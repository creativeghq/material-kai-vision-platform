/** Line identity — "which one is this line?" (#347 phase 5). */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { projectIdentity, rankIdentityOptions } from '@/services/lineIdentityRules';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const blankComments = (src: string) =>
  sharedBlankComments(src);

const ORDERS_SERVICE = 'src/modules/finance/services/ordersService.ts';
const PICKER = 'src/components/business/lines/LineIdentityPicker.tsx';
const ADD_PRODUCTS = 'src/modules/quotes/components/AddProductsSheet.tsx';

const IDENTITY_COLUMNS = ['selected_attributes', 'selected_size', 'selected_color'];

describe('the delete-and-reinsert paths carry the line identity', () => {
  // Both writers rebuild every row from scratch. A column absent from either is not "not
  // updated" — it is erased.
  const src = blankComments(read(ORDERS_SERVICE));

  it('updateItems re-inserts all three identity columns', () => {
    const insert = src.slice(src.indexOf('async updateItems'));
    const body = insert.slice(0, insert.indexOf('recompute_order_totals'));
    for (const col of IDENTITY_COLUMNS) {
      expect(body, `updateItems drops ${col} — an unrelated edit would erase it`).toContain(col);
    }
  });

  it('create() persists all three identity columns', () => {
    const start = src.indexOf('const itemRows = lines.map');
    expect(start, 'create() itemRows mapping not found — this guard is stale').toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('.insert(itemRows)'));
    for (const col of IDENTITY_COLUMNS) {
      expect(body, `create() drops ${col}, so only quote-generated orders would keep it`).toContain(col);
    }
  });

  it('NewOrderItem declares them, so a caller cannot silently omit them', () => {
    const iface = src.slice(src.indexOf('export interface NewOrderItem'));
    const body = iface.slice(0, iface.indexOf('}'));
    for (const col of IDENTITY_COLUMNS) {
      expect(body).toContain(col);
    }
  });
});

describe('the picker reads the registry rather than restating it', () => {
  it('names no facet keys of its own', () => {
    // A hardcoded ['size','color'] pair in the picker is the bug this phase removes: the
    // registry classifies 22 identity fields for tiles alone.
    const src = blankComments(read(PICKER));
    const HARDCODED = /\[\s*'(?:size|color|colour|finish|material)'\s*,/i;
    expect(src, 'derive the fields from get_line_identity_options, do not list them').not.toMatch(HARDCODED);
  });

  it('gets its options from the SQL resolver', () => {
    expect(blankComments(read('src/services/lineIdentityService.ts')))
      .toContain("rpc('get_line_identity_options'");
  });

  it('the quote line no longer re-keys the map to {size, color}', () => {
    // The exact shape that shipped before: selected_attributes rebuilt from the two locals
    // under invented key names.
    const src = blankComments(read(ADD_PRODUCTS));
    expect(src).not.toMatch(/selected_attributes:\s*\{[\s\S]{0,200}?\bsize:\s*product\.selectedSize/);
  });
});

describe('size and colour are projected from the map, never written beside it', () => {
  it('picks the registry key names', () => {
    expect(projectIdentity({ available_sizes: '600x600', finish: 'matte' }))
      .toEqual({ selected_size: '600x600', selected_color: null });
    expect(projectIdentity({ color: 'beige' }))
      .toEqual({ selected_size: null, selected_color: 'beige' });
  });

  it('treats blank and absent identically — a whitespace value is not a choice', () => {
    expect(projectIdentity({ color: '   ', available_sizes: '' }))
      .toEqual({ selected_size: null, selected_color: null });
  });

  it('prefers the primary key when a product carries several colour-ish fields', () => {
    // Six colour-ish fields are classified identity for tiles today (phase 4 has not run).
    // Whichever wins, it must be deterministic — not "whichever key enumerated first".
    const attrs = { available_colors: 'beige', color: 'sand', primary_color: 'ivory' };
    expect(projectIdentity(attrs).selected_color).toBe('sand');
  });

  it('ranks stocked values first without dropping any', () => {
    const ranked = rankIdentityOptions({
      field_name: 'available_sizes', label: 'Sizes', field_type: 'text',
      options: ['300x300', '600x600', '900x900'], stocked: ['600x600'],
    });
    expect(ranked[0]).toBe('600x600');
    expect([...ranked].sort()).toEqual(['300x300', '600x600', '900x900']);
  });

  it('leaves order alone when nothing is stocked', () => {
    const options = ['a', 'b', 'c'];
    expect(rankIdentityOptions({
      field_name: 'finish', label: 'Finish', field_type: 'text', options, stocked: [],
    })).toEqual(options);
  });
});

describe('price upserts name the variant in their conflict target', () => {
  /**
   * `product_prices` is unique on (workspace_id, product_id, variant_key) NULLS NOT DISTINCT
   * since #347 phase 7.1. An upsert that still says `onConflict: 'workspace_id,product_id'`
   * does not merge — it raises "there is no unique or exclusion constraint matching the ON
   * CONFLICT specification" at the moment someone saves a price.
   */
  const UPSERT_SITES = [
    'src/modules/finance/services/servicesService.ts',
    'src/services/catalogGrantsService.ts',
    'src/services/marketplacePricingService.ts',
  ];

  for (const file of UPSERT_SITES) {
    it(`${file.split('/').pop()} includes variant_key`, () => {
      const src = blankComments(read(file));
      if (!src.includes("from('product_prices')")) return; // moved on; nothing to guard here
      const stale = /onConflict:\s*'workspace_id,\s*product_id'/;
      expect(src, 'product_prices is unique on (workspace_id, product_id, variant_key)').not.toMatch(stale);
    });
  }
});
