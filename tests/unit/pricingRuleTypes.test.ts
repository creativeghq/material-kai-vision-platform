/**
 * Guards `pricing_custom_rules.rule_type` against the inert-rule failure (#347, defect 21).
 *
 * A discount rule type an admin can CREATE but nothing RESOLVES is invisible: the rule is listed
 * in the UI, it looks active, and no price ever changes. That is this platform's dominant failure
 * shape, and `CustomPricingRulesCard`'s own header already stated the policy — "cash_payment is
 * schema-ready but surfaced once a payment-context hook exists, to avoid an inert rule". Nothing
 * enforced it: the column was free text with no CHECK. It has one now.
 *
 * ── The invariant INVERTED in phase 1, deliberately ────────────────────────────────────────
 * This test originally asserted that every allowed type was resolved by one of three TypeScript
 * files. That was true, and it was the bug: `_layerBFactor` read the table from the client and
 * multiplied a factor onto the resolver's answer, so a quote line and an order line for the same
 * product priced differently. Phase 1.1 moved `category_extra` and `volume_category` into
 * `get_product_price_for_workspace`, and phase 1.1b gave `cash_payment` its own single SQL source,
 * `get_workspace_cash_discount_pct` — it stays document-level, because it reduces the subtotal
 * before VAT rather than any line price, and folding it into the line resolver would apply it
 * twice.
 *
 * So the rule is now the opposite: **no TypeScript may resolve a rule type at all.** This file
 * enforces that, plus the two directions of the authoring vocabulary.
 *
 * SCOPE — the DB constraint and both resolvers live in `pg_constraint` / `pg_proc`, which this
 * repo never commits (CLAUDE.md). This test scans REPO FILES, so it cannot see them; it keeps the
 * TypeScript side honest and pins the list the constraint was written with. If you change the
 * constraint, change `ALLOWED_RULE_TYPES` in the same migration.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
const posix = (p: string) => relative(ROOT, p).split(sep).join('/');

/**
 * Mirrors `pricing_custom_rules_rule_type_check`.
 *
 * `volume_category` was retired in #347 phase 1.4. It meant "for category X, at quantity >= N,
 * take M% off" — which `product_price_breaks` already meant, only per-product. It now carries a
 * `category_key` too, so there is one mechanism instead of two, and the surviving one is the
 * correct one: it resolves thresholds through `convert_to_base_unit`, while the rule compared
 * `p_quantity` RAW and so matched "5 pallets" and "5 pieces" at the same threshold.
 */
const ALLOWED_RULE_TYPES = ['category_extra', 'date_window', 'cash_payment', 'payment_terms', 'first_order', 'bundle'] as const;

/** A retired type must not come back without a resolver — that is what this list is for. */
const RETIRED_RULE_TYPES = ['volume_category'] as const;

/** Where each type is resolved — all SQL, none of it scannable from here. */
const SQL_RESOLVERS: Record<(typeof ALLOWED_RULE_TYPES)[number], string> = {
  // Line-level: multiplied into each matching line by the one resolver.
  category_extra: 'get_product_price_for_workspace',
  date_window: 'get_product_price_for_workspace',
  // Document-level: taken off the order subtotal. Never folded into the line resolver, or the
  // discount would apply twice — the reason cash_payment stayed out of it in phase 1.1.
  cash_payment: 'get_workspace_cash_discount_pct',
  payment_terms: 'get_payment_terms_discount_pct',
  first_order: 'get_first_order_discount_pct',
  // The only one needing the whole basket; the line resolver sees one product at a time.
  bundle: 'get_bundle_discount_pct',
};

/** The authoring surface. A type it cannot offer is unreachable from the other direction. */
const AUTHORING_UI = 'src/modules/finance/components/CustomPricingRulesCard.tsx';

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

/** Strip comments so prose about the retired design doesn't count as a resolver branch. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('pricing_custom_rules.rule_type', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
    .filter((f) => posix(f) !== 'src/integrations/supabase/types.ts');

  it('finds sources to scan', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it.each(ALLOWED_RULE_TYPES)('%s can be authored in the UI', (type) => {
    const ui = stripComments(read(AUTHORING_UI));
    expect(
      ui.includes(`'${type}'`) || ui.includes(`"${type}"`),
      `'${type}' is allowed by the CHECK constraint but ${AUTHORING_UI} cannot create it`,
    ).toBe(true);
  });

  it('the UI offers nothing the constraint would reject', () => {
    // The failure that broke every `sales` invite: creatable in one place, rejected by a CHECK in
    // another. Here it would surface as a save that throws.
    const ui = stripComments(read(AUTHORING_UI));
    const offered = [...ui.matchAll(/value="([a-z_]+)"/g)].map((m) => m[1]);
    const rejected = offered.filter(
      (v) => v.includes('_') && !(ALLOWED_RULE_TYPES as readonly string[]).includes(v),
    );
    expect(rejected, 'the rule-type picker offers a value the CHECK constraint rejects').toEqual([]);
  });

  it('NO TypeScript resolves a rule type — resolution is SQL-only since phase 1', () => {
    // `.eq('rule_type', …)` is the shape of asking the table which rule applies. That is policy,
    // and policy has one home. Both deleted copies looked exactly like this.
    const LOOKUP = /\.eq\(\s*['"]rule_type['"]/;
    const offenders = files
      .filter((f) => LOOKUP.test(stripComments(readFileSync(f, 'utf8'))))
      .map(posix);
    expect(
      offenders,
      'Resolve it in SQL: get_product_price_for_workspace, or get_workspace_cash_discount_pct. ' +
      offenders.join(', '),
    ).toEqual([]);
    // Guard the guard — this must match the code that was actually removed.
    expect(LOOKUP.test(".eq('rule_type', 'cash_payment')")).toBe(true);
    expect(LOOKUP.test(".eq('id', id)")).toBe(false);
  });

  it('the client reaches each type through its SQL resolver', () => {
    // Proves the replacement is wired, not merely that the old code is gone — the two halves of
    // a real migration. A resolver nothing calls is as inert as a rule nothing resolves.
    const all = files.map((f) => stripComments(readFileSync(f, 'utf8'))).join('\n');
    for (const fn of new Set(Object.values(SQL_RESOLVERS))) {
      expect(all.includes(fn), `nothing in the client calls ${fn}`).toBe(true);
    }
  });

  it('every allowed type names the SQL function that resolves it', () => {
    // Bookkeeping, not behaviour: adding a type to the constraint without deciding where it
    // resolves is exactly how an inert rule ships.
    for (const type of ALLOWED_RULE_TYPES) {
      expect(SQL_RESOLVERS[type], `${type} has no SQL resolver recorded`).toBeTruthy();
    }
    expect(Object.keys(SQL_RESOLVERS).sort()).toEqual([...ALLOWED_RULE_TYPES].sort());
  });
});

describe('retired rule types stay retired', () => {
  /**
   * A retired type is more dangerous than a missing one: the authoring UI would happily offer
   * it, the CHECK would reject the INSERT, and the operator would see a save fail with a
   * constraint error. That is the shape that made every `sales` / `realestate_agent` invite
   * fail at redemption (workspaceRoles.test.ts).
   */
  for (const t of RETIRED_RULE_TYPES) {
    it(`${t} is not offered by the authoring UI`, () => {
      expect(read(AUTHORING_UI), `${t} was retired — the CHECK constraint refuses it`).not.toContain(`'${t}'`);
    });
  }
});
