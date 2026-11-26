// Generated furniture is a SAM 3D GLB mesh (#617): the edge function hands MIVAA the photo as it is,
// with the object's exact mask when the scene has one, and repaints with Gemini only for a finish.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const EDGE = stripComments(readFileSync(join(ROOT, 'supabase', 'functions', 'object-3d', 'index.ts'), 'utf8'));
const EDITOR = stripComments(readFileSync(join(ROOT, 'src', 'components', 'features', 'scenestudio', 'SceneEditor.tsx'), 'utf8'));

describe('object-3d makes a GLB mesh', () => {
  it('asks for a .glb and never a splat', () => {
    expect(EDGE).toContain('out_path: `${t.folder}/${stamp}.glb`');
    expect(EDGE).not.toMatch(/\.spz|\.ply|'spz'|'ply'/);
    expect(EDGE).toContain("format: 'glb'");
  });

  it('sends the object mask and a noun, so the model never guesses which object', () => {
    expect(EDGE).toContain('mask_path: maskPath, prompt: t.noun');
    expect(EDITOR).toContain('`${tag}-mask`');
    expect(EDITOR).toMatch(/make3d\(\{ floor_plan_object_id: o\.id, \.\.\.\(await cropFromRender\(o\)\)/);
  });

  it('repaints with Gemini only for a finish variant', () => {
    const input = EDGE.slice(EDGE.indexOf('async function modelInput('), EDGE.indexOf('async function generate('));
    const finishBranch = input.slice(input.indexOf('if (t.finish) {'), input.indexOf('if (t.source.path) return'));
    expect(input.match(/generateImageWithGemini\(/g)).toHaveLength(1);
    expect(finishBranch).toContain('generateImageWithGemini(');
    expect(EDGE.match(/generateImageWithGemini\(/g)).toHaveLength(1);
  });

  it('never overwrites a model the supplier uploaded', () => {
    expect(EDGE).toContain("row.source !== 'generated'");
    expect(EDGE).toContain("row?.status === 'ready' && (supplied || isMesh(row.storage_path))");
  });

  it('makes an old splat again instead of serving it as ready', () => {
    expect(EDGE).toContain("obj.model_status === 'ready' && isMesh(obj.model_storage_path)");
    expect(EDGE).toMatch(/model_updated_at\.lt\.\$\{staleBefore\}\),model_status\.eq\.ready`/);
    expect(EDGE).toMatch(/updated_at\.lt\.\$\{staleBefore\}\),status\.eq\.ready`/);
  });
});
