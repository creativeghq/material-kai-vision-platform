/**
 * Turn an image URL into raw base64 (no `data:` prefix), for sending to a
 * vision model.
 *
 * The reason this is a shared helper rather than four inline copies: the
 * obvious implementation — `fetch(url)` → `blob()` → `readAsDataURL` — does
 * something silly when the URL is ALREADY a data: URI. It issues a network
 * request to re-read bytes the page is holding in memory, decodes them, and
 * re-encodes them to exactly the string it started with.
 *
 * That showed up as a CSP report (`Blocked 'connect' from 'data:'`,
 * `connect-src`) — 800 events across 230 sessions on `/discover`. Nothing was
 * broken for users, because the policy ships as
 * `Content-Security-Policy-Report-Only`; finding this kind of thing before the
 * policy is enforced is exactly what report-only mode is for. Once enforced,
 * `fetch('data:…')` fails outright and every generated image silently loses
 * its segmentation.
 *
 * Generated images are the common case here: Gemini returns base64, so
 * `image.url` is frequently a data: URI rather than a storage link.
 *
 * The fix is not to add `data:` to connect-src. It is to notice we already
 * have the bytes.
 */

/** Strip the `data:<mime>;base64,` prefix from a data URI. */
function base64FromDataUri(dataUri: string): string | null {
  const comma = dataUri.indexOf(',');
  if (comma === -1) return null;
  // Only base64 payloads are usable; a `data:text/plain,hello` URI is not an image.
  if (!/;base64$/i.test(dataUri.slice(0, comma).replace(/^data:[^;,]*/i, ''))) {
    return null;
  }
  const payload = dataUri.slice(comma + 1);
  return payload || null;
}

/**
 * Fetch `url` and return its contents as base64 with no data-URI prefix.
 *
 * A `data:` URL is decoded in place — no request is made. Anything else is
 * fetched, which also sidesteps canvas CORS tainting.
 *
 * @returns base64 text, or null when the image could not be read.
 */
export async function imageUrlToBase64(url: string): Promise<string | null> {
  if (!url) return null;

  if (url.startsWith('data:')) {
    return base64FromDataUri(url);
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        resolve(typeof result === 'string' ? result.split(',')[1] || null : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
