import { describe, expect, it } from 'vitest';
import { packagingByFormat } from '@/components/features/products/productDisplayUnits';

describe('packagingByFormat', () => {
  it('returns one row per listed format, keeping the pallet label', () => {
    const rows = packagingByFormat({
      per_variant: [
        { format: '30x90', pallet: '95x120', m2_per_box: 1.35, pieces_per_box: 5, boxes_per_pallet: 36 },
        { format: '30x90', pallet: '80x120', boxes_per_pallet: 24, weight_per_pallet_kg: 575 },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ format: '30x90', pallet: '80x120' });
    expect(rows[1].values.m2_per_box).toBeNull();
    expect(rows[1].values.weight_per_pallet_kg).toBe(575);
  });

  it('marks only the fields the supplier did not publish as estimated', () => {
    const [row] = packagingByFormat({
      per_variant: [{
        format: '60x120', m2_per_box: 1.44, pieces_per_box: 2, boxes_per_pallet: 36,
        estimated: { fields: ['pieces_per_box', 'boxes_per_pallet'], basis: 'same brand, same size' },
      }],
    });
    expect(row.estimated.has('boxes_per_pallet')).toBe(true);
    expect(row.estimated.has('m2_per_box')).toBe(false);
    expect(row.basis).toBe('same brand, same size');
  });

  it('drops rows with no figures and tolerates a missing list', () => {
    expect(packagingByFormat({ per_variant: [{ format: '15x60' }] })).toEqual([]);
    expect(packagingByFormat(null)).toEqual([]);
    expect(packagingByFormat({ boxes_per_pallet: 30 })).toEqual([]);
  });

  it('keeps an https source link and drops anything else', () => {
    const [ok, bad] = packagingByFormat({
      per_variant: [
        { format: '30x90', m2_per_box: 1.35, source: { url: 'https://azulrec.com/x/Keros-TEBAS.pdf' } },
        { format: '30x90', m2_per_box: 1.35, source: { url: 'javascript:alert(1)' } },
      ],
    });
    expect(ok.sourceUrl).toBe('https://azulrec.com/x/Keros-TEBAS.pdf');
    expect(bad.sourceUrl).toBeNull();
  });
});
