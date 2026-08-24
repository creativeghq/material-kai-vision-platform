/**
 * Two facts about an inbound document that the Expenses Inbox keeps apart on purpose.
 *
 *   WHERE THE MONEY RECORD CAME FROM   `source`        permanent
 *   WHETHER THE LINES NAME ANYTHING    `lines_source`  changes when someone completes it
 *
 * They look like one thing and are not. A `14.x` foreign purchase is `source='mydata_self'`
 * forever — we typed it into myAADE, so its totals are an immutable AADE anchor and its lines are
 * ours — while its `lines_source` moves from `none` to `user` the moment an operator types what
 * was actually on the pallet. Collapsing them into one badge loses exactly the distinction that
 * matters on the day the typed lines disagree with the supplier's PDF.
 *
 * There is no separate tab for self-transmitted documents, and there must not be one: once a
 * `14.x` has lines it is indistinguishable from a `1.1` to warehouse, catalog, payables and P&L
 * (issue #377, decision 5). Provenance is a FILTER over one queue, not a partition of it.
 */

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

/** myDATA `invoiceType` family — the part before the dot. `'14.1'` -> `'14'`. */
export const docFamily = (docType: string | null | undefined): string =>
  String(docType ?? '').split('.')[0];

/**
 * 13.x (foreign services) and 14.x (foreign purchases) are reverse-charged: the acquisition is
 * zero-rated at source, we self-account the VAT and reclaim it in the same return, so it nets to
 * zero and never moves. The supplier is owed the NET.
 *
 * SQL owns the derivation — `_inbound_doc_to_supplier_bill_core` decides what the payable IS, and
 * `dic_detect__finance_reverse_charge_booked_at_gross` watches it. This is the presentation half
 * of the same rule: without it the table shows EUR 270.29 of VAT and EUR 1,396.51 gross next to a
 * payable of EUR 1,126.22, which is a valid number in the wrong direction and the exact shape of
 * "Payment: Paid next to an outstanding balance".
 */
export const isReverseCharged = (docType: string | null | undefined): boolean =>
  docFamily(docType) === '13' || docFamily(docType) === '14';

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
