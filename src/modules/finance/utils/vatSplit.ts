/**
 * Splitting a money figure into the net + VAT pair a supplier bill actually stores.
 *
 * `supplier_bills` keeps `subtotal_net` and `vat_amount` separately because they go to different
 * places: net is the P&L cost, VAT is recoverable input tax. Anything that pre-fills the expense
 * form therefore has to hand over BOTH, and the two entry points on an order used to hand over
 * neither consistently — one passed a net figure and one passed a VAT-inclusive one, into the
 * same field, with VAT hardcoded to 0. A 24% line came out as "net 2,249.86 / VAT 0".
 *
 * These two functions are the only place that arithmetic lives.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Net + VAT for a line whose net and VAT RATE are both known. */
export function splitByVatRate(net: number, vatPercent: number | null | undefined): { net: number; vat: number } {
  const n = r2(Math.max(0, net));
  const rate = Number(vatPercent ?? 0) || 0;
  return { net: n, vat: r2(n * (rate / 100)) };
}

/**
 * Net + VAT for a GROSS figure, split in the same proportion as a known net/gross pair.
 *
 * Used for "what we still owe this supplier": the owed number is gross and partly paid, so its
 * rate can't be read off any single line — but the supplier's whole cost on the order carries a
 * net and a gross, and the remainder splits the same way. VAT is taken as the remainder so the
 * two halves always add back to exactly `gross` (rounding never leaks a cent).
 */
export function splitGrossLikeTotals(gross: number, costNet: number, costGross: number): { net: number; vat: number } {
  const g = r2(Math.max(0, gross));
  // No gross to compare against (or a VAT-free supplier) → it is all net.
  const ratio = costGross > 0.005 ? costNet / costGross : 1;
  const net = r2(g * ratio);
  return { net, vat: r2(g - net) };
}
