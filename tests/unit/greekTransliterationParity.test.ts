import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { transliterateGreek, GREEK_DIGRAPHS, GREEK_LETTERS } from '@/services/crm/greekTransliteration';
import { transliterateGreek as edgeTransliterate } from '../../supabase/functions/_shared/crm/greekTransliteration.generated';
import { readMappings } from '../../scripts/gen-crm-translit-sql.mjs';
import { foldForSearch } from '@/components/core/filters/types';

/**
 * Greek→Latin search transliteration exists THREE times, and they must agree (#353 CRM-1).
 *
 *   • src/services/crm/greekTransliteration.ts                       — the source (browser)
 *   • supabase/functions/_shared/crm/greekTransliteration.generated  — generated mirror (Deno)
 *   • public.crm_translit(text)                                      — SQL, writes the column
 *
 * Three, because a search compares a query built in the browser against a column generated in
 * Postgres, and the duplicate probe runs in Deno. The same split `crm_fold`/`foldForSearch`
 * already live with — and the reason `searchFoldParity.test.ts` exists.
 *
 * The two TypeScript twins are imported and compared for real. SQL cannot run here, so its half
 * is pinned two ways: the committed `.sql` is checked to be REGENERATABLE from the same mapping
 * table, and the VECTORS below are frozen output captured from `public.crm_translit()` against
 * the live database. Re-capture with:
 *
 *   select t, public.crm_translit(public.crm_fold(t)) from (values ('…')) v(t);
 */

const ROOT = join(__dirname, '..', '..');
const SOURCE = 'src/services/crm/greekTransliteration.ts';
const SQL = 'supabase/sql/crm_translit.generated.sql';

const IMPLS: Array<[string, (v: string) => string]> = [
  [SOURCE, transliterateGreek],
  ['supabase/functions/_shared/crm/greekTransliteration.generated.ts', edgeTransliterate],
];

/** `crm_fold` then `crm_translit`, as produced by Postgres. Captured 2026-08-28. */
const VECTORS: Array<[string, string]> = [
  // The audit's concrete misses. Each pair MUST land on the same key.
  ['ΜΕΤΑΛΛΙΚΑ ΕΡΓΑ Α.Ε.', 'metallika erga a.e.'],
  ['Metallika Erga SA', 'metallika erga sa'],
  ['Νίκος Παπαδόπουλος', 'nikos papadopoulos'],
  ['Nikos Papadopoulos', 'nikos papadopoulos'],
  // Voiced stops — the digraphs a letter-by-letter mapping gets wrong. `Μπάμπης` is Babis, not
  // "mpampis"; `Ντίνος` is Dinos, not "ntinos". Nobody typing Latin would ever write those.
  ['Μπάμπης Ντίνος', 'babis dinos'],
  // The case the platform's own folding machinery was built for.
  ['Καρέλης ΑΕ', 'karelis ae'],
  ['ΚΑΡΕΛΗΣ ΑΕ', 'karelis ae'],
  // γγ→ng, ευ→ev, τσ→ts, τζ→tz, θ→th, ψ→ps, χ→ch, ω→o, ξ→x.
  ['Γιώργος Τσάκαλος', 'giorgos tsakalos'],
  ['Αγγελική Ευαγγέλου', 'angeliki evangelou'],
  ['ΤΖΙΜΑΣ', 'tzimas'],
  ['Ελευθερία', 'elevtheria'],
  ['Θεοδώρου', 'theodorou'],
  ['Ψαρράς', 'psarras'],
  ['Χατζής', 'chatzis'],
  ['Ωμέγα', 'omega'],
  ['Ξένος', 'xenos'],
  // Latin passes through untouched — what makes it safe to apply to everything.
  ['plain latin name', 'plain latin name'],
  ['', ''],
];

