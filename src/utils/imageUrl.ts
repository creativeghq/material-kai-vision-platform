/**
 * Supabase Image Transform utility.
 *
 * Appends on-the-fly transform query params to Supabase Storage public URLs.
 * The original file in storage is never modified — transforms are applied at
 * serve time by Supabase's imgproxy layer (requires Pro plan or self-hosted
 * with imgproxy enabled).
 *
 * If the URL is not a Supabase storage URL, it is returned unchanged.
 */

interface ImageTransformOptions {
  /** Target width in pixels. Height auto-scales to preserve aspect ratio. */
  width?: number;
  /** Target height in pixels. Width auto-scales to preserve aspect ratio. */
  height?: number;
  /** JPEG/WebP quality 1-100. Default: 80. */
  quality?: number;
  /** Output format. 'origin' keeps the original format. */
  format?: 'webp' | 'png' | 'origin';
  /** Resize mode. 'cover' fills the box (crop), 'contain' fits inside, 'fill' stretches. */
  resize?: 'cover' | 'contain' | 'fill';
}

/** Preset configurations for common display contexts. */
const PRESETS = {
  /** 64-128px thumbnails in cards, tables, lists */
  thumbnail: { width: 256, quality: 75, format: 'webp' as const },
  /** ~300-400px previews in grids, search results */
  preview: { width: 600, quality: 80, format: 'webp' as const },
  /** Large display in modals, lightboxes */
  display: { width: 1200, quality: 85, format: 'webp' as const },
  /** Full quality — only format conversion, no resize */
  full: { quality: 90, format: 'webp' as const },
} as const;

type PresetName = keyof typeof PRESETS;

/**
 * Returns an optimized Supabase Storage URL with transform parameters.
 *
 * @example
 * // With explicit options
 * getOptimizedImageUrl(url, { width: 400, quality: 80, format: 'webp' })
 *
 * // With a preset
 * getOptimizedImageUrl(url, 'thumbnail')
 *
 * // No optimization (passthrough)
 * getOptimizedImageUrl(url)
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  options?: PresetName | ImageTransformOptions,
): string {
  if (!url) return '';

  // Only transform Supabase storage URLs
  if (!url.includes('/storage/v1/object/public/')) return url;

  const opts: ImageTransformOptions =
    typeof options === 'string' ? { ...PRESETS[options] } : options ?? {};

  // Build the render URL by replacing /object/ with /render/image/
  // From: .../storage/v1/object/public/bucket/path
  // To:   .../storage/v1/render/image/public/bucket/path?width=...&quality=...
  const renderUrl = url.replace(
    '/storage/v1/object/public/',
    '/storage/v1/render/image/public/',
  );

  const params = new URLSearchParams();
  if (opts.width) params.set('width', String(opts.width));
  if (opts.height) params.set('height', String(opts.height));
  if (opts.quality) params.set('quality', String(opts.quality));
  if (opts.format) params.set('format', opts.format);
  if (opts.resize) params.set('resize', opts.resize);

  const qs = params.toString();
  return qs ? `${renderUrl}?${qs}` : url;
}

export { PRESETS as IMAGE_PRESETS };
export type { ImageTransformOptions, PresetName };
