import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { VOCABULARIES, expectedMirror } from '../../scripts/gen-vocabularies.mjs';

/**
 * Every generated vocabulary mirror must be what `npm run vocab:mirror` would produce.
 *
 * A vocabulary is a closed set of string values — which triggers a tenant flow may use, which
 * statuses a record may hold. When both runtimes need one, it gets typed out twice, because Vite
 * resolves the `@/` alias and Deno resolves by URL, so neither can import the other's copy.
 *
 * A sweep on 2026-08-27 counted 59 such sets duplicated across `src/` and `supabase/functions/`,
 * 32 of them exactly matching a Postgres enum or CHECK constraint — the database enforcing the
 * fact while TypeScript restates it two to six times. The flow vocabulary was the worst case at
 * four hand-written copies, and the palette copy had drifted WIDER than the enforcer: it offered
 * builder nodes whose INSERT can only raise 42501.
 *
 * The fix is generation, not vigilance. A guard on a hand-kept copy reports drift after someone
 * has already shipped it; a generated copy has nothing to drift from. This test is what makes the
 * generated half trustworthy — without it, a stale checked-in mirror is invisible, and a stale
 * mirror is strictly worse than no mirror because it looks authoritative.
 */
describe('vocabulary mirrors are generated, not hand-kept', () => {
  it('has at least one mirror configured (guards against a vacuous pass)', () => {
    // If VOCABULARIES is ever emptied — or the import silently resolves to nothing — every
    // assertion below would iterate zero items and pass. That is the failure this whole file
    // exists to prevent, so it must not be possible here either.
    expect(VOCABULARIES.length).toBeGreaterThan(0);
  });

  it.each(VOCABULARIES)('%s is mirrored verbatim to %s', (source, target) => {
    expect(
      readFileSync(target, 'utf8'),
      `${target} is not what ${source} would generate. Run \`npm run vocab:mirror\` — and do ` +
      'NOT hand-edit the mirror: it is a byte copy, so an edit here is silently reverted by the ' +
      'next person who runs gen:all, taking whatever behaviour depended on it with it.',
    ).toBe(expectedMirror(source));
  });

  /**
   * The calculators are DERIVATIONS, not vocabularies (#395).
   *
   * `calculator-tools.ts` carried a second implementation of each under a header reading "keep
   * the two in sync". The heat-pump constants still agreed; the heating-cost pair had already
   * diverged — the tool hardcoded the calorific values and efficiencies the canonical version
   * accepts as overrides, so the web page could be told "our oil is 10.2 kWh/L" and the agent
   * could not. A duplicated derivation is harder to spot than a duplicated vocabulary, because
   * both copies return a plausible number.
   */
  it('the agent calculators use the mirror and keep no copy of the math', () => {
    const tools = readFileSync('supabase/functions/_shared/tools/calculator-tools.ts', 'utf8');
    expect(tools).toContain("from '../calculators/heatPumpSizing.generated.ts'");
    expect(tools).toContain("from '../calculators/heatingCostComparison.generated.ts'");
    for (const constant of [
      'BASE_W_PER_M2', 'ZONE_FACTOR', 'GLAZING_FACTOR', 'DHW_KW_PER_OCCUPANT',
      'distributionFactor =', 'oilCalorific =', 'woodRawCalorific =',
    ]) {
      expect(tools, `${constant} is back — the math has been re-copied into the tool`)
        .not.toContain(constant);
    }
  });

  it('every source stays import-free so the copy can be a byte copy', () => {
    // One `import` makes the module unresolvable in the other runtime, which turns the mirror
    // from a byte copy into a translation — and a translation is a second implementation
    // wearing a generated banner.
    for (const [source] of VOCABULARIES) {
      const src = readFileSync(source, 'utf8');
      expect(
        /^\s*import\s/m.test(src),
        `${source} has an import. A mirrored vocabulary module must be dependency-free: Vite ` +
        'resolves `@/` and Deno resolves by URL, so the copy would not load on the other side.',
      ).toBe(false);
    }
  });
});
