// deno-lint-ignore-file no-explicit-any
/**
 * Tell the seeded flows a sales document was issued — ONE emitter, two callers.
 *
 * `finance-issue-invoice` fires this after `mark_invoice_issued` (the manual and quote paths);
 * `_shared/payments/record-payment.ts` fires it when a draft paid in full online is issued by
 * `issue_invoice_on_online_payment`. Both events (`invoice_issued` / `receipt_issued`) are
 * SERVER_ONLY in flow-engine, which is why this lives in `_shared` and not in a component.
 *
 * Receipt vs invoice follows the DOCUMENT TYPE (family 11 is retail), never the buyer guess.
 */
import { emitFlowEvent } from '../flow-events.ts';

export async function emitDocumentIssued(supabase: any, invoiceId: string): Promise<void> {
  try {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, internal_number, legal_number, document_type, total, currency, customer_company_id, customer_contact_id, workspace_id')
      .eq('id', invoiceId)
      .maybeSingle();
    if (!inv) return;
    const isReceipt = String(inv.document_type ?? '').startsWith('11');
    let name: string | null = null, email: string | null = null, userId: string | null = null;
    if (inv.customer_company_id) {
      const { data: c } = await supabase.from('crm_companies').select('name, email').eq('id', inv.customer_company_id).maybeSingle();
      name = c?.name ?? null; email = c?.email ?? null;
    } else if (inv.customer_contact_id) {
      const { data: c } = await supabase.from('crm_contacts').select('name, first_name, last_name, email, user_id').eq('id', inv.customer_contact_id).maybeSingle();
      name = c?.name || [c?.first_name, c?.last_name].filter(Boolean).join(' ') || null; email = c?.email ?? null; userId = c?.user_id ?? null;
    }
    const num = inv.legal_number ?? inv.internal_number ?? '';
    const amount = `${Number(inv.total ?? 0).toFixed(2)} ${inv.currency ?? 'EUR'}`;
    const docWord = isReceipt ? 'Receipt' : 'Invoice';
    await emitFlowEvent(isReceipt ? 'receipt_issued' : 'invoice_issued', {
      type: isReceipt ? 'receipt_issued' : 'invoice_issued',
      user_id: userId ?? undefined,
      customer_email: email ?? undefined,
      customer_name: name ?? undefined,
      invoice_id: inv.id,
      document_number: num,
      document_type: inv.document_type ?? undefined,
      amount,
      currency: inv.currency ?? 'EUR',
      workspace_id: inv.workspace_id,
      title: `${docWord} ${num} issued`,
      body: `${docWord} ${num} for ${amount}${name ? ` to ${name}` : ''} has been issued.`,
      action_url: `/finance/invoices/${inv.id}`,
    }).catch(() => {});
  } catch { /* best-effort */ }
}
