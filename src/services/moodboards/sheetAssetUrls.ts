import { supabase } from '@/integrations/supabase/client';

import {
  SHEET_ASSET_BUCKET,
  SHEET_ASSET_SCHEME,
  collectSheetImages,
  isSheetAssetRef,
  mapSheetImages,
  sheetAssetPath,
} from './sheetAssetRefs';

/**
 * Turn a sheet's stored image refs into URLs a browser can load, and back again (#392).
 *
 * RESOLVE AT THE BOUNDARY, NOT PER `<img>`. About thirty render sites across seven canvas
 * components read `data.hero_image_url`, `item.image_url`, `chip.image_url` and friends. They all
 * keep working untouched because `moodboardSheetsService.list/get/createSheet` hand them a payload
 * whose image values are already signed URLs, and `update` folds them back before the write.
 *
 * THE FOLD-BACK IS THE PART THAT MATTERS. A canvas loads a sheet, moves a chip, saves the whole
 * `data` object back. Without `toSheetAssetRefs` that write would replace every ref with the
 * one-hour signed URL it was rendered with — the sheet would look fine all afternoon and be a
 * page of dead images tomorrow, with nothing to point at as the moment it broke.
 */

/** How long a rendered sheet's images stay loadable. Long enough to draw on, short enough to revoke. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * `sheet-asset://<path>` → a signed URL. Anything else is returned untouched: a legacy sheet
 * created before snapshotting still holds absolute URLs, and those render exactly as they did.
 *
 * A ref that cannot be signed is left AS THE REF rather than blanked. It renders as a broken
 * image, which is visible and reportable; a silently emptied `image_url` looks like a sheet the
 * designer never finished.
 */
export async function resolveSheetAssets<T>(data: T): Promise<T> {
  const refs = collectSheetImages(data).filter(isSheetAssetRef);
  if (refs.length === 0) return data;

  const paths = refs.map((r) => sheetAssetPath(r)!).filter(Boolean);
  const { data: signed, error } = await supabase.storage
    .from(SHEET_ASSET_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  if (error || !signed) {
    console.warn('[sheet-assets] could not sign sheet images:', error?.message);
    return data;
  }

  // `createSignedUrls` reports per-path failures inline (`error` on the entry), so one missing
  // object does not cost the whole sheet its images.
  const byRef = new Map<string, string>();
  for (const entry of signed) {
    if (entry.signedUrl && !entry.error && entry.path) {
      byRef.set(`${SHEET_ASSET_SCHEME}${entry.path}`, entry.signedUrl);
    }
  }
  return mapSheetImages(data, (value) => byRef.get(value) ?? value) as T;
}

/**
 * The inverse: a signed URL for our own bucket → the ref it came from.
 *
 * Structural rather than remembered — the path is inside the URL, so this works on a payload that
 * arrived from anywhere (a different tab, a page reload, a canvas that cloned an item) instead of
 * only on one this module resolved.
 */
const SIGNED_PATH = new RegExp(
  `/storage/v1/object/(?:sign|public|authenticated)/${SHEET_ASSET_BUCKET}/([^?]+)`,
);

export function toSheetAssetRefs<T>(data: T): T {
  return mapSheetImages(data, (value) => {
    const m = SIGNED_PATH.exec(value);
    if (!m) return value;
    const path = m[1].split('/').map((seg) => decodeURIComponent(seg)).join('/');
    return `${SHEET_ASSET_SCHEME}${path}`;
  }) as T;
}
