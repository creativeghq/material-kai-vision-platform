/**
 * Applying configurator choices to a loaded glTF (#321 M2, #260 Phase 1).
 *
 * React-free on purpose, like `modelTransform.ts` — the in-app configurator uses it today and the
 * #258 embed bundle can use the same function rather than a second copy.
 *
 * TWO THINGS HERE ARE LOAD-BEARING.
 *
 * 1. **We never touch the loaded materials.** `useGLTF` caches by URL, and `Object3D.clone()`
 *    copies the node tree but keeps material references SHARED. So recolouring "the model" in a
 *    configurator would recolour the cached original, and every other view of that product — the
 *    AR preview, a second configurator on the same page, the next visitor to reuse the cache —
 *    would silently inherit it. `cloneSceneWithOwnMaterials` gives this instance its own copies
 *    first, so a swap can never escape the component that made it.
 *
 * 2. **A target name that matches nothing is reported, not ignored.** An author who types
 *    `Fabric` when the glTF material is `Fabric_Navy` gets an option that changes nothing, with no
 *    error anywhere — the exact silent-zero shape this codebase keeps rediscovering. `applyMaterialOverrides`
 *    returns per-target hit counts so the UI can say "this option matches no material in the model".
 */
import {
  Color, RepeatWrapping, SRGBColorSpace, TextureLoader,
  type Material, type Mesh, type Object3D, type Texture,
} from 'three';

export interface MaterialOverride {
  /** glTF material name, e.g. `Fabric_Navy`. The material is the swap unit, not the mesh. */
  targetMaterialName: string;
  baseColorHex?: string | null;
  roughness?: number | null;
  metalness?: number | null;
  /**
   * A derived tileable texture for this option (#321).
   *
   * This is what makes a velvet and a linen at the same colour look different. Without it an
   * option can only move three scalars, and two fabrics with the same hue render identically —
   * which is the gap #260 item 6 named.
   */
  albedoUrl?: string | null;
  /** How many times the texture repeats across the material. Fabric weave is small; a tile is not. */
  textureRepeat?: number | null;
}

/**
 * Textures are cached by URL for the lifetime of the page.
 *
 * Loading is async and `applyMaterialOverrides` is called on every selection change, so without a
 * cache switching back and forth re-downloads the same image each time. Keyed by URL, never by
 * material — the same texture legitimately dresses several materials.
 */
const textureCache = new Map<string, Texture>();
const textureLoader = new TextureLoader();

function loadTexture(url: string, repeat: number): Texture {
  const cached = textureCache.get(url);
  if (cached) return cached;
  const tex = textureLoader.load(url);
  // sRGB, because it is a colour image. Left in linear space it renders washed out — the same
  // colour-space trap the fixture generator hit from the other direction.
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  textureCache.set(url, tex);
  return tex;
}

/** How many mesh materials each target actually matched. Zero means the name is wrong. */
export type OverrideHits = Record<string, number>;

interface Standardish extends Material {
  color?: Color;
  roughness?: number;
  metalness?: number;
  map?: Texture | null;
}

/**
 * Deep-clone a loaded scene AND give it private copies of every material it uses.
 *
 * Materials are cloned once per source material, not once per mesh, so the armchair's four legs
 * keep sharing one `Walnut` clone and a single override still recolours all of them.
 */
export function cloneSceneWithOwnMaterials(scene: Object3D): Object3D {
  const root = scene.clone(true);
  const clones = new Map<Material, Material>();

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const swap = (m: Material): Material => {
      const existing = clones.get(m);
      if (existing) return existing;
      const copy = m.clone();
      // three drops the name on clone in some versions; the name is how we find it again.
      copy.name = m.name;
      clones.set(m, copy);
      return copy;
    };

    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(swap)
      : swap(mesh.material);
  });

  return root;
}

/**
 * Apply overrides by glTF material name. Returns per-target hit counts.
 *
 * Only the properties an option actually sets are written: leaving `roughness` null on a colour
 * choice must keep the model's authored roughness, not reset it to a default that quietly flattens
 * every fabric in the catalog.
 */
export function applyMaterialOverrides(root: Object3D, overrides: MaterialOverride[]): OverrideHits {
  const hits: OverrideHits = {};
  for (const o of overrides) hits[o.targetMaterialName] = 0;
  if (overrides.length === 0) return hits;

  const byName = new Map<string, MaterialOverride>();
  for (const o of overrides) byName.set(o.targetMaterialName, o);

  // One material clone can be shared by several meshes (four legs, one Walnut). Track which
  // materials we have already written so the hit count reports MATERIALS matched, not meshes —
  // otherwise "1 material, 4 legs" reads as 4 and a genuine miss is harder to spot.
  const seen = new Set<Material>();

  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

    for (const material of list) {
      const override = byName.get(material.name);
      if (!override || seen.has(material)) continue;
      seen.add(material);
      hits[override.targetMaterialName] += 1;

      const target = material as Standardish;
      if (override.baseColorHex && target.color) {
        // `setStyle` treats the input as sRGB and converts to the renderer's working space. The
        // fixture generator has to do that conversion by hand because raw glTF `baseColorFactor`
        // is LINEAR with no colour management — here three does it, so a hex from the option row
        // renders as the hex the author picked.
        target.color.setStyle(override.baseColorHex);
      }
      if (override.roughness != null && 'roughness' in target) target.roughness = override.roughness;
      if (override.metalness != null && 'metalness' in target) target.metalness = override.metalness;
      if ('map' in target) {
        if (override.albedoUrl) {
          target.map = loadTexture(override.albedoUrl, override.textureRepeat ?? 1);
          // A texture carries its own colour. Leaving a tint multiplied over it makes a navy
          // velvet render navy-times-navy, so the base colour goes back to white unless the option
          // deliberately asked for a tint.
          if (!override.baseColorHex && target.color) target.color.setStyle('#ffffff');
        } else if (override.baseColorHex) {
          // Switching from a textured option BACK to a plain colour has to clear the texture, or
          // the previous fabric stays visible under the new colour.
          target.map = null;
        }
      }
      target.needsUpdate = true;
    }
  });

  return hits;
}

/** Target names that matched no material — an authoring error worth surfacing. */
export function unmatchedTargets(hits: OverrideHits): string[] {
  return Object.entries(hits).filter(([, n]) => n === 0).map(([name]) => name);
}

/**
 * Every distinct material name in a loaded model, sorted.
 *
 * Feeds the option editor's target picker. Choosing from the model's own names is what stops the
 * typo class at the source — an author who types `Fabric` where the glTF says `Fabric_Navy` gets an
 * option that is selectable, priced, and visually inert. A list beats a warning after the fact.
 */
export function listMaterialNames(root: Object3D): string[] {
  const names = new Set<string>();
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) if (m.name) names.add(m.name);
  });
  return [...names].sort();
}