describe('#353 CRM-1 — the three implementations agree', () => {
  for (const [name, fn] of IMPLS) {
    it(`${name} matches the SQL vectors`, () => {
      for (const [input, expected] of VECTORS) {
        expect(fn(foldForSearch(input)), `${name} on ${JSON.stringify(input)}`).toBe(expected);
      }
    });
  }

  it('the two TypeScript twins are byte-identical in behaviour', () => {
    // Not just "both pass the vectors" — the mirror is generated, so any divergence means the
    // generation is stale, and staleness is invisible from the vectors alone if both are wrong.
    const probes = [...VECTORS.map(([i]) => i), 'αυτοκινητο', 'ΓΚΑΓΚΑ', 'υιος', 'οικος', 'ειναι'];
    for (const p of probes) {
      expect(edgeTransliterate(foldForSearch(p)), p).toBe(transliterateGreek(foldForSearch(p)));
    }
  });

  it('the committed SQL is regeneratable from the same mapping table', () => {
    // The SQL half cannot be executed here, so this is what stands in for it: the function body
    // in the DB was applied FROM this file, and this file is derivable from the TypeScript.
    // Drift therefore needs two independent mistakes rather than one.
    const fromTs = readMappings(readFileSync(join(ROOT, SOURCE), 'utf8'));
    const sql = readFileSync(join(ROOT, SQL), 'utf8');
    const inSql = [...sql.matchAll(/, '([^']+)', '([^']*)'\)/g)].map((m) => [m[1], m[2]]);
    expect(inSql).toEqual([...fromTs.digraphs, ...fromTs.letters]);
  });
});

describe('#353 CRM-1 — the ordering rules that make it correct', () => {
  it('digraphs are applied before single letters', () => {
    // `ου` must become `ou` before `ο` and `υ` are replaced separately, which would give `oy`.
    expect(transliterateGreek('ουρανος')).toBe('ouranos');
    expect(transliterateGreek('μπουκαλι')).toBe('boukali');
  });

  it('longer sequences precede their own prefixes', () => {
    // `γγ` before `γ`, or `αγγελος` becomes `aggelos` instead of `angelos`.
    const keys = GREEK_DIGRAPHS.map(([k]) => k);
    expect(keys.indexOf('γγ')).toBeLessThan(keys.indexOf('γκ'));
    expect(transliterateGreek('αγγελος')).toBe('angelos');
  });

  it('every Greek letter has a mapping', () => {
    // A letter with no entry passes through as Greek and poisons the whole key: the stored
    // column would hold a half-transliterated string that no Latin query can ever match.
    const alphabet = 'αβγδεζηθικλμνξοπρστυφχψωσς';
    const mapped = new Set(GREEK_LETTERS.map(([k]) => k));
    for (const ch of alphabet) {
      expect(mapped.has(ch), `no mapping for ${ch}`).toBe(true);
    }
    expect(transliterateGreek(alphabet)).toMatch(/^[a-z]+$/);
  });

  it('output is always Latin — nothing Greek survives', () => {
    for (const [input] of VECTORS) {
      expect(transliterateGreek(foldForSearch(input))).not.toMatch(/[Ͱ-Ͽ]/);
    }
  });
});

describe('#353 CRM-1 — the search helpers use the cross-script columns', () => {
  const src = readFileSync(join(ROOT, 'src/services/crmSearch.ts'), 'utf8');

  it('CRM_SEARCH_COLUMN points at search_xscript', () => {
    // The old `search_fold` holds no transliteration, so pointing back at it silently restores
    // the bug while every test that only checks "a fold happened" keeps passing.
    expect(src).toContain("export const CRM_SEARCH_COLUMN = 'search_xscript'");
    expect(src).toContain("export const CRM_NAME_COLUMN = 'name_xscript'");
  });

  it('foldedLike folds THEN transliterates THEN escapes', () => {
    // Order is load-bearing: the mapping is written against folded input, and escaping first
    // would leave the pattern's metacharacters half-processed by the two passes after it.
    expect(src).toMatch(/escapeLike\(transliterateGreek\(foldForSearch\(term\)\)\)/);
  });

  it('the dedupe helper does NOT wrap in %…%', () => {
    // `name_xscript` is an equality key. Wrapping it would make every short name collide with
    // every longer one containing it.
    const fn = src.slice(src.indexOf('export function foldedName'));
    expect(fn).not.toContain('%');
  });
});
