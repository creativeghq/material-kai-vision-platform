/**
 * #273 Phase 0 — provider-neutral payment ingestion.
 *
 * ONE path writes an inbound customer payment into the books, whatever provider
 * collected it. Extracted verbatim-in-behaviour from `stripe-webhooks`
 * (`handleInvoicePaymentSucceeded` / `handleStatementPaymentSucceeded`) so the Viva
 * webhook — and any future provider — inherits allocation, the seller-branded
 * receipt, and the customer/owner notifications for free instead of re-implementing
 * them and drifting.
 *
 * Two shapes, matching the two things a customer can pay:
 *   - `recordInvoicePayment`   — a specific invoice.
 *   - `recordStatementPayment` — a whole account balance, allocated oldest-first.
 *
 * GUARDRAIL: this module is for CUSTOMER→TENANT commerce payments only. Platform
 * billing (credits, subscriptions, module add-ons) settles to the OPERATOR's own
 * Stripe account and must never route through here — it has no invoice, no tenant
 * BYOK provider, and its own idempotency. See #273 blocker #4.
 */

import { emitFlowEvent } from '../flow-events.ts';

export type PaymentMethod = 'card' | 'bank_transfer' | 'cash' | 'check' | 'other';

/** Postgres unique_violation — our (provider, provider_ref) index caught a duplicate. */
const PG_UNIQUE_VIOLATION = '23505';

export interface PaymentSource {
  /** Provider slug — must match the module slug suffix: 'stripe' | 'viva'. */
  provider: string;
  /** Provider-side immutable id (Stripe payment_intent id, Viva TransactionId). */
  providerRef: string;
  /** Human label for the payment `reference` line, e.g. 'Stripe' / 'Viva'. */
  providerLabel: string;
  /** Gross amount in MAJOR units (euros, not cents). Callers convert. */
  amount: number;
  currency: string;
  method: PaymentMethod;
  /** Optional provider extra persisted on the row (Stripe checkout session). */
  checkoutSessionId?: string | null;
  /** Overrides the default `notes` line when the provider wants a specific one. */
  notes?: string;
}

export interface RecordResult {
  ok: boolean;
  /** True when this providerRef was already ingested — a safe no-op, not an error. */
  duplicate?: boolean;
  paymentId?: string;
  /** Amount actually applied to invoices; the remainder sits as on-account credit. */
  allocated?: number;
  unallocated?: number;
  error?: string;
}

/** Did this insert fail purely because the provider ref is already recorded? */
function isDuplicate(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === PG_UNIQUE_VIOLATION || /payments_provider_ref_uniq/.test(err.message ?? '');
}

/**
 * Has this provider payment already been ingested? Checked BEFORE the insert so the
 * common retry path is a cheap read; the unique index is the actual race-proof guarantee.
 */
