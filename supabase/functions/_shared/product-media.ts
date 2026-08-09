/**
 * Reading media out of a product's free-form `metadata` jsonb.
 *
 * `products.metadata` is schema-loose by design — images arrive there from XML imports, PDF
 * ingestion and manual edits, under whichever of half a dozen keys the source used. Every public
 * surface that shows a product (the online storefront, the #321 embed API) has to guess the same
 * way, so the guessing lives once here rather than once per surface.
 */

// deno-lint-ignore-file no-explicit-any

/** First usable image URL in the metadata blob, or null. Best-effort, schema-loose. */
export function imageFromMetadata(meta: any): string | null {
  const all = imagesFromMetadata(meta);
  return all[0] ?? null;
}

/**
 * Every usable image URL in the metadata blob, in source order.
 *
 * The embed viewer wants a gallery, not just a hero shot; the storefront wants the first one.
 * Both come from one traversal so a key added here shows up on both surfaces.
 */
export function imagesFromMetadata(meta: any): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.startsWith('http') && !out.includes(v)) out.push(v);
  };

  for (const key of ['image_url', 'thumbnail_url', 'primary_image', 'image', 'cover_image']) {
    push(meta[key]);
  }
  for (const key of ['images', 'gallery']) {
    const arr = meta[key];
    if (!Array.isArray(arr)) continue;
    for (const entry of arr) {
      if (typeof entry === 'string') push(entry);
      else if (entry && typeof entry === 'object') push((entry as any).url);
    }
  }
  return out;
}
