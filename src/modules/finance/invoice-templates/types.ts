// Shared invoice-template contract. Consumed by the React renderer (HTML preview)
// AND mirrored by the pdf-lib generator (supabase/functions/finance-invoice-pdf)
// so the on-screen invoice and the PDF stay visually similar. Keep the two registries
// in sync — same ids, same layout flags, same default colors.

export type InvoiceColorRole =
  | 'accent'        // links, emphasis, accent rules / totals highlight
  | 'headerBg'      // header band fill (band/stacked styles)
  | 'headerText'    // text on the header band
  | 'tableHeaderBg' // line-items header row fill
  | 'text'          // primary ink
  | 'muted'         // secondary text
  | 'line';         // hairline rules / borders

export type InvoiceColors = Record<InvoiceColorRole, string>;

/** Header layout variants. */
export type HeaderStyle =
  | 'split'    // issuer left, title right (classic)
  | 'band'     // full-width colored band with title + issuer inside
  | 'stacked'  // issuer block, big title below
  | 'minimal'  // oversized title, issuer small underneath
  | 'sidebar'  // vertical accent wordmark gutter on the left, title right
  | 'commercial'; // logo left / QR right, three icon party columns, code+comment items, large amount-due

export type TitleStyle = 'right' | 'left-xl' | 'on-band' | 'center';
export type TotalsBoxStyle = 'plain' | 'boxed' | 'accent' | 'accent-text';

export interface InvoiceTemplateSpec {
  id: string;
  label: string;
  description: string;
  defaultColors: InvoiceColors;
  headerStyle: HeaderStyle;
  titleStyle: TitleStyle;
  /** Whether the line-items header row gets a filled background (tableHeaderBg). */
  tableHeaderFill: boolean;
  totalsBoxStyle: TotalsBoxStyle;
}

// ── Normalized render data (the single field set both renderers draw) ──

export interface InvoiceParty {
  name: string;
  /** Address / extra lines already formatted for display. */
  lines: string[];
}

export interface InvoiceLineRow {
  description: string;
  /** color / size / line comments, joined. */
  detail?: string;
  sku?: string;
  qty: number;
  unit: string;
  unitPrice: number;
  /** Line discount AMOUNT in currency (invoice_items.discounted_price). 0 when none.
   *  NOT a discounted unit price — on the QUOTE side the same column name means the
   *  opposite thing, so never copy one into the other without converting. */
  discount: number;
  net: number;
  vatPct: number;
  vatAmount: number;
  /** Per-line myDATA "other taxes" (invoice_items.other_taxes_amount). 0 when none. */
  otherTaxes: number;
  /** myDATA VAT-exemption category (1..31) on a 0%/exempt line. The legal ground for
   *  charging no VAT MUST be printed on the document, so this drives a footnote marker. */
  exemptionCode?: number | null;
  lineTotal: number; // net + vat + other taxes
}

export interface VatAnalysisRow { pct: number; net: number; vat: number; total: number }

/** One distinct exemption ground cited by the lines, printed under the items table. */
export interface VatExemptionNote { marker: string; code: number; label: string }
export interface TotalsExtraRow { label: string; value: number; negative?: boolean }

export interface InvoiceRenderData {
  lang: 'el' | 'en';
  currency: string;
  /** Document title resolved from document_type + language (+ draft ⇒ pre-invoice). */
  title: string;
  /** True when this is a draft pre-invoice (προτιμολόγιο) — not a fiscal document. */
  isPreInvoice?: boolean;
  labels: Record<string, string>;
  issuer: { name: string; lines: string[]; logoUrl?: string | null };
  customer: InvoiceParty;
  /** Right-column meta rows (type, number, series, date, time, payment method, related). */
  meta: { label: string; value: string }[];
  items: InvoiceLineRow[];
  vatAnalysis: VatAnalysisRow[];
  /** Distinct exemption grounds cited by the 0%-VAT lines, in marker order. */
  vatExemptions: VatExemptionNote[];
  totals: {
    subtotalNet: number;        // Price (pre-discount net)
    discount: number;           // order-level (paid-upfront) discount, 0 if none
    priceAfterDiscount: number; // Net taxable base (post-discount)
    totalVat: number;
    extras: TotalsExtraRow[];    // fees / stamp / withholding / etc. (NOT the discount)
    grand: number;
    amountPaid: number;
    amountDue: number;
  };
  payment: { method?: string; info?: string; accounts: string[] };
  shipping?: { rows: string[] } | null;
  /** Third party panel — where the goods go, when it differs from the billing party
   *  (a chosen crm_address_units sub-unit, or the document's ship-to). */
  delivery?: { name?: string; lines: string[] } | null;
  /** Non-base currency: the rate this document was converted at. Never printed for EUR. */
  fx?: { rate: number; base: string } | null;
  notes?: string | null;
  /** Customer note entered when the order was placed (shown under the invoice notes). */
  orderNotes?: string | null;
  infoBox?: string | null;
  /** True when ΦΠΑ is suspended (art. 39a etc.) — prints a legal note on the document. */
  vatSuspended?: boolean;
  /** Carry-forward: what the customer owed BEFORE this document (>0 owes, <0 in credit). */
  priorBalance?: number | null;
  /** Hosted /pay/{token} URL — prints a "Pay / view online" link + QR. */
  payUrl?: string | null;
  fiscal?: { mark?: string; uid?: string; authCode?: string | null; qrUrl?: string | null } | null;
}
