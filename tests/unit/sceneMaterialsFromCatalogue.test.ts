import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => stripComments(readFileSync(join(ROOT, ...p), 'utf8'));
const SLOT = read('src', 'components', 'features', 'scenestudio', 'SlotMaterials.tsx');
const RENDER = read('src', 'components', 'features', 'scenestudio', 'RenderMaterials.tsx');
const SERVICE = read('src', 'services', 'sceneStudioService.ts');
const EDITOR = read('src', 'components', 'features', 'scenestudio', 'SceneEditor.tsx');
const TOOL = read('supabase', 'functions', '_shared', 'tools', 'scene-studio-tools.ts');

describe('3D-room part finishes come from the catalogue', () => {
  it('offers Materials and Colours tabs and no free colour picker', () => {
    expect(SLOT).toContain('<TabsTrigger value="materials"');
    expect(SLOT).toContain('<TabsTrigger value="colours"');
    expect(SLOT).not.toContain('ColourRow');
  });

  it('lists only products in the categories the database says supply that part', () => {
    expect(SLOT).toContain('categoryIds={slotCats[slot] ?? NO_CATEGORIES}');
    expect(SERVICE).toContain("from('scene_slot_categories')");
    expect(SERVICE).toContain("req = req.in('category_id', categoryIds)");
    expect(SERVICE).toMatch(/if \(categoryIds && !categoryIds\.length\) return \[\];/);
  });

  it('offers colours only from the chosen product', () => {
    const colours = SLOT.slice(SLOT.indexOf('<TabsContent value="colours"'));
    expect(colours).toContain('colourOptions(product).map(');
  });

  it('never prints a colour code as the material', () => {
    expect(RENDER).not.toMatch(/what: [^,]*\.hex/);
    expect(RENDER).not.toMatch(/what: o\.colour_hex/);
    expect(SLOT).not.toMatch(/finish\?\.hex \? finish\.hex/);
  });

  it('paints walls, floors and ceilings only with catalogue surfaces', () => {
    expect(EDITOR).not.toContain('ColourRow');
    expect(EDITOR).toContain('categoryIds={surfaceCats}');
    expect(EDITOR).toContain('setSurfaceCats(c.surface ?? [])');
  });

  it('the agent finishes with a catalogue product and only its own colourways', () => {
    expect(TOOL).toMatch(/if \(!product\) return JSON\.stringify\(\{ success: false/);
    expect(TOOL).toContain('is not sold in ${colour}');
  });

  it('the agent opens a 3D room by its name', () => {
    expect(TOOL).toContain("if (!scene_id && name?.trim() && action !== 'create')");
    expect(TOOL).toContain('More than one 3D room matches');
  });
});
