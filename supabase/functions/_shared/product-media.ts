/**
 * Product images for public surfaces. PDF ingestion links images through
 * `image_product_associations` → `document_images.image_url` (public `pdf-tiles`); XML imports and
 * manual edits put URLs in `products.metadata`. Associations come first, metadata is the fallback.
 */

// deno-lint-ignore-file no-explicit-any

/** First usable image URL in the metadata blob, or null. Best-effort, schema-loose. */
export function imageFromMetadata(meta: any): string | null {
  const all = imagesFromMetadata(meta);
  return all[0] ?? null;
}

/** Every usable image URL in the metadata blob, in source order. */
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

export interface AssociatedImage {
  url: string;
  variant_key: string | null;
}

const ID_CHUNK = 200;

/** Associated images per product, best score first. Throws on a read error — never an empty map. */
export async function associatedImagesByProduct(
  supabase: { from: (t: string) => any },
  productIds: readonly string[],
): Promise<Map<string, AssociatedImage[]>> {
  const out = new Map<string, AssociatedImage[]>();
  const ids = [...new Set(productIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await supabase.from('image_product_associations')
      .select('product_id, variant_key, overall_score, image:document_images(image_url)')
      .in('product_id', ids.slice(i, i + ID_CHUNK))
      .order('overall_score', { ascending: false, nullsFirst: false });
    if (error) throw new Error(`image_product_associations read failed: ${error.message}`);
    for (const row of (data ?? []) as any[]) {
      const url = row.image?.image_url;
      if (typeof url !== 'string' || !url.startsWith('http')) continue;
      const list = out.get(row.product_id) ?? [];
      if (!list.some((x) => x.url === url)) list.push({ url, variant_key: row.variant_key ?? null });
      out.set(row.product_id, list);
    }
  }
  return out;
}

/** A variant's own images first, then the product's, then whatever metadata carries. */
export function productImages(
  associated: readonly AssociatedImage[] | undefined,
  metadata: unknown,
  variantKey: string | null = null,
): string[] {
  const assoc = associated ?? [];
  const ordered = variantKey
    ? [...assoc.filter((a) => a.variant_key === variantKey), ...assoc.filter((a) => a.variant_key !== variantKey)]
    : assoc;
  const out = ordered.map((a) => a.url);
  for (const url of imagesFromMetadata(metadata)) if (!out.includes(url)) out.push(url);
  return out;
}
