import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  pinPointForSurface, staleProductIds, orderQuantityForUnit, computeCoverage, type Coverage, type Pt,
} from '../../src/lib/surfaceRenderer';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8')).replace(/\r\n/g, '\n');

const quad: [Pt, Pt, Pt, Pt] = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.1 }, { x: 0.8, y: 0.9 }, { x: 0.2, y: 0.9 }];

describe('pinPointForSurface', () => {
  it('pins the centre when the centre is painted', () => {
    const p = pinPointForSurface(quad, () => true);
    expect(p.x).toBeCloseTo(0.5, 1);
    expect(p.y).toBeCloseTo(0.5, 1);
  });

  it('moves off an occluder (a mirror in the middle of the wall) to the nearest painted point', () => {
    const mirror = (p: Pt) => (p.x - 0.5) ** 2 + (p.y - 0.5) ** 2 < 0.2 ** 2;
    const p = pinPointForSurface(quad, (pt) => !mirror(pt));
    expect(mirror(p)).toBe(false);
    expect(p.x).toBeGreaterThanOrEqual(0.2);
    expect(p.x).toBeLessThanOrEqual(0.8);
    expect(Math.hypot(p.x - 0.5, p.y - 0.5)).toBeLessThan(0.26);
  });

  it('falls back to the centre rather than outside the surface when nothing is painted', () => {
    const p = pinPointForSurface(quad, () => false);
    expect(p).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('staleProductIds', () => {
  const at = '2026-11-12T10:00:00Z';
  it('names a product edited after the render', () => {
    expect(staleProductIds(at, [
      { id: 'a', updated_at: '2026-11-12T10:00:01Z' },
      { id: 'b', updated_at: '2026-11-12T09:59:59Z' },
    ])).toEqual(['a']);
  });
  it('calls nothing stale when either time is unknown', () => {
    expect(staleProductIds(null, [{ id: 'a', updated_at: '2030-01-01T00:00:00Z' }])).toEqual([]);
    expect(staleProductIds(at, [{ id: 'a', updated_at: null }])).toEqual([]);
  });
});

describe('orderQuantityForUnit', () => {
  const orderable: Coverage = computeCoverage({
    surfaceWidthCm: 300, surfaceDepthCm: 400, format: { widthCm: 60, lengthCm: 60 }, formatAssumed: false,
    groutCm: 0.3, pattern: 'stack', wastagePercent: 10, m2PerBox: 1.44,
  });

  it('answers in the unit the product is sold in', () => {
    expect(orderable.orderable).toBe(true);
    expect(orderQuantityForUnit(orderable, 'm2')).toEqual({ quantity: orderable.m2Gross, unit: 'm2' });
    expect(orderQuantityForUnit(orderable, 'sqm')).toEqual({ quantity: orderable.m2Gross, unit: 'm2' });
    expect(orderQuantityForUnit(orderable, 'boxes')).toEqual({ quantity: orderable.boxes, unit: 'box' });
    expect(orderQuantityForUnit(orderable, 'τεμ')).toEqual({ quantity: orderable.piecesGross, unit: 'pcs' });
  });

  it('refuses an unset unit rather than reading it as pieces', () => {
    expect(orderQuantityForUnit(orderable, null)).toBeNull();
    expect(orderQuantityForUnit(orderable, '  ')).toBeNull();
  });

  it('refuses a unit coverage cannot express', () => {
    expect(orderQuantityForUnit(orderable, 'kg')).toBeNull();
  });

  it('refuses when the coverage is not an order quantity yet', () => {
    const noWastage = computeCoverage({
      surfaceWidthCm: 300, surfaceDepthCm: 400, format: { widthCm: 60, lengthCm: 60 }, formatAssumed: false,
      groutCm: 0.3, pattern: 'stack', wastagePercent: null, m2PerBox: 1.44,
    });
    expect(orderQuantityForUnit(noWastage, 'm2')).toBeNull();
  });
});

describe('the room_view sheet is wired end to end', () => {
  it('the PDF builder draws it alone and inside a deck', () => {
    const builders = read('supabase/functions/generate-moodboard-sheet-pdf/builders.ts');
    const index = read('supabase/functions/generate-moodboard-sheet-pdf/index.ts');
    expect(builders).toMatch(/export async function buildRoomView/);
    expect(builders).toMatch(/case 'room_view':\s*await buildRoomView/);
    expect(index).toMatch(/case 'room_view':\s*await buildRoomView/);
  });

  it('the Client View serves room views with their pins, and only from the view\'s own sheets', () => {
    const share = read('supabase/functions/moodboard-sheet-share/index.ts');
    expect(share).toMatch(/room_views/);
    expect(share).toMatch(/sheet_type === 'room_view'/);
    const page = read('src/pages/PublicClientViewPage.tsx');
    expect(page).toMatch(/room_views/);
  });

  it('a saved render is checked for its private copy, so a public temp file is never the record', () => {
    const svc = read('src/services/roomViewService.ts');
    expect(svc).toMatch(/isSheetAssetRef/);
  });
});
