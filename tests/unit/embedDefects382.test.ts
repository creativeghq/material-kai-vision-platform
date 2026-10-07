/**
 * The four defects #382 catalogued, each pinned so it cannot come back (#382).
 *
 * All four share a shape: nothing raised, nothing failed a check, and the surface was simply worse
 * than it looked. That is the only reason they survived long enough to be written down.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { widgetsForKey, widgetSnippet } from '@/components/core/Profile/embed/embedWidgets';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

const API = read('supabase/functions/products-3d-api/index.ts');

describe('1. the room planner receives the measurements it asks for', () => {
  const listBlock = API.slice(API.indexOf("if (action === 'list')"), API.indexOf("if (action === 'product')"));

  it('the listing selects the model dimensions', () => {
    // Placing every product at the 0.6 m placeholder — however carefully its GLB was measured —
    // answers the one question the planner exists for, wrongly, for every item.
    expect(listBlock).toContain('width_m, height_m, depth_m');
  });

  it('the listing returns them per product', () => {
    for (const k of ['width_m:', 'height_m:', 'depth_m:']) expect(listBlock).toContain(k);
  });

  it('the planner reads images[0], not a field the API never sends', () => {
    const planner = read('src/pages/EmbedPlannerPage.tsx');
    // `p.image` was undefined for every row, so the thumbnail map was always empty.
    expect(planner).toMatch(/Array\.isArray\(p\.images\)/);
  });
});

describe('2. the builder opens on the shelf, not an empty box', () => {
  const builder = read('src/embed/materialkai-builder.ts');

  it('actually calls the catalogue action it had all along', () => {
    // Matched without the closing paren: the call carries a page size, and it must keep going
    // through `url()` so the embed key cannot be dropped by a later refactor.
    expect(builder).toContain("this.url('list'");
  });

  it('renders the products it fetched', () => {
    // A loaded-but-unrendered shelf is the same empty box with extra network traffic.
    expect(builder).toContain("frame.dataset.mode = 'shelf'");
    expect(builder).toContain('shelfItem');
  });

  it('a shelf that fails to load does not break the wizard', () => {
    const fn = builder.slice(builder.indexOf('private async loadShelf'));
    expect(fn.slice(0, 900)).toContain('catch');
  });
});

describe('3. no vocabulary means no wizard', () => {
  const builder = read('src/embed/materialkai-builder.ts');

  it('short-circuits instead of rendering a form with no fields', () => {
    // `get_embed_spec_options` builds from product ATTRIBUTES, so a workspace that has filled none
    // in rendered a heading, a hint, and nothing — seen only by a brand-new catalogue, which is
    // the audience least able to forgive it.
    const build = builder.slice(builder.indexOf('private renderBuild'));
    expect(build.slice(0, 1500)).toMatch(/this\.facets\.length === 0/);
    expect(build.slice(0, 1500)).toContain('quoteOnlyRow');
  });

  it('offers the way out rather than a dead end', () => {
    expect(builder).toContain("go.textContent = 'Request a quote'");
  });
});

describe('4. scene settings reach the embed', () => {
  it('the product action resolves them, passing the KEY so a per-key override means something', () => {
    expect(API).toContain('resolve_scene_settings');
    expect(API).toMatch(/p_embed_key_id: auth\.ctx\.keyId/);
    expect(API).toContain('scene: scene ?? null');
  });

  it('the widget lights from the tenant preset rather than hardcoded numbers', () => {
    const widget = read('src/embed/materialkai-product.ts');
    expect(widget).toContain('LIGHTING_PRESETS');
    expect(widget).toContain('rig.ambientIntensity');
    expect(widget).toContain('rig.sunIntensity');
    // Exposure and background are not part of a preset and were the other half of the setting.
    expect(widget).toContain('toneMappingExposure');
    expect(widget).toContain('show_background');
  });

  it('does NOT fetch the preset HDRI, which a merchant CSP may block', () => {
    const widget = read('src/embed/materialkai-product.ts');
    // A lit product must not depend on the host page allowing our origin for assets. The generated
    // RoomEnvironment stays; the preset drives the sun and the ambient.
    expect(widget).toContain('RoomEnvironment');
    expect(widget).not.toMatch(/rig\.hdri|RGBELoader|\.hdr['"`]/);
  });
});

/**
 * 5. The copyable snippet has to name a tag the KEY can actually serve.
 *
 * Same shape as the four above, one layer out: #382 shipped `<materialkai-configurator>` and
 * `<materialkai-assistant>`, and the one place the platform hands a merchant something to paste
 * kept emitting the builder tag for every key. A `tools` key serves no catalogue and a
 * blueprint-scoped key sees no products, so two of the three kinds copied a snippet that could
 * only render nothing — on their own site, with nothing here saying why.
 */
describe('5. the embed snippet matches the key it was copied from', () => {
  const base = { tools_enabled: false };

  it('a tools key serves the calculators and nothing else', () => {
    expect(widgetsForKey({ ...base, key_kind: 'tools', scope_type: 'all' })).toEqual(['assistant']);
  });

  it('a blueprint-scoped key serves the configurator and no product widget', () => {
    expect(widgetsForKey({ ...base, key_kind: 'catalog', scope_type: 'blueprints' })).toEqual(['configurator']);
  });

  it('a product-scoped key is never offered the configurator', () => {
    expect(widgetsForKey({ ...base, key_kind: 'catalog', scope_type: 'products' })).not.toContain('configurator');
  });

  it('the snippet names the tag and the id the visitor needs', () => {
    const code = widgetSnippet('https://app.example', 'mk_embed_x', 'configurator', { blueprintId: 'bp-1' });
    expect(code).toContain('<materialkai-configurator api-key="mk_embed_x" blueprint="bp-1">');
    expect(code).toContain('src="https://app.example/embed/materialkai-product.js"');
  });

  it('the visualizer snippet carries a pinned room and product', () => {
    const code = widgetSnippet('https://a', 'k', 'visualizer', { sceneId: 's1', productId: 'p1' });
    expect(code).toContain('<materialkai-visualizer api-key="k" product-id="p1" scene-id="s1">');
  });

  it('a required id nobody picked stays a visible placeholder, never an empty attribute', () => {
    expect(widgetSnippet('https://a', 'k', 'product')).toContain('product-id="PRODUCT_ID"');
  });

  it('the card offers code through the widget flow, not a hand-written tag per key', () => {
    const card = read('src/components/core/Profile/EmbedKeysCard.tsx');
    expect(card).toContain('EmbedWidgetDialog');
    expect(card).not.toMatch(/<materialkai-/);
  });
});
