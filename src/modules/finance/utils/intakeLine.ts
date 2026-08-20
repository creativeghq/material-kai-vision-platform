/**
 * One reading of a supplier invoice line, shared by every surface that receives one.
 *
 * Two screens turn a myDATA line into stock — `ReceiveToWarehouseDialog` (the modal on an
 * expense document) and `PendingProductsCard` (the intake queue) — and they had independently
 * answered the same six questions. Where they disagreed, the modal was right and the queue was
 * wrong, in ways nothing could see:
 *
 *   • the unit — the modal read `measurement_unit` off the line (AADE states it, so it IS the
 *     unit); the queue asked Haiku to infer it from the description and filed 4.1 metres of
 *     worktop as 4.1 pieces.
 *   • the supplier's article code — the modal used `item_code`; the queue used a regex over the
 *     description, so `11-3331-60-1` was stored as `H3331`, and that fabricated string is what
 *     the "supplier item code matches existing stock" auto-approve branch was keyed on.
 *   • the VAT category — the modal seeded it from the line; the queue left it blank.
 *   • unit cost — both divide the net by the quantity, and both had their own copy of it.
 *   • markup ↔ sale price — the same "two views of one number" pair, written twice.
 *   • netting a VAT-inclusive price before storing it as `list_price` — written twice, and both
 *     copies silently skipped the netting when no VAT category was set. In the modal that is
 *     nearly unreachable (the category is seeded from the line); in the queue it was the
 *     DEFAULT path, so a gross figure was stored as an ex-VAT list price and every quote built
 *     on it was 24% wrong. `netListPrice` cannot be called wrongly now: it returns a refusal
 *     rather than an unnetted number.
 *
 * Only the *reading* lives here. What each screen then WRITES stays with the screen — the modal
 * mints a full catalog product through the ingest core, the queue records a stock and cost
 * event — because that difference is deliberate.
 */
import { normalizeUnit, unitFromMydataCode, unitDef } from '@/lib/units';
import { round2 } from '@/utils/decimal';

/** The fields a myDATA inbound line carries, as stored in `inbound_documents.lines`. */
export interface MydataLineFacts {
  quantity?: number | null;
  /** AADE `measurementUnit` code. Present on 2,022 of 3,643 lines here. */
  measurement_unit?: number | null;
  /** The supplier's own article code, as printed on their document. */
  item_code?: string | null;
  /** AADE VAT category. Present on every line. */
  vat_category?: number | null;
  /** The line total ex-VAT, exactly as stated. */
  net_value?: number | null;
}

/**
 * AADE VAT category → percent.
 *
 * `mydata_reference` has no `vat_category` rows, so unlike the measurement units this genuinely
 * has no DB source to read; the table is restated in `_shared/fiscal/invoice-builder.ts` for the
 * edge runtime, which cannot import from `src/`. This is the client's single copy — it replaced
 * one in each of the two intake surfaces.
 */
export const VAT_PCT_BY_CATEGORY: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };

/** Percent for a category, or null when the category is unset or unknown. */
export function vatPctForCategory(category: string | number | null | undefined): number | null {
  if (category === '' || category == null) return null;
  const pct = VAT_PCT_BY_CATEGORY[Number(category)];
  return pct == null ? null : pct;
}

export interface ResolvedUnit {
  /** Canonical unit key — see `src/lib/units.ts`. */
  unit: string;
  /** Why that unit, shown so the choice is never silent. */
  reason: string;
  /** True when AADE stated it on the line, i.e. it is a fact rather than a reading. */
  statedByAade: boolean;
}

/**
 * The unit this line is billed in.
 *
 * The order is not a preference, it is a hierarchy of evidence: what the document states beats
 * what a model read in the description, which beats what a regex read in the description. Only
 * the first of those is a fact. `src/lib/units.ts` says it outright — "wherever a code is
 * present it is the authority — never infer the unit from a product description instead" — and
 * the queue writer inferred it anyway for every line it ever queued.
 */
export function resolveIntakeUnit(input: {
  /** `measurement_unit` off the line. */
  code?: number | null;
  /** What the AI extraction thought, if anything. */
  modelUnit?: string | null;
  /** What the deterministic text parser thought, and why. */
  parsedUnit?: string | null;
  parsedReason?: string | null;
}): ResolvedUnit {
  const stated = unitFromMydataCode(input.code ?? null);
  if (stated) {
    return {
      unit: stated,
      reason: `Unit stated by AADE on this line (myDATA measurementUnit ${input.code}).`,
      statedByAade: true,
    };
  }
  const model = String(input.modelUnit ?? '').trim();
  if (model) {
    return {
      unit: normalizeUnit(model),
      reason: 'The document did not state a unit; read from the line description.',
      statedByAade: false,
    };
  }
  const parsed = String(input.parsedUnit ?? '').trim();
  return {
    unit: parsed ? normalizeUnit(parsed) : 'pcs',
    reason: input.parsedReason || 'The document did not state a unit; defaulted to pieces.',
    statedByAade: false,
  };
}

