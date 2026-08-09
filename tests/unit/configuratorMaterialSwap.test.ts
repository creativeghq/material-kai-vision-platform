/**
 * Guard for the configurator's material swap (#321 M2, #260 Phase 1).
 *
 * Two failure modes here are invisible to every other check, and both produce a *valid* render:
 *
 * 1. **Cache contamination.** `useGLTF` caches the parsed glTF by URL, and `Object3D.clone()`
 *    copies the node tree while keeping material references SHARED. Recolour "the model" in a
 *    configurator and you have recoloured the cached original — so the AR preview, a second
 *    configurator on the page, and the next component to hit that cache all quietly render the
 *    last person's fabric choice. Nothing throws. The screenshot just looks wrong to someone else.
 *
 * 2. **A target name that matches nothing.** An author types `Fabric` where the glTF material is
 *    `Fabric_Navy`; the option renders, is selectable, is priced, and changes nothing at all. That
 *    is the silent-zero shape, in the visual layer.
 *
 * So this parses the REAL fixture with the same GLTFLoader drei uses and drives the exported
 * functions the component calls — not a copy of the logic.
 *
 * Fixture note: armchair.glb has 8 meshes over exactly 3 materials (`Walnut` on four legs,
 * `Oak_Frame`, `Fabric_Navy` on seat/back/armrests). That ratio is the point — one choice must
 * repaint all four legs, and the hit count must report 1 material, not 4 meshes.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Color, type Group, type Mesh, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  applyMaterialOverrides, cloneSceneWithOwnMaterials, unmatchedTargets, listMaterialNames,
} from '@/components/features/ar/materialOverrides';

const FIXTURE = path.resolve(__dirname, '../fixtures/armchair.glb');

async function loadScene(): Promise<Group> {
  const buf = readFileSync(FIXTURE);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const gltf = await new Promise<any>((resolve, reject) =>
    new GLTFLoader().parse(ab, '', resolve, reject),
  );
  return gltf.scene as Group;
}

function materialsByName(root: Group | any): Map<string, Material[]> {
  const out = new Map<string, Material[]>();
  root.traverse((node: any) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) {
      const arr = out.get(m.name) ?? [];
      arr.push(m);
      out.set(m.name, arr);
    }
  });
  return out;
}

let original: Group;

beforeEach(async () => {
  original = await loadScene();
});

describe('the fixture has the shape the configurator assumes', () => {
  it('carries the three named materials, with Walnut shared across the four legs', () => {
    const byName = materialsByName(original);
    expect([...byName.keys()].sort()).toEqual(['Fabric_Navy', 'Oak_Frame', 'Walnut']);
    // Four leg meshes, one material instance between them.
    expect(byName.get('Walnut')!.length).toBe(4);
    expect(new Set(byName.get('Walnut')!).size).toBe(1);
  });
});

describe('listMaterialNames feeds the option editor its target picker', () => {
  it('returns the model\'s own material names, deduped and sorted', () => {
    // The four legs share one Walnut material — the picker must offer it once, not four times.
    expect(listMaterialNames(original)).toEqual(['Fabric_Navy', 'Oak_Frame', 'Walnut']);
  });

  it('offers exactly the names an override must match, so a picked target can never miss', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const hits = applyMaterialOverrides(
      clone,
      listMaterialNames(original).map((n) => ({ targetMaterialName: n, baseColorHex: '#123456' })),
    );
    expect(unmatchedTargets(hits)).toEqual([]);
  });
});

describe('the three.js behaviour this design exists to work around', () => {
  /**
   * Proves the guard above is not vacuous. If `Object3D.clone()` deep-copied materials, the whole
   * `cloneSceneWithOwnMaterials` layer would be dead weight and its test would pass for the wrong
   * reason. It does not: the node tree is copied, the materials are shared by reference — so the
   * naive implementation leaks a configurator's choices into the cached model.
   */
  it('a plain clone() SHARES materials, so writing through it mutates the original', () => {
    const naive = original.clone(true);
    const sharedInClone = materialsByName(naive).get('Fabric_Navy')![0] as any;
    const inOriginal = materialsByName(original).get('Fabric_Navy')![0] as any;

    expect(sharedInClone, 'three still shares material refs across clone()').toBe(inOriginal);

    sharedInClone.color.setStyle('#FF0000');
    expect(inOriginal.color.getHex(), 'the cached original was mutated through the clone')
      .toBe(new Color().setStyle('#FF0000').getHex());
  });
});

