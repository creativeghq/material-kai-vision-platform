/** Product in Place (#474): the cut-out, the hit-testing, and the snippet the merchant pastes. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import {
  cutoutStudioBackground, handlePoint, hitItem, objectSizeM, topItemAt, widthsPerMetre, type PlacedItem, type SpaceReading,
} from '@/embed/placeGeometry';
import { validatePlaceSpace } from '../../supabase/functions/_shared/place-space';
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

  it('sends the photo only from the explicit Place it for me action, and never stores it', () => {
    const widget = read('src/embed/materialkai-place.ts');
    expect(widget).not.toMatch(/FormData/);
    expect(widget.match(/toDataURL\(/g)?.length).toBe(2);
    const realism = widget.slice(widget.indexOf('private async makeRealistic('), widget.indexOf('private async analyseSpace('));
    const analyse = widget.slice(widget.indexOf('private async analyseSpace('), widget.indexOf('private animateReveal('));
    expect(realism).toContain('toDataURL(');
    expect(analyse).toContain('toDataURL(');
    expect(widget.match(/this\.analyseSpace\(\)/g)?.length).toBe(1);
    expect(widget.match(/this\.makeRealistic\(\)/g)?.length).toBe(1);
    expect(widget).toMatch(/magic\.addEventListener\('click', \(\) => void this\.analyseSpace\(\)\)/);
    expect(widget).toMatch(/magic\.addEventListener\('click', \(\) => void this\.makeRealistic\(\)\)/);
    expect(widget).toContain('Make it realistic sends this picture once');
    const api = read('supabase/functions/products-3d-api/index.ts');
    const action = api.slice(api.indexOf("if (action === 'analyze_space')"), api.indexOf("if (action === 'scenes')"));
    expect(action).not.toMatch(/storage|\.upload\(|\.insert\(/);
  });

  it('the endpoint narrows the listing to the picked set INSIDE the key scope', () => {
    const api = read('supabase/functions/products-3d-api/index.ts');
    expect(api).toMatch(/intersectIdFilters\(\s*await scopeRestriction\(supabase, auth\.ctx\), modelledIds, matchedIds, pickedIds,/);
  });
});

describe('standing a piece on the floor at real size', () => {
  const space: SpaceReading = {
    horizon_y: 0.4, scale_row_y: 0.9, scale_span_m: 4, floor_polygon: [], spots: [], confidence: 'medium', scale_reference: '',
  };

  it('at the scale row, the image width is the stated span', () => {
    expect(widthsPerMetre(space, 0.9)).toBeCloseTo(0.25);
  });

  it('halfway to the horizon a piece is drawn half as big — perspective, not a constant', () => {
    expect(widthsPerMetre(space, 0.65)).toBeCloseTo(0.125);
  });

  it('nothing stands at or above the horizon', () => {
    expect(widthsPerMetre(space, 0.4)).toBe(0);
    expect(widthsPerMetre(space, 0.2)).toBe(0);
  });
});

describe('a product’s real size from its spec', () => {
  it('reads width and height, centimetres by default', () => {
    expect(objectSizeM({ attributes: { width: 82, height: 75 } })).toEqual({ widthM: 0.82, heightM: 0.75 });
  });

  it('honours a stated unit and a "W x D x H" string', () => {
    expect(objectSizeM({ metadata: { dimensions: '820 x 900 x 750 mm' } })).toEqual({ widthM: 0.82, heightM: 0.75 });
    expect(objectSizeM({ attributes: { width: '1.6 m' } })).toEqual({ widthM: 1.6, heightM: null });
  });

  it('refuses sizes no piece of furniture has, instead of drawing a 60-metre sofa', () => {
    expect(objectSizeM({ attributes: { width: 6000 } })).toBeNull();
    expect(objectSizeM({})).toBeNull();
  });
});

describe('the room reading Claude returns is checked before anything is placed with it', () => {
  const good = {
    floor_visible: true, horizon_y: 0.42, scale_row_y: 0.9, scale_span_m: 3.8, scale_reference: 'door',
    floor_polygon: [{ x: 0, y: 0.6 }, { x: 1, y: 0.6 }, { x: 1, y: 1 }, { x: 0, y: 1.2 }],
    spots: [{ x: 0.5, y: 0.8 }, { x: 0.5, y: 0.3 }], confidence: 'high',
  };

  it('accepts a sane reading, clamping points into the photo and dropping spots above the horizon', () => {
    const space = validatePlaceSpace(good)!;
    expect(space.floor_polygon[3]).toEqual({ x: 0, y: 1 });
    expect(space.spots).toEqual([{ x: 0.5, y: 0.8 }]);
  });

  it('refuses a photo with no floor, a floor that recedes towards the camera, and an impossible span', () => {
    expect(validatePlaceSpace({ ...good, floor_visible: false })).toBeNull();
    expect(validatePlaceSpace({ ...good, horizon_y: 0.92 })).toBeNull();
    expect(validatePlaceSpace({ ...good, scale_span_m: 120 })).toBeNull();
    expect(validatePlaceSpace('{"floor_visible":true}')).toBeNull();
  });

  it('the endpoint constrains the reply with a schema and checks the key, the budget and refusals first', () => {
    const api = read('supabase/functions/products-3d-api/index.ts');
    const action = api.slice(api.indexOf("if (action === 'analyze_space')"), api.indexOf("if (action === 'scenes')"));
    expect(action).toMatch(/format: \{ type: 'json_schema', schema: PLACE_SPACE_SCHEMA \}/);
    expect(action.indexOf('paid_tools_enabled')).toBeLessThan(action.indexOf('callClaudeMessages'));
    expect(action.indexOf('embed_spend_has_headroom')).toBeLessThan(action.indexOf('callClaudeMessages'));
    expect(action).toMatch(/stop_reason === 'refusal'/);
    expect(action).toMatch(/loadPrompt\(supabase, 'embed', 'embed_place_space'\)/);
  });
});

describe('make it realistic keeps nothing of the visitor\u2019s home', () => {
  const api = read('supabase/functions/products-3d-api/index.ts');
  const action = api.slice(api.indexOf("if (action === 'realism')"), api.indexOf("if (action === 'analyze_space')"));

  it('checks the key allows generation and has quota before any model work', () => {
    const generator = action.indexOf('generate-interior-gemini');
    expect(action.indexOf('allow_generation')).toBeLessThan(generator);
    expect(action.indexOf("rpc('consume_embed_generation_quota'")).toBeLessThan(generator);
    expect(action).toMatch(/loadPrompt\(supabase, 'embed', 'embed_place_realism'\)/);
  });

  it('fetches only our own storage, and always removes both images and the history row', () => {
    expect(action).toMatch(/if \(!url\.startsWith\(publicPrefix\)\) return/);
    const cleanup = action.slice(action.indexOf('} finally {'));
    expect(cleanup).toMatch(/\.remove\(\[inputPath/);
    expect(cleanup).toMatch(/from\('generation_3d'\)\.delete\(\)/);
  });
});

describe('a shop’s products are read live from the shop, never copied to us', () => {
  it('the snippet asks for the shop’s own products instead of a picked catalogue set', () => {
    const code = widgetSnippet('https://a', 'k', 'place', { fromStore: true, productIds: ['p1'] });
    expect(code).toContain('catalog="store"');
    expect(code).not.toContain('product-ids');
  });

  it('the widget reads only the shop’s own public storefront endpoints', () => {
    const widget = read('src/embed/materialkai-place.ts');
    const loader = widget.slice(widget.indexOf('private async loadStoreProducts('), widget.indexOf('private async loadSizes('));
    expect(loader).toContain("fetch('/products.json?limit=60')");
    expect(loader).toContain("fetch('/wp-json/wc/store/v1/products?per_page=60')");
    expect(loader).not.toMatch(/apiBase/);
  });

  it('nothing in the app calls the retired catalogue import', () => {
    for (const f of ['src/services/embedKeysService.ts', 'src/services/commerce/storeConnectionsService.ts',
      'src/components/core/Profile/embed/EmbedWidgetDialog.tsx']) {
      expect(read(f)).not.toMatch(/store-products-sync|product-from-url/);
    }
  });
});
