/**
 * Revolut feed reconciliation (#315 phase 2) — match incoming statement lines to open
 * invoices and settle them through the ONE money path.
 *
 * WHAT EVEN ENTERS THE MATCHER. Two filters run before the ladder, because the feed is
 * per-LEG and carries every kind of money movement, not just customer payments:
 *   - `type = 'transfer'` only. A `topup`, `exchange` credit, `card_refund`, `refund` or
 *     `fee` leg is not a customer paying an invoice; letting those in filled the review
 *     queue with own-money and fired one "unmatched bank payment" alert per line.
 *   - Transactions with an `out` leg of ours are INTERNAL movements (pocket→pocket), whose
 *     `in` leg is otherwise indistinguishable from an incoming customer payment. They are
 *     stamped `ignored` so they leave the review surface instead of being re-scanned and
 *     re-suggested on every pass. A transaction with more than one `in` leg is ambiguous
 *     (which leg is the payment?) and is never auto-settled — it can still be matched by
 *     hand from the feed.
 *
 * Matching ladder, most→least certain:
 *   1. `reference` — the transfer text contains exactly one open invoice's
 *      internal_number → AUTO-match.
 *   2. `amount_name` — exactly one open invoice has this exact amount_due AND the
 *      counterparty name matches the invoice's customer (transliterated, so a Greek
 *      bank statement matches a Latin CRM name) → AUTO-match.
 *   3. Weaker signals (unique amount alone, or name alone) → SUGGESTED: the line waits
 *      in the review queue with candidate invoice ids; a human confirms.
 *   4. Nothing → stays `unmatched`; one `bank_payment_unmatched` flow event is emitted
 *      per line, ever (stamped via unmatched_notified_at).
 *
 * Settlement is ALWAYS `recordInvoicePayment` (payments + payment_allocations →
 * `get_order_settlements` derives paid status) — never a local re-derivation
 * (CLAUDE.md anti-regression rule #1). Auto-match never over-pays: record-payment caps
 * allocation at live amount_due and leaves any excess as on-account credit.
 */

// deno-lint-ignore-file no-explicit-any

import { recordInvoicePayment } from '../payments/record-payment.ts';
import { emitFlowEvent } from '../flow-events.ts';
import { transliterateToLatin } from '../transliterate.ts';
import { financeNotifyRecipient } from './notify.ts';

/**
 * The only transaction type that can be a counterparty paying us (or us paying a
 * supplier). Everything else in the feed is own-money and must never reach the ladder.
 */
export const RECONCILABLE_TX_TYPE = 'transfer';

export interface ReconcileResult {
  scanned: number;
  autoMatched: number;
  suggested: number;
  unmatched: number;
  /** Internal pocket→pocket movements stamped `ignored` rather than offered for matching. */
  internal: number;
  errors: string[];
}

interface OpenInvoice {
  id: string;
  internal_number: string;
  amount_due: number;
  currency: string;
  customer_name: string;
}

