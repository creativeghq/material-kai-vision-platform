// The one way an edge function fetches an image from a URL.
//
// There were five, at three different strengths, and the differences were invisible
// because every one of them returned plausible bytes:
//
//   _shared/pdf/branding.ts        no guard · redirect:'follow' · cap AFTER arrayBuffer · http ok
//   generate-moodboard-.../layout  no guard · follows redirects · no cap
//   generate-virtual-staging       no guard · follows redirects · no cap
//   generate-region-edit           guarded  · redirect:'error'  · no cap
//   generate-interior-gemini       guarded  · redirect:'error'  · no cap
//
// The first three are invariant 7 violations (audit #352 `A8`): a model- or
// user-supplied `image_url` is fetched server-side with no SSRF guard, and
// `redirect: 'follow'` means a public URL can 302 to 169.254.169.254 and be
// followed. Discarding the body afterwards does not un-send the request.
//
// The last two were guarded and still unbounded: `await res.arrayBuffer()` on an
// attacker-chosen URL reads whatever the server sends into the isolate's memory.
// A cap consulted after the read is not a cap — that is the same defect MIVAA's
// image_download_service had, where an absent Content-Length skipped the check and
// a malformed one fell through to `pass`.
//
// So the cap here is applied WHILE streaming and aborts the moment it is passed:
// peak memory is bounded by `maxBytes` regardless of what the server claims in its
// headers or actually sends.
//
// Sibling implementation: mivaa-pdf-extractor/app/services/images/image_download_service.py.
// A sixth runtime gets a sixth caller of this, never a sixth copy.

import { assertSafeUrl, SSRFError } from './ssrf-guard.ts';

export { SSRFError };

export interface GuardedImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface FetchImageOptions {
  /** Hard ceiling on bytes read. The read aborts as soon as it is exceeded. */
  maxBytes?: number;
  /** Schemes to permit. Defaults to https only — a bearer-free image fetch still
   *  leaks the URL and the fact of the request over plaintext, and every image
   *  source this platform has is https. Pass ['https:', 'http:'] deliberately. */
  allowSchemes?: string[];
  /** Require an `image/*` content-type when the server sends one. */
  requireImageContentType?: boolean;
  timeoutMs?: number;
}

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024; // 8 MB, matching branding.ts's old intent
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * Fetch an image over a validated URL, bounded in size. Throws on anything wrong.
 *
 * Redirects are NOT followed (`redirect: 'error'`). The guard checks the host it
 * was given; a redirect would move the request to a host nothing checked, which is
 * precisely the bypass the guard exists to close. If a caller genuinely needs to
 * follow one, it must re-guard each hop itself.
 */
export async function fetchImageGuarded(
  url: string,
  opts: FetchImageOptions = {},
): Promise<GuardedImage> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const safeUrl = await assertSafeUrl(url, {
    allowSchemes: opts.allowSchemes ?? ['https:'],
  });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(safeUrl, { redirect: 'error', signal: ctl.signal });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Image fetch failed: HTTP ${res.status}`);
    }

    const mimeType = res.headers.get('content-type')?.split(';')[0].trim() || 'image/jpeg';
    if (opts.requireImageContentType !== false && !mimeType.startsWith('image/')) {
      await res.body?.cancel();
      throw new Error(`Not an image: content-type ${mimeType}`);
    }

    // Content-Length is a CLAIM. Reject an oversized claim early as a courtesy,
    // then enforce the real limit against the bytes actually delivered — an absent
    // or lying header must not be able to skip the check.
    const claimed = Number(res.headers.get('content-length') ?? NaN);
    if (Number.isFinite(claimed) && claimed > maxBytes) {
      await res.body?.cancel();
      throw new Error(`Image too large: ${claimed} bytes > ${maxBytes}`);
    }

    const bytes = await readCapped(res, maxBytes);
    if (bytes.length === 0) throw new Error('Image fetch returned no bytes');
    return { bytes, mimeType };
  } finally {
    clearTimeout(timer);
  }
}

/** `fetchImageGuarded`, but null instead of throwing — for the render paths where
 *  one missing image must not abandon a whole PDF. The failure is logged, never
 *  silent: a chip that renders blank because the URL was blocked and a chip that
 *  renders blank because the file is gone need different fixes. */
export async function fetchImageGuardedOrNull(
  url: string | null | undefined,
  opts: FetchImageOptions = {},
): Promise<GuardedImage | null> {
  if (!url) return null;
  try {
    return await fetchImageGuarded(url, opts);
  } catch (err) {
    const why = err instanceof SSRFError ? 'blocked by the SSRF guard' : String(err);
    console.warn(`[fetch-image] ${url} → ${why}`);
    return null;
  }
}

/** Read the body, aborting the moment it exceeds `maxBytes`. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) {
    // No stream to meter (some runtimes/mocks). Fall back to a buffered read and
    // check after — still bounded in practice by the Content-Length check above.
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error(`Image too large: > ${maxBytes} bytes`);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`Image too large: > ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
