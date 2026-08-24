/**
 * Inbound channel media: pulling it out of the provider and into our own storage.
 *
 * Shared because TWO callers need it and a second copy is how they drift:
 *   - zernio-webhook-handler, when a media message arrives live;
 *   - messaging-api `repair-attachments`, for rows filed before this path existed, which hold a
 *     provider link the browser cannot load and are stuck that way permanently otherwise.
 */
import { fetchZernioMediaUrl } from './zernio.ts';

/** Where inbound files land — the same bucket and prefix inbox-api writes outbound ones to. */
export const INBOX_ATTACHMENT_BUCKET = 'generation-images';

/**
 * Pull inline media URLs into our own storage.
 *
 * The real payload carries `{ url: "https://zernio.com/api/v1/whatsapp/media/…", content_type:
 * "image" }`. Keeping that url is useless twice over: it needs the API bearer key, so the browser
 * gets a broken image, and it is the vendor's to expire. Both are fixed by holding the bytes.
 */
export async function materialiseInlineAttachments(
  supabase: any,
  threadId: string,
  atts: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const [i, a] of atts.entries()) {
    const url = typeof a.url === 'string' ? a.url : '';
    // Already ours (a previous run stored it) or nothing to fetch — pass through untouched.
    if (!url || a.storage_object_path) { out.push(a); continue; }

    const got = await fetchZernioMediaUrl(url);
    if (!got || !got.bytes.byteLength) {
      // Keep the entry so the message still shows SOMETHING was sent, and mark why it is not
      // openable — a silently dropped attachment is the failure this whole path exists to end.
      out.push({ ...a, fetch_failed: true });
      continue;
    }

    // Prefer the server's content type over the payload's: the payload says "image", the response
    // says "image/jpeg", and only one of those tells a browser what to do.
    const contentType = got.contentType && got.contentType !== 'application/octet-stream'
      ? got.contentType
      : normalizeMediaType(String(a.content_type ?? ''));
    const ext = extensionFor(contentType, got.fileName);
    const base = got.fileName || (typeof a.name === 'string' && a.name ? a.name : `attachment-${i + 1}${ext}`);
    const safeName = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `inbox/${threadId}/${crypto.randomUUID()}-${safeName}`;

    const { error } = await supabase.storage
      .from(INBOX_ATTACHMENT_BUCKET)
      .upload(path, got.bytes, { contentType, upsert: false });
    if (error) {
      console.error('[zernio-webhook] inline attachment upload failed:', error.message);
      out.push({ ...a, fetch_failed: true });
      continue;
    }

    out.push({
      storage_bucket: INBOX_ATTACHMENT_BUCKET,
      storage_object_path: path,
      name: base,
      content_type: contentType,
      size: got.bytes.byteLength,
    });
  }
  return out;
}

/**
 * `"image"` is not a MIME type, and `startsWith('image/')` says so.
 *
 * The payload's `content_type` is a bare family — image, video, audio, document, sticker. Every
 * renderer in this codebase tests `startsWith('image/')`, so a bare `"image"` fell through to the
 * generic-file branch and the operator got a paperclip labelled "attachment" instead of a photo.
 */
export function normalizeMediaType(raw: string): string {
  const t = raw.trim().toLowerCase();
  if (!t) return 'application/octet-stream';
  if (t.includes('/')) return t;                    // already a MIME type
  const family: Record<string, string> = {
    image: 'image/jpeg',
    photo: 'image/jpeg',
    sticker: 'image/webp',
    video: 'video/mp4',
    audio: 'audio/ogg',
    voice: 'audio/ogg',
    ptt: 'audio/ogg',
    document: 'application/pdf',
    file: 'application/octet-stream',
  };
  return family[t] ?? 'application/octet-stream';
}

/** A file extension for a name that has none, so the browser and our renderer both know what it is. */
export function extensionFor(contentType: string, fileName?: string): string {
  if (fileName && /\.[a-z0-9]{2,5}$/i.test(fileName)) return '';
  const ct = contentType.split(';')[0].trim().toLowerCase();
  const map: Record<string, string> = {
    'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
    'image/webp': '.webp', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'text/vcard': '.vcf',
    'application/msword': '.doc', 'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };
  return map[ct] ?? '';
}

