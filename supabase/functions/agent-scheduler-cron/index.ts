/**
 * Agent Scheduler Cron
 *
 * Runs every minute. Checks all enabled background agents with
 * trigger_type='cron', parses their schedule expression, and
 * dispatches any that are due to background-agent-runner.
 *
 * Uses the same cron parsing logic as flow-scheduler-cron.
 * Register via Supabase Dashboard > Database > Extensions > pg_cron:
 *   SELECT cron.schedule('agent-scheduler', '* * * * *',
 *     $$SELECT net.http_post(url:='<SUPABASE_URL>/functions/v1/agent-scheduler-cron',
 *       headers:'{"Authorization":"Bearer <SERVICE_KEY>"}'::jsonb, body:'{}'::jsonb)$$);
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders }  from '../_shared/cors.ts';

// ── Cron expression parser (identical to flow-scheduler-cron) ────────────────

function cronMatchesNow(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [minPart, hourPart, domPart, monPart, dowPart] = parts;
  return (
    fieldMatches(minPart,  now.getMinutes(),     0, 59) &&
    fieldMatches(hourPart, now.getHours(),        0, 23) &&
    fieldMatches(domPart,  now.getDate(),         1, 31) &&
    fieldMatches(monPart,  now.getMonth() + 1,   1, 12) &&
    fieldMatches(dowPart,  now.getDay(),          0,  6)
  );
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangePart, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;
      let start = min, end = max;
      if (rangePart !== '*') {
        if (rangePart.includes('-')) {
          [start, end] = rangePart.split('-').map(Number);
        } else {
          start = parseInt(rangePart, 10);
          end   = max;
        }
      }
      for (let i = start; i <= end; i += step) {
        if (i === value) return true;
      }
      continue;
    }

    if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      if (value >= s && value <= e) return true;
      continue;
    }

    if (parseInt(part, 10) === value) return true;
  }

  return false;
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const SUPABASE_URL             = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: agents, error } = await supabase
      .from('background_agents')
      .select('id, name, schedule, last_run_at, last_run_status')
      .eq('trigger_type', 'cron')
      .eq('enabled', true);

    if (error) throw new Error(`Failed to fetch scheduled agents: ${error.message}`);

    if (!agents || agents.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No scheduled agents', triggered: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now     = new Date();
    const results: Array<{ agent_id: string; name: string; triggered: boolean; run_id?: string; error?: string }> = [];

    for (const agent of agents) {
      if (!agent.schedule) {
        results.push({ agent_id: agent.id, name: agent.name, triggered: false, error: 'No cron schedule' });
        continue;
      }

      if (!cronMatchesNow(agent.schedule, now)) continue;

      // 55-second debounce — prevent double-firing within the same minute
      if (agent.last_run_at) {
        const diffMs = now.getTime() - new Date(agent.last_run_at).getTime();
        if (diffMs < 55_000) continue;
      }

      // Concurrency guard — skip if a prior run is still in flight. Without
      // this an agent whose work exceeds its cron interval (e.g. * * * * *
      // with a 3-minute Replicate health check) gets fanned out into N
      // concurrent runs all contending for the same heartbeat row.
      // background_agents.last_run_status is only written at completion
      // ('completed' / 'failed' / 'cancelled'), so query agent_runs directly
      // for a non-terminal row — auto-recovery-cron handles genuinely-stuck
      // ones separately on its 8-minute heartbeat threshold.
      const { data: inflight } = await supabase
        .from('agent_runs')
        .select('id')
        .eq('agent_id', agent.id)
        .in('status', ['pending', 'processing'])
        .limit(1)
        .maybeSingle();
      if (inflight) {
        results.push({ agent_id: agent.id, name: agent.name, triggered: false, error: 'Previous run still in flight' });
        continue;
      }

      // Dispatch to background-agent-runner (non-blocking)
      try {
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/background-agent-runner`,
          {
            method:  'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type':  'application/json',
            },
            body: JSON.stringify({
              agent_id:     agent.id,
              triggered_by: 'cron',
              input_data:   { scheduled_at: now.toISOString() },
            }),
          },
        );

        if (!response.ok) {
          const errText = await response.text();
          results.push({ agent_id: agent.id, name: agent.name, triggered: false, error: errText.slice(0, 200) });
        } else {
          const body = await response.json();
          results.push({ agent_id: agent.id, name: agent.name, triggered: true, run_id: body.run_id });
        }
      } catch (dispatchErr) {
        results.push({
          agent_id: agent.id,
          name:     agent.name,
          triggered: false,
          error:    dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr),
        });
      }
    }

    const triggered = results.filter(r => r.triggered).length;
    console.log(`[agent-scheduler-cron] Checked ${agents.length} agents, triggered ${triggered}`);

    return new Response(
      JSON.stringify({ success: true, checked: agents.length, triggered, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err) {
    console.error('[agent-scheduler-cron] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
