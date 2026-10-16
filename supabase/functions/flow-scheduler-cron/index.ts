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
import { authenticatePlatformOperator, isAdminAccess, isCronAuthorized } from '../_shared/auth.ts';
import { cronMatchesNow } from '../_shared/cron-match.ts';

// ── Main handler ──

Deno.serve(withApiLogging('flow-scheduler-cron', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Cron-only: fires scheduled flows (emails, webhooks, credit-spending actions).
  // verify_jwt is disabled for this function, so gate it here — only the pg_cron
  // service-role caller or a platform admin may trigger it.
  if (!isCronAuthorized(req)) {
    const auth = await authenticatePlatformOperator(req);
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
