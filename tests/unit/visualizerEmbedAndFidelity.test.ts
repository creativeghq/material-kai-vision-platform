/**
 * The photoreal pass is MEASURED, and the embed re-implements nothing (#447).
 *
 * Both halves guard the same thing: a confident wrong answer. A model that quietly recolours the
 * tile, or a widget with its own copy of the maths, produces a number or a picture the merchant
 * would not stand behind — and both look perfect on screen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  compareSurfaceFidelity, meanColorInQuad, deltaE, rgbToLab, PHOTOREAL_DELTA_E_LIMIT,
  raster, pickProductSpec, type Pt, type Raster,
} from '../../src/lib/surfaceRenderer';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

/** A solid image, so a mean colour has an obvious right answer. */
function solid(w: number, h: number, rgb: [number, number, number]): Raster {
  const r = raster(w, h);
  for (let i = 0; i < w * h; i++) {
    r.data[i * 4] = rgb[0];
    r.data[i * 4 + 1] = rgb[1];
    r.data[i * 4 + 2] = rgb[2];
    r.data[i * 4 + 3] = 255;
  }
  return r;
}

const FULL: [Pt, Pt, Pt, Pt] = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.1, y: 0.9 }];

describe('photoreal fidelity', () => {
  it('reads the surface colour off a normalised quad, whatever the image size', () => {
    const small = meanColorInQuad(solid(40, 30, [200, 40, 40]), FULL);
    const large = meanColorInQuad(solid(400, 300, [200, 40, 40]), FULL);
    expect(small![0]).toBeCloseTo(200, 0);
    expect(large![0]).toBeCloseTo(200, 0);
  });

  it('an unchanged surface HELDS, and a recoloured one is reported as shifted', () => {
    const ours = solid(80, 60, [200, 40, 40]);
    const held = compareSurfaceFidelity(ours, solid(120, 90, [201, 41, 41]), FULL);
    expect(held.verdict).toBe('held');
    expect(held.deltaE).toBeLessThan(PHOTOREAL_DELTA_E_LIMIT);

    // A terracotta tile coming back as a grey one: the exact failure the check exists for.
    const shifted = compareSurfaceFidelity(ours, solid(120, 90, [130, 130, 130]), FULL);
    expect(shifted.verdict).toBe('shifted');
    expect(shifted.deltaE!).toBeGreaterThan(PHOTOREAL_DELTA_E_LIMIT);
  });

  it('a surface it cannot sample is UNMEASURED, never held', () => {
    const degenerate: [Pt, Pt, Pt, Pt] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }];
    const v = compareSurfaceFidelity(solid(40, 30, [10, 10, 10]), solid(40, 30, [240, 240, 240]), degenerate);
    expect(v.verdict).toBe('unmeasured');
    expect(v.deltaE).toBeNull();
  });

  it('compares perceptually — two greys a channel apart are not the same distance as two hues', () => {
    expect(rgbToLab([255, 255, 255])[0]).toBeCloseTo(100, 0);
    expect(rgbToLab([0, 0, 0])[0]).toBeCloseTo(0, 0);
    // Equal RGB euclidean distance, very different perceptually.
    const greyish = deltaE([120, 120, 120], [140, 140, 140]);
    const hue = deltaE([120, 120, 120], [120, 140, 100]);
    expect(Math.abs(greyish - hue)).toBeGreaterThan(1);
  });

  it('the UI never reports an unmeasured check as a clean one', () => {
    const src = stripComments(read('src/components/features/visualizer/SurfaceVisualizer.tsx'));
    expect(src).toContain("photoreal.fidelity.verdict === 'shifted'");
    expect(src).toContain("photoreal.fidelity.verdict === 'unmeasured'");
    // The deterministic render must be named as the accurate one when they disagree.
    expect(src).toMatch(/deterministic render/i);
  });
});

