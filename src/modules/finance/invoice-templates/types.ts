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
  net: number;
  vatPct: number;
  vatAmount: number;
  lineTotal: number; // net + vat
}

export interface VatAnalysisRow { pct: number; net: number; vat: number }
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
  /** Right-column meta rows (number, series, date, due, related). */
  meta: { label: string; value: string }[];
  items: InvoiceLineRow[];
  vatAnalysis: VatAnalysisRow[];
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
  fiscal?: { mark?: string; uid?: string; qrUrl?: string | null } | null;
}
