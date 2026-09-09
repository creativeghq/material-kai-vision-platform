/**
 * Send a payment — the ONE money-out entry the UI calls, whichever rail it goes out on.
 *
 * Until now "actually move the money" existed only inside `revolut-api`, reachable only from a
 * supplier bill, and only for Revolut. So paying anyone the platform did not already hold a bill
 * for had no path at all, and a workspace whose money sits in Viva had no path ever. This function
 * takes the account the operator picked in OUR books, derives the rail from it, and hands the work
 * to the shared executor in `_shared/payments/payout.ts` — which is also what `revolut-api`'s own
 * `send-payment` action now calls, so there is one implementation and not one per screen.
 *
 * Body: {
 *   workspace_id, source_bank_account_id, crm_bank_account_id,
 *   amount, currency, reference, mode: 'draft' | 'payment',
 *   request_id (idempotency, minted when the dialog opens), supplier_bill_id?
 * }
 *
 * Auth: finance manager of the TARGET workspace, checked under the caller's own RLS before the
 * service client is used for anything (invariant 1). Ownership mismatch answers 404, never 403.
 *
 * NOTE ON WHAT IT WRITES: an instruction, never a `payments` row. See the header of
 * `_shared/payments/payout.ts` — the bank feed is the one thing allowed to say the money moved.
 */

// deno-lint-ignore-file no-explicit-any

import { authenticate } from '../_shared/auth.ts';
import { isWorkspaceEntitled } from '../_shared/entitlement.ts';
import { HttpError, withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse } from '../_shared/http.ts';
import {
  executePayout,
  PayoutError,
  resolvePayoutSource,
  type PayoutMode,
} from '../_shared/payments/payout.ts';

/** The module a rail belongs to. A tenant that has not enabled it cannot send on it. */
const MODULE_FOR_PROVIDER: Record<string, string> = {
  revolut: 'banking-revolut',
  viva: 'payments-viva',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(withApiLogging('finance-send-payment', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'POST only');
  await bootstrapForFunction();

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) throw new HttpError(401, 'unauthorized');
  /**
   * A REAL person, not a service-role caller.
   *
   * `supabaseAsUser` is the RLS-bound client the tenancy check runs under, and it only exists when
   * the request carried a user JWT. Reaching for it with `!` would mean a service-role call —
   * flow-engine, a partner key, an admin-secret path — crashing on `undefined.rpc` somewhere below
   * instead of being refused here. This endpoint moves money irreversibly; "no user" is a refusal,
   * never a caller to be trusted because it holds a powerful key.
   */
  if (!auth.supabaseAsUser) throw new HttpError(401, 'this endpoint requires a signed-in user');
  const service = auth.supabase;

  const body = await req.json().catch(() => null) as Record<string, any> | null;
  const workspaceId = String(body?.workspace_id ?? '');
  if (!workspaceId) throw new HttpError(400, 'workspace_id is required');

  // Tenancy gate under the CALLER's RLS, before the service client touches anything.
  const { data: isMgr } = await auth.supabaseAsUser
    .rpc('is_workspace_finance_manager', { p_workspace_id: workspaceId });
  if (!isMgr) throw new HttpError(404, 'not found');

  const sourceBankAccountId = String(body?.source_bank_account_id ?? '');
  const crmBankAccountId = String(body?.crm_bank_account_id ?? '');
  const amount = Number(body?.amount ?? 0);
  const currency = String(body?.currency ?? 'EUR').toUpperCase();
  const reference = String(body?.reference ?? '').slice(0, 140);
  const mode: PayoutMode = body?.mode === 'draft' ? 'draft' : 'payment';
  const supplierBillId = body?.supplier_bill_id ? String(body.supplier_bill_id) : null;

  if (!sourceBankAccountId || !crmBankAccountId) {
    throw new HttpError(400, 'source_bank_account_id and crm_bank_account_id are required');
  }
  if (!(amount > 0)) throw new HttpError(400, 'amount must be positive');

  /**
   * The idempotency key is the caller's, and it is REQUIRED here.
   *
   * `revolut-api` accepts a missing one and mints a fresh uuid, which was the old behaviour and is
   * the opposite of an idempotency key — two attempts get two ids and both execute. This entry is
   * new, so it can insist: the dialog mints one when it opens and resends it with every attempt,
   * and a retry after a dropped connection then replays instead of paying twice.
   */
  const requestId = String(body?.request_id ?? '');
  if (!UUID_RE.test(requestId)) {
    throw new HttpError(400, 'request_id must be a uuid minted once per payment attempt');
  }

  try {
    const source = await resolvePayoutSource(service, workspaceId, sourceBankAccountId);

    const moduleSlug = MODULE_FOR_PROVIDER[source.provider];
    if (!moduleSlug || !(await isWorkspaceEntitled(service, workspaceId, moduleSlug))) {
      throw new HttpError(402, `The ${source.provider} module is not enabled for this workspace`);
    }

    const outcome = await executePayout(service, {
      workspaceId,
      userId: auth.userId,
      requestId,
      source,
      crmBankAccountId,
      amount,
      currency,
      reference,
      mode,
      supplierBillId,
    });
    return jsonResponse(outcome);
  } catch (err) {
    // PayoutError already carries the status and a message written for an operator; anything else
    // is a genuine fault and belongs to the wrapper (which reports it to Sentry).
    if (err instanceof PayoutError) throw new HttpError(err.status, err.message);
    throw err;
  }
}));
