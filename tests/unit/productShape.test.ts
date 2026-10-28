import { describe, it, expect } from 'vitest';
import { isoBox, shapesFromModelTable } from '@/components/features/products/productShape';
import { buildModelTable } from '@/components/features/products/productModelTable';

describe('isoBox', () => {
  it('keeps every corner inside the padded canvas, for a slab and for a cube', () => {
    for (const [w, h, d] of [[600, 900, 54], [500, 500, 500], [1200, 300, 80]]) {
      const box = isoBox(w, h, d, 260, 200, 34);
      for (const p of [...box.front, ...box.side, ...box.top]) {
        expect(p.x).toBeGreaterThanOrEqual(33.9);
        expect(p.x).toBeLessThanOrEqual(226.1);
        expect(p.y).toBeGreaterThanOrEqual(33.9);
        expect(p.y).toBeLessThanOrEqual(166.1);
      }
    }
  });
});

describe('shapesFromModelTable', () => {
  it('draws only the models that state a width and a height', () => {
    const table = buildModelTable([
      {
        product_codes: ['A 700.450', 'A 900.600'],
        width_mm: { 'A 700.450': '450', 'A 900.600': '600' },
        height_mm: { 'A 700.450': '700', 'A 900.600': '900' },
      },
    ]);
    expect(shapesFromModelTable(table)).toEqual([
      { label: 'A 700.450', w: 450, h: 700, d: null },
      { label: 'A 900.600', w: 600, h: 900, d: null },
    ]);
    expect(shapesFromModelTable(null)).toEqual([]);
  });
});
