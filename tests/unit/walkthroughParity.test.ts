import { describe, expect, it } from 'vitest';

import { wipeAt } from '../../src/lib/scene/beforeAfterVideo';
import { roomPoses, walkthroughStage, type Pose, type WalkRoom } from '../../src/lib/scene/walkthroughTimeline';
import { blankedSource } from '../helpers/sourceIndex';

const read = (p: string) => blankedSource(p);
const pose: Pose = { position: [1, 1.5, 1], target: [0, 1, 0], fov: 55 };
const room: WalkRoom = { centre: [0, 0], far: [2, 2], corners: [[-2, -2], [2, -2], [2, 2], [-2, 2]], shot: pose };
const base = { span: 6, walk: [room, room], names: ['Living Room', 'Kitchen'], finalPose: null };

describe('walkthroughStage', () => {
  it('ends a room on its own render, and never when the room has a photoreal version', () => {
    const at = 0.35 + 0.25 * 0.8;
    expect(walkthroughStage(at, { ...base, photoreal: [false, false] })).toMatchObject({ caption: 'Living Room', shotRoom: 0, shotOpacity: 1 });
    expect(walkthroughStage(at, { ...base, photoreal: [true, false] })).toMatchObject({ shotRoom: -1, shotOpacity: 0 });
  });

  it('starts inside the room even when its picture was taken near a wall, so the room is lit from the first frame', () => {
    const near: Pose = { position: [0, 1.5, 1.65], target: [0, 1, -2], fov: 60 };
    expect(roomPoses({ ...room, shot: near })[0].position[2]).toBeLessThan(2);
    expect(roomPoses({ ...room, shot: { ...near, position: [0, 1.5, 0] } })[0].position[2]).toBeCloseTo(0.5, 5);
  });

  it('does not promise a finished design when there is no closing render', () => {
    expect(walkthroughStage(1, { ...base, photoreal: [false, false] }).caption).toBe('Your home');
    expect(walkthroughStage(1, { ...base, photoreal: [false, false], finalPose: pose }).caption).toBe('The finished design');
  });
});

describe('the recorded walkthrough shows what the client sees', () => {
  it('the page, the explorer and the recorder read one plan and one stage', () => {
    const scroll = read('src/components/features/scenestudio/ScrollWalkthrough.tsx');
    const recorder = read('src/components/features/scenestudio/WalkthroughRecorder.tsx');
    for (const src of [scroll, recorder]) {
      expect(src).toContain('useWalkthrough(data)');
      expect(src).toContain('walkthroughStage(');
      expect(src).not.toContain('walkthroughFrame(');
      expect(src).toMatch(/modelUrls=\{modelUrls\}/);
      expect(src).toMatch(/worlds=\{worlds\}/);
    }
    expect(recorder).toMatch(/settled\(\)/);
    expect(recorder).toMatch(/=== room && scene\.current\?\.lit\(\) \? SETTLE_FRAME_MS : SETTLE_ROOM_MS/);
    expect(recorder).toMatch(/disabled=\{[^}]*!ready/);
  });

  it('the editor hands the recorder its models, renders and photoreal rooms', () => {
    const editor = read('src/components/features/scenestudio/SceneEditor.tsx');
    const payload = editor.slice(editor.indexOf('const walkthroughPayload'), editor.indexOf('const saveWalkthrough'));
    for (const part of ['model_url:', 'renders:', 'worlds:']) expect(payload).toContain(part);
  });
});

describe('a photoreal room', () => {
  it('replaces the drawn room as soon as its splat is on screen, even while the camera moves', () => {
    const canvas = read('src/components/features/scenestudio/SceneCanvas.tsx');
    const body = canvas.slice(canvas.indexOf('const PhotorealRooms'), canvas.indexOf('const SPLAT_TURN'));
    expect(body).toMatch(/drawn\.current\.visible = !room \|\| !splatShown\(scene, loaded\[room\.id\]\)/);
    expect(body).not.toContain('splatsSettled');
  });

  it('is walked from an open spot, not from the render camera', () => {
    expect(read('src/components/features/scenestudio/ScrollWalkthrough.tsx')).toMatch(/shot: real \? null : shot\?\.camera \?\? null, start: real \? openSpot\(/);
  });
});

describe('public walkthrough', () => {
  it('both public pages use the one builder, which withholds a room or product of another workspace', () => {
    const builder = read('supabase/functions/_shared/scene-walkthrough.ts');
    expect(builder).toMatch(/if \(!workspaceId \|\| plan\.workspace_id !== workspaceId\)[\s\S]{0,160}return null/);
    expect(builder).toMatch(/if \(p\.workspace_id !== workspaceId\) continue/);
    expect(read('supabase/functions/moodboard-sheet-share/index.ts')).toMatch(/buildSceneWalkthrough\(supabase, view\.walkthrough_floor_plan_id, viewWorkspaceId\)/);
    expect(read('supabase/functions/real-estate-public/index.ts')).toMatch(/buildSceneWalkthrough\(supabase, property\.walkthrough_floor_plan_id, property\.workspace_id\)/);
    expect(read('supabase/functions/real-estate-api/index.ts')).toMatch(/assertSameWorkspace\(supabase, 'floor_plans', payload\.walkthrough_floor_plan_id/);
  });
});

describe('before and after', () => {
  it('holds on the before, then ends on the after', () => {
    expect(wipeAt(0)).toBe(0);
    expect(wipeAt(0.19)).toBe(0);
    expect(wipeAt(0.5)).toBeCloseTo(0.5, 5);
    expect(wipeAt(0.8)).toBe(1);
    expect(wipeAt(1)).toBe(1);
  });

  it('a 3D room render gets its real walkthrough before any paid video call', () => {
    const tool = read('supabase/functions/_shared/tools/background-tools.ts');
    const run = tool.slice(tool.indexOf('invented_camera }) =>'));
    expect(run.indexOf("from('scene_renders')")).toBeGreaterThan(0);
    expect(run.indexOf("from('scene_renders')")).toBeLessThan(run.indexOf('generate-interior-video-v2'));
    const hub = read('src/components/features/ai/AgentHub.tsx');
    const ui = hub.slice(hub.indexOf('const handleGenerateVideo'));
    expect(ui.indexOf('sceneOfRender(')).toBeLessThan(ui.indexOf('generate-interior-video-v2'));
  });
});
