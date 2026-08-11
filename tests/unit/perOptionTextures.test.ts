/**
 * Per-option material textures (#321 / #260 item 6).
 *
 * The gap this closes: an option value carries `base_color_hex`, `roughness` and `metalness` — three
 * scalars — so a velvet and a linen at the same colour render IDENTICALLY. No amount of tuning
 * numbers fixes that; the difference between two fabrics *is* the weave, which is a texture.
 *
 * Three ways it silently fails, all guarded here:
 *
 *   1. THE OVERRIDE CANNOT CARRY A TEXTURE. If `MaterialOverride` loses `albedoUrl`, the option
 *      still swaps colour and the UI still looks like it worked — it just does nothing visible,
 *      which is the same silent zero as a target name that matches no material.
 *   2. TWO DECLARATIONS OF THE OVERRIDE. The configurator service used to declare its OWN
 *      `MaterialOverride`, so the renderer could learn a field the builder could not produce. One
 *      contract, two copies, free to disagree — the escapeHtml/settlement shape.
 *   3. THE TINT IS LEFT ON. A texture carries its own colour; multiplying a navy tint over a navy
 *      velvet renders navy-times-navy. Switching back to a plain colour has to clear the map, or
 *      the old fabric shows through the new colour.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const OVERRIDES = 'src/components/features/ar/materialOverrides.ts';
const CONFIG_SVC = 'src/services/productConfiguratorService.ts';

describe('an option can carry its own texture', () => {
  it('the override type has a texture field', () => {
    const src = read(OVERRIDES);
    expect(src).toMatch(/albedoUrl\?:/);
    // Repeat matters: one stretched photo across a sofa reads as a print, not a weave.
    expect(src).toMatch(/textureRepeat\?:/);
  });

  it('there is exactly ONE declaration of the override contract', () => {
    // The service re-exports rather than redeclaring. A second `interface MaterialOverride` means
    // the renderer and the builder can drift — one learns a field the other cannot send.
    const svc = read(CONFIG_SVC);
    expect(svc).not.toMatch(/interface MaterialOverride\s*\{/);
    expect(svc).toContain("export type { MaterialOverride }");
  });

  it('the configurator passes per-value textures into the overrides', () => {
    const svc = read(CONFIG_SVC);
    expect(svc).toContain('texturesByValueId');
    expect(svc).toMatch(/albedoUrl:\s*texturesByValueId/);
  });

  it('applying a texture clears the tint, and clearing a texture clears the map', () => {
    const src = read(OVERRIDES);
    const apply = src.slice(src.indexOf('export function applyMaterialOverrides'));
    // Both directions. Missing the first renders navy-times-navy; missing the second leaves the
    // previous fabric visible underneath a plain colour choice.
    expect(apply).toMatch(/if \(!override\.baseColorHex && target\.color\)/);
    expect(apply).toMatch(/target\.map = null/);
  });

  it('textures are cached by URL, not reloaded on every selection change', () => {
    // applyMaterialOverrides runs on each click; without a cache, toggling between two fabrics
    // re-downloads both every time.
    const src = read(OVERRIDES);
    expect(src).toMatch(/textureCache/);
  });
});
