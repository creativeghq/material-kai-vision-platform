/**
 * Guards the pricing chain (#332).
 *
 * Three defects motivated this file, and all three shared a shape: a rung of the markup ladder
 * that was fully built, visible in the UI, and could not fire.
 *
 *  1. **`scope='brand'` was rejected by the CHECK.** `_pricing_retail` read it and
 *     `BrandMarkupCard` wrote it, but `pricing_rules_scope_check` only ever allowed
 *     ('category','product'). Every attempt to save a brand markup raised a constraint
 *     violation, so the rung could never hold a row. Same class as the `sales` invite that was
 *     creatable in one place and rejected by a CHECK in another.
 *  2. **A third margin derivation, in TypeScript.** `PendingProductsCard` computed
 *     `cost * (1 + finance_categories.margin_pct / 100)` in the browser, disagreeing with the
 *     `pricing_rules` ladder that every other pricing path uses.
 *  3. **Quantity without its unit.** `get_product_price_break` does
 *     `coalesce(convert_to_base_unit(product, qty, unit), qty)`, so a quantity passed without
 *     its unit is silently read as already being in base units — "5 pallets" matching a
 *     threshold meant for 5 pieces. A wrong price, and a valid number, so nothing raises.
 *
 * SCOPE — read this before assuming a clean run means the invariant holds.
 * These tests scan REPO FILES. This project's SQL is applied through the Supabase MCP and never
 * committed (CLAUDE.md), so `pricing_rules_scope_check`, `_pricing_markup_ladder` and
 * `_pricing_retail` are invisible here: they live only in `pg_constraint` / `pg_proc`. This file
 * pins the TypeScript half and the vocabulary the constraint was written with. **If you change
 * the CHECK, change `ALLOWED_SCOPES` in the same commit.** The runtime half is watched by the
 * `finance.quantity_breaks_never_fire` integrity check, which reports a workspace whose
 * configured breaks never once reached a document.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const posix = (p: string) => relative(ROOT, p).split(sep).join('/');

/**
 * Mirrors `pricing_rules_scope_check`, in the order `_pricing_markup_ladder` tries the rungs.
 * `supplier` was added by #332 step 6; `brand` was in the resolver from the start and missing
 * from the constraint the whole time.
 */
const ALLOWED_SCOPES = ['category', 'product', 'brand', 'supplier'] as const;

/** Where an operator authors each scope. A rung with no authoring surface is unreachable. */
const AUTHORING_UI: Record<(typeof ALLOWED_SCOPES)[number], string | null> = {
  category: 'src/modules/finance/components/PricingRulesCard.tsx',
  brand: 'src/modules/finance/components/BrandMarkupCard.tsx',
  supplier: 'src/modules/finance/components/SupplierMarkupCard.tsx',
  // Per-product overrides are set from the product itself, not from a finance settings card.
  product: null,
};

const SCOPE_TYPE_FILE = 'src/modules/finance/services/financeService.ts';
const SCAN_DIRS = ['src', 'supabase/functions'];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '_generated') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the old bug doesn't count as the bug. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

const FILES = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
  .filter((f) => posix(f) !== 'src/integrations/supabase/types.ts');

