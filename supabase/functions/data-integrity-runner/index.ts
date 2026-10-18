// deno-lint-ignore-file no-explicit-any
// Platform-wide Data Integrity runner.
//   • Cron path  (x-cron-secret / service-role Bearer) → runs the full battery with auto-heal
//     for every check whose `autoheal_enabled = true`.
//   • Admin path (session JWT, admin/super_admin/owner) → run on demand + manage checks/findings.
// All the heavy lifting lives in Postgres (run_data_integrity_checks / heal_data_integrity_check);
// this function is the auth boundary + thin dispatcher. See migration data_integrity_framework_core.

import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticatePlatformOperator, isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { captureMessage } from '../_shared/sentry.ts';
import { resolveSecret } from '../_shared/secrets.ts';

interface RequestBody {
  action?:
    | 'run'              // run the battery (optional autoheal + domain filter)
    | 'heal_check'       // run one check's heal fn on demand
    | 'ignore_finding'   // mark a finding as ignored (accepted / won't-fix)
    | 'reopen_finding'   // un-ignore a finding
    | 'set_autoheal'     // toggle a check's autoheal_enabled
    | 'toggle_check'     // enable/disable a check
    | 'run_kb_eval';     // run the KB retrieval golden set once (paid: Voyage)
  autoheal?: boolean;
  domains?: string[] | null;
  key?: string;
  findingId?: string;
  enabled?: boolean;
}


const svc = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/**
 * Page the sweep's own results to Sentry. `withApiLogging` reports a request that FAILED; a sweep
 * that ran clean and found ten critical problems is a 200, so nothing here reaches Sentry on its
 * own — the findings sit in a table nobody opens until something breaks. One event per finding,
 * fingerprinted on its identity, so each is an issue you resolve individually and a recurrence
 * reopens rather than duplicates.
 */
async function reportRunToSentry(supabase: ReturnType<typeof svc>, runId: string): Promise<void> {
  const [{ data: run }, { data: criticals }] = await Promise.all([
    supabase.from('data_integrity_runs')
      .select('error, checks_run, findings_open').eq('id', runId).maybeSingle(),
    supabase.from('data_integrity_findings')
      .select('check_key, entity_id, detail')
      .eq('status', 'open').eq('severity', 'critical'),
  ]);

  // A detector that raised is now isolated and the sweep carries on — which is the fix, and also
  // exactly why it needs its own alarm: the run is a 200 with one fewer check in it.
  let failures: Array<{ check?: string; detect_fn?: string; sqlstate?: string; error?: string }> = [];
  if (run?.error) {
    try { failures = JSON.parse(run.error); } catch { /* malformed: covered by the summary below */ }
  }
  for (const f of failures) {
    await captureMessage(
      `Data integrity detector failed: ${f.check ?? f.detect_fn ?? 'unknown'}`,
      'error',
      {
        tags: { area: 'data-integrity', kind: 'detector_failed', check: f.check ?? 'unknown' },
        extra: { ...f, run_id: runId },
        fingerprint: ['data-integrity', 'detector-failed', f.check ?? f.detect_fn ?? 'unknown'],
      },
    );
  }
  if (run?.error && failures.length === 0) {
    await captureMessage('Data integrity sweep recorded an unparseable error', 'error', {
      tags: { area: 'data-integrity', kind: 'detector_failed' },
      extra: { run_id: runId, error: run.error },
      fingerprint: ['data-integrity', 'detector-failed', 'unparseable'],
    });
  }

  for (const c of criticals ?? []) {
    const d = (c.detail ?? {}) as Record<string, unknown>;
    const gist = (d.label ?? d.reason ?? d.why ?? '') as string;
    await captureMessage(
      `Data integrity CRITICAL: ${c.check_key} — ${c.entity_id}`,
      'error',
      {
        tags: { area: 'data-integrity', kind: 'critical_finding', check: c.check_key },
        extra: { entity_id: c.entity_id, gist, detail: d, run_id: runId },
        fingerprint: ['data-integrity', c.check_key, String(c.entity_id)],
      },
    );
  }
}

/**
 * Close the Sentry issue of every critical finding that healed in the last two days. Each issue is
 * found by the exact title `reportRunToSentry` gives it. Needs SENTRY_AUTH_TOKEN (event:write) and
 * SENTRY_ORG; without them it says so and does nothing, rather than pretending the channel is clean.
 */
