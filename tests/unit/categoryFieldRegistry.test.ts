/** Material metadata registry (#347 phase 3, #368 PD-5) — one registry, no second copy. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { CATEGORY_KEYS } from '../../src/lib/categoryVocab.generated';
import { UPLOAD_CATEGORIES, resolveUploadCategory } from '../../src/lib/categoryFieldRegistry';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/** Strip comments so prose describing the old shape never counts as the old shape. */
const blankComments = (src: string) =>
  sharedBlankComments(src);

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

const REGISTRY_TS = 'src/lib/categoryFieldRegistry.ts';
const SERVICE_TS = 'src/services/dealerProductsService.ts';
const RUNTIME_TS = 'src/services/fieldRegistryService.ts';

describe('category vocabulary ↔ the DB registry', () => {
  it('the category list is the projection, not a union typed out by hand', () => {
    // The union used to be written here and had already lost `building_materials`.
    const src = blankComments(read(REGISTRY_TS));
    expect(/export type UploadCategory\s*=\s*\n?\s*\|/.test(src),
      'UploadCategory must be derived from categoryVocab.generated, not spelled out').toBe(false);
    expect([...UPLOAD_CATEGORIES].sort()).toEqual([...CATEGORY_KEYS].sort());
  });

  it('every category resolves to itself', () => {
    // A category present in the DB that this cannot resolve renders under another one's
    // heading and reports nothing.
    for (const key of CATEGORY_KEYS) {
      expect(resolveUploadCategory(key), `${key} must resolve to itself`).toBe(key);
    }
  });

  it('building_materials — the category the hand-written union lost — resolves', () => {
    expect(resolveUploadCategory('door')).toBe('building_materials');
    expect(resolveUploadCategory('window')).toBe('building_materials');
  });
});

describe('the registry is read, not restated', () => {
  it('no hardcoded facet-key array has come back', () => {
    // COMMON_FACET_KEYS was exactly this shape. The keys it named are registry rows; any array
    // of them in source is a copy that will drift the moment a field is rescoped in the DB.
    const FACETY = ['color', 'available_colors', 'finish', 'material', 'style', 'application', 'room'];
    const offenders: string[] = [];
    for (const file of [SERVICE_TS, 'src/components/business/marketplace/AddDealerProductDialog.tsx']) {
      blankComments(read(file)).split('\n').forEach((line, i) => {
        // An array literal naming three or more facet keys is a restatement of the registry.
        const named = FACETY.filter((k) => line.includes(`'${k}'`)).length;
        if (named >= 3) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(
      offenders,
      'Read the fields from material_metadata_fields (loadCategoryFields) instead of listing ' +
      'them. The registry knows which are global, which are scoped, and which canonicalize.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  it('COMMON_FACET_KEYS is gone and not re-exported', () => {
    expect(blankComments(read(SERVICE_TS))).not.toContain('COMMON_FACET_KEYS');
  });

  it('the field query honours is_global and filters to active rows', () => {
    const src = blankComments(read(SERVICE_TS));
    expect(src, 'the universal flag must be selected').toMatch(/is_global/);
    expect(src, "inactive registry rows must not be offered").toMatch(/\.eq\(\s*'status'\s*,\s*'active'\s*\)/);
    expect(src, 'is_global is the universality test').toMatch(/is_global\s*===\s*true/);
  });

  it('an empty applies_to_categories no longer means "applies to all"', () => {
    // The exact predicate that leaked 16 fields into every category.
    const src = blankComments(read(SERVICE_TS));
    expect(src).not.toMatch(/arr\.length\s*===\s*0\s*\|\|/);
    expect(src, 'a null/absent scope must not short-circuit to true').not.toMatch(/if\s*\(\s*!cats\s*\)\s*return true/);
  });

  it('the runtime reader applies the same universality rule', () => {
    const src = blankComments(read(RUNTIME_TS));
    expect(src, 'is_global is the universality test here too').toMatch(/is_global === true/);
    expect(src, 'and it reads only active rows').toMatch(/\.eq\(\s*'status'\s*,\s*'active'\s*\)/);
  });

  it('CATEGORY_DISPLAY_REGISTRY has not come back', () => {
    // #368 PD-5. The 900-line display registry is the copy this phase deleted. Anything that
    // reintroduces a per-category map of sections and field labels is the same thing again.
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      const rel = relative(ROOT, file).split(sep).join('/');
      const src = blankComments(readFileSync(file, 'utf8'));
      if (/CATEGORY_DISPLAY_REGISTRY/.test(src)) offenders.push(rel);
      // A `sections: [...]` literal carrying `fields: [` under it is the shape regardless of
      // what the constant is called.
      if (/sections\s*:\s*\[[\s\S]{0,400}?fields\s*:\s*\[\s*\{\s*key\s*:/.test(src)) offenders.push(rel);
    }
    expect(
      [...new Set(offenders)],
      'the sections and labels live in material_metadata_fields (section, display_name, '
      + 'label_by_category, applies_to_categories) and are read by fieldRegistryService.',
    ).toEqual([]);
  });
});