describe('pricing_rules.scope', () => {
  it('finds sources to scan', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });

  it('the TypeScript union matches the constraint vocabulary exactly', () => {
    const src = read(SCOPE_TYPE_FILE);
    const m = /export type PricingRuleScope\s*=\s*([^;]+);/.exec(src);
    expect(m, `PricingRuleScope is not declared in ${SCOPE_TYPE_FILE}`).toBeTruthy();
    const declared = [...(m![1].matchAll(/'([a-z_]+)'/g))].map((x) => x[1]).sort();
    expect(declared, 'PricingRuleScope has drifted from pricing_rules_scope_check').toEqual(
      [...ALLOWED_SCOPES].sort(),
    );
  });

  it.each(ALLOWED_SCOPES.filter((s) => AUTHORING_UI[s]))('%s can be authored in the UI', (scope) => {
    const file = AUTHORING_UI[scope]!;
    const ui = stripComments(read(file));
    expect(
      ui.includes(`'${scope}'`) || ui.includes(`"${scope}"`),
      `scope '${scope}' is allowed by the CHECK but ${file} cannot create it`,
    ).toBe(true);
  });

  /**
   * The direction that actually broke. `BrandMarkupCard` wrote `scope: 'brand'` for months into
   * a column whose CHECK rejected it — creatable in one place, refused in another, and the only
   * symptom was a toast the operator saw once and worked around.
   */
  it('no code writes a scope the constraint would reject', () => {
    // `scope:` is a common field name (inbox filters, search facets), so this is anchored to the
    // pricing-rule writer instead of matching the word wherever it appears.
    const WRITE = /(?:upsertPricingRule|from\(['"]pricing_rules['"]\))[\s\S]{0,400}?scope:\s*'([a-z_]+)'/g;
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(WRITE)) {
        if (!(ALLOWED_SCOPES as readonly string[]).includes(m[1])) {
          offenders.push(`${posix(f)}: scope: '${m[1]}'`);
        }
      }
    }
    expect(
      offenders,
      'a pricing rule is being written with a scope pricing_rules_scope_check rejects — the save ' +
      'will throw. Add it to the CHECK and to ALLOWED_SCOPES, or use an allowed scope.\n' +
      offenders.join('\n'),
    ).toEqual([]);
    // Guard the guard: the pattern must match the shape that WAS broken, and must not fire on
    // the unrelated `scope:` fields that made the first draft of this test useless.
    const hit = "financeService.upsertPricingRule({ workspaceId, scope: 'nonsense', targetId: x })";
    expect([...hit.matchAll(new RegExp(WRITE.source, 'g'))].length).toBe(1);
    expect([..."setFilter({ scope: 'all' })".matchAll(new RegExp(WRITE.source, 'g'))].length).toBe(0);
  });

  it('every authoring card is mounted somewhere', () => {
    // A card nobody renders is as inert as a rule nothing resolves — the same failure one layer
    // up, and exactly how `price_my_spec` stayed unreachable behind a perfect push site.
    const all = FILES.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
    for (const scope of ALLOWED_SCOPES) {
      const file = AUTHORING_UI[scope];
      if (!file) continue;
      const component = file.split('/').pop()!.replace(/\.tsx$/, '');
      const mounts = new RegExp(`<${component}\\b`).test(all);
      expect(mounts, `${component} is never rendered, so scope '${scope}' has no reachable UI`).toBe(true);
    }
  });
});