async function resolveHealedInSentry(supabase: ReturnType<typeof svc>): Promise<void> {
  const [token, org] = await Promise.all([
    resolveSecret(supabase, 'SENTRY_AUTH_TOKEN'), resolveSecret(supabase, 'SENTRY_ORG'),
  ]);
  if (!token.value || !org.value) {
    console.warn('[data-integrity-runner] SENTRY_AUTH_TOKEN / SENTRY_ORG unset: healed findings stay open in Sentry');
    return;
  }
  const { data: healed, error } = await supabase.from('data_integrity_findings')
    .select('check_key, entity_id')
    .in('status', ['healed', 'cleared']).eq('severity', 'critical')
    .gt('healed_at', new Date(Date.now() - 2 * 86_400_000).toISOString());
  if (error) {
    console.warn('[data-integrity-runner] could not read healed findings:', error.message);
    return;
  }
  const base = `https://sentry.io/api/0/organizations/${encodeURIComponent(org.value)}/issues/`;
  const headers = { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' };
  for (const f of healed ?? []) {
    const title = `Data integrity CRITICAL: ${f.check_key} — ${f.entity_id}`;
    try {
      const q = new URLSearchParams({ query: `is:unresolved message:"${title.replace(/"/g, '\\"')}"` });
      const found = await fetch(`${base}?${q}`, { headers, signal: AbortSignal.timeout(10_000) });
      if (!found.ok) { console.warn(`[data-integrity-runner] Sentry search ${found.status} for ${title}`); continue; }
      const issues = (await found.json()) as Array<{ id: string; title: string }>;
      const ids = issues.filter((i) => i.title === title).map((i) => i.id);
      if (ids.length === 0) continue;
      const put = await fetch(`${base}?${ids.map((id) => `id=${encodeURIComponent(id)}`).join('&')}`, {
        method: 'PUT', headers, body: JSON.stringify({ status: 'resolved' }), signal: AbortSignal.timeout(10_000),
      });
      if (!put.ok) console.warn(`[data-integrity-runner] Sentry resolve ${put.status} for ${title}`);
    } catch (e) {
      console.warn(`[data-integrity-runner] Sentry resolve failed for ${title}:`, e instanceof Error ? e.message : e);
    }
  }
}

Deno.serve(withApiLogging('data-integrity-runner', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Cron path: full battery + auto-heal, no body required ───────────────
    if (isCronAuthorized(req)) {
      const supabase = svc();
      const { data, error } = await supabase.rpc('run_data_integrity_checks', {
        p_autoheal: true, p_domains: null, p_triggered_by: 'cron',
      });
      if (error) return json({ error: error.message }, 500);
      // Only the cron path pages. An admin pressing Run is already looking at the results.
      await reportRunToSentry(supabase, data as string);
      await resolveHealedInSentry(supabase);
      return json({ ok: true, run_id: data });
    }

    // ── Admin path ──────────────────────────────────────────────────────────
    const auth = await authenticatePlatformOperator(req);
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const supabase = svc();
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const action = body.action ?? 'run';

    switch (action) {
      case 'run': {
        const { data, error } = await supabase.rpc('run_data_integrity_checks', {
          p_autoheal: body.autoheal === true,
          p_domains: body.domains ?? null,
          p_triggered_by: auth.userId ?? 'admin',
        });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, run_id: data });
      }
      case 'heal_check': {
        if (!body.key) return json({ error: 'key is required' }, 400);
        const { data, error } = await supabase.rpc('heal_data_integrity_check', { p_key: body.key });
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true, healed: data });
      }
      case 'ignore_finding':
      case 'reopen_finding': {
        if (!body.findingId) return json({ error: 'findingId is required' }, 400);
        const status = action === 'ignore_finding' ? 'ignored' : 'open';
        const { error } = await supabase.from('data_integrity_findings')
          .update({ status, resolved_by: action === 'ignore_finding' ? auth.userId ?? null : null })
          .eq('id', body.findingId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case 'set_autoheal': {
        if (!body.key) return json({ error: 'key is required' }, 400);
        const { error } = await supabase.from('data_integrity_checks')
          .update({ autoheal_enabled: body.enabled === true }).eq('key', body.key);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case 'toggle_check': {
        if (!body.key) return json({ error: 'key is required' }, 400);
        const { error } = await supabase.from('data_integrity_checks')
          .update({ is_enabled: body.enabled === true }).eq('key', body.key);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
      case 'run_kb_eval': {
        // Spends Voyage calls, so it runs only when an operator presses the button — never on a schedule.
        const secret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
        if (!secret) return json({ error: 'CRON_SECRET is not configured' }, 503);
        const gateway = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
        const resp = await fetch(`${gateway}/api/rag/kb-eval/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(140_000),
        });
        const result = await resp.json().catch(() => null);
        if (!resp.ok || !result) {
          return json({ error: `KB eval failed: HTTP ${resp.status} ${JSON.stringify(result?.detail ?? result ?? '').slice(0, 300)}` }, 502);
        }
        const { error } = await supabase.rpc('run_data_integrity_checks', {
          p_autoheal: false, p_domains: ['kb'], p_triggered_by: auth.userId ?? 'admin',
        });
        return json({
          ok: true, batch_id: result.batch_id, cases: result.cases,
          embed_failures: result.embed_failures ?? [], summary: result.summary ?? [],
          checks_refreshed: !error,
        });
      }
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('[data-integrity-runner] Unhandled error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
}));
