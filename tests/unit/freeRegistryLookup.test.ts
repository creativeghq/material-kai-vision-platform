/**
 * `company_registry_lookup` is the FREE path, and both halves of that have to stay true.
 *
 * Free in the literal sense: GLEIF, ARES and ANAF are public government/foundation endpoints that
 * take no key and no account, so the tool debits nothing. The moment someone adds a
 * `debitExternalServiceCredits` / `reserveCredits` call to it, the reason it exists — start here
 * before you spend anything — is gone, and the agent's "this is free, always try it first"
 * instruction in the tool description becomes a lie the model has no way to detect.
 *
 * And free in the sense that matters for #334: it answers the question the paid providers do NOT.
 * Apollo sells employee counts and technographics; the registries say whether the entity is real,
 * what it is called on paper, and what its registration number is. That number is the bridge to
 * the ΑΑΔΕ / VIES lookup `create_company_from_vat` already implements — which is why this tool
 * must never grow its own VAT-lookup path instead of pointing at that one.
 *
 * The third property is the one that already bit during development. OpenStreetMap was in this
 * tool as "the free phone source" until it was measured: Overpass times out on a country-wide name
 * regex, and Nominatim returned a phone for none of four test manufacturers. It reported
 * `unavailable` on 100% of calls while the tool as a whole still looked healthy. A per-source
 * `hit` / `miss` / `unavailable` verdict is what made that visible in one run, so it is pinned.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/_shared/tools/b2b-tools.ts'), 'utf8'),
);

/** The tool body, from its factory to the next top-level export. */
const TOOL = (() => {
  const from = SRC.indexOf('createCompanyRegistryLookupTool');
  expect(from, 'createCompanyRegistryLookupTool is gone — re-point this guard').toBeGreaterThan(-1);
  const next = SRC.indexOf('export const create', from + 40);
  return SRC.slice(from, next > -1 ? next : undefined);
})();

describe('company_registry_lookup stays the free path', () => {
  it('debits nothing', () => {
    for (const spender of ['debitExternalServiceCredits', 'debitOrRefuse', 'reserveCredits', 'b2bAffordabilityGate']) {
      expect(
        TOOL.includes(spender),
        `company_registry_lookup calls ${spender}. It queries public registries that take no key and `
        + `no account — there is nothing to bill for, and its whole role is being the step you run `
        + `before spending anything.`,
      ).toBe(false);
    }
  });

  it('tells the agent it is free, so the model prefers it over the paid tools', () => {
    expect(TOOL).toMatch(/credits:\s*0/);
    expect(TOOL, 'the description must say FREE — it is the only signal the model has').toMatch(/FREE/);
  });

  it('points at the existing VAT lookup rather than growing its own', () => {
    expect(
      TOOL,
      'the registration number this returns is what `create_company_from_vat` needs to reach ΑΑΔΕ / '
      + 'VIES. Naming it keeps the agent chaining to that tool instead of this one sprouting a '
      + 'second VAT path beside it.',
    ).toMatch(/create_company_from_vat/);
    for (const dup of ['vies-validate', 'myaade-rgwspublic2']) {
      expect(
        TOOL.includes(dup),
        `company_registry_lookup calls ${dup} directly. That is create_company_from_vat's job — a `
        + `second caller is a second behaviour to keep in step.`,
      ).toBe(false);
    }
  });

  /**
   * "Found nothing" and "the registry was down" are different answers and only the first one means
   * the company is not there. Collapsing them is how a source sits dead for months looking fine.
   */
  it('reports every source separately, and distinguishes a miss from an outage', () => {
    for (const verdict of ["'hit'", "'miss'", "'unavailable'"]) {
      expect(SRC, `the ${verdict} verdict is gone from the registry sources`).toContain(verdict);
    }
    expect(TOOL, 'the per-source verdicts must reach the caller').toMatch(/sources_unavailable/);

    // Each source function has to be able to say all three, or its outages read as misses.
    for (const fn of ['lookupGleif', 'lookupAres', 'lookupAnaf']) {
      const at = SRC.indexOf(`async function ${fn}(`);
      expect(at, `${fn} is gone — re-point this guard`).toBeGreaterThan(-1);
      const body = SRC.slice(at, SRC.indexOf('\n}', at));
      expect(body, `${fn} never reports 'unavailable' — an outage there would read as "not found"`)
        .toMatch(/status:\s*'unavailable'/);
      expect(body, `${fn} never reports 'miss'`).toMatch(/status:\s*'miss'/);
    }
  });

  /**
   * Every registry call goes through `registryFetch`, which carries the deadline. A bare `fetch`
   * to a public endpoint is how one slow donated service holds the whole tool past the 90s tool
   * timeout — which is exactly what Overpass did before it was removed.
   */
  it('every registry call carries a deadline', () => {
    const region = SRC.slice(SRC.indexOf('async function registryFetch'), SRC.indexOf('createCompanyRegistryLookupTool'));
    const bareFetches = [...region.matchAll(/\bawait fetch\(/g)].length;
    expect(
      bareFetches,
      'a registry helper calls fetch() directly instead of registryFetch(). registryFetch is what '
      + 'holds the AbortController deadline and turns an outage into a reported state rather than a throw.',
    ).toBe(1); // the one inside registryFetch itself
  });
});
