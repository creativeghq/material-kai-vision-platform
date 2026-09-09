/**
 * Sending money — the client half of `finance-send-payment`.
 *
 * RECORDING a payment and SENDING one are two different acts and this module is only the second.
 * `financeService.recordPayment` / `paySupplierBill` write down money that moved somewhere else;
 * these calls instruct a bank to move it. A screen offers both and the operator picks, which is
 * the whole point — but nothing here writes to `payments`, because the bank feed is what learns
 * that the transfer landed (see the header of `supabase/functions/_shared/payments/payout.ts`).
 */
import { supabase } from '@/integrations/supabase/client';
import { callRevolutApi } from '@/modules/banking-revolut/services/revolutConfigService';

/** Which rail an account of ours can send on. NULL/absent = it can only record. */
export type PayoutProvider = 'revolut' | 'viva';

export interface CounterpartyBankAccount {
  id: string;
  bank_name: string | null;
  account_holder: string | null;
  iban: string | null;
  is_primary: boolean;
  /** Set once Revolut has a counterparty for this IBAN — which is also when VoP ran. */
  revolut_counterparty_id: string | null;
  /** Set once Viva has linked this IBAN. Validates the IBAN; does NOT check the holder name. */
  viva_bank_account_id: string | null;
  vop_result: string | null;
}

export interface SendPaymentInput {
  workspaceId: string;
  /** `finance_bank_accounts.id` — the account of OURS the money leaves. */
  sourceBankAccountId: string;
  /** `crm_bank_accounts.id` — the counterparty account being paid. */
  crmBankAccountId: string;
  amount: number;
  currency: string;
  reference: string;
  /** 'draft' = prepared for approval in the provider's app. Revolut only; Viva has no such step. */
  mode: 'draft' | 'payment';
  /** Minted ONCE when the dialog opens and resent with every attempt — see below. */
  requestId: string;
  supplierBillId?: string | null;
}

export interface SendPaymentResult {
  ok: true;
  provider: PayoutProvider;
  mode: 'draft' | 'payment';
  duplicate?: boolean;
  providerId: string | null;
  state: string;
  note?: string;
}

/**
 * The counterparty's own accounts, and the state of each on both rails.
 *
 * Read directly rather than through a service wrapper because `crm_bank_accounts` is RLS-scoped to
 * the workspace already — the filter here is a convenience, not the boundary.
 */
export async function listCounterpartyBankAccounts(
  workspaceId: string,
  party: { companyId?: string | null; contactId?: string | null },
): Promise<CounterpartyBankAccount[]> {
  if (!party.companyId && !party.contactId) return [];
  let q = supabase
    .from('crm_bank_accounts')
    .select('id, bank_name, account_holder, iban, is_primary, revolut_counterparty_id, viva_bank_account_id, vop_result')
    .eq('workspace_id', workspaceId);
  q = party.companyId
    ? q.eq('company_id', party.companyId)
    : q.eq('contact_id', party.contactId as string);
  const { data, error } = await q.order('is_primary', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as CounterpartyBankAccount[];
}

/** Has this account been prepared on the rail it is about to be paid on? */
export function counterpartyReadyFor(
  account: CounterpartyBankAccount | null | undefined,
  provider: PayoutProvider | null,
): boolean {
  if (!account || !provider) return false;
  return provider === 'revolut'
    ? Boolean(account.revolut_counterparty_id)
    : Boolean(account.viva_bank_account_id);
}

/**
 * Name-verify a counterparty account on Revolut (Confirmation of Payee) and create the
 * counterparty record.
 *
 * This is a SEPARATE step on purpose, and `executePayout` refuses to do it implicitly: minting the
 * counterparty is what runs the name check, and a `not_matched` verdict has to reach a human who
 * can decide, not be swallowed by the send call. `force` is that human's decision.
 */
export async function verifyAndLinkRevolutCounterparty(
  workspaceId: string,
  crmBankAccountId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  await callRevolutApi('create-counterparty', workspaceId, {
    crm_bank_account_id: crmBankAccountId,
    ...(opts.force ? { force: true } : {}),
  });
}

/** True when the error from `verifyAndLinkRevolutCounterparty` is the name-mismatch refusal. */
export function isVopMismatch(err: unknown): boolean {
  return /does NOT match/i.test((err as Error)?.message ?? '');
}

export async function sendPayment(input: SendPaymentInput): Promise<SendPaymentResult> {
  const { data, error } = await supabase.functions.invoke('finance-send-payment', {
    body: {
      workspace_id: input.workspaceId,
      source_bank_account_id: input.sourceBankAccountId,
      crm_bank_account_id: input.crmBankAccountId,
      amount: input.amount,
      currency: input.currency,
      reference: input.reference,
      mode: input.mode,
      request_id: input.requestId,
      supplier_bill_id: input.supplierBillId ?? null,
    },
  });
  if (error) {
    // The server writes these messages for an operator ("that account is not linked to a
    // pocket…"), and they are lost if only `error.message` — a bare "non-2xx status" — is shown.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message);
  }
  /**
   * An APPLICATION failure inside a 200 is still a failure.
   *
   * `supabase.functions.invoke` reports no `error` for a 200 body that says `{ ok: false }`, so a
   * caller that trusts the absence of `error` shows a success toast for a payment that was never
   * instructed — the silent-zero shape, on money.
   */
  const out = data as (Omit<SendPaymentResult, 'ok'> & { ok?: boolean; error?: string }) | null;
  if (!out || out.ok !== true) throw new Error(out?.error || 'the payment could not be sent');
  return out as SendPaymentResult;
}
