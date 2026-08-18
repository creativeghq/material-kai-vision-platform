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
