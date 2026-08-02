// deno-lint-ignore-file no-explicit-any
// Platform-wide Data Integrity runner.
//   • Cron path  (x-cron-secret / service-role Bearer) → runs the full battery with auto-heal
//     for every check whose `autoheal_enabled = true`.
//   • Admin path (session JWT, admin/super_admin/owner) → run on demand + manage checks/findings.
// All the heavy lifting lives in Postgres (run_data_integrity_checks / heal_data_integrity_check);
// this function is the auth boundary + thin dispatcher. See migration data_integrity_framework_core.

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

interface RequestBody {
  action?:
    | 'run'              // run the battery (optional autoheal + domain filter)
    | 'heal_check'       // run one check's heal fn on demand
    | 'ignore_finding'   // mark a finding as ignored (accepted / won't-fix)
    | 'reopen_finding'   // un-ignore a finding
    | 'set_autoheal'     // toggle a check's autoheal_enabled
    | 'toggle_check';    // enable/disable a check
  autoheal?: boolean;
  domains?: string[] | null;
  key?: string;
  findingId?: string;
  enabled?: boolean;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const svc = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      return json({ ok: true, run_id: data });
    }

    // ── Admin path ──────────────────────────────────────────────────────────
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner'] });
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
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error('[data-integrity-runner] Unhandled error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
}));
