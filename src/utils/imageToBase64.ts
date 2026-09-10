/**
 * Turn an image URL into raw base64 (no `data:` prefix), for sending to a
 * vision model.
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
