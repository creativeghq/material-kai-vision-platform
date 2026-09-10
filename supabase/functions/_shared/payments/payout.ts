/** Money OUT — the ONE implementation, for every rail that can move it. */
import {
  createPayment,
  createPaymentDraft,
  issuerDomainFrom,
  resolveRevolutConfig,
} from '../revolut/client.ts';
import {
  linkVivaBankAccount,
  resolveVivaTransferContext,
  sendVivaBankTransfer,
} from './viva-payout.ts';

export type PayoutProvider = 'revolut' | 'viva';
/** `draft` prepares it for a human to approve in the provider's own app; `payment` moves it now. */
export type PayoutMode = 'draft' | 'payment';

export interface PayoutSource {
  /** The row in OUR books the money leaves. Null only for the legacy Revolut-pocket entry point. */
  bankAccountId: string | null;
  provider: PayoutProvider;
  /** Provider-side account: a Revolut pocket id, or a Viva walletId as text. */
  ref: string;
}

export interface PayoutParams {
  workspaceId: string;
  userId: string | null;
  /** Idempotency key minted ONCE by the screen and resent with every attempt. */
  requestId: string;
  source: PayoutSource;
  /** `crm_bank_accounts.id` — the counterparty account being paid. */
  crmBankAccountId: string;
  amount: number;
  currency: string;
  reference: string;
  mode: PayoutMode;
  /** The bill this settles, so the feed does not have to guess it from reference text. */
  supplierBillId: string | null;
  /** Proceed even though Confirmation of Payee said the holder name does not match (Revolut). */
  forceVop?: boolean;
}

export interface PayoutOutcome {
  ok: true;
  provider: PayoutProvider;
  mode: PayoutMode;
  duplicate?: boolean;
  providerId: string | null;
  state: string;
  note?: string;
}

export class PayoutError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'PayoutError';
  }
}

/** Everything the dispatch needs about the recipient, already tenancy-checked. */
interface CounterpartyRow {
  id: string;
  iban: string | null;
  account_holder: string | null;
  revolut_counterparty_id: string | null;
  viva_bank_account_id: string | null;
  displayName: string;
}