/** Case/diacritic/script-insensitive normal form for name comparison. */
function nameKey(s: string | null | undefined): string {
  if (!s) return '';
  return (transliterateToLatin(s) ?? s).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function centsEqual(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** Names match when one normalized form contains the other (≥4 chars, so "AE" ≠ noise). */
function namesMatch(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  return a.includes(b) || b.includes(a);
}

async function loadOpenInvoices(service: any, workspaceId: string): Promise<OpenInvoice[]> {
  const { data, error } = await service
    .from('invoices')
    .select('id, internal_number, amount_due, currency, status, contact:crm_contacts!customer_contact_id(name), company:crm_companies!customer_company_id(name)')
    .eq('workspace_id', workspaceId)
    .in('status', ['issued', 'partially_paid', 'overdue'])
    .gt('amount_due', 0);
  if (error) throw new Error(`open-invoice load failed: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    internal_number: String(r.internal_number ?? ''),
    amount_due: Number(r.amount_due ?? 0),
    currency: String(r.currency ?? 'EUR').toUpperCase(),
    customer_name: nameKey(r.company?.name ?? r.contact?.name ?? ''),
  })).filter((i: OpenInvoice) => i.internal_number.length > 0);
}

export interface LegShape {
  /** Legs of this transaction that credit one of our accounts. */
  inLegs: number;
  /** Legs that debit one of our accounts — their presence means the money never left us. */
  outLegs: number;
  /**
   * How many legs the parent transaction actually had, per the rows themselves.
   *
   * `inLegs + outLegs < legsTotal` means we are looking at part of a transaction. Its shape is
   * unknown, not external — and the difference is a pocket transfer settling a customer invoice.
   */
  legsTotal: number | null;
}

/**
 * Group the feed's per-leg rows back onto their parent transaction.
 *
 * A single Revolut transaction becomes N rows (`<txid>:<legid>`), so amount-matching a
 * row in isolation is matching a fragment. The shape of the whole transaction is what
 * says whether its `in` leg is real incoming money (external counterparty → one in leg,
 * no out leg) or an internal pocket move (in AND out legs, both ours).
 */
export async function loadLegShapes(service: any, workspaceId: string, transactionIds: string[]): Promise<Map<string, LegShape>> {
  const shapes = new Map<string, LegShape>();
  if (transactionIds.length === 0) return shapes;
  for (let i = 0; i < transactionIds.length; i += 200) {
    const { data, error } = await service
      .from('revolut_bank_transactions')
      .select('transaction_id, direction, legs_total')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'revolut')
      .in('transaction_id', transactionIds.slice(i, i + 200));
    // THROW (#359 CM-12). This read destructured `{ data }` only, so a failed page contributed
    // nothing and every transaction in it fell to the "external money" default — a whole page of
    // pocket transfers auto-matched against customer invoices, with the run reporting success.
    // An incomplete picture must stop the pass, not quietly shrink it.
    if (error) throw new Error(`leg-shape load failed: ${error.message}`);
    for (const row of (data ?? []) as Array<{ transaction_id: string; direction: string; legs_total: number | null }>) {
      const cur = shapes.get(row.transaction_id) ?? { inLegs: 0, outLegs: 0, legsTotal: null };
      if (row.direction === 'in') cur.inLegs++; else cur.outLegs++;
      // Every row of one transaction carries the same total; keep the first non-null we see.
      if (cur.legsTotal === null && typeof row.legs_total === 'number') cur.legsTotal = row.legs_total;
      shapes.set(row.transaction_id, cur);
    }
  }
  return shapes;
}

/**
 * Is this transaction's shape fully known? (#359 CM-12)
 *
 * `null` legsTotal is a row written before the column existed — unknowable, so it counts as
 * incomplete. Fewer rows than the total means the rest have not been written yet.
 */
export function legShapeIsComplete(shape: LegShape | undefined): boolean {
  if (!shape) return false;
  if (typeof shape.legsTotal !== 'number') return false;
  return shape.inLegs + shape.outLegs >= shape.legsTotal;
}

/** Settle one line against one invoice and stamp the row. Shared by auto + manual. */
export async function settleTransaction(
  service: any,
  tx: any,
  invoiceId: string,
  method: 'reference' | 'amount_name' | 'manual',
): Promise<{ ok: boolean; error?: string }> {
  const res = await recordInvoicePayment(service, invoiceId, {
    provider: String(tx.provider ?? 'revolut'),
    providerRef: tx.provider_ref,
    providerLabel: 'Bank transfer (Revolut)',
    amount: Number(tx.amount),
    currency: String(tx.currency ?? 'EUR'),
    method: 'bank_transfer',
    bankAccountId: tx.bank_account_id ?? null,
    notes: tx.reference ? `Bank transfer: ${String(tx.reference).slice(0, 140)}` : undefined,
  });
  if (!res.ok) return { ok: false, error: res.error };
  const { error } = await service
    .from('revolut_bank_transactions')
    .update({
      match_status: 'matched',
      matched_invoice_id: invoiceId,
      match_method: method,
      matched_at: new Date().toISOString(),
      reconciled_payment_id: res.paymentId ?? null,
      suggested_invoice_ids: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tx.id);
  if (error) return { ok: false, error: `stamp failed: ${error.message}` };
  return { ok: true };
}

/**
 * OUTGOING side (#315): match completed outgoing transfers to supplier bills, so a
 * drafted bill run (whose payment references carry the bill number) marks its bills
 * paid when it actually executes. AUTO-ONLY and conservative:
 *   - reference quotes exactly one open bill's number, amount ≤ its due → settle
 *   - or exactly one open bill with cent-equal amount_due AND supplier-name match → settle
 * The payments row + payment_allocations.supplier_bill_id write mirrors the manual
 * bank-payment path; bill amount_paid/amount_due derive from allocations as always.
 *
 * What does NOT match is now announced. Money leaving the account with no bill behind it
 * — a transfer someone made by hand in the Revolut app — used to be visible only to
 * whoever thought to browse the feed; it now raises the same one-per-line
 * `bank_payment_unmatched` alert the incoming side has always raised.
 */
export async function reconcileOutgoingRevolut(service: any, workspaceId: string): Promise<{ settled: number; unmatched: number; errors: string[] }> {
  const out = { settled: 0, unmatched: 0, errors: [] as string[] };
  const { data: txs } = await service
    .from('revolut_bank_transactions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'revolut')
    .eq('match_status', 'unmatched')
    .eq('direction', 'out')
    .eq('state', 'completed')
    .eq('type', RECONCILABLE_TX_TYPE)
    .is('reconciled_payment_id', null)
    .order('booked_at', { ascending: true })
    .limit(200);
  if (!txs?.length) return out;

  const shapes = await loadLegShapes(service, workspaceId, [...new Set<string>(txs.map((t: any) => String(t.transaction_id)))]);
  const recipientId = await financeNotifyRecipient(service, workspaceId);

  const { data: billRows } = await service
    .from('supplier_bills')
    .select('id, supplier_bill_number, supplier_name, supplier_company_id, supplier_contact_id, amount_due, currency')
    .eq('workspace_id', workspaceId)
    .gt('amount_due', 0);
  const bills = (billRows ?? []).map((b: any) => ({
    ...b,
    numberKey: nameKey(String(b.supplier_bill_number ?? '')),
    nameKeyed: nameKey(String(b.supplier_name ?? '')),
    currency: String(b.currency ?? 'EUR').toUpperCase(),
  })).filter((b: any) => b.numberKey.length > 0 || b.nameKeyed.length > 0);

  for (const tx of txs as any[]) {
    const shape = shapes.get(String(tx.transaction_id));
    // Same fail-closed rule as the incoming side (#359 CM-12): an incomplete picture is not
    // "external", it is unknown. The default here was `{ inLegs: 0, outLegs: 1 }`, so a pocket
    // move whose credit leg had not synced looked like a supplier payment.
    if (!legShapeIsComplete(shape)) { out.unmatched++; continue; }
    // The mirror of the incoming guard: an out leg whose transaction also credits one of
    // our accounts is a pocket→pocket move, not a supplier payment.
    if (shape!.inLegs > 0) {
      await service
        .from('revolut_bank_transactions')
        .update({ match_status: 'ignored', updated_at: new Date().toISOString() })
        .eq('id', tx.id);
      continue;
    }

    const refText = nameKey(String(tx.reference ?? ''));
    const cpName = nameKey(String(tx.counterparty_name ?? ''));
    const txCurrency = String(tx.currency ?? 'EUR').toUpperCase();
    const sameCcy = bills.filter((b: any) => b.currency === txCurrency && Number(b.amount_due) > 0);

    const byNumber = sameCcy.filter((b: any) => b.numberKey && refText.includes(b.numberKey));
    const byAmountName = sameCcy.filter((b: any) =>
      centsEqual(Number(b.amount_due), Number(tx.amount)) && cpName && namesMatch(b.nameKeyed, cpName));

    let bill: any = null;
    let method: 'reference' | 'amount_name' | null = null;
    if (byNumber.length === 1 && Number(tx.amount) <= Number(byNumber[0].amount_due) + 0.01) {
      bill = byNumber[0]; method = 'reference';
    } else if (byNumber.length === 0 && byAmountName.length === 1) {
      bill = byAmountName[0]; method = 'amount_name';
    }
    if (!bill || !method) {
      out.unmatched++;
      // Only escalate when the tenant actually tracks payables. With no open bill to
      // match against, "outgoing money with no bill behind it" describes rent, payroll
      // and tax as much as it describes a missed supplier payment — the review queue
      // shows those; a notification each would train people to ignore the alert.
      if (recipientId && bills.length > 0 && !tx.unmatched_notified_at) {
        await notifyUnmatched(service, workspaceId, recipientId, tx, 'out');
      }
      continue;
    }

    try {
      // Idempotent payments row (provider, provider_ref unique). On a duplicate, pick
      // up the EXISTING row and continue — a crash between payment insert and
      // allocation insert must be healed on the next pass, not orphaned forever
      // (same doctrine as record-payment's heal-on-redelivery).
      let payId: string | null = null;
      const { data: pay, error: payErr } = await service.from('payments').insert({
        workspace_id: workspaceId,
        direction: 'out',
        amount: Number(tx.amount),
        currency: txCurrency,
        method: 'bank_transfer',
        paid_at: tx.booked_at ?? new Date().toISOString(),
        counterparty_company_id: bill.supplier_company_id,
        counterparty_contact_id: bill.supplier_contact_id,
        bank_account_id: tx.bank_account_id ?? null,
        reference: `Bank transfer (Revolut) ${tx.provider_ref}`,
        notes: `Auto-matched to bill ${bill.supplier_bill_number ?? bill.id}`,
        provider: 'revolut',
        provider_ref: tx.provider_ref,
      }).select('id').single();
      if (pay) payId = pay.id;
      else if (payErr && /duplicate|unique/i.test(payErr.message ?? '')) {
        const { data: existing } = await service.from('payments')
          .select('id').eq('provider', 'revolut').eq('provider_ref', tx.provider_ref).maybeSingle();
        payId = existing?.id ?? null;
        if (payId) {
          const { count } = await service.from('payment_allocations')
            .select('id', { count: 'exact', head: true }).eq('payment_id', payId);
          if ((count ?? 0) > 0) {
            // Fully recorded earlier — just stamp the line and move on.
            await service.from('revolut_bank_transactions').update({
              match_status: 'matched', match_method: method,
              matched_at: new Date().toISOString(), reconciled_payment_id: payId,
              updated_at: new Date().toISOString(),
            }).eq('id', tx.id);
            out.settled++;
            continue;
          }
        }
      }
      if (!payId) {
        if (payErr) out.errors.push(`${tx.provider_ref}: ${payErr.message}`);
        continue;
      }
      const applied = Math.min(Number(tx.amount), Number(bill.amount_due));
      // The over-allocation trigger raises when sum(allocations) would exceed the bill
      // total; a race that trips it lands in errors and retries next pass.
      const { error: allocErr } = await service.from('payment_allocations').insert({
        payment_id: payId,
        supplier_bill_id: bill.id,
        amount: applied,
        amount_doc_currency: applied,
        fx_rate: 1,
      });
      if (allocErr) {
        out.errors.push(`${tx.provider_ref}: allocation failed: ${allocErr.message}`);
        continue;
      }
      await service.from('revolut_bank_transactions').update({
        match_status: 'matched',
        match_method: method,
        matched_at: new Date().toISOString(),
        reconciled_payment_id: payId,
        updated_at: new Date().toISOString(),
      }).eq('id', tx.id);
      bill.amount_due = Number(bill.amount_due) - applied;
      out.settled++;
    } catch (err) {
      out.errors.push(`${tx.provider_ref}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return out;
}

export async function reconcileWorkspaceRevolut(service: any, workspaceId: string): Promise<ReconcileResult> {
  const result: ReconcileResult = { scanned: 0, autoMatched: 0, suggested: 0, unmatched: 0, internal: 0, errors: [] };

  const { data: txs, error: txErr } = await service
    .from('revolut_bank_transactions')
    .select('*')
    .eq('workspace_id', workspaceId)
    // Only REVOLUT rows auto-match: stripe/viva feed rows describe money the provider
    // webhooks already settled — rematching them would double-book.
    .eq('provider', 'revolut')
    .eq('match_status', 'unmatched')
    .eq('direction', 'in')
    .eq('state', 'completed')
    // Own-money movements (top-ups, exchanges, refunds, fees) are not invoice payments.
    .eq('type', RECONCILABLE_TX_TYPE)
    .is('reconciled_payment_id', null)
    .order('booked_at', { ascending: true })
    .limit(500);
  if (txErr) {
    result.errors.push(`feed load failed: ${txErr.message}`);
    return result;
  }
  const lines = txs ?? [];
  result.scanned = lines.length;
  if (lines.length === 0) return result;

  const shapes = await loadLegShapes(service, workspaceId, [...new Set<string>(lines.map((l: any) => String(l.transaction_id)))]);
  let invoices = await loadOpenInvoices(service, workspaceId);
  const recipientId = await financeNotifyRecipient(service, workspaceId);
  if (!recipientId) {
    console.warn(`[revolut/reconcile] ${workspaceId}: no active member — unmatched-payment alerts cannot be delivered`);
  }

  for (const tx of lines) {
    const shape = shapes.get(String(tx.transaction_id));

    // FAIL CLOSED on an incomplete picture (#359 CM-12). The default here used to be
    // `{ inLegs: 1, outLegs: 0 }` — "external money" — so a transaction whose sibling out leg had
    // not been written yet was auto-matched against a customer invoice. That is the exact hazard
    // CLAUDE.md records about this feed: match a row in isolation and an internal pocket move
    // settles a customer invoice.
    //
    // Left `unmatched` rather than `ignored`: we do not know it is internal either, and the next
    // pass — once the missing legs have synced — will classify it properly. Ignoring it here would
    // hide a real payment for good.
    if (!legShapeIsComplete(shape)) {
      result.unmatched++;
      continue;
    }

    // Both sides of the transaction are ours → pocket→pocket move, not a payment. Stamp
    // it so it stops coming back on every pass instead of silently re-suggesting.
    // Safe because Revolut carries transfer fees as leg ATTRIBUTES, not as extra legs, so
    // a genuine incoming transfer has exactly one leg — and because `ignored` is not a
    // dead end: the row stays visible in the feed and is still matchable by hand.
    if (shape!.outLegs > 0) {
      const { error } = await service
        .from('revolut_bank_transactions')
        .update({ match_status: 'ignored', updated_at: new Date().toISOString() })
        .eq('id', tx.id);
      if (error) result.errors.push(`${tx.provider_ref}: internal stamp failed: ${error.message}`);
      else result.internal++;
      continue;
    }

    const refText = nameKey(String(tx.reference ?? ''));
    const cpName = nameKey(String(tx.counterparty_name ?? ''));
    const txCurrency = String(tx.currency ?? 'EUR').toUpperCase();
    const sameCurrency = invoices.filter((i) => i.currency === txCurrency);

    // 1. Invoice number quoted in the transfer text.
    const byNumber = sameCurrency.filter((i) => refText.includes(nameKey(i.internal_number)));
    // 2/3. Amount and name signals.
    const byAmount = sameCurrency.filter((i) => centsEqual(i.amount_due, Number(tx.amount)));
    const byName = cpName ? sameCurrency.filter((i) => namesMatch(i.customer_name, cpName)) : [];

    // A transaction split across several incoming legs cannot be auto-settled: this row
    // is a fragment of the payment, so its amount matches nothing and its reference
    // matches everything. Candidates still surface for a human.
    const singleLeg = shape!.inLegs === 1;

    let settled = false;
    if (singleLeg && byNumber.length === 1) {
      const s = await settleTransaction(service, tx, byNumber[0].id, 'reference');
      if (s.ok) { result.autoMatched++; settled = true; } else result.errors.push(`${tx.provider_ref}: ${s.error}`);
    } else if (singleLeg && byAmount.length === 1 && byName.some((i) => i.id === byAmount[0].id)) {
      const s = await settleTransaction(service, tx, byAmount[0].id, 'amount_name');
      if (s.ok) { result.autoMatched++; settled = true; } else result.errors.push(`${tx.provider_ref}: ${s.error}`);
    }
    if (settled) {
      // A settled invoice's amount_due changed — reload so the next line can't re-hit it.
      invoices = await loadOpenInvoices(service, workspaceId);
      continue;
    }

    // Weak signals → review queue with candidates (number hits first, then name, then amount).
    const candidates = [...new Set([...byNumber, ...byName, ...byAmount].map((i) => i.id))].slice(0, 5);
    if (candidates.length > 0) {
      const { error } = await service
        .from('revolut_bank_transactions')
        .update({
          match_status: 'suggested',
          suggested_invoice_ids: candidates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);
      if (error) result.errors.push(`${tx.provider_ref}: suggest stamp failed: ${error.message}`);
      else result.suggested++;
      continue;
    }

    result.unmatched++;
    // One notification per line, ever.
    if (recipientId && !tx.unmatched_notified_at) {
      await notifyUnmatched(service, workspaceId, recipientId, tx, 'in');
    }
  }

  return result;
}

/**
 * One `bank_payment_unmatched` event per feed line, ever (stamped via
 * `unmatched_notified_at`). Both directions use the same trigger — the payload's
 * `direction` lets a flow branch — so adding the money-out side needed no new trigger
 * type and no second seeded flow.
 */
async function notifyUnmatched(
  service: any,
  workspaceId: string,
  recipientId: string,
  tx: any,
  direction: 'in' | 'out',
): Promise<void> {
  const currency = String(tx.currency ?? 'EUR').toUpperCase();
  const amount = Number(tx.amount);
  const party = tx.counterparty_name ?? (direction === 'in' ? 'unknown sender' : 'unknown recipient');
  await emitFlowEvent('bank_payment_unmatched', {
    user_id: recipientId,
    type: 'bank_payment_unmatched',
    title: direction === 'in' ? 'Unmatched bank payment' : 'Unmatched outgoing payment',
    body: direction === 'in'
      ? `${currency} ${amount.toFixed(2)} from ${party} — no invoice matched. Review the bank feed.`
      : `${currency} ${amount.toFixed(2)} paid to ${party} — no supplier bill matched. Review the bank feed.`,
    action_url: '/finance?tab=settings&section=banks',
    workspace_id: workspaceId,
    direction,
    amount,
    currency,
    counterparty: tx.counterparty_name ?? null,
    reference: tx.reference ?? null,
  }).catch((err: any) => console.warn('[revolut/reconcile] flow emit failed:', err?.message ?? err));
  await service
    .from('revolut_bank_transactions')
    .update({ unmatched_notified_at: new Date().toISOString() })
    .eq('id', tx.id);
}
