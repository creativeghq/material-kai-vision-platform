/**
 * "Is this buyer a business, and therefore what sales document do they get?" — ONE definition.
 *
 * This question was answered in two places with two different rules. NewInvoiceDialog checked the
 * buyer's VAT number (correct); OrdersPanel checked only whether a CRM *company* was linked
 * (`order.customer_company_id ? 'invoice' : 'receipt'`). They disagree for the very common Greek
 * case of a sole trader (ατομική επιχείρηση) stored as a CONTACT carrying an ΑΦΜ: a business that
 * the order flow labelled retail, so it proposed an ΑΛΠ receipt to someone entitled to a
 * τιμολόγιο. An issued retail receipt is transmitted to myDATA, so unpicking that costs a 5.1
 * credit note plus a reissue — not a delete.
 *
 * The rule lives here, is pure, and is covered by tests/unit/salesDocumentKind.test.ts. Callers
 * resolve the buyer's identity (financeService.getBuyerIdentity) and ask this module; nobody
 * re-derives it from `customer_company_id` alone.
 *
 * Fiscal background: a τιμολόγιο (myDATA 1.1 goods / 2.1 services) is issued to a party with a
 * VAT number and lets them deduct the VAT. An ΑΛΠ retail receipt (11.1 / 11.2) is for consumers
 * and does not. AADE REJECTS an invoice issued to a VAT-less party, so steering a consumer to a
 * receipt is correctness, not presentation.
 */

/** What we need to know about a buyer to classify them. Deliberately not a CRM row type — both
 *  a company row and a contact row map onto this. */
export interface BuyerIdentity {
  /** The buyer is a linked CRM company (always a business). */
  isCompany: boolean;
  /** ΑΦΜ / VAT number, from whichever row the buyer is. */
  vatNumber?: string | null;
  /** `crm_contacts.contact_type` — 'company' marks a contact that represents a business. */
  contactType?: string | null;
}

export type SalesDocumentKind = 'invoice' | 'receipt';

/**
 * A consumer has no VAT identity: not a CRM company, no ΑΦΜ, not a company-typed contact.
 * Returns false when the buyer is unknown — an unresolved buyer must NOT be treated as a
 * consumer, because that would silently restrict them to retail receipts.
 */
export function buyerIsConsumer(buyer: BuyerIdentity | null | undefined): boolean {
  if (!buyer) return false;
  if (buyer.isCompany) return false;
  if (buyer.contactType === 'company') return false;
  return !String(buyer.vatNumber ?? '').trim();
}

/** The sales document this buyer should receive. */
export function salesDocumentKindFor(buyer: BuyerIdentity | null | undefined): SalesDocumentKind {
  return buyerIsConsumer(buyer) ? 'receipt' : 'invoice';
}

/** Human label for the document kind — used in buttons and the payment dialog's issue choice. */
export function salesDocumentKindLabel(kind: SalesDocumentKind): string {
  return kind === 'receipt' ? 'Receipt' : 'Invoice';
}

/** Why the buyer was classified this way, so the operator can see the reasoning before issuing
 *  a fiscal document rather than having to trust a bare label. */
export function salesDocumentKindReason(buyer: BuyerIdentity | null | undefined): string {
  if (!buyer) return 'Buyer not resolved — defaulting to an invoice.';
  if (buyer.isCompany) return 'Buyer is a company.';
  if (buyer.contactType === 'company') return 'Contact is marked as a business.';
  if (String(buyer.vatNumber ?? '').trim()) return `Contact has a VAT number (${String(buyer.vatNumber).trim()}).`;
  return 'Contact has no VAT number — a consumer can only be issued a retail receipt (ΑΛΠ).';
}
