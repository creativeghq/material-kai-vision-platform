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

import { displayValue, titleCaseDisplay } from '@/components/features/products/productSpecDisplay';

describe('displayValue', () => {
  it.each([
    ['design radiator', 'Design Radiator'],
    ['wall-mounted', 'Wall Mounted'],
    ['electrical', 'Electrical'],
    ['hot water', 'Hot Water'],
    ['false', 'False'],
    ['towel_rail', 'Towel Rail'],
    ['white RAL 9016', 'White RAL 9016'],
    ['hot water, electric', 'Hot Water, Electric'],
    ['waterborne detergents', 'Waterborne Detergents'],
  ])('%s reads %s', (raw, shown) => expect(displayValue(raw)).toBe(shown));

  it.each(['450 mm', '5 years', '230 V / 50 Hz', 'KORADO', 'EN 442', '#F1F0EA', 'https://www.korado.com/x', 'info@korado.cz', 'KRCA 700.600'])(
    'leaves %s alone', raw => expect(displayValue(raw)).toBe(raw));

  it('keeps a long sentence and only capitalises it', () => {
    const t = 'integrated connection fittings HM with thermostatic head available for bottom middle connection (KRCM)';
    expect(displayValue(t)).toBe(t[0].toUpperCase() + t.slice(1));
  });

  it('never lets a short lowercase value or an underscore through', () => {
    for (const raw of ['wall-mounted', 'design radiator', 'electric', 'matte black', 'towel_rail', 'floor standing', 'yes']) {
      expect(displayValue(raw)).not.toMatch(/(^|\s)\p{Ll}{3,}/u);
      expect(displayValue(raw)).not.toContain('_');
    }
  });
});

describe('titleCaseDisplay', () => {
  it('keeps acronyms and codes, folds shouted words', () => {
    expect(titleCaseDisplay('white RAL 9016')).toBe('White RAL 9016');
    expect(titleCaseDisplay('ANTHRACITE GREY')).toBe('Anthracite Grey');
    expect(titleCaseDisplay('matte-black')).toBe('Matte Black');
  });
});
