/** A presentation sheet owns PRIVATE COPIES of the images it shows (#392). */

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
