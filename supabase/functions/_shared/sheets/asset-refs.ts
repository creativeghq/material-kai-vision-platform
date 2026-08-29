/**
 * A presentation sheet owns PRIVATE COPIES of the images it shows (#392).
 *
 * THE PROBLEM. A sheet's layout stored absolute URLs into `generation-images`, a public bucket.
 * Revoking the client-view token therefore revoked nothing: whoever kept a URL kept the image,
 * and anyone who learned the path could construct one. The first remedy proposed — store
 * `{bucket, path}` and resolve at render — changes what sits in the layout and nothing about who
 * can fetch the file, because on a public bucket the resolved URL is the same URL.
 *
 * THE SECOND TRAP, which is why this copies rather than re-points. A sheet's images come from two
 * places: an upload the operator made for this sheet, and an image belonging to a moodboard item
 * (a product photo, a generated render) that the rest of the platform hotlinks from the same
 * public bucket. Moving only the uploads would put the minority of a sheet's assets behind the
 * share boundary and leave the rest exactly where they were — a partial fix that reads like a
 * complete one.
 *
 * So the sheet SNAPSHOTS every image it references, into `sheet-assets/<sheet_id>/`. That buys a
 * second thing worth having on its own: the sheet stops changing when the moodboard does. A sheet
 * handed to a client is a DOCUMENT, and this platform already has that rule written down for the
 * other one — an invoice prints from `counterparty_snapshot`, frozen at issue, precisely so that
 * editing the customer later does not rewrite a document somebody already holds.
 *
 * THE REFERENCE IS A STRING, deliberately. `sheet-asset://<path>` goes exactly where the URL went,
 * so every payload shape, every validator and all ~30 render sites keep working unchanged, and
 * resolution happens at two boundaries instead of thirty (`fetchImageBytes` server-side,
 * `moodboardSheetsService.get/list` client-side).
 */

export {
  SHEET_ASSET_BUCKET,
  SHEET_ASSET_SCHEME,
  isImageKey,
  isSheetAssetRef,
  sheetAssetPath,
} from '../sheetAssetRefs.generated.ts';

// Also imported: a re-export does not bind the names locally.
import { SHEET_ASSET_BUCKET, SHEET_ASSET_SCHEME, mapSheetImages } from '../sheetAssetRefs.generated.ts';

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

/** A stable, collision-free object name for one source URL. */
async function objectName(sourceUrl: string, contentType: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceUrl));
  const hex = [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex}.${EXT_BY_TYPE[contentType] ?? 'bin'}`;
}

export interface SnapshotReport {
  /** Source URL → the ref it became. */
  copied: Record<string, string>;
  /** Source URL → why it could not be copied. */
  failed: Record<string, string>;
}

/**
 * Copy every image the payload references into the sheet's private folder and rewrite the value
 * to a `sheet-asset://` ref.
 *
 * A source that cannot be fetched is LEFT AS IT WAS rather than dropped or blanked. A sheet whose
 * hero image silently vanished because one fetch 404'd is worse than one still pointing at a
 * public URL, and the report says which — the caller decides what to tell the operator.
 *
 * Already-snapshotted refs pass through untouched, so re-running this on an existing payload (an
 * edit, a re-render) is free and idempotent.
 */
export async function snapshotSheetAssets(
  supabase: { storage: { from: (b: string) => any } },
  sheetId: string,
  data: unknown,
  fetchImage: (url: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>,
): Promise<{ data: unknown; report: SnapshotReport }> {
  const report: SnapshotReport = { copied: {}, failed: {} };
  // One fetch per distinct URL even when several keys share it (a hero that is also a chip).
  const seen = new Map<string, string | null>();

  const copyOne = async (url: string): Promise<string | null> => {
    if (seen.has(url)) return seen.get(url)!;
    let ref: string | null = null;
    try {
      const img = await fetchImage(url);
      if (!img) throw new Error('image could not be fetched');
      const name = await objectName(url, img.mimeType);
      const path = `${sheetId}/${name}`;
      const { error } = await supabase.storage.from(SHEET_ASSET_BUCKET).upload(path, img.bytes, {
        contentType: img.mimeType,
        upsert: true,
      });
      if (error) throw new Error(error.message);
      ref = `${SHEET_ASSET_SCHEME}${path}`;
      report.copied[url] = ref;
    } catch (e) {
      report.failed[url] = e instanceof Error ? e.message : String(e);
      ref = null;
    }
    seen.set(url, ref);
    return ref;
  };

  // Two passes rather than one async walk: `mapSheetImages` is the SHARED traversal (the client
  // folds signed URLs back to refs with the same function), and it is synchronous. Collect what
  // needs copying, copy it, then substitute — which also means the fetches are not serialised
  // behind the tree walk.
  const sources = new Set<string>();
  mapSheetImages(data, (value) => {
    if (/^https?:\/\//i.test(value)) sources.add(value);
    return value;
  });
  for (const url of sources) await copyOne(url);

  return { data: mapSheetImages(data, (value) => seen.get(value) ?? value), report };
}
