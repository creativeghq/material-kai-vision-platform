/**
 * #273 — a persistent RF (bank-transfer) code ON the invoice/proforma document.
 *
 * Distinct from the transient RF a buyer mints by clicking "bank transfer" on the pay page:
 * a customer may receive the PDF or the email and never open the pay link, so the code has
 * to live on the document itself, next to the IBANs. This is the ONE place that mints or
 * reuses it, so the PDF, the email, and the pay page all show the SAME code.
 *
 * Storage reuses `invoice_payment_intents` (method 'bank_reference') — the same table the
 * 2054 settlement loop already polls — so a document RF settles through the exact same path
 * as a pay-page one, with no second mechanism.
 *
 * Idempotent + amount-aware: it reuses an existing pending RF intent whose amount still
 * matches what's payable, and only mints a fresh (never-expiring) Viva order when there
 * is none or the amount drifted (e.g. a proforma edited before issue).
 *
 * Returns null — never throws — when the workspace can't offer RF (Viva not connected, the
 * bank_reference method disabled, non-EUR, nothing payable). Renderers just omit the code.
 */

import { getPaymentProvider } from './registry.ts';
import { mintInvoiceRf } from './viva-provider.ts';

export interface InvoiceRf {
  rfCode: string;
  orderCode: string;
  amount: number;
  currency: string;
}

/** Cent-precision equality so 10.00 vs 10.001 rounding never forces a re-mint. */
function sameAmount(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export async function ensureInvoiceRf(supabase: any, invoiceId: string): Promise<InvoiceRf | null> {
  const { data: inv, error } = await supabase
    .from('invoices')
    .select('id, workspace_id, internal_number, currency, amount_due, status')
    .eq('id', invoiceId)
    .maybeSingle();
  if (error || !inv) return null;

  // Nothing to collect (paid / void / credit-noted / zero balance) → no code.
  if (inv.status === 'void' || inv.status === 'credit_noted' || inv.status === 'paid') return null;
  const payable = Number(inv.amount_due ?? 0);
  if (!(payable > 0)) return null;

  const currency = String(inv.currency || 'EUR').toUpperCase();

  // RF is a Viva capability. Resolve the tenant's Viva context; bail quietly if unusable.
  const viva = getPaymentProvider('viva');
  if (!viva || !viva.methods.includes('bank_reference')) return null;
  if (viva.currencies && !viva.currencies.includes(currency)) return null; // RF is EUR/Greece

  const ctx = await viva.resolveContext(supabase, inv.workspace_id).catch(() => null);
  if (!ctx) return null; // Viva not connected/enabled for this workspace
  // Respect the tenant's per-workspace method toggle (resolveContext carries it).
  const enabledMethods = String(ctx.credentials.__methods ?? '').split(',').map((s) => s.trim());
  if (enabledMethods.length && !enabledMethods.includes('bank_reference')) return null;

  // Reuse an existing pending RF intent if its amount still matches.
  const { data: existing } = await supabase
    .from('invoice_payment_intents')
    .select('id, provider_order_code, rf_code, amount, currency, status')
    .eq('invoice_id', invoiceId)
    .eq('provider', 'viva')
    .eq('method', 'bank_reference')
    .eq('status', 'pending')
    .not('rf_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.rf_code && existing.provider_order_code && sameAmount(Number(existing.amount), payable)) {
    return {
      rfCode: existing.rf_code,
      orderCode: String(existing.provider_order_code),
      amount: payable,
      currency,
    };
  }

  // Mint a fresh never-expiring RF order and persist the intent.
  let minted;
  try {
    minted = await mintInvoiceRf(ctx, {
      invoiceId,
      invoiceNumber: inv.internal_number,
      amount: payable,
      currency,
      description: `Invoice ${inv.internal_number}`,
    });
  } catch (err) {
    console.error('[invoice-rf] mint failed for', invoiceId, err);
    return null;
  }

  const { error: insErr } = await supabase.from('invoice_payment_intents').insert({
    workspace_id: inv.workspace_id,
    invoice_id: invoiceId,
    provider: 'viva',
    method: 'bank_reference',
    amount: payable,
    currency,
    provider_order_code: minted.orderCode,
    rf_code: minted.rfCode,
    status: 'pending',
  });
  if (insErr) {
    // The RF is valid at Viva; we just failed to record it. Log loudly but still return it
    // so the current render isn't blank — the settlement sweep keys on the order state.
    console.error('[invoice-rf] intent insert failed for', invoiceId, insErr.message);
  }

  return { rfCode: minted.rfCode, orderCode: minted.orderCode, amount: payable, currency };
}

/**
 * Read-only lookup for surfaces that CANNOT mint (the frontend preview has no Viva
 * credentials): return the latest pending document RF if one already exists, else null.
 */
export async function getInvoiceRf(supabase: any, invoiceId: string): Promise<InvoiceRf | null> {
  const { data } = await supabase
    .from('invoice_payment_intents')
    .select('provider_order_code, rf_code, amount, currency, status')
    .eq('invoice_id', invoiceId)
    .eq('provider', 'viva')
    .eq('method', 'bank_reference')
    .eq('status', 'pending')
    .not('rf_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.rf_code || !data.provider_order_code) return null;
  return {
    rfCode: data.rf_code,
    orderCode: String(data.provider_order_code),
    amount: Number(data.amount),
    currency: String(data.currency || 'EUR'),
  };
}
