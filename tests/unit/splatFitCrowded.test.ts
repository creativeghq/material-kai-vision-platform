import { describe, expect, it } from 'vitest';

import { crowded } from '@/lib/scene/splatFit';

describe('splat furniture', () => {
  it('drops splats that float alone and keeps the crowded ones', () => {
    const n = 400;
    const xyz = new Float32Array(n * 3);
    for (let i = 0; i < n - 1; i++) { xyz[i * 3] = (i % 20) * 0.01; xyz[i * 3 + 1] = Math.floor(i / 20) * 0.01; }
    xyz.set([3, 3, 3], (n - 1) * 3);
    const keep = crowded(xyz, new Float32Array(n).fill(0.9));
    expect(keep[n - 1]).toBe(0);
    expect(keep[200]).toBe(1);
  });
});