/**
 * The supplier's article code.
 *
 * `item_code` is an identity the supplier printed; anything found in the description is a guess
 * about which token looks code-shaped. This value becomes `products.external_sku` and
 * `supplier_products.supplier_sku` — the keys the NEXT invoice from this supplier matches on —
 * so a guess here quietly forks the catalog one delivery later.
 */
export function resolveSupplierCode(
  itemCode: string | null | undefined,
  parsedCode: string | null | undefined,
): string {
  return String(itemCode ?? '').trim() || String(parsedCode ?? '').trim();
}

/** Cost per unit: the document's own arithmetic, ex-VAT. */
export function unitCostFromNet(
  netValue: number | null | undefined,
  quantity: number | null | undefined,
): number | null {
  const qty = Number(quantity ?? 0);
  if (!qty || netValue == null || !Number.isFinite(Number(netValue))) return null;
  return round2(Number(netValue) / qty);
}

/**
 * How far `quantity × unit_cost` has drifted from the net value the document states, or null
 * when they agree (or there is nothing to compare).
 *
 * `unit_cost` is stored rounded to the cent, so it cannot reproduce the line total exactly:
 * 100.48 over 4.1 is 24.5073…, and 24.51 × 4.1 is 100.491. One line is a rounding artefact;
 * a page of them is a ledger that no longer reconciles with the invoices behind it, which is
 * why the exact net is now carried alongside rather than divided away.
 */
export function netValueDrift(
  netValue: number | null | undefined,
  quantity: number | null | undefined,
  unitCost: number | null | undefined,
): number | null {
  if (netValue == null || unitCost == null || quantity == null) return null;
  const recomputed = round2(Number(unitCost) * Number(quantity));
  const drift = round2(recomputed - Number(netValue));
  return drift === 0 ? null : drift;
}

/**
 * A quantity that cannot exist in the stated unit.
 *
 * 4.1 pieces is not a small problem with a number, it is a number that means the unit is wrong.
 * Worth saying out loud because it survives everything downstream: it is a valid `numeric`, so
 * no constraint, no typecheck and no integrity probe can see it, and it lands in `qty_on_hand`
 * where it becomes what the warehouse believes it holds. 48 rows in the queue are in this state
 * with AADE itself saying `pieces`, i.e. the supplier's own document disagrees with itself.
 */
export function unitQuantityIssue(unit: string | null | undefined, quantity: number | null | undefined): string | null {
  const key = normalizeUnit(unit);
  const qty = Number(quantity ?? 0);
  if (!Number.isFinite(qty) || qty === 0) return null;
  const fractional = Math.abs(qty - Math.round(qty)) > 1e-9;
  if (!fractional) return null;
  // Units that count discrete things. Everything else (kg, m, m², litres) is legitimately
  // fractional and must not be flagged, or the warning becomes noise and stops being read.
  if (!['pcs', 'box', 'pallet', 'set'].includes(key)) return null;
  return `${qty} ${unitDef(key)?.label ?? key} is not a whole number of items — the unit is probably wrong.`;
}

/** Markup and sale price are two views of one number. These are the two directions. */
export function priceFromMarkup(cost: number | null, markupPct: number | null): number | null {
  if (cost == null || markupPct == null || !Number.isFinite(cost) || !Number.isFinite(markupPct)) return null;
  return round2(cost * (1 + markupPct / 100));
}
export function markupFromPrice(cost: number | null, price: number | null): number | null {
  if (cost == null || price == null || !Number.isFinite(cost) || !Number.isFinite(price) || cost <= 0) return null;
  return round2(((price - cost) / cost) * 100);
}

/** Either the ex-VAT figure to store, or the reason it cannot be worked out. */
export type NetListPrice =
  | { ok: true; net: number | null; vatPct: number | null }
  | { ok: false; reason: 'vat_category_required' };

/**
 * The ex-VAT figure to store as `list_price`.
 *
 * A Greek operator reads a GROSS price off an invoice. `list_price` is ex-VAT everywhere in the
 * platform, so a gross figure has to be netted BEFORE it is written or every quote built on it
 * is 24% high. The catch is what to do when the operator says "this includes VAT" without
 * saying WHICH VAT — both previous copies of this function answered "store it unchanged", which
 * is the one answer that is definitely wrong, and did it silently. It refuses instead.
 */
export function netListPrice(input: {
  typed: number | null;
  vatCategory: string | number | null | undefined;
  pricesIncludeVat: boolean;
}): NetListPrice {
  const vatPct = vatPctForCategory(input.vatCategory);
  if (input.typed == null || !Number.isFinite(input.typed)) return { ok: true, net: null, vatPct };
  if (!input.pricesIncludeVat) return { ok: true, net: input.typed, vatPct };
  if (vatPct == null) return { ok: false, reason: 'vat_category_required' };
  return { ok: true, net: round2(input.typed / (1 + vatPct / 100)), vatPct };
}
