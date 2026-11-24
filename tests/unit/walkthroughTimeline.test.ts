/** Guards the client scroll walkthrough (#604 phase 8): scroll progress is the only clock, and it ends on the render's own camera. */

import { describe, it, expect } from 'vitest';

import { fitFov, roomPoses, walkthroughFrame, type Pose, type WalkRoom } from '../../src/lib/scene/walkthroughTimeline';

const rooms: WalkRoom[] = [{ centre: [-1, 0], far: [-3, -2] }, { centre: [2, 1], far: [4, 3] }];
const render: Pose = { position: [3, 1.4, 4], target: [0, 1, 0], fov: 55 };

describe('walkthroughFrame', () => {
  it('opens on the plan from above with the walls not yet raised', () => {
    const f = walkthroughFrame(0, 6, rooms, render);
    expect(f.pose.position[1]).toBeGreaterThan(6);
    expect(f.walls).toBeLessThan(0.05);
    expect(f.objects).toBe(0);
  });

  it('raises the walls before the units', () => {
    const f = walkthroughFrame(0.22, 6, rooms, render);
    expect(f.walls).toBeGreaterThan(0.8);
    expect(f.objects).toBeLessThan(0.3);
  });

  it('walks each room at eye level, in order', () => {
    const first = walkthroughFrame(0.5, 6, rooms, render);
    const second = walkthroughFrame(0.75, 6, rooms, render);
    expect([first.room, second.room]).toEqual([0, 1]);
    expect(first.pose.position[1]).toBeCloseTo(1.6, 5);
  });

  it('dips between rooms instead of flying through a wall', () => {
    expect(walkthroughFrame(0.35 + 0.001, 6, rooms, render).dip).toBeGreaterThan(0.9);
    expect(walkthroughFrame(0.5, 6, rooms, render).dip).toBe(0);
  });

  it('ends exactly on the render camera with the render fully shown', () => {
    const f = walkthroughFrame(1, 6, rooms, render);
    expect(f.pose).toEqual(render);
    expect(f.render).toBe(1);
  });

  it('is a pure function of progress', () => {
    expect(walkthroughFrame(0.63, 6, rooms, render)).toEqual(walkthroughFrame(0.63, 6, rooms, render));
  });

  it('starts a room near its far side and moves toward the centre', () => {
    const [a, b] = roomPoses(rooms[0]);
    const d = (p: Pose) => Math.hypot(p.position[0] - rooms[0].centre[0], p.position[2] - rooms[0].centre[1]);
    expect(d(a)).toBeGreaterThan(d(b));
  });

  it('faces the furniture of a room, standing on the side opposite it', () => {
    const [a] = roomPoses({ centre: [0, 0], far: [2, 2], focus: [0, -1.5] });
    expect(a.position[2]).toBeGreaterThan(0);
    expect(a.target).toEqual([0, 1, -1.5]);
  });

  it('with the outline known, shoots from the corner farthest from the furniture, looking across the room', () => {
    const room: WalkRoom = { centre: [0, 0], far: [2, 2], focus: [1, -1], corners: [[-2, -2], [2, -2], [2, 2], [-2, 2]] };
    const [a, b] = roomPoses(room);
    expect(a.position[0]).toBeLessThan(-1.4);
    expect(a.position[2]).toBeGreaterThan(1.4);
    expect(a.target).toEqual([1, 1.1, -1]);
    expect(Math.hypot(b.position[0] - 1, b.position[2] + 1)).toBeLessThan(Math.hypot(a.position[0] - 1, a.position[2] + 1));
  });

  it('a room with its own render arrives on that render camera and crossfades into the photo', () => {
    const shot: Pose = { position: [-1, 1.5, 1], target: [-2, 1, -1], fov: 60 };
    const withShot: WalkRoom[] = [{ ...rooms[0], shot }, rooms[1]];
    const late = walkthroughFrame(0.35 + 0.25 * 0.8, 6, withShot, null);
    expect(late.room).toBe(0);
    expect(late.pose).toEqual(shot);
    expect(late.shot).toBe(1);
    expect(walkthroughFrame(0.35 + 0.25 * 0.2, 6, withShot, null).shot).toBe(0);
    expect(walkthroughFrame(0.75, 6, withShot, null).shot).toBe(0);
  });

  it('with no final render, ends on the whole home and shows no photo', () => {
    const f = walkthroughFrame(1, 6, rooms, null);
    expect(f.render).toBe(0);
    expect(f.pose.position[1]).toBeGreaterThan(3);
  });
});

describe('fitFov', () => {
  it('keeps the field of view on a landscape screen', () => {
    expect(fitFov(60, 1.78)).toBe(60);
  });

  it('widens it on a portrait phone so the room is not cropped to a sliver', () => {
    const v = fitFov(60, 390 / 844);
    expect(v).toBeGreaterThan(95);
    const h = (a: number, fov: number) => 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * a);
    expect(h(390 / 844, v)).toBeGreaterThan(h(1.5, 60) * 0.8);
    expect(h(390 / 844, 60)).toBeLessThan(h(1.5, 60) * 0.5);
  });
});
