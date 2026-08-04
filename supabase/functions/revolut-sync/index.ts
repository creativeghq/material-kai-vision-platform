/**
 * Revolut transaction sync (#315) — cron sweep over every connected workspace.
 *
 * Dual auth, mirroring finance-inbound-sync:
 *   - cron path: `x-cron-secret` (pg_cron) or service-role key
 *   - human path: an authenticated finance user; the sweep is then restricted to THEIR
 *     workspaces so one tenant's "Sync now" can never pull for everyone.
 *
 * The webhook receiver keeps rows fresh in near-real-time; this sweep is the backstop
 * that also advances the watermark and repairs any missed deliveries. Single-workspace
 * interactive sync lives in `revolut-api?action=sync-now` (same shared core).
 */

// deno-lint-ignore-file no-explicit-any

import { authenticate, isCronAuthorized, listUserWorkspaceIds } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import { syncWorkspaceRevolut } from '../_shared/revolut/sync-core.ts';
import type { RevolutConfigRow } from '../_shared/revolut/client.ts';

const CRON_CORS = {
  ...corsHeaders,
  'Access-Control-Allow-Headers': `${corsHeaders['Access-Control-Allow-Headers']}, x-cron-secret`,
};

Deno.serve(withApiLogging('revolut-sync', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CRON_CORS });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const cronOk = isCronAuthorized(req);
  let allowedWorkspaceIds: string[] | null = null;

  const { createClient } = await import('@supabase/supabase-js');
  const service = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  if (!cronOk) {
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success || !auth.userId) throw new HttpError(401, 'unauthorized');
    allowedWorkspaceIds = await listUserWorkspaceIds(service, auth.userId);
    if (allowedWorkspaceIds.length === 0) throw new HttpError(404, 'not found');
  }

  let query = service
    .from('workspace_revolut_config')
    .select('*')
    .eq('enabled', true)
    .not('refresh_token', 'is', null);
  if (allowedWorkspaceIds) query = query.in('workspace_id', allowedWorkspaceIds);

  const { data: configs, error } = await query;
  if (error) throw new HttpError(500, `config sweep failed: ${error.message}`);

  const results = [];
  for (const cfg of (configs ?? []) as RevolutConfigRow[]) {
    // A lapsed entitlement pauses the sweep for that workspace (fail closed, no error).
    if (!(await isWorkspaceEntitled(service, cfg.workspace_id, 'banking-revolut'))) continue;
    results.push(await syncWorkspaceRevolut(service, cfg));
  }

  const failed = results.filter((r) => !r.ok);
  return jsonResponse({
    ok: failed.length === 0,
    workspaces: results.length,
    fetched: results.reduce((n, r) => n + r.fetched, 0),
    upserted: results.reduce((n, r) => n + r.upserted, 0),
    failures: failed.map((r) => ({ workspace_id: r.workspaceId, error: r.error })),
  });
}));
