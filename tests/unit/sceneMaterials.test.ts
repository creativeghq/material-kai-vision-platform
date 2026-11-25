import { describe, expect, it } from 'vitest';

import { linearOfHex, looksLikeWood, pickMaterial, tintFor, type SceneMaterial } from '@/lib/scene/sceneMaterials';
import { resolveFinish } from '@/lib/scene/sceneSurfaces';
import type { SceneProduct } from '@/services/sceneStudioService';

const mat = (over: Partial<SceneMaterial> & Pick<SceneMaterial, 'key' | 'kind'>): SceneMaterial => ({
  label: over.key, roles: [], words: [], albedoUrl: '', normalUrl: '', roughnessUrl: '', tileM: 1, mean: [0.4, 0.4, 0.4], tintOnly: false,
  normalScale: 1, roughnessFactor: 1, priority: 30, ...over,
});
const OAK = mat({ key: 'oak', kind: 'wood', words: ['oak'], roles: ['slot:top'], mean: [0.36, 0.21, 0.1] });
const WALNUT = mat({ key: 'walnut', kind: 'wood', words: ['walnut'], roles: ['slot:top'], mean: [0.14, 0.07, 0.04] });
const PLANKS = mat({ key: 'planks', kind: 'wood', roles: ['surface:floor'], mean: [0.33, 0.22, 0.13] });
const CEMENT = mat({ key: 'cement', kind: 'stone', words: ['concrete'], roles: ['surface:floor'] });
const LINEN = mat({ key: 'linen', kind: 'fabric', roles: ['slot:upholstery'] });
const ALL = [OAK, WALNUT, PLANKS, CEMENT, LINEN];

describe('which material a surface is drawn in', () => {
  it('believes the name first, from the start of a word', () => {
    expect(pickMaterial(ALL, { role: null, text: 'Panel — Sonoma Oak', hex: '#cbb49b' })?.key).toBe('oak');
    expect(pickMaterial(ALL, { role: null, text: 'Cloak', hex: '#cbb49b' })).toBeNull();
    expect(pickMaterial(ALL, { role: null, text: 'Chicago Concrete', hex: '#e3e1e0' })?.key).toBe('cement');
  });

  it('gives a wood colour the nearest timber, and a painted colour no grain at all', () => {
    expect(pickMaterial(ALL, { role: 'slot:top', hex: '#5a3c28' })?.key).toBe('walnut');
    expect(pickMaterial(ALL, { role: 'slot:top', hex: '#b98d5c' })?.key).toBe('oak');
    expect(pickMaterial(ALL, { role: 'slot:top', hex: '#1f1f1f' })).toBeNull();
    expect(looksLikeWood('#305a6d')).toBe(false);
  });

  it('a grey floor is not tinted timber', () => {
    expect(pickMaterial(ALL, { role: 'surface:floor', hex: '#8d8f92' })?.key).toBe('cement');
    expect(pickMaterial(ALL, { role: 'surface:floor', hex: '#a98f6f' })?.key).toBe('planks');
    expect(pickMaterial(ALL, { role: 'slot:upholstery', hex: '#a98f6f' })?.key).toBe('linen');
  });

  it('a tint lands on the colour asked for', () => {
    const t = tintFor(LINEN, '#8c8a7e');
    linearOfHex('#8c8a7e').forEach((v, i) => expect(t[i] * LINEN.mean[i]).toBeCloseTo(v, 5));
  });
});

describe('a colour option of a board', () => {
  const product = {
    id: 'p', name: 'Panel', imageUrl: null, attributes: null,
    colourTextures: { '#cbb49b': { url: 'https://x/t.png', coversM: 1 } },
    metadata: { available_sizes: ['2750×119×16 mm', '2750×119×12 mm'], colour_options: [{ hex: '#CBB49B', name: 'Sonoma Oak', swatch_url: 'https://x/s.png' }] },
  } as unknown as SceneProduct;
  it('carries the board thickness and its own texture', () => {
    const f = resolveFinish({ colour_hex: '#cbb49b' }, product);
    expect(f?.thicknessMm).toBe(16);
    expect(f?.colourTexture?.url).toBe('https://x/t.png');
  });
});
