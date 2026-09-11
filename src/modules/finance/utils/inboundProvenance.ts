/** Two facts about an inbound document that the Expenses Inbox keeps apart on purpose. */

import type { InboundLinesSource, InboundSource } from '@/modules/finance/services/inboundService';

/** Filter + chip wording for each inlet. One list; the filter and the table both read it. */
export const INBOUND_SOURCE_LABEL: Record<InboundSource, string> = {
  mydata: 'From supplier (myDATA)',
  mydata_self: 'Entered in myAADE',
  email: 'Email',
  upload: 'Upload',
  peppol: 'Peppol',
  api: 'Supplier API',
};

/** The short form that fits in a table row. `mydata` gets none — it is the unremarkable case. */
export const INBOUND_SOURCE_CHIP: Partial<Record<InboundSource, string>> = {
  mydata_self: 'Entered in myAADE',
  email: 'Email',
  upload: 'Upload',
  peppol: 'Peppol',
  api: 'Supplier API',
};

export function inboundSourceLabel(source: string | null | undefined): string {
  return INBOUND_SOURCE_LABEL[(source ?? 'mydata') as InboundSource] ?? String(source);
}

/**
 * Worded as the operator's question — "does this document still need me?" — not as the enum.
 * `document` is Phase 2 (extracted from an attached PDF against the myDATA total as an anchor).
 */
export const INBOUND_DETAIL_LABEL: Record<InboundLinesSource, string> = {
  none: 'Needs detail',
  user: 'Detail added',
  document: 'Detail added',
  mydata: 'Came with detail',
};

export function inboundDetailLabel(linesSource: string | null | undefined): string {
  return INBOUND_DETAIL_LABEL[(linesSource ?? 'none') as InboundLinesSource] ?? String(linesSource);
}

/** A document nobody has completed yet. This is what gates the Phase 1b line editor. */
export const needsLineDetail = (doc: { lines_source?: string | null }): boolean =>
  (doc.lines_source ?? 'none') === 'none';

/**
 * AADE voided this document. Nothing may be booked, received or itemised against it — the
 * refusal itself lives in `_inbound_doc_to_supplier_bill_core`, because PostgREST and the agent
 * tools reach that function without passing this file; hiding the action here only spares the
 * operator an error they cannot act on.
 */
export const isCancelledDocument = (doc: { cancelled_by_mark?: string | null }): boolean =>
  String(doc.cancelled_by_mark ?? '').trim() !== '';

/** myDATA `invoiceType` family — the part before the dot. `'14.1'` -> `'14'`. */
export const docFamily = (docType: string | null | undefined): string =>
  String(docType ?? '').split('.')[0];

/**
 * 13.x (foreign services) and 14.x (foreign purchases) are reverse-charged: the acquisition is
 * zero-rated at source, we self-account the VAT and reclaim it in the same return, so it nets to
 * zero and never moves. The supplier is owed the NET.
 */
export const isReverseCharged = (docType: string | null | undefined): boolean =>
  docFamily(docType) === '13' || docFamily(docType) === '14';

/**
 * What the supplier actually invoiced — the only total a reader should ever be shown as "what
 * this cost".
 */
export function invoicedTotal(doc: {
  doc_type?: string | null; total_net?: number | null; total_gross?: number | null;
}): number {
  if (isReverseCharged(doc.doc_type)) return doc.total_net ?? 0;
  return doc.total_gross ?? 0;
}

/**
 * The VAT we self-assess and reclaim on a reverse-charged purchase, or null when the document is
 * an ordinary one whose VAT is really owed. Never presented as part of a cost — it exists so the
 * figure stays reachable (it belongs on the VAT return) rather than silently disappearing.
 */
export function selfAccountedVat(doc: {
  doc_type?: string | null; total_vat?: number | null;
}): number | null {
  if (!isReverseCharged(doc.doc_type)) return null;
  return doc.total_vat ?? 0;
}

/**
 * Payroll is never a supplier bill. 17.x arrives on the same RequestTransmittedDocs call as the
 * foreign purchases and is visible for the same reason, but it belongs to the HR module — booking
 * it in payables would double-count it against payroll already recorded there. Enforced in SQL by
 * `_inbound_doc_to_supplier_bill_core`; this hides the offer rather than letting it fail.
 */
export const isPayrollDocument = (docType: string | null | undefined): boolean =>
  docFamily(docType) === '17';

/**
 * On a self-transmitted document `series` is OUR ΑΦΜ and `aa` a counter we assigned ourselves —
 * the supplier's own invoice number is not in the myDATA record at all. Printing them produces a
 * number the operator will try, and fail, to match against the supplier's statement, so a
 * document that has no number must say so rather than show a plausible one.
 */
export function inboundDocumentNumber(doc: {
  source?: string | null; series?: string | null; aa?: string | null;
}): string | null {
  if ((doc.source ?? 'mydata') === 'mydata_self') return null;
  const parts = [doc.series, doc.aa].map((p) => String(p ?? '').trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}
