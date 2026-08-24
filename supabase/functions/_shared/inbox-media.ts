/**
 * Inbound channel media: pulling it out of the provider and into our own storage.
 *
 * Shared because TWO callers need it and a second copy is how they drift:
 *   - zernio-webhook-handler, when a media message arrives live;
 *   - messaging-api `repair-attachments`, for rows filed before this path existed, which hold a
 *     provider link the browser cannot load and are stuck that way permanently otherwise.
 */
import { fetchZernioMediaUrl } from './zernio.ts';
import { fetchImageGuardedOrNull } from './fetch-image.ts';

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


/**
 * Store a counterparty's profile picture on their thread.
 *
 * Shared for the same reason as the media download above: TWO callers reach it — the webhook,
 * when a live payload happens to carry `conversation.participantPicture`, and messaging-api's
 * `sync-avatars`, which is the one that actually gets them.
 *
 * The picture is DOWNLOADED, never linked. A platform CDN url expires, and the api-hosted ones
 * need our bearer key, so a stored link renders as a broken square in the browser — the same
 * reason inbound media is pulled rather than referenced.
 *
 * Returns whether an image was actually stored, so a caller can report a real count instead of
 * assuming its own success.
 */
export async function storeParticipantPicture(
  supabase: any,
  threadId: string,
  pictureUrl: string,
  name: string,
): Promise<boolean> {
  try {
    const img = await fetchImageGuardedOrNull(pictureUrl);
    let avatarPath: string | null = null;
    if (img) {
      const path = `inbox/${threadId}/profile/${crypto.randomUUID()}${extensionFor(img.mimeType) || '.jpg'}`;
      const { error } = await supabase.storage
        .from(INBOX_ATTACHMENT_BUCKET)
        .upload(path, img.bytes, { contentType: img.mimeType, upsert: true });
      if (error) console.warn('[inbox-media] participant picture upload failed:', error.message);
      else avatarPath = path;
    }
    // MERGE, not assign: `wa_profile` also carries the display name, and a whole-column write
    // would drop it. PostgREST `.update({metadata})` replaces the column outright.
    const { data: row } = await supabase
      .from('inbox_threads').select('metadata').eq('id', threadId).maybeSingle();
    const known = ((row?.metadata as Record<string, unknown> | undefined)?.wa_profile ?? {}) as Record<string, unknown>;
    await supabase.rpc('inbox_thread_merge_metadata', {
      p_thread_id: threadId,
      p_patch: {
        wa_profile: {
          ...known,
          name: name || (known.name as string | undefined) || null,
          // Kept so the next pass can tell "same picture" from "they changed it" without
          // downloading anything. Cleared bytes with a live source would re-download forever.
          avatar_source: avatarPath ? pictureUrl : null,
          avatar_bucket: avatarPath ? INBOX_ATTACHMENT_BUCKET : null,
          avatar_path: avatarPath,
        },
        wa_profile_checked_at: new Date().toISOString(),
        wa_profile_found: true,
      },
    });
    return avatarPath !== null;
  } catch (err) {
    console.warn('[inbox-media] participant picture failed:', err instanceof Error ? err.message : String(err));
    return false;
  }
}


/**
 * OUR OWN number's WhatsApp Business photo — the one customers see beside our messages.
 *
 * Separate from `storeParticipantPicture` because it is a different question with a different
 * endpoint: a business profile, not a conversation participant. Confusing the two is what made me
 * tell the operator their photo was unavailable — a counterparty's genuinely is withheld by Meta
 * unless the contact allows it, ours never was.
 *
 * Shared because BOTH `sync-channels` (which runs on connect) and `sync-avatars` need it, and one
 * copy of "download the profile photo into storage" is the rule the media path already learned.
 *
 * Returns the config fragment to merge, so the caller decides how it is written — `sync-channels`
 * folds it into the larger channel update it is already making, `sync-avatars` writes it alone.
 * `profile: null` means the lookup failed; a profile with `avatar_path: null` means the number
 * simply has no photo set, which is a different answer and only one of them is ours to fix.
 */
export async function fetchOwnBusinessAvatar(
  supabase: any,
  accountId: string,
  knownCfg: Record<string, unknown>,
  zernioApiFn: (method: string, path: string) => Promise<any>,
): Promise<{
  profile: Record<string, unknown> | null;
  fragment: Record<string, unknown>;
  error: string | null;
}> {
  let profile: Record<string, unknown> | null = null;
  try {
    const bp = await zernioApiFn('GET', `/whatsapp/business-profile?accountId=${encodeURIComponent(accountId)}`);
    profile = (bp?.businessProfile ?? bp?.data ?? null) as Record<string, unknown> | null;
  } catch (err) {
    // Enrichment. A transient failure must never fail the sync that keeps the channel connected.
    return { profile: null, fragment: {}, error: err instanceof Error ? err.message : String(err) };
  }
  if (!profile) return { profile: null, fragment: {}, error: 'no business profile returned' };

  const picUrl = typeof profile.profilePictureUrl === 'string' ? profile.profilePictureUrl : '';
  let avatarPath = typeof knownCfg.avatar_path === 'string' ? knownCfg.avatar_path : null;
  let error: string | null = null;

  // Meta's CDN link expires, so the BYTES are held rather than the url — the same rule as inbox
  // media. Re-downloaded only when the url changes, since the image at a given url is immutable.
  if (picUrl && (knownCfg.avatar_source !== picUrl || !avatarPath)) {
    const img = await fetchImageGuardedOrNull(picUrl);
    if (img) {
      const path = `inbox/channel/${accountId}/${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(INBOX_ATTACHMENT_BUCKET)
        .upload(path, img.bytes, { contentType: img.mimeType, upsert: true });
      if (upErr) error = upErr.message;
      else avatarPath = path;
    } else {
      error = 'the profile photo could not be downloaded';
    }
  } else if (!picUrl) {
    error = 'no profile picture is set on this WhatsApp Business number';
  }

  return {
    profile,
    fragment: {
      business_profile: profile,
      // Only recorded next to real bytes: a source with no path would read as "already done" and
      // the retry would never happen.
      avatar_source: avatarPath ? picUrl : null,
      avatar_bucket: avatarPath ? INBOX_ATTACHMENT_BUCKET : null,
      avatar_path: avatarPath,
    },
    error,
  };
}