async function loadCounterparty(
  service: any,
  workspaceId: string,
  crmBankAccountId: string,
): Promise<CounterpartyRow> {
  const { data } = await service
    .from('crm_bank_accounts')
    .select('id, iban, account_holder, revolut_counterparty_id, viva_bank_account_id, '
      + 'company:crm_companies!company_id(name), contact:crm_contacts!contact_id(name)')
    .eq('id', crmBankAccountId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  // 404, not 403: a wrong answer here would let someone probe which ids exist (invariant 1).
  if (!data) throw new PayoutError(404, 'not found');
  const row = data as any;
  return {
    id: String(row.id),
    iban: row.iban ?? null,
    account_holder: row.account_holder ?? null,
    revolut_counterparty_id: row.revolut_counterparty_id ?? null,
    viva_bank_account_id: row.viva_bank_account_id ?? null,
    displayName: String(row.account_holder || row.company?.name || row.contact?.name || ''),
  };
}

/**
 * Resolve one of OUR bank accounts into the rail it can send on.
 *
 * A books account that is not mapped to a provider account cannot send, and says so by name — the
 * alternative is an operator picking "Postbank BG" and being told something vague about
 * configuration when the real answer is "that account is not a rail, it is a record".
 */
export async function resolvePayoutSource(
  service: any,
  workspaceId: string,
  bankAccountId: string,
): Promise<PayoutSource> {
  const { data } = await service
    .from('finance_bank_accounts')
    .select('id, name, provider_slug, revolut_account_id, viva_wallet_id, currency, is_active')
    .eq('id', bankAccountId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data) throw new PayoutError(404, 'not found');
  const row = data as any;
  if (row.is_active === false) throw new PayoutError(400, `${row.name} is archived`);

  if (row.revolut_account_id) {
    return { bankAccountId: String(row.id), provider: 'revolut', ref: String(row.revolut_account_id) };
  }
  if (row.viva_wallet_id) {
    return { bankAccountId: String(row.id), provider: 'viva', ref: String(row.viva_wallet_id) };
  }
  throw new PayoutError(
    400,
    `${row.name} can record payments but cannot send them — it is not linked to a Revolut pocket or a Viva wallet. `
    + 'Link it in Finance → Settings, or pick an account that is.',
  );
}

export async function executePayout(service: any, params: PayoutParams): Promise<PayoutOutcome> {
  const {
    workspaceId, userId, requestId, source, crmBankAccountId,
    amount, currency, reference, mode, supplierBillId,
  } = params;

  if (!(amount > 0)) throw new PayoutError(400, 'amount must be positive');
  if (!requestId) throw new PayoutError(400, 'request_id is required');

  // ---- 1. Resolve and tenancy-check everything the body named. ------------------------------
  const counterparty = await loadCounterparty(service, workspaceId, crmBankAccountId);

  // A payout pointing at another workspace's bill would settle it from the feed, so the id is
  // checked before it is stored, not when it is used.
  if (supplierBillId) {
    const { data: billRow } = await service
      .from('supplier_bills')
      .select('id')
      .eq('id', supplierBillId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!billRow) throw new PayoutError(404, 'not found');
  }

  // ---- 2. A repeat of the SAME instruction is not a second payment. -------------------------
  const { data: prior } = await service
    .from('payout_instructions')
    .select('id, provider, provider_id, state, kind')
    .eq('workspace_id', workspaceId)
    .eq('request_id', requestId)
    .maybeSingle();
  if (prior) {
    const p = prior as any;
    return {
      ok: true,
      provider: (p.provider ?? source.provider) as PayoutProvider,
      mode: (p.kind === 'draft' ? 'draft' : 'payment') as PayoutMode,
      duplicate: true,
      providerId: p.provider_id ?? null,
      state: String(p.state ?? 'unknown'),
      note: 'This payment instruction was already sent — nothing was sent twice.',
    };
  }

  // ---- 3. Audit BEFORE the provider is called. ----------------------------------------------
  const { data: audit, error: auditErr } = await service.from('payout_instructions').insert({
    workspace_id: workspaceId,
    provider: source.provider,
    request_id: requestId,
    kind: mode,
    amount,
    currency: currency.toUpperCase(),
    source_account_ref: source.ref,
    source_bank_account_id: source.bankAccountId,
    crm_bank_account_id: counterparty.id,
    counterparty_name: counterparty.displayName,
    reference,
    supplier_bill_id: supplierBillId,
    created_by: userId,
  }).select('id').single();
  if (auditErr || !audit) {
    throw new PayoutError(500, `could not record the instruction, so nothing was sent: ${auditErr?.message}`);
  }
  const auditId = (audit as { id: string }).id;

  const stamp = (patch: Record<string, unknown>) =>
    service.from('payout_instructions')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', auditId);

  // ---- 4 + 5. Move the money, then say what happened. ---------------------------------------
  try {
    const outcome = source.provider === 'revolut'
      ? await sendViaRevolut(service, params, counterparty)
      : await sendViaViva(service, params, counterparty);
    await stamp({ provider_id: outcome.providerId, state: outcome.state });
    return { ok: true, provider: source.provider, mode, ...outcome };
  } catch (err) {
    // A FAILED instruction is not a payment, so it must not sit in the way of a real retry — the
    // replay check above keys on the row, and this state is what tells the two apart.
    await stamp({ state: 'failed' });
    throw err;
  }
}

async function sendViaRevolut(
  service: any,
  params: PayoutParams,
  counterparty: CounterpartyRow,
): Promise<{ providerId: string | null; state: string; note?: string }> {
  const { workspaceId, requestId, source, amount, currency, reference, mode } = params;

  const cfg = await resolveRevolutConfig(service, workspaceId);
  if (!cfg) throw new PayoutError(400, 'Revolut is not set up for this workspace');
  if (!cfg.refresh_token) {
    // The exact state this platform is in today, and the one error worth naming precisely: the
    // code is live, the account behind it is not.
    throw new PayoutError(400, 'Revolut is enabled but was never connected — finish the connection in Profile → Keys before sending money.');
  }
  const issuer = issuerDomainFrom(cfg.oauth_redirect_uri ?? '');

  /**
   * The counterparty must ALREADY exist, and this must not create one.
   *
   * Minting it is what runs Confirmation of Payee (`revolut-api?action=create-counterparty`),
   * where a `not_matched` verdict blocks the account unless a human explicitly overrides it.
   * Creating it here to save the caller a round trip would route every payment around that check
   * — the one control standing between a mistyped IBAN and an irreversible transfer to a
   * stranger. The screen calls create-counterparty first, sees the verdict, and comes back.
   */
  const counterpartyId = counterparty.revolut_counterparty_id;
  if (!counterpartyId) {
    throw new PayoutError(
      400,
      'This account has not been name-verified with Revolut yet. Verify the account holder first — '
      + 'money is never sent to an IBAN whose name has not been checked.',
    );
  }

  if (mode === 'draft') {
    const draft = await createPaymentDraft(service, cfg, issuer, {
      title: reference || `Payment to ${counterparty.displayName}`,
      payments: [{
        account_id: source.ref,
        receiver: { counterparty_id: counterpartyId },
        amount,
        currency: currency.toUpperCase(),
        reference: reference || undefined,
      }],
    });
    return {
      providerId: draft.id,
      state: 'pending_approval',
      note: 'Approve the draft in the Revolut app to execute it.',
    };
  }

  const pay = await createPayment(service, cfg, issuer, {
    request_id: requestId,
    account_id: source.ref,
    receiver: { counterparty_id: counterpartyId },
    amount,
    currency: currency.toUpperCase(),
    reference: reference || undefined,
  });
  return { providerId: pay.id, state: pay.state ?? 'pending' };
}

async function sendViaViva(
  service: any,
  params: PayoutParams,
  counterparty: CounterpartyRow,
): Promise<{ providerId: string | null; state: string; note?: string }> {
  const { workspaceId, source, amount, reference, mode } = params;

  // Viva has no draft/approval concept — a transfer either executes or it does not. Refusing is
  // the honest answer: silently upgrading a draft to a real payment would move money the operator
  // asked to have held for approval.
  if (mode === 'draft') {
    throw new PayoutError(
      400,
      'Viva has no approval step — a Viva transfer executes immediately. Send it directly, or pay this from a Revolut account if you want the draft-and-approve flow.',
    );
  }

  const ctx = await resolveVivaTransferContext(service, workspaceId);
  if (!ctx) {
    throw new PayoutError(
      400,
      'This workspace has no Viva transfer credentials. Add the Account Transactions credentials in Profile → Keys — the Smart Checkout pair that takes card payments cannot send money.',
    );
  }

  let bankAccountId = counterparty.viva_bank_account_id;
  if (!bankAccountId) {
    if (!counterparty.iban) throw new PayoutError(400, 'that account has no IBAN, so it cannot be paid');
    const linked = await linkVivaBankAccount(ctx, {
      iban: counterparty.iban,
      beneficiaryName: counterparty.displayName,
      friendlyName: counterparty.displayName,
    });
    bankAccountId = linked.bankAccountId;
    await service.from('crm_bank_accounts')
      .update({ viva_bank_account_id: bankAccountId })
      .eq('id', counterparty.id);
  }

  const walletId = Number(source.ref);
  if (!Number.isFinite(walletId) || walletId <= 0) {
    throw new PayoutError(400, 'that account is not mapped to a Viva wallet');
  }

  // Minor units. Viva's :send takes an integer in cents while its own webhook reports the amount
  // in major units — the two halves of one transfer disagree about scale, so neither figure may be
  // passed to the other without conversion.
  const amountMinor = Math.round(amount * 100);
  const out = await sendVivaBankTransfer(ctx, {
    bankAccountId,
    walletId,
    amountMinor,
    description: reference || undefined,
  });

  return {
    providerId: out.commandId ?? out.walletTransactionId,
    // Instant or not, the money has left the wallet; "received by the beneficiary" is what the
    // 769 webhook later confirms, and that is what settles the bill.
    state: out.isInstant ? 'completed' : 'pending',
    note: out.fee > 0 ? `Viva charged a ${out.fee.toFixed(2)} fee on this transfer.` : undefined,
  };
}
