import { describe, expect, it } from 'vitest';
import { tileFormats } from '@/components/features/products/tileFormats';

describe('tileFormats', () => {
  it('reads catalogue size strings as centimetres, smallest first, one entry per format', () => {
    const f = tileFormats(['30x120 cm', '10x60 cm', '60×120', '120x30 cm']);
    expect(f.map(x => x.label)).toEqual(['10×60', '30×120', '60×120']);
    expect(f[0]).toMatchObject({ widthCm: 10, heightCm: 60 });
  });

  it('drops OCR cell fragments that are not a tile format', () => {
    expect(tileFormats(['4x\n57', '2x\n199', '4x42', '40×40']).map(x => x.label)).toEqual(['40×40']);
  });

  it('reads structured sizes and other units', () => {
    const f = tileFormats([{ metric_cm: '11.8x11.8' }, { width: 600, height: 1200, unit: 'mm' }]);
    expect(f.map(x => x.label)).toEqual(['11.8×11.8', '60×120']);
  });

  it('returns nothing for empty or non-size input', () => {
    expect(tileFormats(undefined, null, 'Matt', [])).toEqual([]);
  });
});
