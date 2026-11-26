import { describe, expect, it } from 'vitest';

import { fitModel } from '@/lib/scene/modelFit';

describe('fitModel', () => {
  it('reads the model width along X and fills a TV unit box', () => {
    const k = fitModel({ x: 1.0, y: 0.26, z: 0.27 }, 1.8, 0.4, 0.5);
    expect(1.0 * k[0]).toBeCloseTo(1.8, 2);
    expect(0.26 * k[1]).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(0.27 * k[2]).toBeLessThanOrEqual(0.4 + 1e-9);
  });

  it('stretches a too-deep, too-flat sofa to its true size', () => {
    const k = fitModel({ x: 1.04, y: 0.32, z: 0.75 }, 2.4, 0.9, 0.85);
    expect(1.04 * k[0]).toBeCloseTo(2.4, 2);
    expect(0.32 * k[1]).toBeCloseTo(0.85, 2);
    expect(0.75 * k[2]).toBeCloseTo(0.9, 2);
  });

  it('caps how far one axis stretches against another, and never overflows the box', () => {
    const k = fitModel({ x: 1, y: 0.05, z: 1 }, 1, 1, 1);
    expect(Math.max(...k) / Math.min(...k)).toBeLessThanOrEqual(1.8 * 1.8 + 1e-9);
    expect(1 * k[0]).toBeLessThanOrEqual(1 + 1e-9);
    expect(0.05 * k[1]).toBeLessThanOrEqual(1 + 1e-9);
    expect(1 * k[2]).toBeLessThanOrEqual(1 + 1e-9);
  });
});