describe('cloneSceneWithOwnMaterials isolates the instance from the cache', () => {
  it('gives the clone different material objects than the loaded scene', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const before = materialsByName(original);
    const after = materialsByName(clone);
    for (const name of before.keys()) {
      expect(after.get(name)![0], `${name} must not be the cached instance`)
        .not.toBe(before.get(name)![0]);
    }
  });

  it('preserves material names — they are how an override finds its target', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    expect([...materialsByName(clone).keys()].sort()).toEqual(['Fabric_Navy', 'Oak_Frame', 'Walnut']);
  });

  it('keeps ONE clone per source material, so four legs still share one Walnut', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const walnut = materialsByName(clone).get('Walnut')!;
    expect(walnut.length).toBe(4);
    expect(new Set(walnut).size).toBe(1);
  });

  // The whole reason this function exists.
  it('recolouring the clone leaves the cached original untouched', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const originalHex = (materialsByName(original).get('Fabric_Navy')![0] as any).color.getHex();

    applyMaterialOverrides(clone, [{ targetMaterialName: 'Fabric_Navy', baseColorHex: '#1E5945' }]);

    expect((materialsByName(original).get('Fabric_Navy')![0] as any).color.getHex())
      .toBe(originalHex);
    expect((materialsByName(clone).get('Fabric_Navy')![0] as any).color.getHex())
      .not.toBe(originalHex);
  });
});

describe('applyMaterialOverrides', () => {
  it('applies the colour to every mesh sharing the target material', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    applyMaterialOverrides(clone, [{ targetMaterialName: 'Walnut', baseColorHex: '#112233' }]);
    const expected = new Color().setStyle('#112233').getHex();
    for (const m of materialsByName(clone).get('Walnut')!) {
      expect((m as any).color.getHex()).toBe(expected);
    }
  });

  it('reports one hit per MATERIAL, not per mesh', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const hits = applyMaterialOverrides(clone, [{ targetMaterialName: 'Walnut', baseColorHex: '#112233' }]);
    // Four leg meshes share one Walnut material — a count of 4 would make a real miss harder to see.
    expect(hits.Walnut).toBe(1);
  });

  it('leaves unset properties alone rather than resetting them to a default', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const before = (materialsByName(clone).get('Fabric_Navy')![0] as any).roughness;
    applyMaterialOverrides(clone, [{ targetMaterialName: 'Fabric_Navy', baseColorHex: '#1E5945' }]);
    expect((materialsByName(clone).get('Fabric_Navy')![0] as any).roughness).toBe(before);
  });

  it('writes roughness and metalness when the option sets them', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    applyMaterialOverrides(clone, [
      { targetMaterialName: 'Oak_Frame', roughness: 0.2, metalness: 0.8 },
    ]);
    const m = materialsByName(clone).get('Oak_Frame')![0] as any;
    expect(m.roughness).toBe(0.2);
    expect(m.metalness).toBe(0.8);
  });

  it('touches nothing a target does not name', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const oakBefore = (materialsByName(clone).get('Oak_Frame')![0] as any).color.getHex();
    applyMaterialOverrides(clone, [{ targetMaterialName: 'Walnut', baseColorHex: '#112233' }]);
    expect((materialsByName(clone).get('Oak_Frame')![0] as any).color.getHex()).toBe(oakBefore);
  });

  // The silent-zero case: an option that is selectable and priced but changes nothing.
  it('reports a target that matches no material instead of silently doing nothing', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const hits = applyMaterialOverrides(clone, [
      { targetMaterialName: 'Fabric', baseColorHex: '#1E5945' },   // typo: real name is Fabric_Navy
      { targetMaterialName: 'Walnut', baseColorHex: '#112233' },
    ]);
    expect(hits.Fabric).toBe(0);
    expect(hits.Walnut).toBe(1);
    expect(unmatchedTargets(hits)).toEqual(['Fabric']);
  });

  it('is a no-op for an empty override list', () => {
    const clone = cloneSceneWithOwnMaterials(original);
    const before = (materialsByName(clone).get('Fabric_Navy')![0] as any).color.getHex();
    expect(applyMaterialOverrides(clone, [])).toEqual({});
    expect((materialsByName(clone).get('Fabric_Navy')![0] as any).color.getHex()).toBe(before);
  });
});
