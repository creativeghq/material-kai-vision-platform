/**
 * #227 — canonical totals breakdown shown on every "final" customer-facing document
 * (quotes, invoices, exports). Five explicit lines so VAT + discount are never hidden:
 *
 *   Price                 (net subtotal, after per-line/customer discounts)
 *   Discount              (order-level "paid upfront" discount only)
 *   Price after Discount  (= Price − Discount = net taxable base)
 *   VAT                   (VAT on the post-discount net)
 *   Final                 (= Price after Discount + VAT = grand total)
 *
 * Per-line/customer discounts are shown per row in the items table; this block consolidates
 * the order-level discount only (the chosen "net subtotal + order discount" convention).
 */
export interface TotalsBreakdown {
  price: number;
  discount: number;
  priceAfterDiscount: number;
  vat: number;
  vatRate: number;
  final: number;
  hasDiscount: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeTotalsBreakdown(input: {
  subtotal: number | null | undefined;        // pre-discount net subtotal
  cashDiscountPct: number | null | undefined;  // order-level paid-upfront %
  vatAmount: number | null | undefined;
  vatRate: number | null | undefined;
  grandTotal: number | null | undefined;
}): TotalsBreakdown {
  const price = Number(input.subtotal) || 0;
  const cashPct = Number(input.cashDiscountPct) || 0;
  const discount = r2(price * cashPct / 100);
  const priceAfterDiscount = r2(price - discount);
  const vat = Number(input.vatAmount) || 0;
  const final = Number(input.grandTotal) || 0;
  return {
    price,
    discount,
    priceAfterDiscount,
    vat,
    vatRate: Number(input.vatRate) || 0,
    final,
    hasDiscount: discount > 0,
  };
}

/** Ordered rows for rendering. Discount + "after discount" rows are omitted when there's no
 *  order-level discount (they'd just repeat Price). Extras (fees/stamp/etc.) are caller-supplied
 *  and slotted before VAT. */
export interface TotalsRow { label: string; value: number; kind: 'price' | 'discount' | 'subtotal' | 'extra' | 'vat' | 'final'; negative?: boolean; muted?: boolean; }

export function totalsRows(
  b: TotalsBreakdown,
  opts?: { extras?: Array<{ label: string; value: number; negative?: boolean }> },
): TotalsRow[] {
  const rows: TotalsRow[] = [{ label: 'Price', value: b.price, kind: 'price' }];
  if (b.hasDiscount) {
    rows.push({ label: 'Discount', value: b.discount, kind: 'discount', negative: true });
    rows.push({ label: 'Price after Discount', value: b.priceAfterDiscount, kind: 'subtotal' });
  }
  for (const e of opts?.extras ?? []) {
    rows.push({ label: e.label, value: e.value, kind: 'extra', negative: e.negative });
  }
  rows.push({ label: b.vatRate ? `VAT (${b.vatRate}%)` : 'VAT', value: b.vat, kind: 'vat' });
  rows.push({ label: 'Final', value: b.final, kind: 'final' });
  return rows;
}
