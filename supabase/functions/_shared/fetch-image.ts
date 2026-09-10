// The one way an edge function fetches an image from a URL.

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

export interface FetchBinaryOptions {
  maxBytes?: number;
  allowSchemes?: string[];
  /** Require the content-type to start with this when the server sends one.
   *  Omit to accept anything. */
  contentTypePrefix?: string;
  timeoutMs?: number;
  /** Extra request headers — an Authorization bearer, in practice. */
  headers?: Record<string, string>;
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
  const { bytes, mimeType } = await fetchBinaryGuarded(url, {
    maxBytes: opts.maxBytes,
    allowSchemes: opts.allowSchemes,
    timeoutMs: opts.timeoutMs,
    contentTypePrefix: opts.requireImageContentType === false ? undefined : 'image/',
  });
  if (bytes.length === 0) throw new Error('Image fetch returned no bytes');
  return { bytes, mimeType: mimeType || 'image/jpeg' };
}

/** The same guard for a non-image body — a generated VIDEO, mainly. */
export async function fetchBinaryGuarded(
  url: string,
  opts: FetchBinaryOptions = {},
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const safeUrl = await assertSafeUrl(url, {
    allowSchemes: opts.allowSchemes ?? ['https:'],
  });

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(safeUrl, {
      redirect: 'error',
      signal: ctl.signal,
      ...(opts.headers ? { headers: opts.headers } : {}),
    });
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`Fetch failed: HTTP ${res.status}`);
    }

    const mimeType = res.headers.get('content-type')?.split(';')[0].trim() || '';
    if (opts.contentTypePrefix && mimeType && !mimeType.startsWith(opts.contentTypePrefix)) {
      await res.body?.cancel();
      throw new Error(`Unexpected content-type ${mimeType} (wanted ${opts.contentTypePrefix}*)`);
    }

    // Content-Length is a CLAIM. Reject an oversized claim early as a courtesy,
    // then enforce the real limit against the bytes actually delivered — an absent
    // or lying header must not be able to skip the check.
    const claimed = Number(res.headers.get('content-length') ?? NaN);
    if (Number.isFinite(claimed) && claimed > maxBytes) {
      await res.body?.cancel();
      throw new Error(`Response too large: ${claimed} bytes > ${maxBytes}`);
    }

    return { bytes: await readCapped(res, maxBytes), mimeType };
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a TEXT body — an HTML page, for a link preview — re-guarding every redirect hop. */
export async function fetchTextGuarded(
  url: string,
  opts: {
    maxBytes?: number;
    timeoutMs?: number;
    maxRedirects?: number;
    contentTypePrefix?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<{ text: string; finalUrl: string; mimeType: string }> {
  const maxBytes = opts.maxBytes ?? 256 * 1024;
  const maxRedirects = opts.maxRedirects ?? 4;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 10_000);
  try {
    let current = await assertSafeUrl(url, { allowSchemes: ['https:'] });
    for (let hop = 0; ; hop++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: ctl.signal,
        ...(opts.headers ? { headers: opts.headers } : {}),
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        await res.body?.cancel();
        if (!location) throw new Error(`HTTP ${res.status} with no Location`);
        if (hop >= maxRedirects) throw new Error(`Too many redirects (> ${maxRedirects})`);
        // Resolved against the hop it came from — a bare `/en/page` is the common form — and
        // then re-validated. Resolving without re-validating is the bypass itself.
        current = await assertSafeUrl(new URL(location, current).toString(), {
          allowSchemes: ['https:'],
        });
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`Fetch failed: HTTP ${res.status}`);
      }
      const mimeType = res.headers.get('content-type')?.split(';')[0].trim() || '';
      if (opts.contentTypePrefix && mimeType && !mimeType.startsWith(opts.contentTypePrefix)) {
        await res.body?.cancel();
        throw new Error(`Unexpected content-type ${mimeType} (wanted ${opts.contentTypePrefix}*)`);
      }
      // Capped while streaming, exactly as the binary path is: a page that keeps sending is
      // stopped at the ceiling rather than after it.
      const bytes = await readCapped(res, maxBytes);
      return { text: new TextDecoder('utf-8').decode(bytes), finalUrl: current, mimeType };
    }
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
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
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
