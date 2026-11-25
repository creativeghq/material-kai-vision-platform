/** Guards the time-of-day sun in the 3D room (#604 phase 6). */

import { describe, it, expect } from 'vitest';

import { sunAt } from '../../src/lib/scene/sun';

describe('sunAt', () => {
  it('stands highest and brightest at 13:00 and rises and sets low', () => {
    const noon = sunAt(13, 6);
    const dawn = sunAt(6.5, 6);
    const dusk = sunAt(19.5, 6);
    expect(noon.position[1]).toBeGreaterThan(dawn.position[1]);
    expect(noon.intensity).toBeGreaterThan(dawn.intensity);
    expect(dawn.position[0]).toBeGreaterThan(0);
    expect(dusk.position[0]).toBeLessThan(0);
  });

  it('is warm at the ends of the day and near white at midday', () => {
    const blue = (c: string) => Number(c.match(/\d+/g)![2]);
    expect(blue(sunAt(6.5, 6).colour)).toBeLessThan(blue(sunAt(13, 6).colour));
  });

  it('never puts the sun below the floor', () => {
    for (let h = 6; h <= 20; h += 0.5) expect(sunAt(h, 6).position[1]).toBeGreaterThan(0);
  });
});
