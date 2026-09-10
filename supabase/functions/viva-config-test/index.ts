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
import { runVivaConnectionTest, vivaCurrencyFromNumeric } from '../_shared/payments/viva-provider.ts';
import { listVivaWallets, resolveVivaTransferContext } from '../_shared/payments/viva-payout.ts';
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

  /**
   * The money-out half, tested SEPARATELY because it is a separate entitlement.
   *
   * It runs after `runVivaConnectionTest` rather than inside it for two reasons: that function
   * returns early on a checkout failure, and the two halves are genuinely independent — a merchant
   * whose card credentials are wrong may still have working transfer credentials, and reporting
   * "not tested" for one because the other failed is the kind of missing verdict this codebase
   * treats as a defect rather than a gap.
   *
   * Listing the wallets IS the test: it is the same scope every transfer needs, and the result is
   * the list the operator has to choose a source account from, so a passing check hands back
   * something usable instead of a tick.
   */
  const checks = [...result.checks];
  // `currency` is resolved here, from the same table that encodes it on the way out — a wallet
  // list that mislabelled 978 as GBP would have the operator paying out of the wrong balance.
  let wallets: Array<{
    walletId: number; currency: string | null; available: number; isPrimary: boolean; friendlyName: string | null;
  }> = [];

  const transferCtx = await resolveVivaTransferContext(auth.supabase, workspaceId);
  if (!transferCtx) {
    checks.push({
      key: 'transfer',
      label: 'Sending money',
      ok: false,
      detail: 'No Account Transactions credentials saved. Viva can take card payments but cannot send any — '
        + 'add the second client pair from Settings → API Access.',
    });
  } else {
    try {
      wallets = (await listVivaWallets(transferCtx)).map((w) => ({
        walletId: w.walletId,
        currency: vivaCurrencyFromNumeric(w.currencyCode),
        available: w.available,
        isPrimary: w.isPrimary,
        friendlyName: w.friendlyName,
      }));
      checks.push({
        key: 'transfer',
        label: 'Sending money',
        ok: wallets.length > 0,
        detail: wallets.length > 0
          ? `${wallets.length} wallet${wallets.length === 1 ? '' : 's'} readable — map one to a bank account to pay from it.`
          : 'The credentials authenticate but no wallet came back. Check that this client belongs to the account holding the money.',
      });
    } catch (err) {
      checks.push({
        key: 'transfer',
        label: 'Sending money',
        ok: false,
        detail: `${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return jsonResponse({
    ...result,
    // The overall verdict has to account for the check just appended, or a failing transfer step
    // renders under a green headline.
    ok: checks.every((c) => c.ok),
    checks,
    wallets,
    incomplete: false,
  });
}));
