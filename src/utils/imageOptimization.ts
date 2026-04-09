/**
 * Supabase Storage image optimization utilities.
 * Uses Supabase's built-in imgproxy transform parameters.
 */

export interface ImageTransformOptions {
  width?: number;
  quality?: number;
}

/**
 * Returns an optimized image URL for Supabase Storage images.
 *
 * For Supabase Storage public URLs (containing `/storage/v1/object/public/`),
 * appends imgproxy transform query params: width, quality, and format=origin.
 *
 * For all other URLs (external CDNs, data URIs, etc.), returns the URL unchanged.
 *
 * @param url     - The original image URL
 * @param options - Optional transform params. width defaults to undefined (omitted),
 *                  quality defaults to 75.
 * @returns       The (possibly transformed) image URL string
 *
 * @example
 * // Supabase URL — appends transform params
 * getOptimizedImageUrl(
 *   'https://xyz.supabase.co/storage/v1/object/public/products/img.jpg',
 *   { width: 400, quality: 80 }
 * );
 * // => '...?width=400&quality=80&format=origin'
 *
 * @example
 * // External URL — returned unchanged
 * getOptimizedImageUrl('https://example.com/image.jpg', { width: 400 });
 * // => 'https://example.com/image.jpg'
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  options: ImageTransformOptions = {}
): string {
  if (!url) return '';

  const SUPABASE_STORAGE_MARKER = '/storage/v1/object/public/';

  if (!url.includes(SUPABASE_STORAGE_MARKER)) {
    return url;
  }

  const { width, quality = 75 } = options;

  const params = new URLSearchParams();
  if (width !== undefined) {
    params.set('width', String(width));
  }
  params.set('quality', String(quality));
  params.set('format', 'origin');

  // Preserve any existing query params (e.g. cache-bust tokens) by appending
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${params.toString()}`;
}
