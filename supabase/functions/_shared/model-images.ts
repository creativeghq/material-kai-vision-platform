import { fetchImageGuarded } from './fetch-image.ts';
import { getOptimizedImageUrl } from './imageUrl.generated.ts';

/** Anthropic downscales past ~1568px on the long edge anyway, so sending more is pure cost. */
const MODEL_IMAGE_WIDTH = 1568;
const MODEL_IMAGE_QUALITY = 82;
const MAX_INLINE_BYTES = 3.5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Read `url` ourselves and return it as a `data:` URL.
 *
 * Passing an https URL makes the PROVIDER fetch it, and a 2.8MB PNG our own storage serves in
 * 0.3s timed their fetcher out after 45s. Falls back to the URL unchanged, so a failure here
 * can never be worse than the behaviour it replaced.
 */
export async function inlineImageForModel(url: string): Promise<string> {
  if (!url || typeof url !== 'string' || url.startsWith('data:')) return url;

  const smaller = getOptimizedImageUrl(url, {
    width: MODEL_IMAGE_WIDTH,
    quality: MODEL_IMAGE_QUALITY,
    format: 'webp',
  });
  const candidates = smaller && smaller !== url ? [smaller, url] : [url];

  for (const candidate of candidates) {
    try {
      const { bytes, mimeType } = await fetchImageGuarded(candidate, {
        maxBytes: MAX_INLINE_BYTES,
        timeoutMs: FETCH_TIMEOUT_MS,
      });
      return `data:${mimeType};base64,${toBase64(bytes)}`;
    } catch (err) {
      console.warn(`[model-images] could not inline ${candidate}: ${err}`);
    }
  }
  return url;
}

export async function inlineImagesForModel(urls: readonly string[]): Promise<string[]> {
  if (!Array.isArray(urls) || urls.length === 0) return [];
  return await Promise.all(urls.map((u) => inlineImageForModel(u)));
}
