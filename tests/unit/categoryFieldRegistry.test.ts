/**
 * Material metadata registry (#347 phase 3) — one registry, no second copy.
 *
 * `material_metadata_fields` is meant to be THE answer to "which fields does a product in
 * category X have, and what is each one for". Phase 3 exists because that answer was also
 * written down in TypeScript, in Python, and in a hardcoded facet list — and the copies drifted.
 *
 * Three failure shapes, none of them visible to the typechecker:
 *
 *  1. **A second copy of the facet list.** `dealerProductsService` exported
 *     `COMMON_FACET_KEYS = ['color','available_colors','finish','material','style','application','room']`.
 *     The registry disagreed with it on three of the seven: `finish` and `style` are scoped
 *     (8 and 2 categories), not universal, and `application_areas` is global + canonicalizable
 *     and was missing entirely. A hardcoded array of field names is always a copy of this table.
 *
 *  2. **Two conventions for "applies everywhere".** The registry has `is_global`. The consumer
 *     ignored it and inferred universality from an EMPTY `applies_to_categories` instead. The
 *     seed then shipped 16 rows that were neither global nor scoped, so sanitary's `bowl_shape`
 *     and `flush_type` were offered on tiles products and `wood_type` / `weave` / `upholstery`
 *     on lighting. Nine of those 16 are `role='identity'` — the field set Phase 5/6 keys
 *     warehouse stock on, so a wrong scope does not stay cosmetic.
 *
 *  3. **A drifting category vocabulary.** The 10 categories are a closed set in the DB. The TS
 *     `UploadCategory` union and `CATEGORY_DISPLAY_REGISTRY` restate them; a category added on
 *     one side only silently renders nothing (or resolves to nothing) on the other.
 *
 * SCOPE. This is the TypeScript half. The DB half — "no row is left neither global nor scoped" —
 * cannot be seen from here and is watched instead by the `ops.registry_field_unreachable` probe,
 * which is a migration, not a file. A green run here says nothing about that.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/** Strip comments so prose describing the old shape never counts as the old shape. */
const blankComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

/**
 * The live category vocabulary. Verify with:
 *   select distinct unnest(applies_to_categories) from material_metadata_fields order by 1;
 */
const DB_CATEGORIES = [
  'decor', 'furniture', 'general_materials', 'heating', 'kitchen',
  'lighting', 'paint_wall_decor', 'sanitary', 'tiles', 'wood',
];

const REGISTRY_TS = 'src/lib/categoryFieldRegistry.ts';
const SERVICE_TS = 'src/services/dealerProductsService.ts';

describe('category vocabulary ↔ the DB registry', () => {
  it('UploadCategory names exactly the 10 categories the registry uses', () => {
    const src = read(REGISTRY_TS);
    const union = src.match(/export type UploadCategory\s*=([\s\S]*?);/);
    expect(union, `no UploadCategory union found in ${REGISTRY_TS}`).toBeTruthy();
    const declared = [...union![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(declared).toEqual([...DB_CATEGORIES].sort());
  });

  it('CATEGORY_DISPLAY_REGISTRY has an entry for every category and no extras', () => {
    const src = read(REGISTRY_TS);
    const body = src.slice(src.indexOf('export const CATEGORY_DISPLAY_REGISTRY'));
    const present = DB_CATEGORIES.filter((c) => new RegExp(`^\\s{2}${c}:\\s*\\{`, 'm').test(body));
    expect(
      present.sort(),
      'a category in the DB with no display config renders an empty Details tab',
    ).toEqual([...DB_CATEGORIES].sort());
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
});
