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
  const from = SRC.indexOf('export const createCompanyRegistryLookupTool');
  expect(from, 'createCompanyRegistryLookupTool is gone — re-point this guard').toBeGreaterThan(-1);
  const next = SRC.indexOf('export const create', from + 44);
  return SRC.slice(from, next > -1 ? next : undefined);
})();

/** The routing table, which is where the country coverage actually lives. */
const TABLE = () => {
  const from = SRC.indexOf('const NATIONAL_REGISTRIES');
  expect(from, 'NATIONAL_REGISTRIES is gone — re-point this guard').toBeGreaterThan(-1);
  return SRC.slice(from, SRC.indexOf('const REGISTRY_COUNTRIES'));
};

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

    const gleif = SRC.slice(SRC.indexOf('async function lookupGleif('));
    expect(gleif.slice(0, gleif.indexOf('\n}'))).toMatch(/status:\s*'unavailable'/);
  });

  /**
   * The routing table is what makes "add a country" one entry rather than a new branch, so every
   * entry has to be able to say all three verdicts. A register that can only say hit-or-miss
   * reports its own outage as "this company does not exist" — which is the opposite conclusion,
   * and the one an operator would act on.
   */
  it('every national register can report an outage, not just a miss', () => {
    const table = TABLE();
    const countries = [...table.matchAll(/^ {2}([A-Z]{2}): \{$/gm)].map((m) => m[1]);
    expect(
      countries.length,
      'fewer than 7 countries in NATIONAL_REGISTRIES — the table is the coverage, so a shrink is a '
      + 'real loss of markets, not a refactor',
    ).toBeGreaterThanOrEqual(7);

    for (const cc of countries) {
      const at = table.indexOf(`\n  ${cc}: {`);
      const nextIdx = countries
        .map((o) => table.indexOf(`\n  ${o}: {`))
        .filter((i) => i > at)
        .sort((a, b) => a - b)[0];
      const entry = table.slice(at, nextIdx > -1 ? nextIdx : undefined);
      expect(entry, `${cc} never reports 'unavailable' — its outages would read as "not found"`)
        .toMatch(/status:\s*'unavailable'/);
      expect(entry, `${cc} declares no register name`).toMatch(/register:\s*'/);
      expect(entry, `${cc} declares no keyedBy`).toMatch(/keyedBy:\s*'(name|id)'/);
    }
  });

  /**
   * GLEIF's `filter[fulltext]` searches every indexed field, not just the name, and its ranking
   * reflects that. Searching Italy for "Marazzi" put **PRO-BIKE SRL first** — a different company
   * entirely, with the word Marazzi nowhere in its name, carrying a real LEI and a real address.
   * Six genuine MARAZZI companies ranked below it. Handed to the agent unranked, that is not a
   * fuzzy match; it is the wrong company presented as a confident one.
   *
   * Re-ranked and NOT filtered, which is the half that is easy to get wrong on a later edit: GLEIF
   * holds Karelia as `ΚΑΠΝΟΒΙΟΜΗΧΑΝΙΑ ΚΑΡΕΛΙΑ ΑΝΩΝΥΜΟΣ ΕΤΑΙΡΕΙΑ`, so a name in another script is a
   * real match this check cannot always confirm. Dropping it would lose the Greek supplier — the
   * exact case the platform's folding and transliteration machinery exists for.
   */
  it('re-ranks GLEIF by whether the name actually matches, and never drops the rest', () => {
    expect(SRC, 'the name-match check is gone').toMatch(/function nameMatchesQuery\(/);
    expect(SRC, 'every GLEIF match must carry the verdict').toMatch(/name_matches_query:\s*nameMatchesQuery\(/);

    const fn = SRC.slice(SRC.indexOf('function nameMatchesQuery('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(
      body,
      'the check must transliterate before folding. foldForSearch handles case and accents and '
      + 'explicitly does NOT transliterate, so without this a Latin query never matches a Greek or '
      + 'Cyrillic legal name and the supplier is silently ranked last.',
    ).toMatch(/transliterateToLatin\(/);
    expect(body, 'and it must fold — raw comparison misses Ż, ά and final sigma').toMatch(/foldForSearch\(/);

    const from = SRC.indexOf('async function lookupGleif(');
    expect(from, 'lookupGleif is gone — re-point this guard').toBeGreaterThan(-1);
    const after = SRC.indexOf('\nconst NATIONAL_REGISTRIES', from);
    const gleifBody = SRC.slice(from, after > -1 ? after : from + 4000);
    expect(
      gleifBody,
      'non-matching GLEIF rows must still be RETURNED, just ranked below the matching ones — a '
      + 'silent drop loses every company whose name is written in another script.',
    ).toMatch(/matches:\s*\[\.\.\.byName,\s*\.\.\.rest\]/);
    expect(gleifBody, 'a result set with no name match must say so').toMatch(/caution:/);
  });

  /**
   * The covered-country list is DERIVED from the table. Hand-listing it anywhere is how the tool
   * description ends up promising a register that was removed, which the model cannot detect.
   */
  it('derives the covered-country list from the table', () => {
    expect(SRC).toMatch(/REGISTRY_COUNTRIES\s*=\s*Object\.keys\(NATIONAL_REGISTRIES\)/);
    expect(TOOL, 'the response must tell the caller which countries have a national register')
      .toMatch(/countries_with_a_national_register/);
    expect(
      TOOL,
      'an uncovered country must say so. Otherwise "no national register for Bulgaria" and "this '
      + 'company is not real" are the same answer, and they are opposite conclusions.',
    ).toMatch(/No free national register wired for/);
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
