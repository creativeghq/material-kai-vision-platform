import { describe, expect, it } from 'vitest';
import { inferSection, placeFields } from '@/components/features/products/productFieldPlacement';

describe('inferSection', () => {
  it.each([
    ['max_vertical_load_n', 'performance'],
    ['bracket_distance_mm', 'installation'],
    ['brackets_included', 'installation'],
    ['en_442_compliant', 'compliance'],
    ['nominal_heat_output_w_per_m', 'thermal_performance'],
    ['carton_quantity', 'packaging'],
    ['finish_type', 'appearance'],
    ['warranty_years', 'commercial'],
    ['voltage_v', 'electrical_specs'],
    ['mysterious_thing', 'other'],
  ])('%s -> %s', (key, section) => {
    expect(inferSection(key)).toBe(section);
  });

  it('uses the parked group name as a hint', () => {
    expect(inferSection('quantity', 'mounting_options')).toBe('installation');
  });
});

describe('placeFields', () => {
  it('buckets by section and keeps unknowns together', () => {
    const placed = placeFields([
      { key: 'bracket_distance_mm', label: 'a', value: '1' },
      { key: 'zzz', label: 'b', value: '2' },
    ]);
    expect([...placed.keys()].sort()).toEqual(['installation', 'other']);
  });
});
