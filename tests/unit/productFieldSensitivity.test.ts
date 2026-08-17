/**
 * The product detail surface hides internal fields, and cannot be made to stop quietly (#368).
 *
 * THE BUG. `ProductDetailModal`'s permission model gates SECTIONS — stock, cost, listings,
 * movements each ask whether this viewer may see that section, on both axes (ownership AND
 * capability). The Details tab is not a section. It is a walker: it collects
 * `attributes` + `metadata` + `properties` + `specifications`, descends into nested groups, and
 * renders every remaining key it finds. So the gating was per-section while the renderer was
 * per-key, and anything sensitive landing in jsonb rather than in a dedicated column went
 * straight past it — to whoever could see the product, including a project client.
 *
 * That is not hypothetical here: `attributes_raw` is where supplier XML lands, `attributes` is
 * where AI extraction writes, and extraction is explicitly allowed to invent fields the registry
 * has never seen. A feed carrying `cost`, `wholesale`, `buy_price` or `margin` renders.
 *
 * WHY THESE TESTS AND NOT A TYPE. A withheld field and a shown field are the same string; a
 * filter that has quietly stopped filtering produces a page that looks exactly right. The
 * failure is invisible by construction, so it has to be asserted.
 *
 * SCOPE. The server half — `is_internal_product_field`, `redact_internal_product_fields` and the
 * allowlisted projection in `get_product_detail` — lives in `pg_proc` and cannot be seen from
 * here (this project's SQL is applied through the Supabase MCP and never committed as a file).
 * A green run here says nothing about that half.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The sensitivity decision itself is pure — the client is only how the registry arrives.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  type FieldRegistrySnapshot,
  type RegistryField,
  isInternalFieldKey,
  labelForField,
  sectionsForCategory,
} from '../../src/services/fieldRegistryService';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const blankComments = (src: string) =>
  sharedBlankComments(src);

const MODAL = 'src/components/features/products/ProductDetailModal.tsx';
const REGISTRY_SERVICE = 'src/services/fieldRegistryService.ts';

/** The pattern as `internal_product_field_pattern()` returns it. */
const DB_PATTERN =
  '(^|_)(cost|costs|wholesale|margin|margins|markup|profit|landed|procurement)(_|$)'
  + '|(^|_)(buy|buying|purchase|trade|dealer|net|supplier|invoice|acquisition|our|own)_(price|prices|cost|costs|rate)(_|$)';

function field(partial: Partial<RegistryField> & { name: string }): RegistryField {
  return {
    label: partial.name,
    section: 'other',
    categories: null,
    sortOrder: 0,
    sensitivity: 'public',
    labelByCategory: null,
    descriptionByCategory: null,
    description: null,
    ...partial,
  };
}

function snapshot(fields: RegistryField[], pattern: RegExp | null = new RegExp(DB_PATTERN)): FieldRegistrySnapshot {
  return { fields, byName: new Map(fields.map((f) => [f.name, f])), internalPattern: pattern };
}

describe('field sensitivity — the registry answers, the pattern is the floor', () => {
  const snap = snapshot([
    field({ name: 'finish' }),
    field({ name: 'price_range' }),                              // reads like money, is not
    field({ name: 'landed_cost_note', sensitivity: 'internal' }), // registry says internal
  ]);

  it('a registry row decides for a key the registry knows', () => {
    expect(isInternalFieldKey(snap, 'finish')).toBe(false);
    expect(isInternalFieldKey(snap, 'landed_cost_note')).toBe(true);
  });

  it('an explicitly public registry row overrides the pattern', () => {
    // Without this escape hatch a legitimately public field whose name reads like money would
    // be unrenderable and there would be no way to say so.
    expect(new RegExp(DB_PATTERN).test('price_range')).toBe(false);
    expect(isInternalFieldKey(snap, 'price_range')).toBe(false);
  });

  it('the floor catches the keys a supplier feed actually carries', () => {
    // The four the audit named, plus the spellings around them.
    for (const key of [
      'cost', 'costs', 'wholesale', 'wholesale_price', 'buy_price', 'buying_price',
      'purchase_price', 'purchase_cost', 'margin', 'margin_pct', 'markup', 'markup_percent',
      'landed_cost', 'supplier_cost', 'trade_price', 'dealer_rate', 'net_price', 'our_price',
      'own_cost', 'invoice_price', 'profit', 'procurement_cost',
    ]) {
      expect(isInternalFieldKey(snap, key), `${key} must be withheld`).toBe(true);
    }
  });

  it('the floor does not catch ordinary specification keys', () => {
    // `cost` as a bare substring would hit half of these; the pattern is anchored on `_`
    // boundaries for exactly that reason.
    for (const key of [
      'acoustic_rating_db', 'composition', 'frost_resistance', 'coverage_per_litre_m2',
      'compressive_strength', 'costa_marble', 'net_weight_kg', 'colors', 'finish_sheen',
      'water_absorption_pct', 'pei_rating', 'wattage_w',
    ]) {
      expect(isInternalFieldKey(snap, key), `${key} must render`).toBe(false);
    }
  });

  it('an unknown key with no pattern is UNRESOLVED, not public', () => {
    // The failure this shape is built to survive: the registry loaded, the pattern did not.
    // Answering `false` there turns the filter off in exactly the situation nobody notices.
    const noPattern = snapshot([field({ name: 'finish' })], null);
    expect(isInternalFieldKey(noPattern, 'finish')).toBe(false);
    expect(isInternalFieldKey(noPattern, 'some_key_nobody_registered')).toBeNull();
  });
});