async function findExisting(
  supabase: any,
  provider: string,
  providerRef: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('payments')
    .select('id')
    .eq('provider', provider)
    .eq('provider_ref', providerRef)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Record a payment against ONE invoice.
 *
 * Allocation is capped at the invoice's CURRENT `amount_due`, re-read inside this call
 * (#273 blocker #2): a webhook/redirect race, a double-click, or paying an invoice that
 * was settled manually in the meantime must not over-allocate. Any excess is left as
 * unallocated on-account credit rather than being silently dropped or refused — the money
 * genuinely arrived.
 */
export async function recordInvoicePayment(
  supabase: any,
  invoiceId: string,
  src: PaymentSource,
): Promise<RecordResult> {
  const existingId = await findExisting(supabase, src.provider, src.providerRef);
  if (existingId) {
    console.log(`[payments] ${src.provider} ${src.providerRef} already recorded as ${existingId}`);
    return { ok: true, duplicate: true, paymentId: existingId };
  }

  const { data: inv, error: invErr } = await supabase
    .from('invoices')
    .select('*, contact:crm_contacts!customer_contact_id(id, email, name), company:crm_companies!customer_company_id(id, email, name)')
    .eq('id', invoiceId)
    .single();
  if (invErr || !inv) {
    console.error('[payments] invoice not found', invoiceId, invErr?.message);
    return { ok: false, error: `invoice ${invoiceId} not found` };
  }

  const currency = (src.currency || inv.currency || 'eur').toUpperCase();

  const { data: paymentRow, error: payErr } = await supabase
    .from('payments')
    .insert({
      workspace_id: inv.workspace_id,
      direction: 'in',
      amount: src.amount,
      currency,
      method: src.method,
      paid_at: new Date().toISOString(),
      counterparty_contact_id: inv.customer_contact_id,
      counterparty_company_id: inv.customer_company_id,
      reference: `${src.providerLabel} ${src.providerRef}`,
      notes: src.notes ?? `Inv ${inv.internal_number} via ${src.providerLabel}`,
      provider: src.provider,
      provider_ref: src.providerRef,
      stripe_payment_intent_id: src.provider === 'stripe' ? src.providerRef : null,
      // Legacy Stripe-only column: keep populating it for existing reporting. Falls back to
      // the session the invoice recorded when the checkout link was minted.
      stripe_checkout_session_id:
        src.checkoutSessionId ?? (src.provider === 'stripe' ? inv.stripe_checkout_session_id ?? null : null),
    })
    .select('id')
    .single();

  if (payErr || !paymentRow) {
    // Lost the race to a concurrent delivery of the same event — the other one won,
    // and it did (or is doing) the identical work. Not a failure.
    if (isDuplicate(payErr)) {
      const winner = await findExisting(supabase, src.provider, src.providerRef);
      console.log(`[payments] concurrent duplicate for ${src.provider} ${src.providerRef}`);
      return { ok: true, duplicate: true, paymentId: winner ?? undefined };
    }
    console.error('[payments] insert failed', payErr?.message);
    return { ok: false, error: payErr?.message ?? 'payments insert failed' };
  }

  // Cap the allocation at what is still owed RIGHT NOW.
  const due = Number(inv.amount_due ?? 0);
  const applied = Math.max(0, Math.min(due, src.amount));
  const unallocated = Number((src.amount - applied).toFixed(2));

  if (applied > 0) {
    const { error: allocErr } = await supabase
      .from('payment_allocations')
      .insert({ payment_id: paymentRow.id, invoice_id: inv.id, amount: applied });
    if (allocErr) {
      // The payment row stands (money did arrive) but the books won't show the invoice
      // settled — loud, because it needs a human.
      console.error('[payments] allocation insert failed', allocErr.message);
      return { ok: false, paymentId: paymentRow.id, error: allocErr.message };
    }
  }
  if (unallocated > 0) {
    console.warn(
      `[payments] ${src.provider} ${src.providerRef}: ${unallocated} ${currency} exceeds invoice ${inv.internal_number} due (${due}) — left as on-account credit`,
    );
  }

  console.log(
    `[payments] recorded ${src.provider} payment ${paymentRow.id} for invoice ${inv.internal_number} (${src.amount} ${currency}, allocated ${applied})`,
  );

  // Owner-facing bell, routed through Flows (#245 D) so admins can pause/retarget.
  if (inv.created_by) {
    await emitFlowEvent('invoice_paid', {
      user_id: inv.created_by,
      type: 'invoice_paid',
      title: `Invoice ${inv.internal_number} paid`,
      body: `${currency} ${src.amount.toFixed(2)} received via ${src.method === 'card' ? 'card' : src.providerLabel}.`,
      action_url: `/admin/finance/invoices/${inv.id}`,
      invoice_id: inv.id,
      amount: src.amount,
      currency,
      provider: src.provider,
      payment_intent_id: src.providerRef,
      workspace_id: inv.workspace_id,
    }).catch(() => {});
  }

  // Customer-facing: seller-branded receipt + notification, same document a manual
  // payment produces. Backgrounded — the provider must not wait on PDF rendering.
  const cust = (inv.company ?? inv.contact) as { email?: string; name?: string } | null;
  runInBackground((async () => {
    const receiptUrl = await generatePaymentReceipt(paymentRow.id);
    await emitFlowEvent('payment_received', {
      type: 'payment_received',
      customer_email: cust?.email ?? undefined,
      customer_name: cust?.name ?? undefined,
      invoice_id: inv.id,
      payment_id: paymentRow.id,
      amount: `${src.amount.toFixed(2)} ${currency}`,
      currency,
      workspace_id: inv.workspace_id,
      receipt_url: receiptUrl ?? undefined,
      receipt_line: receiptLineFor(receiptUrl),
      title: `Payment received — ${src.amount.toFixed(2)} ${currency}`,
      body: `We received your payment of ${src.amount.toFixed(2)} ${currency} for invoice ${inv.internal_number}.`,
      action_url: `/finance/invoices/${inv.id}`,
    }).catch(() => {});
  })());

  return { ok: true, paymentId: paymentRow.id, allocated: applied, unallocated };
}

/**
 * Record a payment against a customer's WHOLE outstanding balance (no single invoice) —
 * the statement "pay balance" flow. Allocates oldest-first across open invoices; any
 * remainder stays as unallocated on-account credit.
 */
export async function recordStatementPayment(
  supabase: any,
  party: { workspaceId: string; partyType: 'company' | 'contact'; partyId: string },
  src: PaymentSource,
): Promise<RecordResult> {
  const existingId = await findExisting(supabase, src.provider, src.providerRef);
  if (existingId) {
    console.log(`[payments] statement ${src.provider} ${src.providerRef} already recorded as ${existingId}`);
    return { ok: true, duplicate: true, paymentId: existingId };
  }

  const currency = (src.currency || 'eur').toUpperCase();
  const isCompany = party.partyType === 'company';

  const { data: paymentRow, error: payErr } = await supabase
    .from('payments')
    .insert({
      workspace_id: party.workspaceId,
      direction: 'in',
      amount: src.amount,
      currency,
      method: src.method,
      paid_at: new Date().toISOString(),
      counterparty_contact_id: isCompany ? null : party.partyId,
      counterparty_company_id: isCompany ? party.partyId : null,
      reference: `${src.providerLabel} ${src.providerRef}`,
      notes: src.notes ?? `Account balance via ${src.providerLabel}`,
      provider: src.provider,
      provider_ref: src.providerRef,
      stripe_payment_intent_id: src.provider === 'stripe' ? src.providerRef : null,
    })
    .select('id')
    .single();

  if (payErr || !paymentRow) {
    if (isDuplicate(payErr)) {
      const winner = await findExisting(supabase, src.provider, src.providerRef);
      return { ok: true, duplicate: true, paymentId: winner ?? undefined };
    }
    console.error('[payments] statement insert failed', payErr?.message);
    return { ok: false, error: payErr?.message ?? 'payments insert failed' };
  }

  // Oldest-first across this party's open invoices.
  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('id, amount_due, issued_at, status')
    .eq('workspace_id', party.workspaceId)
    .eq(isCompany ? 'customer_company_id' : 'customer_contact_id', party.partyId)
    .order('issued_at', { ascending: true });

  let remaining = src.amount;
  const allocations: Array<{ payment_id: string; invoice_id: string; amount: number }> = [];
  for (const inv of (openInvoices ?? [])) {
    if (remaining <= 0) break;
    if (inv.status === 'void' || inv.status === 'credit_noted' || inv.status === 'draft') continue;
    const due = Number(inv.amount_due || 0);
    if (due <= 0) continue;
    const applied = Math.min(due, remaining);
    allocations.push({ payment_id: paymentRow.id, invoice_id: inv.id, amount: applied });
    remaining -= applied;
  }
  if (allocations.length > 0) {
    const { error: allocErr } = await supabase.from('payment_allocations').insert(allocations);
    if (allocErr) console.error('[payments] statement allocations insert failed', allocErr.message);
  }

  const { data: partyRow } = await supabase
    .from(isCompany ? 'crm_companies' : 'crm_contacts')
    .select('email, name')
    .eq('id', party.partyId)
    .maybeSingle();

  runInBackground((async () => {
    const receiptUrl = await generatePaymentReceipt(paymentRow.id);
    await emitFlowEvent('payment_received', {
      type: 'payment_received',
      customer_email: (partyRow as any)?.email ?? undefined,
      customer_name: (partyRow as any)?.name ?? undefined,
      payment_id: paymentRow.id,
      amount: `${src.amount.toFixed(2)} ${currency}`,
      currency,
      workspace_id: party.workspaceId,
      receipt_url: receiptUrl ?? undefined,
      receipt_line: receiptLineFor(receiptUrl),
      title: `Payment received — ${src.amount.toFixed(2)} ${currency}`,
      body: `We received your account payment of ${src.amount.toFixed(2)} ${currency}. Thank you.`,
      action_url: '/finance',
    }).catch(() => {});
  })());

  console.log(
    `[payments] recorded ${src.provider} statement payment ${paymentRow.id} (${src.amount} ${currency}); ${allocations.length} invoice(s), ${remaining.toFixed(2)} on account`,
  );

  return {
    ok: true,
    paymentId: paymentRow.id,
    allocated: Number((src.amount - remaining).toFixed(2)),
    unallocated: Number(remaining.toFixed(2)),
  };
}

/**
 * Generate the seller's own payment receipt (απόδειξη είσπραξης) and return a link.
 * `finance-invoice-pdf` accepts a service call (x-cron-secret) for payment receipts
 * specifically, since a webhook has no user.
 *
 * Best-effort by design: a receipt failure must never fail the webhook (the provider
 * would retry the whole delivery). We fall back to a receipt-less notification.
 */
export async function generatePaymentReceipt(paymentId: string): Promise<string | null> {
  try {
    const base = Deno.env.get('SUPABASE_URL');
    const secret = Deno.env.get('CRON_SECRET');
    if (!base || !secret) return null;
    const res = await fetch(`${base}/functions/v1/finance-invoice-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({ payment_id: paymentId }),
    });
    if (!res.ok) {
      console.error(`[payments] receipt generation failed (${res.status}) for ${paymentId}`);
      return null;
    }
    const out = await res.json();
    return (out?.pdf_url as string) ?? null;
  } catch (err) {
    console.error('[payments] receipt generation threw', err);
    return null;
  }
}

/** Customer-facing "download your receipt" line for the payment_received email. */
export function receiptLineFor(url: string | null): string {
  return url ? `<p><a href="${url}">Download your receipt</a></p>` : '';
}

/**
 * Run follow-up work AFTER the webhook has already answered the provider.
 *
 * Providers give a delivery ~10s before timing out and retrying. Rendering a receipt PDF
 * (font fetch + layout) eats into that, and the provider does not need to know about it —
 * the payment row is committed by the time we get here. `EdgeRuntime.waitUntil` keeps the
 * worker alive past the response. Falls back to awaiting inline where unsupported.
 */
export function runInBackground(work: Promise<unknown>): Promise<void> {
  const guarded = work.catch((err) => console.error('[payments] background task failed', err));
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === 'function') {
    rt.waitUntil(guarded);
    return Promise.resolve();
  }
  return guarded as Promise<void>;
}
