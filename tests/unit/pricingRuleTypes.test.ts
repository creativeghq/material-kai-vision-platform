/**
 * Guards `pricing_custom_rules.rule_type` against the inert-rule failure (#347, defect 21).
 *
 * A discount rule type an admin can CREATE but nothing RESOLVES is invisible: the rule is
 * listed in the UI, it looks active, and no price ever changes. That is this platform's
 * dominant failure shape, and `CustomPricingRulesCard`'s own header already states the policy —
 * "cash_payment is schema-ready but surfaced once a payment-context hook exists, to avoid an
 * inert rule". Nothing enforced it: the column was free text with no CHECK.
 *
 * There is now a CHECK constraint. This test keeps the three copies of the vocabulary honest —
 * the constraint, the resolvers, and the authoring UI — the same arrangement
 * [workspaceRoles.test.ts] uses for a role that was invitable but not storable.
 *
 * SCOPE — the DB constraint is the real gate and lives in `pg_proc`/`pg_constraint`, which this
 * repo never commits. This test scans REPO FILES, so it cannot see the constraint itself; it
 * asserts the TS side matches what the constraint was written with. If you change the
 * constraint, change ALLOWED_RULE_TYPES here in the same migration.
 *
 * Phase 1 of #347 folds all three types into `get_product_price_for_workspace`, after which the
 * resolver list below collapses to one SQL function and this test should be updated to match —
 * the point is that it must be updated deliberately, not drift.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

/** Mirrors `pricing_custom_rules_rule_type_check`. Adding one here means adding a resolver. */
const ALLOWED_RULE_TYPES = ['category_extra', 'volume_category', 'cash_payment'] as const;

/**
 * Where each type is actually turned into money. A type absent from every one of these files
 * is inert, however good the authoring form looks.
 */
const RESOLVERS = [
  'src/modules/quotes/services/QuotesService.ts',
  'src/modules/finance/services/financeService.ts',
  'supabase/functions/_shared/tools/quote-tools.ts',
];

/** The authoring surface. A type it cannot offer is unreachable from the other direction. */
const AUTHORING_UI = 'src/modules/finance/components/CustomPricingRulesCard.tsx';

/** Strip comments so prose naming a retired type doesn't count as a resolver branch. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('pricing_custom_rules.rule_type — every allowed value resolves', () => {
  const resolverSources = RESOLVERS.map((p) => ({ path: p, code: stripComments(read(p)) }));

  it.each(ALLOWED_RULE_TYPES)('%s is resolved somewhere', (type) => {
    const hits = resolverSources.filter((s) => s.code.includes(`'${type}'`)).map((s) => s.path);
    expect(
      hits.length,
      `'${type}' is accepted by the CHECK constraint but no resolver reads it — ` +
        `an admin can create the rule and it will never change a price. ` +
        `Resolvers scanned: ${RESOLVERS.join(', ')}`,
    ).toBeGreaterThan(0);
  });

  it.each(ALLOWED_RULE_TYPES)('%s can be authored in the UI', (type) => {
    const ui = stripComments(read(AUTHORING_UI));
    expect(
      ui.includes(`'${type}'`) || ui.includes(`"${type}"`) || ui.includes(`value="${type}"`),
      `'${type}' is allowed and resolved but ${AUTHORING_UI} cannot create it`,
    ).toBe(true);
  });

  it('the UI offers nothing the constraint would reject', () => {
    // The reverse direction — the failure that broke every `sales` invite: creatable in one
    // place, rejected by the CHECK in another. Here it would surface as a save that throws.
    const ui = stripComments(read(AUTHORING_UI));
    const offered = [...ui.matchAll(/value="([a-z_]+)"/g)]
      .map((m) => m[1])
      .filter((v) => v.includes('_') || (ALLOWED_RULE_TYPES as readonly string[]).includes(v));
    const rejected = offered.filter((v) => !(ALLOWED_RULE_TYPES as readonly string[]).includes(v));
    expect(rejected, 'the rule-type picker offers a value the CHECK constraint rejects').toEqual([]);
  });

  it('no resolver reads a rule type the constraint would reject', () => {
    // Catches the other drift: a resolver branch left behind for a type that was removed from
    // the constraint. It cannot fire, so it is dead code that reads as coverage.
    const known = new Set<string>(ALLOWED_RULE_TYPES);
    for (const { path, code } of resolverSources) {
      const referenced = [...code.matchAll(/rule_type['"]?\s*[,:)]?\s*['"]([a-z_]+)['"]/g)]
        .map((m) => m[1])
        .concat([...code.matchAll(/\.eq\(\s*['"]rule_type['"]\s*,\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]));
      const unknown = [...new Set(referenced)].filter((t) => !known.has(t));
      expect(unknown, `${path} branches on a rule type the constraint rejects`).toEqual([]);
    }
  });
});
