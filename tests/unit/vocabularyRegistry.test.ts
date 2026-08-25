/**
 * Value vocabularies live in `public.reference_vocabularies` — not in a constant (issue #370).
 *
 * WHAT WENT WRONG. The 30 sourcing markets were `B2B_REGIONS`, a module-local const in
 * b2b-tools.ts used only to interpolate a string into a web-search query. The model could not read
 * it from the prompt, the schema (`region` was a bare `z.string()`), the tool description (it named
 * the five region KEYS and never their members), or the KB. Asked to "search the countries list we
 * have in place", the agent searched the Knowledge Base three times, found nothing, INVENTED a
 * list and presented it as the platform's — Bulgaria in the wrong region, 13 markets missing.
 * Nothing could catch it: a wrong country list is a valid country list.
 *
 * And there were three lists, all disagreeing:
 *   B2B_REGIONS       30 sourcing markets (edge)
 *   COMMON_MARKETS    14 readable names, no Poland/Turkey/Serbia/Romania (ToolkitFormModal)
 *   COUNTRY_CODES     16 ISO codes (ToolkitFormModal)
 * so the B2B "Enrich a company" picker offered Australia and Canada and hid every market the
 * search tool actually swept.
 *
 * This file is the ratchet. It is a TEXT rule for the same reason escapeHtmlParity is: the copies
 * drifted precisely because convention was the only thing holding them together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { stripComments as sharedStripComments } from '../helpers/stripComments';
import {
  buildMarketScope,
  resolveMarket,
  type VocabularyTerm,
} from '../../supabase/functions/_shared/vocabularies.ts';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

/** Source files we scan: the app + the edge functions, skipping build output and vendored deps. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const skip = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', 'playwright-report']);
  const walk = (dir: string) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (skip.has(e)) continue;
      const full = join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(e) && !/\.generated\.ts$/.test(e)) out.push(full);
    }
  };
  walk(join(ROOT, 'src'));
  walk(join(ROOT, 'supabase/functions'));
  return out;
}

/**
 * Countries that appear in `sourcing_markets` and essentially nowhere else in normal prose — a
 * literal array containing several of these is a country list, whatever it is called.
 */
const MARKET_NAMES = [
  'Poland', 'Czech Republic', 'Slovakia', 'Hungary', 'Romania', 'Bulgaria', 'Ukraine',
  'Turkey', 'Serbia', 'Croatia', 'Slovenia', 'North Macedonia', 'Albania',
  'Lithuania', 'Latvia', 'Estonia', 'Finland', 'Denmark',
  'Germany', 'Netherlands', 'France', 'Spain', 'Italy', 'Portugal', 'United Kingdom',
];

/**
 * Files that legitimately hold a list of countries for a DIFFERENT purpose. The defect was never
 * "a country list exists" — it was four divergent lists of the SAME thing (sourcing markets).
 * Each entry states why it is not that. SHRINK-ONLY: adding one needs a reason as good as these,
 * and a stale entry fails the test below rather than lingering.
 */
const NON_SOURCING_COUNTRY_LISTS: Array<{ file: string; why: string }> = [
  {
    file: 'src/components/core/Profile/ProfileTab.tsx',
    why: 'phone DIAL codes (+30, +44) with flags — a different vocabulary that happens to name countries',
  },
  {
    file: 'src/lib/vatCountries.ts',
    why: 'VAT PREFIX letters (EL≠GR for Greece), already the documented single source for every Tax/VAT surface, with the name→code derivation in SQL (country_ref()) and a crm.country_code_mismatch probe over it',
  },
];

