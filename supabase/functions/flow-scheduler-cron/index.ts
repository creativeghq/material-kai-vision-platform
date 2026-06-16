/**
 * Flow Scheduler Cron
 *
 * Runs every minute (configured via Supabase dashboard / external scheduler).
 * Checks all active flows with trigger_type='scheduled', parses their cron
 * expression, and executes any that are due to run.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, isAdminAccess, isServiceRoleRequest } from '../_shared/auth.ts';

// ── Cron expression parser (minute, hour, day-of-month, month, day-of-week) ──

function cronMatchesNow(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [minPart, hourPart, domPart, monPart, dowPart] = parts;
  const minute = now.getMinutes();
  const hour = now.getHours();
  const dayOfMonth = now.getDate();
  const month = now.getMonth() + 1; // 1-based
  const dayOfWeek = now.getDay(); // 0=Sun

  return (
    fieldMatches(minPart, minute, 0, 59) &&
    fieldMatches(hourPart, hour, 0, 23) &&
    fieldMatches(domPart, dayOfMonth, 1, 31) &&
    fieldMatches(monPart, month, 1, 12) &&
    fieldMatches(dowPart, dayOfWeek, 0, 6)
  );
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;

  for (const part of field.split(',')) {
    // Handle step values: */5 or 1-10/2
    if (part.includes('/')) {
      const [rangePart, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;

      let start = min;
      let end = max;
      if (rangePart !== '*') {
        if (rangePart.includes('-')) {
          const [s, e] = rangePart.split('-').map(Number);
          start = s;
          end = e;
        } else {
          start = parseInt(rangePart, 10);
          end = max;
        }
      }
      for (let i = start; i <= end; i += step) {
        if (i === value) return true;
      }
      continue;
    }

    // Handle ranges: 1-5
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (value >= start && value <= end) return true;
      continue;
    }

    // Plain value
    if (parseInt(part, 10) === value) return true;
  }

  return false;
}

// ── Main handler ──

Deno.serve(withApiLogging('flow-scheduler-cron', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Cron-only: fires scheduled flows (emails, webhooks, credit-spending actions).
  // verify_jwt is disabled for this function, so gate it here — only the pg_cron
  // service-role caller or a platform admin may trigger it.
  if (!isServiceRoleRequest(req)) {
    const auth = await authenticate(req, { allowedRoles: ['admin', 'super_admin'] });
    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    // Find all active scheduled flows
    const { data: flows, error } = await supabase
      .from('flows')
      .select('id, name, trigger_config, last_run_at')
      .eq('trigger_type', 'scheduled')
      .eq('status', 'active');

    if (error) throw new Error(`Failed to fetch scheduled flows: ${error.message}`);

    if (!flows || flows.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No scheduled flows', triggered: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now = new Date();
    const results: Array<{ flow_id: string; name: string; triggered: boolean; error?: string }> = [];

    for (const flow of flows) {
      const cron = flow.trigger_config?.cron as string | undefined;
      if (!cron) {
        results.push({ flow_id: flow.id, name: flow.name, triggered: false, error: 'No cron expression' });
        continue;
      }

      // Apply timezone if configured (default UTC)
      const tz = (flow.trigger_config?.timezone as string) || 'UTC';
      let checkTime = now;
      try {
        // Convert to the flow's timezone for comparison
        const tzStr = now.toLocaleString('en-US', { timeZone: tz });
        checkTime = new Date(tzStr);
      } catch {
        // Invalid timezone, fall back to UTC
      }

      if (!cronMatchesNow(cron, checkTime)) {
        continue; // Not due yet
      }

      // Prevent double-firing: skip if last_run_at is within the same minute
      if (flow.last_run_at) {
        const lastRun = new Date(flow.last_run_at);
        const diffMs = now.getTime() - lastRun.getTime();
        if (diffMs < 55_000) { // Less than 55 seconds ago
          continue;
        }
      }

      // Stamp last_run_at BEFORE dispatch to prevent concurrent ticks from
      // double-firing the same flow (the 55s guard above reads this).
      await supabase
        .from('flows')
        .update({ last_run_at: now.toISOString() })
        .eq('id', flow.id);

      try {
        const response = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/flow-engine`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'execute-flow',
              flow_id: flow.id,
              trigger_data: { scheduled: true, cron, timestamp: now.toISOString() },
            }),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          results.push({ flow_id: flow.id, name: flow.name, triggered: false, error: errText });
        } else {
          results.push({ flow_id: flow.id, name: flow.name, triggered: true });
        }
      } catch (execErr) {
        results.push({
          flow_id: flow.id,
          name: flow.name,
          triggered: false,
          error: execErr instanceof Error ? execErr.message : String(execErr),
        });
      }
    }

    const triggered = results.filter((r) => r.triggered).length;
    console.log(`[flow-scheduler-cron] Checked ${flows.length} flows, triggered ${triggered}`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: flows.length,
        triggered,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[flow-scheduler-cron] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));