describe('the embed visualizer', () => {
  const widget = read('src/embed/materialkai-visualizer.ts');
  const code = stripComments(widget);

  it('ships at all — the bundle has ONE entry, so an unimported component reaches nobody', () => {
    const entry = read('src/embed/materialkai-product.ts');
    expect(entry).toContain("import './materialkai-visualizer'");
    expect(code).toContain("customElements.define('materialkai-visualizer'");
  });

  it('runs the app\'s own renderer, format parser and coverage — not a second copy', () => {
    expect(code).toMatch(/from '@\/lib\/surfaceRenderer'/);
    expect(code).toMatch(/computeCoverage/);
    expect(code).toMatch(/tileFormatM/);
    expect(code).toMatch(/packCoverageM2/);
    // A local re-derivation would show up as its own arithmetic on piece counts.
    expect(code).not.toMatch(/Math\.ceil\([^)]*wastage/i);
  });

  it('emits every event the API allowlist declares for it', () => {
    for (const type of ['embed_visualize_surface', 'embed_visualizer_share', 'embed_visualizer_quote']) {
      expect(code, `${type} is allowed by the API but the widget never sends it`).toContain(type);
    }
  });

  it('sends the render STATE and the coverage verdict, never an invented price', () => {
    expect(code).toContain('visualizer_link');
    expect(code).toContain('coverage_is_order_quantity');
    expect(code).toContain('coverage_missing');
    // `total_estimated` is deliberately absent from the embed quote path.
    expect(code).not.toContain('total_estimated');
  });

  it('gates the lead behind Turnstile, because request_quote mints a CRM contact', () => {
    expect(code).toContain('loadTurnstile');
    expect(code).toContain('turnstile_token');
  });

  it('never trusts a workspace id from its own page', () => {
    expect(code).not.toMatch(/workspace_id/);
  });
});

describe('the spec projection', () => {
  it('keeps the LEAVES of a nested size, not just the branch', () => {
    // The depth guard used to fire on the scalar, so `available_sizes` arrived as an empty object
    // and a 60×120 slab rendered as the assumed 60×60 with nobody able to tell.
    const kept = pickProductSpec({
      available_sizes: [{ width: 60, length: 120, unit: 'cm' }],
      dimensions: { width: 30, length: 60, dimension_unit: 'cm' },
      m2_per_box: '1.44',
      cost: 999,
      supplier_company_id: 'leak',
    }) as Record<string, unknown>;
    expect((kept.available_sizes as Array<Record<string, unknown>>)[0]).toEqual({ width: 60, length: 120, unit: 'cm' });
    expect(kept.dimensions).toEqual({ width: 30, length: 60, dimension_unit: 'cm' });
    expect(kept.m2_per_box).toBe('1.44');
    // And it is still an allowlist: nothing unclassified rides along.
    expect(kept.cost).toBeUndefined();
    expect(kept.supplier_company_id).toBeUndefined();
  });

  it('refuses to walk for ever, whatever it is handed', () => {
    const deep: Record<string, unknown> = { dimensions: {} };
    let cur = deep.dimensions as Record<string, unknown>;
    for (let i = 0; i < 200; i++) { cur.dimensions = {}; cur = cur.dimensions as Record<string, unknown>; }
    expect(() => pickProductSpec(deep)).not.toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.dimensions = cyclic;
    expect(() => pickProductSpec(cyclic)).not.toThrow();
  });

  it('covers every key the format and pack parsers read', () => {
    const keys = read('src/lib/surfaceRenderer/productSpecKeys.ts');
    const parser = stripComments(read('src/components/features/roomplanner/surfaceFormat.ts'));
    // Every quoted key the parser looks up must be offered by the projection, or the embed silently
    // falls back to an assumed format on products whose size we actually hold.
    const looked = new Set<string>();
    for (const m of parser.matchAll(/(?:src|attributes|metadata|o|dims)\.([a-z0-9_]+)/gi)) looked.add(m[1]);
    for (const m of parser.matchAll(/read\('([a-z0-9_]+)'\)/gi)) looked.add(m[1]);
    const ignored = new Set(['dimension_unit', 'unit']);
    const missing = [...looked]
      .filter((k) => !ignored.has(k) && /_(cm|mm|m|m2|box|sizes|unit)$|^(width|length|height|dimensions|slab_size|available_sizes)/.test(k))
      .filter((k) => !keys.includes(`'${k}'`));
    expect(missing, `PRODUCT_SPEC_KEYS is missing: ${missing.join(', ')}`).toEqual([]);
  });
});
