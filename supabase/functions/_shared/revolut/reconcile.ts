/**
 * Revolut feed reconciliation (#315 phase 2) — match incoming statement lines to open
 * invoices and settle them through the ONE money path.
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

export interface ReconcileResult {
  scanned: number;
  autoMatched: number;
  suggested: number;
  unmatched: number;
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

/** The workspace owner's user id — recipient of unmatched-payment notifications. */
async function workspaceOwnerId(service: any, workspaceId: string): Promise<string | null> {
  const { data } = await service
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Settle one line against one invoice and stamp the row. Shared by auto + manual. */
export async function settleTransaction(
  service: any,
  tx: any,
  invoiceId: string,
  method: 'reference' | 'amount_name' | 'manual',
): Promise<{ ok: boolean; error?: string }> {
  const res = await recordInvoicePayment(service, invoiceId, {
    provider: 'revolut',
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

export async function reconcileWorkspaceRevolut(service: any, workspaceId: string): Promise<ReconcileResult> {
  const result: ReconcileResult = { scanned: 0, autoMatched: 0, suggested: 0, unmatched: 0, errors: [] };

  const { data: txs, error: txErr } = await service
    .from('revolut_bank_transactions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('match_status', 'unmatched')
    .eq('direction', 'in')
    .eq('state', 'completed')
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

  let invoices = await loadOpenInvoices(service, workspaceId);
  const ownerId = await workspaceOwnerId(service, workspaceId);

  for (const tx of lines) {
    const refText = nameKey(String(tx.reference ?? ''));
    const cpName = nameKey(String(tx.counterparty_name ?? ''));
    const txCurrency = String(tx.currency ?? 'EUR').toUpperCase();
    const sameCurrency = invoices.filter((i) => i.currency === txCurrency);

    // 1. Invoice number quoted in the transfer text.
    const byNumber = sameCurrency.filter((i) => refText.includes(nameKey(i.internal_number)));
    // 2/3. Amount and name signals.
    const byAmount = sameCurrency.filter((i) => centsEqual(i.amount_due, Number(tx.amount)));
    const byName = cpName ? sameCurrency.filter((i) => namesMatch(i.customer_name, cpName)) : [];

    let settled = false;
    if (byNumber.length === 1) {
      const s = await settleTransaction(service, tx, byNumber[0].id, 'reference');
      if (s.ok) { result.autoMatched++; settled = true; } else result.errors.push(`${tx.provider_ref}: ${s.error}`);
    } else if (byAmount.length === 1 && byName.some((i) => i.id === byAmount[0].id)) {
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
    if (ownerId && !tx.unmatched_notified_at) {
      await emitFlowEvent('bank_payment_unmatched', {
        user_id: ownerId,
        type: 'bank_payment_unmatched',
        title: 'Unmatched bank payment',
        body: `${txCurrency} ${Number(tx.amount).toFixed(2)} from ${tx.counterparty_name ?? 'unknown sender'} — no invoice matched. Review the bank feed.`,
        action_url: '/finance?tab=settings&section=banks',
        workspace_id: workspaceId,
        amount: Number(tx.amount),
        currency: txCurrency,
        counterparty: tx.counterparty_name ?? null,
        reference: tx.reference ?? null,
      }).catch((err) => console.warn('[revolut/reconcile] flow emit failed:', err?.message ?? err));
      await service
        .from('revolut_bank_transactions')
        .update({ unmatched_notified_at: new Date().toISOString() })
        .eq('id', tx.id);
    }
  }

  return result;
}
