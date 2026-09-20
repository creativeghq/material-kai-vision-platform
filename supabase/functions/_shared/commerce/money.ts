import { round2 } from '../money.ts';

export interface RawLine {
  sku?: string | null;
  mpn?: string | null;
  barcode?: string | null;
  product_id?: string | null;
  name: string;
  qty: number;
  unit_price: number;
  vat_percent: number;
}

export interface NormalisedLine extends RawLine {
  unit_price_net: number;
  net_value: number;
  vat_amount: number;
  line_total: number;
}

export interface StatedTotals {
  total?: number | null;
  vat?: number | null;
}

export interface NormalisedMoney {
  lines: NormalisedLine[];
  net: number;
  vat: number;
  total: number;
  totalDelta: number | null;
  vatDelta: number | null;
  reconciles: boolean;
}

export const MONEY_TOLERANCE = 0.01;

/** `pricesIncludeTax` is per-ORDER, never configured: backwards is wrong by exactly the VAT rate. */
export function normaliseMoney(
  rawLines: readonly RawLine[],
  stated: StatedTotals,
  pricesIncludeTax: boolean,
): NormalisedMoney {
  const lines: NormalisedLine[] = rawLines.map((l) => {
    const pct = Number(l.vat_percent) || 0;
    const stated_unit = Number(l.unit_price) || 0;
    const unit_price_net = pricesIncludeTax ? stated_unit / (1 + pct / 100) : stated_unit;
    const net_value = round2(unit_price_net * (Number(l.qty) || 0));
    const vat_amount = round2(net_value * pct / 100);
    return {
      ...l,
      unit_price_net: round2(unit_price_net),
      net_value,
      vat_amount,
      line_total: round2(net_value + vat_amount),
    };
  });

  const net = round2(lines.reduce((s, l) => s + l.net_value, 0));
  const vat = round2(lines.reduce((s, l) => s + l.vat_amount, 0));
  const total = round2(net + vat);

  const theirTotal = stated.total == null ? null : Number(stated.total);
  const theirVat = stated.vat == null ? null : Number(stated.vat);
  const totalDelta = theirTotal == null ? null : Math.abs(total - round2(theirTotal));
  const vatDelta = theirVat == null ? null : Math.abs(vat - round2(theirVat));

  return {
    lines, net, vat, total,
    totalDelta, vatDelta,
    reconciles: totalDelta != null && totalDelta <= MONEY_TOLERANCE
      && (vatDelta == null || vatDelta <= MONEY_TOLERANCE),
  };
}
