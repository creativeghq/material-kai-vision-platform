import { describe, expect, it } from 'vitest';

import { packCharts } from '@/lib/scene/lightmapAtlas';
import { homeSignature } from '@/lib/scene/roomSignature';
import { blankedSource } from '../helpers/sourceIndex';

const charts = [{ key: 'floor|a', w: 3, h: 4.8 }, { key: 'walls|w1', w: 4.8, h: 2.7 }, { key: 'walls|w2', w: 3, h: 2.7 }, { key: 'ceiling|a', w: 3, h: 4.8 }];

describe('the light map of a home', () => {
  it('packs every surface without overlap, and the same surfaces always pack the same way', () => {
    const a = packCharts(charts)!;
    const b = packCharts([...charts].reverse())!;
    expect(a.sig).toBe(b.sig);
    const rects = [...a.rects.values()];
    expect(rects).toHaveLength(4);
    for (const r of rects) { expect(r.x + r.w).toBeLessThanOrEqual(a.side); expect(r.y + r.h).toBeLessThanOrEqual(a.side); }
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
      const p = rects[i]; const q = rects[j];
      expect(p.x + p.w <= q.x || q.x + q.w <= p.x || p.y + p.h <= q.y || q.y + q.h <= p.y).toBe(true);
    }
  });

  it('a changed surface is a different bake, so a stale one is never shown', () => {
    expect(packCharts([...charts.slice(1), { key: 'floor|a', w: 3.2, h: 4.8 }])!.sig).not.toBe(packCharts(charts)!.sig);
  });

  it('moving furniture makes the bake out of date', () => {
    const obj = { id: 'o', room_id: 'a', x_mm: 100, y_mm: 100, rotation_deg: 0, width_mm: 1, depth_mm: 1, height_mm: 1, colour_hex: null };
    expect(homeSignature(['a'], [obj], [], [])).not.toBe(homeSignature(['a'], [{ ...obj, x_mm: 400 }], [], []));
  });

  it('the client link, the recorder and the editor read the bake only while the home still matches it', () => {
    expect(blankedSource('src/components/features/scenestudio/ScrollWalkthrough.tsx')).toMatch(/data\.lightmap\.home_sig === homeSignature\(/);
    expect(blankedSource('src/components/features/scenestudio/WalkthroughRecorder.tsx')).toMatch(/lightmap=\{lightmap\}/);
    expect(blankedSource('src/components/features/scenestudio/SceneEditor.tsx')).toMatch(/lightmap=\{lightCurrent && !photo \? lightmap : null\}/);
    expect(blankedSource('supabase/functions/_shared/scene-walkthrough.ts')).toMatch(/from\('scene_lightmaps'\)/);
  });
});
