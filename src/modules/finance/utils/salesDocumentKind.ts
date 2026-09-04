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

// ---------------------------------------------------------------------------
// The SECOND axis: what is being supplied.
//
// The document type is a 2×2, and only the buyer half was ever implemented:
//
//                    goods      services
//   business          1.1         2.1
//   consumer         11.1        11.2
//
// `generate_invoice_from_order` hardcoded the goods column, so every services invoice this
// platform has issued — a commission, a design fee, an installation, a construction valuation —
// went to AADE as a SALE OF GOODS. All four codes are valid, the envelope validates and the MARK
// comes back, so nothing raised: the same shape as a payment-method code in the wrong rotation.
//
// The SQL side resolves this through `mydata_sales_document_type`. This is the mirror, so the
// dialog can propose the code the RPC would pick rather than defaulting to 1.1 and hoping.

/** What a document is supplying. `unknown` is a real answer, not a synonym for goods. */
export type SupplyKind = 'goods' | 'services' | 'mixed' | 'unknown';

/** A line, only as far as this question needs it. */
export interface SupplyLine {
  /** `products.item_type` for the line's product, or null/undefined for a custom line. */
  item_type?: string | null;
}

/**
 * What a set of lines is supplying.
 *
 * A line with no product attached votes for NOTHING. It cannot be read as goods just because the
 * goods code is the fallback: "we do not know" and "it is goods" are different states, and only
 * the first should be revisited when somebody attaches a product later.
 */
export function supplyKindOf(lines: readonly SupplyLine[] | null | undefined): SupplyKind {
  let goods = false;
  let services = false;
  for (const l of lines ?? []) {
    const t = String(l.item_type ?? '').trim();
    if (!t) continue;
    if (t === 'service') services = true; else goods = true;
  }
  if (goods && services) return 'mixed';
  if (services) return 'services';
  if (goods) return 'goods';
  return 'unknown';
}

/**
 * The myDATA sales document code for a buyer and a supply.
 *
 * MIXED AND UNKNOWN BOTH TAKE THE GOODS CODE, deliberately. A sales invoice carrying a service
 * line is ordinary; a services invoice carrying goods is the questionable direction. And an
 * unresolved buyer counts as a business, matching `buyerIsConsumer` — restricting a business to a
 * retail receipt is the expensive way to be wrong.
 */
export function mydataSalesDocumentType(
  buyer: BuyerIdentity | null | undefined,
  supply: SupplyKind,
): string {
  const consumer = buyerIsConsumer(buyer);
  if (supply === 'services') return consumer ? '11.2' : '2.1';
  return consumer ? '11.1' : '1.1';
}

/** Why that code, so an operator can see the reasoning before transmitting it. */
export function mydataSalesDocumentReason(
  buyer: BuyerIdentity | null | undefined,
  supply: SupplyKind,
): string {
  const who = buyerIsConsumer(buyer) ? 'a consumer' : 'a business';
  switch (supply) {
    case 'services':
      return `Every priced line is a service, to ${who}.`;
    case 'goods':
      return `Every priced line is a product, to ${who}.`;
    case 'mixed':
      return `Products and services on one document, to ${who} — a sales invoice may carry a service line.`;
    default:
      return `No line names a catalogue product, so the supply cannot be read — proposing the sales document for ${who}.`;
  }
}
