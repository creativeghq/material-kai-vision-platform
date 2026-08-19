/**
 * Viva.com connection test (per-workspace BYOK).
 *
 * POST { workspace_id } → runs the stored credentials against Viva for real and returns a
 * per-step verdict. Exists because every field on the setup card is silently wrong until a
 * customer pays: a mistyped 4-digit source code authenticates, saves, and fails only at the
 * first sale. See `runVivaConnectionTest` for what each step proves.
 *
 * Tenancy (invariant 1): the caller must be a finance manager of the TARGET workspace,
 * checked under their own RLS via `supabaseAsUser` — the service client is used only after
 * that passes, and a mismatch returns 404 rather than 403 so workspace ids can't be probed.
 */

// deno-lint-ignore-file no-explicit-any

import { authenticate } from '../_shared/auth.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import { runVivaConnectionTest } from '../_shared/payments/viva-provider.ts';
import type { PaymentProviderContext } from '../_shared/payments/types.ts';

Deno.serve(withApiLogging('viva-config-test', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, 'unauthorized');

  const body = await req.json().catch(() => null) as Record<string, any> | null;
  const workspaceId = String(body?.workspace_id ?? '');
  if (!workspaceId) throw new HttpError(400, 'workspace_id is required');

  const { data: isMgr } = await auth.supabaseAsUser!
    .rpc('is_workspace_finance_manager', { p_workspace_id: workspaceId });
  if (!isMgr) throw new HttpError(404, 'not found');

  const { data: cfg, error } = await auth.supabase
    .from('workspace_viva_config')
    .select('workspace_id, client_id, client_secret, merchant_id, api_key, source_code, environment')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) throw new HttpError(500, `could not read the Viva configuration: ${error.message}`);
  if (!cfg?.client_id || !cfg?.client_secret || !cfg?.merchant_id || !cfg?.api_key) {
    // Not an error — the card calls this while setup is still incomplete.
    return jsonResponse({
      ok: false,
      incomplete: true,
      error: 'Save all four credentials before testing the connection.',
      checks: [],
    });
  }

  const ctx: PaymentProviderContext = {
    workspaceId,
    credentials: {
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      merchant_id: cfg.merchant_id,
      api_key: cfg.api_key,
      source_code: cfg.source_code ?? 'Default',
    },
    isSandbox: (cfg.environment ?? 'demo') !== 'production',
  };

  const result = await runVivaConnectionTest(ctx);
  return jsonResponse({ ...result, incomplete: false });
}));
