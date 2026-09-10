/** The category vocabulary has ONE source, and no hand-written copy may reappear (#347 phase 3.4). */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import {
  CATEGORY_VOCAB,
  ALL_CONTROLLED_VOCAB,
  categoryKeyForVocab,
} from '../../src/lib/categoryVocab.generated';
import { UPLOAD_CATEGORIES, resolveUploadCategory } from '../../src/lib/categoryFieldRegistry';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (p.includes('node_modules')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

describe('category vocabulary — one source', () => {
  it('the projection is populated', () => {
    expect(CATEGORY_VOCAB.length).toBeGreaterThan(5);
    expect(ALL_CONTROLLED_VOCAB.size).toBeGreaterThan(50);
  });

  it('no hand-written copy of the vocabulary exists outside the projection', () => {
    // `controlledVocab:` as a DECLARED array is what a second copy looks like. The generated
    // file legitimately declares it; nothing else may.
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      const rel = relative(ROOT, file).split(sep).join('/');
      if (rel === 'src/lib/categoryVocab.generated.ts') continue;
      const src = readFileSync(file, 'utf8');
      if (/controlledVocab\s*:\s*\[/.test(src)) offenders.push(rel);
    }
    expect(offenders,
      'a hand-written category vocabulary reappeared. It belongs in material_categories; '
      + 'regenerate src/lib/categoryVocab.generated.ts with scripts/gen-category-vocab.mjs.',
    ).toEqual([]);
  });

  it('the categories the product surfaces use ARE the projection', () => {
    // These used to be two lists that had to agree. `UPLOAD_CATEGORIES` is now the projection
    // itself (#368 PD-5), so this asserts the wiring rather than a coincidence.
    expect([...UPLOAD_CATEGORIES].sort()).toEqual(CATEGORY_VOCAB.map((c) => c.key).sort());
  });

  it('canonical values win over aliases', () => {
    // `lighting` is BOTH a canonical value of the lighting category and its own alias. If alias
    // lookup ran first, a term that is both could resolve differently depending on row order.
    for (const entry of CATEGORY_VOCAB) {
      for (const v of entry.controlledVocab) {
        expect(categoryKeyForVocab(v), `canonical '${v}' should resolve to ${entry.key}`)
          .toBe(entry.key);
      }
    }
  });

  it('the five values that used to be unmappable now resolve', () => {
    // The exact drift this phase found: present in the DB, absent from the TypeScript copy.
    for (const [value, expected] of [
      ['carpet', 'wood'],
      ['door', 'building_materials'],
      ['window', 'building_materials'],
      ['fabric_swatch', 'general_materials'],
      ['leather_swatch', 'general_materials'],
    ] as const) {
      expect(categoryKeyForVocab(value), `'${value}' must map to ${expected}`).toBe(expected);
    }
  });

  it('resolveUploadCategory uses the projection, not a fuzzy guess', () => {
    // `carpet` contains none of the fuzzy substrings, so before this phase it fell all the way
    // through to 'general_materials'. It is a wood/flooring product.
    expect(resolveUploadCategory('carpet')).toBe('wood');
    expect(resolveUploadCategory('porcelain_tile')).toBe('tiles');
    // Aliases still work.
    expect(resolveUploadCategory('marble')).toBe('general_materials');
    // Unknown input still degrades to the documented default rather than throwing.
    expect(resolveUploadCategory('something_nobody_has_ever_sold')).toBe('general_materials');
  });
});
