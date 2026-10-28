import { describe, expect, it } from 'vitest';
import { inferSection, placeFields } from '@/components/features/products/productFieldPlacement';

const f = (name: string, section: string, description: string | null = null) => ({
  name,
  label: name.replace(/_/g, ' '),
  section,
  description,
});

const registry = [
  f('installation_type', 'installation'),
  f('mounting_type', 'installation'),
  f('fixing_method', 'installation'),
  f('thermal_conductivity', 'thermal_performance'),
  f('heat_output_w', 'thermal_performance'),
  f('compressive_strength', 'performance'),
  f('load_class', 'performance'),
  f('carton_quantity', 'packaging'),
  f('warranty_years', 'commercial'),
];

describe('inferSection', () => {
  it('follows the registered fields a key resembles', () => {
    expect(inferSection(registry, 'bracket_mounting_distance_mm')).toBe('installation');
    expect(inferSection(registry, 'nominal_heat_output_w_per_m')).toBe('thermal_performance');
    expect(inferSection(registry, 'max_load_n')).toBe('performance');
  });

  it('learns from a field added to the registry', () => {
    expect(inferSection(registry, 'noise_level_db')).toBe('other');
    expect(inferSection([...registry, f('noise_rating', 'acoustic')], 'noise_level_db')).toBe('acoustic');
  });

  it('uses the parked group name as a weaker hint', () => {
    expect(inferSection(registry, 'spacing_mm', 'mounting_options')).toBe('installation');
  });

  it('places nothing without a registry', () => {
    expect(inferSection([], 'anything')).toBe('other');
  });
});

describe('placeFields', () => {
  it('buckets by section and keeps unknowns together', () => {
    const placed = placeFields(registry, [
      { key: 'mounting_distance_mm', label: 'a', value: '1' },
      { key: 'zzz', label: 'b', value: '2' },
    ]);
    expect([...placed.keys()].sort()).toEqual(['installation', 'other']);
  });
});
