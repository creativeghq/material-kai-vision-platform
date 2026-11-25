import { describe, expect, it } from 'vitest';

import { rendersForLook, worldsForLook } from '@/config/sceneClientLook';
import { currentRenders, type WalkthroughPayload } from '@/components/features/scenestudio/ScrollWalkthrough';
import { roomSignature, worldsNear } from '@/lib/scene/worldViews';
import { bowlFor, slabAround } from '@/lib/scene/fixturePlan';
import { blankedSource } from '../helpers/sourceIndex';

const rooms = [{ id: 'a', name: 'A', height_mm: null, outline: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]] as Array<[number, number]> }];
const payload = (sig: string | null, source: string): WalkthroughPayload => ({
  name: 'x', default_wall_height_mm: 2700, cabinet_hardware: null, rooms, walls: [], openings: [], objects: [], surfaces: [], finishes: [], products: {}, render: null,
  renders: [{ image_url: 'u', camera: { position: [0, 1.5, 0], target: [0, 1, -1], fov: 60 }, source, sig }],
});

describe('what a shared walkthrough shows', () => {
  it('the live look shows only pictures of the live rooms, and no photoreal room', () => {
    const all = [{ source: 'ai' }, { source: 'photo_mode' }];
    expect(rendersForLook('drawn', all)).toEqual([{ source: 'photo_mode' }]);
    expect(rendersForLook('photoreal', all)).toHaveLength(2);
    expect(rendersForLook(null, all)).toHaveLength(2);
    expect(worldsForLook('drawn', [1])).toEqual([]);
    expect(worldsForLook('photoreal', [1])).toEqual([1]);
  });

  it('a Photo Mode picture of a room that has changed since is left out', () => {
    const sig = roomSignature('a', [], [], []);
    expect(currentRenders(payload(sig, 'photo_mode'))).toHaveLength(1);
    expect(currentRenders(payload('older', 'photo_mode'))).toHaveLength(0);
    expect(currentRenders(payload(null, 'photo_mode'))).toHaveLength(0);
    expect(currentRenders(payload(null, 'ai'))).toHaveLength(1);
  });

  it('the public builder applies the look, so the editor setting decides what a client can fetch', () => {
    const src = blankedSource('supabase/functions/_shared/scene-walkthrough.ts');
    expect(src).toMatch(/rendersForLook\(plan\.client_look,/);
    expect(src).toMatch(/worldsForLook\(plan\.client_look,/);
  });

  it('walking around reuses the canvas of the page: one SceneCanvas, so nothing loads twice', () => {
    expect(blankedSource('src/components/features/scenestudio/ScrollWalkthrough.tsx').match(/<SceneCanvas\b/g)).toHaveLength(1);
    expect(blankedSource('src/components/features/scenestudio/WalkthroughExplore.tsx')).not.toMatch(/<SceneCanvas[\s/]/);
  });
});

describe('photoreal rooms in memory', () => {
  const homes = ['a', 'b', 'c'].map((id, i) => ({ id, outline: [[i * 5000, 0], [i * 5000 + 4000, 0], [i * 5000 + 4000, 4000], [i * 5000, 4000]] as Array<[number, number]> }));
  const worlds = homes.map((r) => ({ roomId: r.id, url: r.id }));
  it('holds the room the camera is in and the nearest other, never the whole home', () => {
    expect(worldsNear(worlds, homes, 2000, 2000)).toEqual(['a', 'b']);
    expect(worldsNear(worlds, homes, 12000, 2000)).toEqual(['b', 'c']);
  });
});

describe('a worktop with a sink', () => {
  const area = (ps: Array<{ size: [number, number, number] }>) => ps.reduce((s, p) => s + p.size[0] * p.size[2], 0);
  it('is cut around the bowl and keeps the rest of its area', () => {
    const bowl = bowlFor(0.9, 0.6);
    const parts = slabAround([0, 0.88, 0], [3.6, 0.04, 0.62], { x: 0.5, z: 0.03, ...bowl });
    expect(parts).toHaveLength(4);
    expect(area(parts)).toBeCloseTo(3.6 * 0.62 - bowl.w * bowl.d, 6);
  });
  it('stays whole when the bowl would break its edge', () => {
    expect(slabAround([0, 0, 0], [0.5, 0.04, 0.5], { x: 0, z: 0, w: 0.6, d: 0.3 })).toHaveLength(1);
  });
});
