/**
 * How a presentation sheet NAMES an image it owns (#392).
 *
 * A sheet's layout used to store absolute URLs into `generation-images`, a PUBLIC bucket, so
 * revoking the share token revoked nothing: whoever kept a URL kept the image. Sheets now hold a
 * private copy of every image they show, in `sheet-assets/<sheet_id>/`, named by a string ref that
 * goes exactly where the URL went.
 *
 * IMPORT-FREE ON PURPOSE. Both runtimes need these five, and Vite resolves `@/` while Deno
 * resolves by URL — so this is the source and `_shared/sheetAssetRefs.generated.ts` is a byte
 * copy written by `npm run vocab:mirror`. Never hand-edit the mirror, and never add an import
 * here: one makes the copy unbuildable on the other side.
 */

export const SHEET_ASSET_BUCKET = 'sheet-assets';
export const SHEET_ASSET_SCHEME = 'sheet-asset://';

/**
 * Keys whose value is an image the sheet renders.
 *
 * An allowlist by KEY NAME, not "anything that looks like a URL": a sheet payload can also carry
 * a product link or a source page, and copying those into the sheet's folder would be wrong.
 * Every image-bearing key in the builders is `image_url` or `<something>_image_url` —
 * `hero_image_url`, `backdrop_image_url`, `plan_image_url`, `elevation_image_url`,
 * `render_image_url`, `cover_image_url`, and the bare `image_url` on layout items and chips.
 */
export function isImageKey(key: string): boolean {
  return key === 'image_url' || key.endsWith('_image_url');
}

export function isSheetAssetRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(SHEET_ASSET_SCHEME);
}

/** `sheet-asset://<path>` -> `<path>`. Null for anything else. */
export function sheetAssetPath(value: unknown): string | null {
  return isSheetAssetRef(value)
    ? (value as string).slice(SHEET_ASSET_SCHEME.length)
    : null;
}

/**
 * Walk a sheet payload and hand every image value to `map`, rebuilding the payload around what it
 * returns. Returning the value unchanged is how "leave this one alone" is said.
 *
 * Shared because BOTH directions need the identical traversal and they have to agree about which
 * keys are images: the client resolves refs to signed URLs on read and folds them back to refs on
 * write, and a walk that disagreed with itself would quietly persist a signed URL — a link that
 * works for an hour and then does not.
 */
export function mapSheetImages(data: unknown, map: (value: string) => string): unknown {
  const walk = (node: unknown, key?: string): unknown => {
    if (Array.isArray(node)) return node.map((item) => walk(item, key));
    if (node && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = walk(v, k);
      return out;
    }
    if (typeof node === 'string' && key && isImageKey(key)) return map(node);
    return node;
  };
  return walk(data);
}

/** Every distinct image value in a payload, in no particular order. */
export function collectSheetImages(data: unknown): string[] {
  const found = new Set<string>();
  mapSheetImages(data, (value) => {
    found.add(value);
    return value;
  });
  return [...found];
}
