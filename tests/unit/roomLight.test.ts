import { describe, expect, it } from 'vitest';

import { litRoomAt, type LitRoom } from '@/lib/scene/roomLight';

const box = (id: string, x0: number, x1: number): LitRoom => ({ id, outline: [[x0, 0], [x1, 0], [x1, 4], [x0, 4]], centre: [(x0 + x1) / 2, 2], height: 2.7 });
const ROOMS = [box('a', 0, 4), box('b', 4.2, 8)];

describe('the room whose light the camera sees', () => {
  it('keeps the room just left while crossing a doorway, then switches once', () => {
    let held: string | null = 'a';
    const seen: Array<string | null> = [];
    for (let x = 3.5; x < 5; x += 0.05) { held = litRoomAt(ROOMS, held, x, 1.6, 2)?.id ?? null; seen.push(held); }
    expect(seen).not.toContain(null);
    expect(seen.filter((v, i) => i > 0 && v !== seen[i - 1])).toEqual(['b']);
  });

  it('lets go above the walls and well outside the home', () => {
    expect(litRoomAt(ROOMS, 'a', 2, 3, 2)).toBeNull();
    expect(litRoomAt(ROOMS, 'a', 2, 1.6, -2)).toBeNull();
    expect(litRoomAt(ROOMS, null, 4.1, 1.6, 2)).toBeNull();
  });
});
