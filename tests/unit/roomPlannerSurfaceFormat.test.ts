/**
 * A surface renders at the product's REAL format, read where the pipeline writes it, and says so
 * when it had to assume one (#404 Phase 0.4).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  tileFormatM, tileFormatLabel, parseFormatText, DEFAULT_TILE_M, type SurfaceTexture,
} from '../../src/components/features/roomplanner/surfaceFormat';
import { wallTransform, WALL_NORMALS } from '../../src/components/features/roomplanner/roomScene';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const recorded = (w: number, l: number) => ({ tileWidthM: w, tileLengthM: l, formatSource: 'recorded' });
const assumed = { tileWidthM: DEFAULT_TILE_M, tileLengthM: DEFAULT_TILE_M, formatSource: 'default' };

describe('one piece of a surface product, in metres', () => {
  it('reads the registry tile fields as centimetres unless the registry unit says otherwise', () => {
    expect(tileFormatM({ attributes: { width: 60, length: 60 } })).toEqual(recorded(0.6, 0.6));
    expect(tileFormatM({ attributes: { width: '120', length: '60' } })).toEqual(recorded(1.2, 0.6));
    expect(tileFormatM({ attributes: { width: 600, length: 600, dimension_unit: 'mm' } })).toEqual(recorded(0.6, 0.6));
    const inch = tileFormatM({ attributes: { width: 12, length: 24, dimension_unit: 'inch' } });
    expect(inch.tileWidthM).toBeCloseTo(0.3048, 6);
    expect(inch.tileLengthM).toBeCloseTo(0.6096, 6);
  });

  it('reads a comma decimal the way the supplier wrote it', () => {
    expect(tileFormatM({ attributes: { width: '60,5', length: '120' } })).toEqual(recorded(0.605, 1.2));
  });

  it('reads the metadata dimensions section the extractors write, and the flat metadata keys', () => {
    expect(tileFormatM({ metadata: { dimensions: { width: 30, length: 60, unit: 'cm' } } })).toEqual(recorded(0.3, 0.6));
    expect(tileFormatM({ metadata: { width: 45, length: 90 } })).toEqual(recorded(0.45, 0.9));
    // attributes win over metadata when both carry a format.
    expect(tileFormatM({ attributes: { width: 60, length: 60 }, metadata: { width: 30, length: 30 } })).toEqual(recorded(0.6, 0.6));
  });

  it('reads wallpaper rolls and wood planks, whose unit is in the field name', () => {
    expect(tileFormatM({ attributes: { roll_width_cm: 53, roll_length_m: 10.05 } })).toEqual(recorded(0.53, 10.05));
    expect(tileFormatM({ metadata: { plank_width_mm: 190, plank_length_mm: 1900 } })).toEqual(recorded(0.19, 1.9));
  });

  it('reads structured sizes and the "60x60" strings the extractors emit', () => {
    expect(tileFormatM({ metadata: { available_sizes: [{ width: 30, height: 60, unit: 'cm' }] } })).toEqual(recorded(0.3, 0.6));
    expect(tileFormatM({ metadata: { dimensions: ['60x120 cm', '30x60 cm'] } })).toEqual(recorded(0.6, 1.2));
    expect(tileFormatM({ metadata: { dimensions_cm_from_vision: '60x120' } })).toEqual(recorded(0.6, 1.2));
    expect(tileFormatM({ attributes: { slab_size: '320x160 cm' } })).toEqual(recorded(3.2, 1.6));
    expect(parseFormatText('12 x 24 in')?.tileWidthM).toBeCloseTo(0.3048, 6);
    expect(parseFormatText('large format')).toBeNull();
    expect(parseFormatText(60)).toBeNull();
  });

  it('assumes, and SAYS it assumed, when the product carries no format', () => {
    for (const row of [
      {}, { attributes: null }, { attributes: { width: 60 } }, { attributes: { width: 0, length: 60 } },
      { attributes: { width: 'big', length: 'huge' } }, { attributes: 'not-an-object' },
      { attributes: { width: 60, length: 60, dimension_unit: 'parsecs' } }, { metadata: { dimensions: [] } },
    ]) {
      expect(tileFormatM(row as { attributes?: unknown; metadata?: unknown })).toEqual(assumed);
    }
  });

  it('labels the format, and says assumed / photo / no image when that is the case', () => {
    const base: SurfaceTexture = { url: 'u', source: 'albedo', tileWidthM: 0.6, tileLengthM: 1.205, formatSource: 'recorded' };
    expect(tileFormatLabel(base)).toBe('60 × 120.5 cm');
    expect(tileFormatLabel({ ...base, formatSource: 'default' })).toBe('60 × 120.5 cm · assumed');
    expect(tileFormatLabel({ ...base, source: 'photo' })).toBe('60 × 120.5 cm · photo');
    expect(tileFormatLabel({ ...base, url: null, source: 'none', formatSource: 'default' })).toBe('60 × 120.5 cm · assumed · no image');
  });
});

describe('the four walls face the room', () => {
  it('each wall stands on its own edge, spans that edge, and its face points at the centre', () => {
    expect(WALL_NORMALS.map((w) => w.key).sort()).toEqual(['wall_east', 'wall_north', 'wall_south', 'wall_west']);
    for (const { normal } of WALL_NORMALS) {
      const t = wallTransform(normal, 4, 3, 2.7);
      const [nx, nz] = normal;
      expect(t.position).toEqual([nx * 2, 1.35, nz * 1.5]);
      expect(t.span).toBe(nx !== 0 ? 3 : 4);
      // A plane faces +z; rotating it by rotationY about y turns that to (sin, 0, cos).
      expect(Math.sin(t.rotationY)).toBeCloseTo(-nx, 9);
      expect(Math.cos(t.rotationY)).toBeCloseTo(-nz, 9);
    }
  });
});

describe('the 3D view', () => {
  const scene = stripComments(read('src/components/features/roomplanner/RoomScene3D.tsx'));

  it('shares one download per URL and gives each surface its own repeat, one per piece', () => {
    expect(scene).toContain('loadSharedTexture(url)');
    expect(scene).toMatch(/\.clone\(\)/);
    expect(scene).toMatch(/repeat\.set\([^)]*tileW[^)]*tileL[^)]*\)/);
    // A texture that fails to load must leave the flat colour, not throw into the Canvas boundary.
    expect(scene).not.toMatch(/useLoader\(|useTexture\(/);
  });

  it('releases a surface texture only after the material holds its replacement', () => {
    expect(scene).toMatch(/useEffect\(\(\) => \(\) => \{ texture\?\.dispose\(\); \}, \[texture\]\)/);
  });

  it('draws all four walls always, and drops the grid over a tiled floor', () => {
    expect(scene).toMatch(/WALL_NORMALS\.map\(/);
    expect(scene).toMatch(/\{!surfaces\?\.floor\?\.url && \(\s*<Grid/);
    expect(scene).not.toMatch(/DEFAULT_HEIGHT_M/);
  });

  it('the panel labels each surface through the one label function and reports a failed read', () => {
    const panel = stripComments(read('src/components/features/roomplanner/RoomPlannerPanel.tsx'));
    expect(panel).toContain('tileFormatLabel(sceneSurfaces[key])');
    expect(panel).toContain('surfaceTextureError');
  });
});
