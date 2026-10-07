/** Product in Place (#474): the cut-out, the hit-testing, and the snippet the merchant pastes. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import {
  cutoutStudioBackground, handlePoint, hitItem, topItemAt, type PlacedItem,
} from '@/embed/placeGeometry';
import { widgetSnippet, widgetsForKey } from '@/components/core/Profile/embed/embedWidgets';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

/** A w×h RGBA image filled with `bg`, with an opaque `fg` rectangle. */
function image(w: number, h: number, bg: number[], fg: number[], rect: [number, number, number, number]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const x = p % w;
    const y = Math.floor(p / w);
    const inside = x >= rect[0] && x < rect[0] + rect[2] && y >= rect[1] && y < rect[1] + rect[3];
    data.set([...(inside ? fg : bg), 255], p * 4);
  }
  return data;
}

describe('cutting a product out of a studio shot', () => {
  it('clears a flat white background and trims to the product', () => {
    const data = image(40, 30, [250, 250, 250], [120, 60, 30], [10, 8, 20, 14]);
    const r = cutoutStudioBackground(data, 40, 30);
    expect(r.cut).toBe(true);
    expect(r.box).toEqual({ x: 10, y: 8, w: 20, h: 14 });
    expect(data[3]).toBe(0);
    expect(data[(15 * 40 + 20) * 4 + 3]).toBe(255);
  });

  it('keeps a lifestyle photo whole rather than carving a background out of it', () => {
    const w = 30;
    const h = 30;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let p = 0; p < w * h; p++) data.set([(p * 37) % 256, (p * 91) % 256, (p * 13) % 256, 255], p * 4);
    const before = data.slice();
    const r = cutoutStudioBackground(data, w, h);
    expect(r.cut).toBe(false);
    expect(data).toEqual(before);
  });

  it('refuses when the product is the background colour, instead of erasing the picture', () => {
    const data = image(20, 20, [250, 250, 250], [248, 248, 248], [5, 5, 10, 10]);
    const before = data.slice();
    expect(cutoutStudioBackground(data, 20, 20).cut).toBe(false);
    expect(data).toEqual(before);
  });
});

describe('picking an item on the photo', () => {
  const item = (uid: number, cx: number, rot = 0): PlacedItem => ({
    uid, productId: `p${uid}`, cx, cy: 100, w: 100, aspect: 2, rot, flip: false,
  });

  it('hits inside the item and misses outside it', () => {
    expect(hitItem(item(1, 100), 140, 120)).toBe(true);
    expect(hitItem(item(1, 100), 160, 100)).toBe(false);
  });

  it('respects rotation — a quarter turn swaps width and height', () => {
    const turned = item(1, 100, Math.PI / 2);
    expect(hitItem(turned, 100, 145)).toBe(true);
    expect(hitItem(turned, 140, 100)).toBe(false);
  });

  it('returns the topmost of two overlapping items', () => {
    expect(topItemAt([item(1, 100), item(2, 120)], 110, 100)?.uid).toBe(2);
  });

  it('puts the resize handle on the bottom-right corner', () => {
    expect(handlePoint(item(1, 100))).toEqual({ x: 150, y: 125 });
  });
});

describe('the widget the merchant pastes', () => {
  it('is offered for any catalogue key that can serve products', () => {
    expect(widgetsForKey({ key_kind: 'catalog', scope_type: 'all', tools_enabled: false })).toContain('place');
    expect(widgetsForKey({ key_kind: 'catalog', scope_type: 'blueprints', tools_enabled: false })).not.toContain('place');
    expect(widgetsForKey({ key_kind: 'tools', scope_type: 'all', tools_enabled: true })).not.toContain('place');
  });

  it('carries the pre-picked products, or none to offer the whole published catalogue', () => {
    expect(widgetSnippet('https://a', 'k', 'place', { productIds: ['p1', 'p2'] }))
      .toContain('<materialkai-place api-key="k" product-ids="p1,p2">');
    expect(widgetSnippet('https://a', 'k', 'place')).toContain('<materialkai-place api-key="k">');
  });

  it('ships in the one bundle the snippet loads', () => {
    expect(read('src/embed/materialkai-product.ts')).toContain("import './materialkai-place'");
  });

  it('never uploads the visitor photo: no request body carries it', () => {
    const widget = read('src/embed/materialkai-place.ts');
    expect(widget).not.toMatch(/toDataURL|FormData/);
    expect(widget).toMatch(/createObjectURL\(file\)/);
  });

  it('the endpoint narrows the listing to the picked set INSIDE the key scope', () => {
    const api = read('supabase/functions/products-3d-api/index.ts');
    expect(api).toMatch(/intersectIdFilters\(\s*await scopeRestriction\(supabase, auth\.ctx\), modelledIds, matchedIds, pickedIds,/);
  });
});
