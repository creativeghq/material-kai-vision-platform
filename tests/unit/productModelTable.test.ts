import { describe, it, expect } from 'vitest';
import { buildModelTable, modelColumnLabel } from '@/components/features/products/productModelTable';

describe('buildModelTable', () => {
  it('folds per-code maps into one row per model', () => {
    const t = buildModelTable([
      {
        product_codes: ['KRCA 700.600', 'KRCA 700.750'],
        weight_kg: { 'KRCA 700.600': '8.5', 'KRCA 700.750': '9.8' },
        electric_element_w: { 'KRCA 700.600': '300', 'KRCA 700.750': '400' },
        sku_codes: { 'KRCA 700.600': 'KRC-1', 'KRCA 700.750': 'KRC-2' },
        colour: { white: 'x', black: 'y' },
      },
    ]);
    expect(t).not.toBeNull();
    expect(t!.rows.map(r => r.model)).toEqual(['KRCA 700.600', 'KRCA 700.750']);
    expect(t!.columns.map(c => c.label)).toEqual(['Weight (kg)', 'Electric Element (W)', 'SKU']);
    expect(t!.rows[1].cells.weight_kg).toBe('9.8');
    expect(t!.consumed).toEqual(expect.arrayContaining(['weight_kg', 'electric_element_w', 'sku_codes']));
    expect(t!.consumed).not.toContain('colour');
  });

  it('reads available_sizes records, height first, sorted by size', () => {
    const t = buildModelTable([
      {
        available_sizes: [
          { model: 'KLM 900.600', width_mm: 600, height_mm: 900, heat_output_70_55_w: 472 },
          { model: 'KLM 700.450', width_mm: 450, height_mm: 690, heat_output_70_55_w: 277 },
        ],
      },
    ]);
    expect(t!.rows.map(r => r.model)).toEqual(['KLM 700.450', 'KLM 900.600']);
    expect(t!.columns.map(c => c.label)).toEqual(['Height (mm)', 'Width (mm)', 'Heat Output 70/55 (W)']);
  });

  it('returns null when there are not several models', () => {
    expect(buildModelTable([{ weight_kg: { 'A 700.600': '1' } }])).toBeNull();
    expect(buildModelTable([{ width_mm: [450, 600] }])).toBeNull();
  });

  it('labels a column from its key and unit suffix', () => {
    expect(modelColumnLabel('water_content_l')).toBe('Water Content (l)');
    expect(modelColumnLabel('temperature_exponent')).toBe('Temperature Exponent');
  });
});
