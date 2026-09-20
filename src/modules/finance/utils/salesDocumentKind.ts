/** "Is this buyer a business, and therefore what sales document do they get?" — ONE definition. */

/** What classifying a buyer needs — a company row and a contact row both map onto this. */
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

/** Why, so the operator sees the reasoning before issuing rather than trusting a bare label. */
export function salesDocumentKindReason(buyer: BuyerIdentity | null | undefined): string {
  if (!buyer) return 'Buyer not resolved — defaulting to an invoice.';
  if (buyer.isCompany) return 'Buyer is a company.';
  if (buyer.contactType === 'company') return 'Contact is marked as a business.';
  if (String(buyer.vatNumber ?? '').trim()) return `Contact has a VAT number (${String(buyer.vatNumber).trim()}).`;
  return 'Contact has no VAT number — a consumer can only be issued a retail receipt (ΑΛΠ).';
}

// The SECOND axis: what is being supplied.

/** What a document is supplying. `unknown` is a real answer, not a synonym for goods. */
export type SupplyKind = 'goods' | 'services' | 'mixed' | 'unknown';

/** A line, only as far as this question needs it. */
export interface SupplyLine {
  /** `products.item_type` for the line's product, or null/undefined for a custom line. */
  item_type?: string | null;
}

/**
 * What a set of lines is supplying. A line with no product attached votes for NOTHING: "we do not
 * know" and "it is goods" are different states, and only the first is worth revisiting later.
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

// The THIRD axis. Not derivable from the buyer: 39a turns on WHAT is sold, which only we know.
export type SaleRegime = 'domestic' | 'intra_community' | 'export' | 'reverse_charge_39a';

/**
 * The myDATA sales document code for a buyer, a supply and a regime.
 *
 * MIXED AND UNKNOWN BOTH TAKE THE GOODS CODE, deliberately. A sales invoice carrying a service
 * line is ordinary; a services invoice carrying goods is the questionable direction. And an
 * unresolved buyer counts as a business, matching `buyerIsConsumer` — restricting a business to a
 * retail receipt is the expensive way to be wrong.
 */
export function mydataSalesDocumentType(
  buyer: BuyerIdentity | null | undefined,
  supply: SupplyKind,
  regime: SaleRegime = 'domestic',
): string {
  if (buyerIsConsumer(buyer)) return supply === 'services' ? '11.2' : '11.1';
  if (supply !== 'services') {
    if (regime === 'intra_community') return '1.2';
    if (regime === 'export') return '1.3';
  }
  return supply === 'services' ? '2.1' : '1.1';
}

/** AADE ERP v2.0.2 §8.3 — 14 intra-community, 8 exports, 16 art. 39α/45 reverse charge. A
 *  cross-border SERVICE withholds: place-of-supply is not decidable here. */
export function mydataSaleRegimeExemption(regime: SaleRegime, supply: SupplyKind): number | null {
  if (regime === 'reverse_charge_39a') return 16;
  if (supply === 'services') return null;
  if (regime === 'intra_community') return 14;
  if (regime === 'export') return 8;
  return null;
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
