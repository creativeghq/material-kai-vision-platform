import { describe, expect, it } from 'vitest';

import { decorLabel, decorPrompt, decorTone } from '@/lib/scene/boardDecor';
import { describeObjectFinishes, finishSignature, resolveFinish } from '@/lib/scene/sceneSurfaces';
import type { SceneObjectFinish } from '@/services/sceneStudioService';

const row = (over: Partial<SceneObjectFinish>): SceneObjectFinish => ({
  id: 'f1', object_id: 'o1', slot: 'fronts', product_id: null, colour_hex: null, ...over,
});

describe('decorTone', () => {
  it('reads an approximate tone off the decor name', () => {
    expect(decorTone('Stone Green')).toBe('#5f7356');
    expect(decorTone('Light Grey Chicago Concrete')).toBe('#c4c4c0');
    expect(decorTone('Dark Grey Chicago Concrete')).toBe('#5a5c5e');
    expect(decorTone('Elegant Black')).toBe('#1f1f1f');
    expect(decorTone('White Carrara Marble')).toBe('#f2f1ec');
    expect(decorTone('Anthracite')).toBe('#3a3d40');
    expect(decorTone('Aliminium')).toBeNull();
  });

  it('treats a wood decor as wood before reading its colour words', () => {
    expect(decorTone('Black-Brown Sorano Oak')).toBe('#6b4a33');
    expect(decorTone('Natural Bardolino Oak')).toBe('#c9a77c');
    expect(decorTone('Grey Sacramento Oak')).toBe('#9a8f84');
    expect(decorTone('American Walnut')).toBe('#5d4030');
    expect(decorTone('Kansas Oak')).toBe('#a97c50');
  });

  it('has no tone for an unnamed or unrecognised decor', () => {
    expect(decorTone(null)).toBeNull();
    expect(decorTone('')).toBeNull();
    expect(decorTone('Textil')).toBeNull();
    expect(decorTone('Cashmere')).toBe('#d8c8ad');
  });
});

describe('board decor in the render prompt', () => {
  const decor = { decor_brand: 'Egger', decor_code: 'U665 ST9', decor_name: 'Stone Green', colour_hex: '#5f7356' };

  it('labels and prompts the named decor', () => {
    const d = { brand: 'Egger', code: 'U665 ST9', name: 'Stone Green' };
    expect(decorLabel(d)).toBe('Egger U665 ST9 · Stone Green');
    expect(decorPrompt(d)).toBe('Egger U665 ST9 "Stone Green" melamine');
    expect(decorPrompt({ brand: 'Swiss Krono', code: 'D3798', name: null })).toBe('Swiss Krono D3798 melamine');
  });

  it('resolves a decor row to its label and approximate tone', () => {
    const f = resolveFinish(row(decor), undefined);
    expect(f?.label).toBe('Egger U665 ST9 · Stone Green');
    expect(f?.hex).toBe('#5f7356');
    expect(f?.decor).toEqual({ brand: 'Egger', code: 'U665 ST9', name: 'Stone Green' });
  });

  it('names the decor, not the hex, in describeObjectFinishes', () => {
    const rows = [row(decor), row({ id: 'f2', slot: 'carcass', colour_hex: '#ffffff' })];
    const text = describeObjectFinishes({ id: 'o1', kind: 'kitchen_base' }, rows, {});
    expect(text).toContain('fronts in Egger U665 ST9 "Stone Green" melamine');
    expect(text).toContain('in colour #ffffff');
    expect(text).not.toContain('#5f7356');
  });

  it('keeps the signature of a decor-less row unchanged and marks a decor change', () => {
    expect(finishSignature('o1', [row({ colour_hex: '#ffffff' })])).toBe('fronts::#ffffff');
    const a = finishSignature('o1', [row(decor)]);
    const b = finishSignature('o1', [row({ ...decor, decor_code: 'U702 ST9' })]);
    expect(a).not.toBe(b);
  });
});
