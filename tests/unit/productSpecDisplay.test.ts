import { describe, it, expect } from 'vitest';
import {
  numericSet,
  formatRange,
  summariseSkuMap,
  isNoiseSpecKey,
  isContactKey,
  complianceFlagLabel,
} from '@/components/features/products/productSpecDisplay';

describe('productSpecDisplay', () => {
  it('folds a list of widths into a range', () => {
    const set = numericSet([450, 750, 600, 600]);
    expect(set && formatRange(set, 'mm')).toBe('450 – 750 mm');
  });

  it('reads a per-SKU map as a range, and leaves a single value alone', () => {
    expect(summariseSkuMap({ 'A 1': '300', 'A 2': '1000', 'A 3': '500' }, 'W')).toBe('300 – 1000 W');
    expect(summariseSkuMap({ 'A 1': '300' })).toBeNull();
  });

  it('classifies extraction bookkeeping and contact keys out of the specs', () => {
    for (const k of ['page_range', '_start_page', 'image_indices', 'confidence', 'unit', 'notes', 'dimensionalAesthetic']) {
      expect(isNoiseSpecKey(k)).toBe(true);
    }
    expect(isNoiseSpecKey('heat_output_w')).toBe(false);
    expect(isContactKey('email')).toBe(true);
    expect(isContactKey('website')).toBe(true);
    expect(isContactKey('width_mm')).toBe(false);
  });

  it('names the compliance flags that belong with the certifications', () => {
    expect(complianceFlagLabel('en_442_compliant')).toBe('EN 442');
    expect(complianceFlagLabel('din_55_900_compliance')).toBe('DIN 55 900');
    expect(complianceFlagLabel('din_55900_compliance')).toBe('DIN 55 900');
    expect(complianceFlagLabel('ip_rating')).toBeNull();
  });
});