describe('the modal withholds anything it cannot vouch for', () => {
  const src = blankComments(read(MODAL));

  it('the walker filters both the flat keys and the keys inside nested groups', () => {
    // Two entry points, and a fix that reached only one of them would leave the nested path —
    // where `commercial: {...}` and the extractor's invented groups live — wide open.
    const collect = src.slice(src.indexOf('const collectFields ='));
    expect(collect.slice(0, 700), 'collectFields must withhold before it formats a value')
      .toMatch(/withholdKey\(ik\)/);

    const walk = src.slice(src.indexOf('Object.entries(allData || {}).forEach'));
    expect(walk.slice(0, 400), 'the top-level walk must withhold too').toMatch(/withholdKey\(k\)/);
  });

  it('an unresolved verdict withholds', () => {
    // `verdict !== false` and not `verdict === true`: null means "no answer yet", and while
    // the registry is loading the walker must show nothing rather than everything.
    expect(src).toMatch(/verdict\s*!==\s*false/);
    expect(src, 'a true-test would render every key until the registry resolved')
      .not.toMatch(/return\s+verdict\s*===\s*true/);
  });

  it('the withhold decision is keyed off the cost capability, not a fresh guess', () => {
    expect(src).toMatch(/const canSeeInternalFields = canSeeCost/);
  });
});

describe('one source for the pattern', () => {
  it('no copy of the denylist regex is written into TypeScript', () => {
    // The regex is fetched from `internal_product_field_pattern()`. A second copy pasted into
    // source is two engines evaluating what is supposed to be one string, and the drift shows
    // up as the server redacting a field the client has already rendered.
    const service = blankComments(read(REGISTRY_SERVICE));
    expect(service, 'the pattern must be fetched, not declared')
      .not.toMatch(/wholesale\|margin|margin\|markup/);
    expect(service).toContain('internal_product_field_pattern');
  });
});

describe('the stacked product is fetched through the sanitized RPC', () => {
  const src = blankComments(read(MODAL));

  it('nothing in the modal selects * from products', () => {
    // #368 PD-2. `products` carries cost, cost_source, markup_percent, supplier_company_id and
    // the raw supplier feed; the table's RLS grants plain workspace membership.
    expect(/\.from\(\s*['"]products['"]\s*\)[\s\S]{0,120}?\.select\(\s*['"]\*['"]\s*\)/.test(src),
      'use productDetailService.fetch — get_product_detail returns an allowlisted projection')
      .toBe(false);
  });

  it('the fetch handles its error instead of discarding it', () => {
    const block = src.slice(src.indexOf('productDetailService.fetch'));
    expect(block.slice(0, 900), 'a failed fetch must say so, not open an empty modal')
      .toMatch(/\.catch\(/);
  });
});

describe('per-category labels come from the registry', () => {
  it('a field named differently per category renders under the right name', () => {
    // `body_material` is "Material" for kitchen and lighting, "Body Material" elsewhere. This
    // is the case the old hand-written registry could express and the DB could not, which is
    // why the labels stayed in the client for so long.
    const f = field({
      name: 'body_material',
      label: 'Material',
      labelByCategory: { kitchen: 'Body Material', lighting: 'Body Material' },
    });
    expect(labelForField(f, 'kitchen')).toBe('Body Material');
    expect(labelForField(f, 'sanitary')).toBe('Material');
  });

  it('sections carry only the fields scoped to the category, is_global aside', () => {
    const snap = snapshot([
      field({ name: 'pei_rating', section: 'performance', categories: ['tiles'] }),
      field({ name: 'janka_hardness', section: 'performance', categories: ['wood'] }),
      field({ name: 'brand', section: 'commercial', categories: null }),
      // Neither global nor scoped: a data bug, and it must reach nothing rather than everything.
      field({ name: 'orphan', section: 'other', categories: [] }),
    ]);
    const tiles = sectionsForCategory(snap, 'tiles');
    const keys = tiles.flatMap((s) => s.fields.map((f) => f.key));
    expect(keys).toContain('pei_rating');
    expect(keys).toContain('brand');
    expect(keys).not.toContain('janka_hardness');
    expect(keys, 'an unscoped, non-global row applies to NOTHING').not.toContain('orphan');
  });
});
