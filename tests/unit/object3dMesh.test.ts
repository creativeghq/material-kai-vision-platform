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

  it('crops each object from the render that shows it most, never just the one on screen', () => {
    const crop = EDITOR.slice(EDITOR.indexOf('const cropFromRender'), EDITOR.indexOf('const make3d'));
    expect(crop).not.toContain('activeRender');
    expect(crop).toMatch(/seen\.reduce\(\(a, b\) => \(b\.area > a\.area \? b : a\)\)/);
    expect(crop).toContain('area: mask.box?.coverage ?? 0');
    expect(crop).toContain('area < MIN_VISIBLE_COVERAGE');
  });

  it('matches an ID-pass colour exactly: a wide tolerance takes the edges of neighbouring objects', () => {
    const compositing = stripComments(readFileSync(join(ROOT, 'src', 'lib', 'scene', 'sceneCompositing.ts'), 'utf8'));
    const tol = Number(/maskForColour\(px\.data, rgb, (\d+)\)/.exec(compositing)?.[1]);
    expect(tol).toBeLessThanOrEqual(8);
  });

  it('repaints with Gemini only for a finish variant', () => {
    const input = EDGE.slice(EDGE.indexOf('async function modelInput('), EDGE.indexOf('async function generate('));
    const finishBranch = input.slice(input.indexOf('if (t.finish) {'), input.indexOf('if (t.source.path) return'));
    expect(input.match(/generateImageWithGemini\(/g)).toHaveLength(1);
    expect(finishBranch).toContain('generateImageWithGemini(');
    expect(EDGE.match(/generateImageWithGemini\(/g)).toHaveLength(1);
  });

  it('never prompts with a product name: a product-only call states what the object is', () => {
    expect(EDGE).not.toMatch(/noun: product\.name/);
    expect(EDGE).toContain('noun: objectNoun(body.object_kind)');
    expect(EDGE).toMatch(/if \(!ready && !processing && !target\.noun\) \{\s*throw new HttpError\(400/);
  });

  it('sizes a product model only from a size a person stated, never an estimate', () => {
    expect(EDGE).toContain("if (link.size_source === 'manual') target.sizeM = statedSize(link.width_mm, link.depth_mm, link.height_mm);");
    expect(EDGE).toContain("size_m: t.kind === 'product' ? t.sizeM ?? null : null,");
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

  it('places a model that already exists for free and charges only for new work', () => {
    const readyAt = EDGE.indexOf("return json({ success: true, status: 'ready', charged: false, credits_used: 0");
    const debitAt = EDGE.indexOf('const debit = await debitExternalServiceCredits(');
    expect(readyAt).toBeGreaterThan(0);
    expect(debitAt).toBeGreaterThan(readyAt);
    expect(EDGE).not.toContain('cached: !!ready');
  });

  it('counts only pieces a saved render actually shows', () => {
    expect(EDITOR).toContain('idPassCoverage(await loadImage(publicUrl(r.id_pass_path!))');
    expect(EDITOR).toContain('const inRender = (o: SceneObject) => !!o.product_id || !!visibleIds?.has(o.id);');
    expect(EDITOR).toMatch(/if \(used === false\) failed\+\+; else credits \+= used;/);
  });

  it('Premium Generation is only ever asked for, priced on its own row, and only for a product', () => {
    expect(EDGE).toContain("const premium = body.quality === 'premium';");
    expect(EDGE).toMatch(/if \(premium && !body\.product_id\) throw new HttpError\(400/);
    expect(EDGE).toContain("const PREMIUM_SERVICE = 'object-3d-premium';");
    expect(EDGE).toContain('premium ? PREMIUM_SERVICE : SERVICE');
    expect(EDGE).toContain('premium: !!t.premium,');
    expect(EDITOR).toContain("onClick={() => void make3d(o, false, true)}");
    expect(EDITOR).toMatch(/const make3d = async \(o: SceneObject, quiet = false, premium = false\)/);
    expect(EDITOR).not.toMatch(/\(1[05] credits\)/);
  });

  it('Premium remakes a standard model, and a refused Premium keeps the model it would have replaced', () => {
    expect(EDGE).toContain('const upgrade = premium && row?.generator !== PREMIUM_GENERATOR;');
    expect(EDGE).toContain("(supplied || isMesh(row.storage_path)) && !upgrade) ready = row.storage_path;");
    const failed = EDGE.slice(EDGE.indexOf('async function markFailed('), EDGE.indexOf('async function readSource('));
    expect(failed.indexOf('if (t.previousPath)')).toBeLessThan(failed.indexOf("status: 'failed'"));
    expect(EDGE).toContain('previous_path: t.previousPath ?? null,');
  });

  it('a finish shot on white is selected by its foreground, not by the noun', () => {
    expect(EDGE).toContain('return { imagePath: path, maskPath: null, cleanBackground: true };');
    expect(EDGE).toContain('clean_background: !!cleanBackground,');
  });
});