describe('one markup derivation', () => {
  /**
   * `cost × (1 + margin/100)` is THE markup formula. It belongs in `_pricing_markup_ladder`,
   * which `_pricing_retail` (every pricing path) and `preview_pending_item_sell_price` (the
   * pre-approval preview) both call. A copy in TypeScript is a second answer to "what margin
   * applies", and it produced a valid number, so neither a typecheck nor an integrity check on
   * stored data could ever see the disagreement.
   */
  it('no TypeScript reads a stored markup policy and applies it', () => {
    /*
     * The invariant is about WHERE THE POLICY COMES FROM, not about arithmetic.
     *
     * A first draft banned the `cost * (1 + pct/100)` shape outright and immediately flagged
     * `ReceiveToWarehouseDialog`'s markup-to-price calculator — which is legitimate: the operator
     * types a markup and sees the price, two views of one number they chose. Banning that would
     * have forced an exemption, and an exemption list is how a rule like this rots.
     *
     * What must never happen is the client FETCHING the policy (`default_markup_pct`, a
     * `margin_pct` column) and applying it, because that reimplements one rung of a five-rung
     * ladder and silently disagrees with every other pricing path. Both real offenders did
     * exactly that, and both produced a perfectly valid number while doing it.
     */
    const APPLIES = /\bcost\w*\s*\*\s*\(\s*1\s*\+[^)\n]*\/\s*100/i;
    const READS_POLICY = /select\(\s*['"][^'"]*\b(?:default_markup_pct|margin_pct)\b/;
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, 'utf8'));
      if (!READS_POLICY.test(src)) continue;
      for (const [i, line] of src.split('\n').entries()) {
        if (APPLIES.test(line)) offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'This file fetches a markup policy and applies it in TypeScript, which reimplements one ' +
      'rung of the ladder. Ask SQL instead: `preview_markup_ladder_price` (no product yet), ' +
      '`preview_pending_item_sell_price` (a queued invoice line), or ' +
      '`get_product_price_for_workspace` (a real product).\n' + offenders.join('\n'),
    ).toEqual([]);
    // Guard the guard, in both directions.
    expect(APPLIES.test('salePrice: String(r2(cost * (1 + pct / 100)))')).toBe(true);
    expect(APPLIES.test('const net = qty * unitPrice;')).toBe(false);
    expect(READS_POLICY.test(".select('id, name, kind, margin_pct')")).toBe(true);
    expect(READS_POLICY.test(".select('id, name, kind')")).toBe(false);
  });

  /**
   * Calling the resolver is not enough — it has to be asked the WHOLE question.
   *
   * `_pricing_markup_explain` takes (workspace, cost, product, material_category, brand, supplier).
   * Both intake previews passed NULL for product, material_category AND brand, so for a line about
   * to become a new product only the supplier rung and the workspace default were reachable: an
   * invoice line that plainly said EGGER on it reported "No pricing rule matches and the workspace
   * default markup is 0% — this would be sold at cost". Approval then called `_pricing_retail` on
   * the product it had just written, which DOES read the category and the brand off the row — so
   * the two could reach different rungs and produce different numbers, while the card's own header
   * said they ran the same ladder.
   *
   * Measured after the fix, against the live function: rung `unpriced` at €53.60 became rung
   * `brand` at €76.11, and approval produced €76.11.
   *
   * The client half is what this can see: the preview call must still carry what the operator has
   * on screen. Drop either argument and the divergence is back, silently and with a plausible
   * number.
   */
  it('the intake preview passes the maker and the material category, not just the cost', () => {
    const src = stripComments(readFileSync(
      join(ROOT, 'src/services/warehouseService.ts'), 'utf8',
    ));
    const call = /rpc\(\s*['"]preview_pending_item_sell_price['"][\s\S]{0,400}?\)/.exec(src)?.[0] ?? '';
    expect(call, 'the preview call was not found at all').not.toBe('');
    for (const arg of ['p_material_category', 'p_manufacturer']) {
      expect(
        call.includes(arg),
        `${arg} is not passed, so the preview asks a narrower question than the approval answers ` +
        'and the two silently disagree about which rung applies',
      ).toBe(true);
    }
    // And the caller has to actually supply them rather than hardcode null at the next layer up.
    const card = stripComments(readFileSync(
      join(ROOT, 'src/modules/finance/components/PendingProductsCard.tsx'), 'utf8',
    ));
    expect(
      /previewIntakeSellPrice\([\s\S]{0,300}?materialCategory:[\s\S]{0,120}?manufacturer:/.test(card),
      'PendingProductsCard calls the preview without the category and the maker it has on screen',
    ).toBe(true);
  });

  /**
   * A resolver nothing calls is as inert as the arithmetic it replaced.
   *
   * Asserted as a CALL (`rpc('name'`), not as a mention. A bare `includes()` is satisfied by the
   * name appearing in a string constant or a leftover argument object, which is the same
   * declaration-vs-call trap that let a mutation through the first draft of this file — and the
   * one `pageWatchWebhook.test.ts` already records for `secretsMatch`.
   */
  it.each([
    'preview_pending_item_sell_price',
    'preview_markup_ladder_price',
  ])('the client actually CALLS %s', (fn) => {
    const all = FILES.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
    const CALL = new RegExp(`rpc\\(\\s*['"]${fn}['"]`);
    expect(
      CALL.test(all),
      `nothing calls ${fn} — whichever surface it was written for is back to guessing a price`,
    ).toBe(true);
  });

  /**
   * `finance_categories.margin_pct` was the second margin system, keyed on the ACCOUNTING
   * taxonomy rather than the product one. The column is dropped; a reader would now be a
   * runtime error on a column that does not exist, which no typecheck catches because
   * `types.ts` is not regenerated in CI.
   */
  it('nothing reads the dropped finance_categories.margin_pct', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, 'utf8'));
      // `margin_pct` is a real, live column on blueprint items and project plans, so merely
      // mentioning it is fine. Only a read or write against `finance_categories` is the defect.
      const RE = /from\(['"]finance_categories['"]\)[\s\S]{0,300}?\bmargin_pct\b/;
      if (RE.test(src)) offenders.push(posix(f));
    }
    expect(
      offenders,
      'finance_categories.margin_pct was dropped in #332 step 4 — margins live in pricing_rules.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('quantity and unit travel together', () => {
  /**
   * The trap, verbatim from `get_product_price_break`:
   *
   *     coalesce(public.convert_to_base_unit(p_product_id, p_quantity, p_unit), p_quantity)
   *
   * A NULL or unconvertible unit does not fail — it falls back to the RAW quantity, which is
   * then compared against a threshold expressed in base units. "5 pallets" matches a break meant
   * for 5 pieces, and the customer gets a pallet discount on five tiles. The only safe rule is
   * that a call passes both or neither, which is why every site builds them as one spreadable
   * object (`breakArgs` / `qtyArgs`) rather than as two independent arguments.
   */
  it('no call passes p_quantity to the price resolver without p_unit', () => {
    // Restricted to files that actually price a product: `p_quantity` is also a parameter of
    // record_stock_movement, convert_to_base_unit and add_configuration_to_quote, none of which
    // have or need a p_unit.
    const PRICING = /get_product_price_for_workspace|get_product_price_break|get_supplier_price_break/;
    const offenders: string[] = [];
    for (const f of FILES) {
      const src = stripComments(readFileSync(f, 'utf8'));
      if (!PRICING.test(src)) continue;
      for (const m of src.matchAll(/p_quantity\s*:/g)) {
        // The pair is always written inside one object literal; 240 chars is comfortably wider
        // than the widest real example and far narrower than the distance to an unrelated call.
        const window = src.slice(Math.max(0, m.index! - 240), m.index! + 240);
        // These RPCs take a quantity and have no unit parameter at all — a configuration is
        // priced in whole configurations, a stock movement is in the item's own unit. Skipping
        // them matters in a file that ALSO prices products, which quote-tools.ts does.
        if (/add_configuration_to_quote|record_stock_movement|convert_to_base_unit/.test(window)) continue;
        if (!/p_unit\s*:/.test(window)) {
          const line = src.slice(0, m.index!).split('\n').length;
          offenders.push(`${posix(f)}:${line}`);
        }
      }
    }
    expect(
      offenders,
      'Pass p_quantity and p_unit together or not at all. Without the unit the resolver reads ' +
      'the quantity as base units and can match the wrong break threshold.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The other half: the sites that price a catalog line must actually ASK for a break. This is
   * the list #332 found — five of them omitted quantity entirely, so a configured break could
   * never apply no matter how the operator set it up.
   */
  it.each([
    'src/modules/finance/services/ordersService.ts',
    'src/modules/quotes/services/QuotesService.ts',
    'src/modules/projects/services/projectsService.ts',
    'src/modules/finance/components/NewInvoiceDialog.tsx',
    'supabase/functions/_shared/tools/quote-tools.ts',
    'supabase/functions/_shared/order-intake/price.ts',
    'supabase/functions/finance-customer-documents/index.ts',
  ])('%s passes quantity to the resolver', (file) => {
    const src = stripComments(read(file));
    expect(
      /p_quantity/.test(src),
      `${file} prices catalog lines but never passes p_quantity, so product_price_breaks cannot ` +
      'fire there — the defect #332 found in five separate call sites',
    ).toBe(true);
  });
});