describe('country vocabularies are data, not constants', () => {
  const files = sourceFiles();
  const exempt = new Set(NON_SOURCING_COUNTRY_LISTS.map((e) => e.file.replace(/\//g, sep)));

  it('scans a believable number of files (an inert walk must fail, not pass)', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('every exemption still points at a real file', () => {
    const missing = NON_SOURCING_COUNTRY_LISTS
      .filter((e) => !files.some((f) => relative(ROOT, f) === e.file.replace(/\//g, sep)))
      .map((e) => e.file);
    expect(
      missing,
      `Exempted files that no longer exist — prune them, this list only shrinks: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('no source file hard-codes a list of sourcing markets', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (exempt.has(relative(ROOT, f))) continue;
      const code = sharedStripComments(read(f));
      // Count distinct market names that appear as quoted string literals.
      const quoted = new Set<string>();
      for (const name of MARKET_NAMES) {
        if (new RegExp(`['"\`]${name}['"\`]`).test(code)) quoted.add(name);
      }
      // Three or more quoted market names in one file is a list, not an example.
      if (quoted.size >= 3) offenders.push(`${relative(ROOT, f)} (${[...quoted].slice(0, 6).join(', ')}…)`);
    }
    expect(
      offenders,
      'These files hard-code a country list. Seed it into `reference_vocabularies` and read it ' +
        'through _shared/vocabularies.ts (edge) or src/services/vocabularies.ts (frontend). ' +
        'Three copies already drifted to three different answers:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the constants this replaced are gone, not merely unused', () => {
    const all = files.map((f) => sharedStripComments(read(f))).join('\n');
    // Named individually rather than by a generic pattern: `COUNTRY_CODES` is deliberately NOT on
    // this list, because two unrelated and legitimate vocabularies use that name — phone dial
    // codes in ProfileTab, and the EU VAT prefix set in vies-validate / role-upgrade-requests,
    // which is defined by regulation rather than by preference. Banning the NAME would have
    // pushed correct code around for nothing; the market-name scan above is what catches a real
    // fourth country list, and it did — it found `SUPPORTED_MARKETS` in _shared/b2b-markets.ts,
    // whose docstring claimed agent-chat and flow-engine used it while nothing imported it.
    for (const dead of ['B2B_REGIONS', 'B2B_ALL_COUNTRIES', 'COMMON_MARKETS', 'SUPPORTED_MARKETS']) {
      expect(
        new RegExp(`\\b${dead}\\b`).test(all),
        `${dead} is back. It was deleted, not emptied — the vocabulary table is the source.`,
      ).toBe(false);
    }
  });

  it('both runtimes have a resolver, and neither restates a vocabulary', () => {
    const edge = read(join(ROOT, 'supabase/functions/_shared/vocabularies.ts'));
    const app = read(join(ROOT, 'src/services/vocabularies.ts'));
    for (const [name, src] of [['edge', edge], ['frontend', app]] as const) {
      expect(src.includes('reference_vocabularies'), `${name} resolver must read the table`).toBe(true);
      // A resolver that silently substitutes a default is the failure this change removes.
      expect(
        /\bPoland\b|\bTurkey\b|\bSerbia\b/.test(sharedStripComments(src)),
        `${name} resolver contains market names — it must READ the vocabulary, never carry one`,
      ).toBe(false);
    }
  });

  it('the scope clause has ONE derivation, shared by both callers', () => {
    const b2b = sharedStripComments(read(join(ROOT, 'supabase/functions/_shared/tools/b2b-tools.ts')));
    const flow = sharedStripComments(read(join(ROOT, 'supabase/functions/flow-engine/index.ts')));
    expect(b2b.includes('buildMarketScope('), 'b2b-tools must use buildMarketScope').toBe(true);
    expect(flow.includes('buildMarketScope('), 'flow-engine must use buildMarketScope').toBe(true);
    // flow-engine's own copy said "across Europe and major global manufacturing hubs" for a bare
    // sweep, so the same request searched different geography depending on the caller.
    expect(
      /across Europe and major global manufacturing hubs/.test(flow),
      'flow-engine is building its own scope clause again',
    ).toBe(false);
  });

  it('region is a real enum built from the vocabulary, not a free string', () => {
    const b2b = sharedStripComments(read(join(ROOT, 'supabase/functions/_shared/tools/b2b-tools.ts')));
    expect(
      /region:\s*z\.enum\(groupKeys\(markets\)/.test(b2b),
      'b2b_manufacturer_search.region must be z.enum(groupKeys(markets)) — as a bare string, an ' +
        'unrecognised value produced "in the <garbage> region" and searched nothing, silently.',
    ).toBe(true);
  });
});

/**
 * A country string means a MARKET ROW, and the row is what carries the language.
 *
 * `country` is a free string on b2b_manufacturer_search on purpose — any country is searchable,
 * not only the ones we sweep — so what arrives is whatever the model typed. It used to be matched
 * against `value` with a `===`, so `Czechia` matched nothing: the search ran, said "in Czechia",
 * and silently dropped the Czech native-language clause that is the entire reason the row carries
 * a language at all. Unresolved and language-less look identical from the outside, so nothing
 * raised — the same shape as the invented country list one layer up.
 *
 * The alternative names are DATA (`metadata.aliases`, seeded by the sourcing_market_aliases
 * migration) rather than a map in a source file, because a map of country names in a source file
 * is another copy of the country list, which is what the scans above exist to stop.
 */
describe('resolveMarket — a country string resolves to the market row it means', () => {
  const term = (
    value: string,
    aliases: string[],
    language_name?: string,
  ): VocabularyTerm => ({
    value,
    label: value,
    group_key: 'cee',
    group_label: 'Central & Eastern Europe',
    sort_order: 10,
    metadata: { aliases, ...(language_name ? { language_name } : {}) },
  });

  // Shaped exactly like the seeded rows, values included — the point of the fixture is that the
  // reported case ("Czechia" for our "Czech Republic") resolves.
  const MARKETS: VocabularyTerm[] = [
    term('Czech Republic', ['CZ', 'CZE', 'Czechia', 'Czech Rep.', 'Czech', 'Česká republika'], 'Czech'),
    term('Turkey', ['TR', 'TUR', 'Türkiye'], 'Turkish'),
    term('United Kingdom', ['GB', 'UK', 'GBR', 'Great Britain', 'Britain'], 'English'),
    term('Netherlands', ['NL', 'NLD', 'Holland', 'Nederland'], 'Dutch'),
    term('Greece', ['GR', 'GRC', 'EL', 'Hellas', 'Ελλάδα'], 'Greek'),
    term('Ukraine', ['UA', 'UKR', 'Україна'], 'Ukrainian'),
  ];

  const resolved = (s: string) => resolveMarket(MARKETS, s)?.value ?? null;

  it('resolves the canonical name whatever the case or spacing', () => {
    expect(resolved('Czech Republic')).toBe('Czech Republic');
    expect(resolved('czech republic')).toBe('Czech Republic');
    expect(resolved('  CZECH REPUBLIC ')).toBe('Czech Republic');
  });

  it('resolves the name the model actually typed — this is the reported bug', () => {
    // Every one of these searched English-only before, with nothing anywhere to say so.
    for (const written of ['Czechia', 'czechia', 'CZ', 'CZE', 'Czech Rep.', 'Česká republika']) {
      expect(resolved(written), `${written} must resolve to our market`).toBe('Czech Republic');
    }
  });

  it('folds accents, punctuation and a leading article', () => {
    expect(resolved('Türkiye')).toBe('Turkey');
    expect(resolved('turkiye')).toBe('Turkey');
    expect(resolved('U.K.')).toBe('United Kingdom');
    expect(resolved('Great-Britain')).toBe('United Kingdom');
    expect(resolved('The Netherlands')).toBe('Netherlands');
  });

  it('resolves a non-Latin name instead of colliding with every other one', () => {
    // An ASCII-only fold turns both of these into '', which is not "no match" — it is "matches
    // whichever row the loop reached first", so Ukraine would have answered for Greece.
    expect(resolved('Ελλάδα')).toBe('Greece');
    expect(resolved('Україна')).toBe('Ukraine');
  });

  it('a canonical name always wins over another market alias', () => {
    // 'Czech' is an alias of Czech Republic; a market literally called Czech would still win.
    const withDecoy = [...MARKETS, term('Czech', [], 'Czech')];
    expect(resolveMarket(withDecoy, 'Czech')?.value).toBe('Czech');
    expect(resolveMarket(withDecoy, 'Czechia')?.value).toBe('Czech Republic');
  });

  it('a country we do not source from resolves to null and is NOT rewritten', () => {
    expect(resolved('Vietnam')).toBeNull();
    expect(resolved('')).toBeNull();
    expect(resolveMarket(MARKETS, null)).toBeNull();
    expect(resolveMarket(MARKETS, undefined)).toBeNull();
    // Narrowing an unlisted country to a listed one would search somewhere nobody asked about.
    expect(buildMarketScope(MARKETS, { country: 'Vietnam' })).toBe('in Vietnam');
  });

  it('the scope clause names the market, not the spelling it arrived in', () => {
    expect(buildMarketScope(MARKETS, { country: 'Czechia' })).toBe('in Czech Republic');
    expect(buildMarketScope(MARKETS, { country: 'Türkiye' })).toBe('in Turkey');
  });

  it('the aliases are read off the row — no source file carries a second list of them', () => {
    const edge = sharedStripComments(read(join(ROOT, 'supabase/functions/_shared/vocabularies.ts')));
    const app = sharedStripComments(read(join(ROOT, 'src/services/vocabularies.ts')));
    expect(/aliases/.test(edge), 'the edge resolver must read metadata.aliases').toBe(true);
    for (const [name, src] of [['edge', edge], ['frontend', app]] as const) {
      expect(
        /Czechia|Turkiye|Türkiye|Holland|Great Britain/.test(src),
        `${name} resolver hard-codes country aliases — they belong on the vocabulary row, ` +
          'editable without a deploy, like the markets themselves',
      ).toBe(false);
    }
  });

  it('the b2b search resolves its country instead of matching the name exactly', () => {
    const b2b = sharedStripComments(read(join(ROOT, 'supabase/functions/_shared/tools/b2b-tools.ts')));
    expect(
      b2b.includes('resolveMarket('),
      'b2b-tools must resolve `country` through resolveMarket — an exact match on `value` dropped ' +
        'the native-language clause for every market written under another name.',
    ).toBe(true);
    expect(
      /m\.value\.toLowerCase\(\)\s*===\s*sel\.country/.test(b2b),
      'the exact-name filter is back in nativeLanguageClause',
    ).toBe(false);
  });
});
