import { describe, it, expect } from 'vitest';
import { imageSize } from '../../supabase/functions/seo-api/handlers/image-size.ts';
import {
  MIN_PHOTO_WIDTH,
  PHOTO_CHECK_VERSION,
  photoCheckCurrent,
  photoOffered,
  siteMinPhotoWidth,
  type PageImage,
  type PhotoSeen,
} from '../../supabase/functions/_shared/page-images.ts';
import { blankedSource } from '../helpers/sourceIndex';

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

describe('imageSize — pixel size from the file header', () => {
  it('reads PNG IHDR', () => {
    const png = bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a], be32(13), 'IHDR', be32(1600), be32(900), [8, 6, 0, 0, 0]);
    expect(imageSize(png)).toEqual({ width: 1600, height: 900 });
  });

  it('reads a JPEG SOF after skipping APP and DHT segments', () => {
    const app0 = [0xff, 0xe0, ...be16(16), ...new Array(14).fill(0)];
    const dht = [0xff, 0xc4, ...be16(4), 0, 0];
    const sof2 = [0xff, 0xc2, ...be16(17), 8, ...be16(507), ...be16(760), 3, ...new Array(9).fill(0)];
    expect(imageSize(bytes([0xff, 0xd8], app0, dht, sof2))).toEqual({ width: 760, height: 507 });
  });

  it('reads all three WebP flavours', () => {
    const riff = (chunk: string, body: number[]) => bytes('RIFF', [0, 0, 0, 0], 'WEBP', chunk, [0, 0, 0, 0], body);
    const lossy = riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(1200), ...le16(800), 0, 0]);
    expect(imageSize(lossy)).toEqual({ width: 1200, height: 800 });

    const bits = (1919 & 0x3fff) | ((1079 & 0x3fff) << 14);
    const lossless = riff('VP8L', [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255, 0, 0, 0, 0, 0]);
    expect(imageSize(lossless)).toEqual({ width: 1920, height: 1080 });

    const extended = riff('VP8X', [0, 0, 0, 0, ...le24(2047), ...le24(1364)]);
    expect(imageSize(extended)).toEqual({ width: 2048, height: 1365 });
  });

  it('is null for an unknown format or a truncated header — never a guess', () => {
    expect(imageSize(bytes('<html>'))).toBeNull();
    expect(imageSize(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(imageSize(bytes([0x89], 'PNG', [0x0d, 0x0a]))).toBeNull();
  });
});

describe('photoOffered — which checked photos the writer may place', () => {
  const seen = (over: Partial<PhotoSeen> = {}): PhotoSeen => ({
    text: 'Λευκός νιπτήρας', site_alt_ok: true, at: '2026-10-12T00:00:00Z',
    has_text: false, text_language: null, width: 1600, height: 1067, v: PHOTO_CHECK_VERSION, ...over,
  });
  const img = (s?: PhotoSeen): PageImage => ({ src: 'https://site.gr/a.webp', alt: 'a', seen: s ? { el: s } : undefined });

  it('offers a wide photo with no foreign text', () => {
    expect(photoOffered(img(seen()), 'el')).toBe(true);
    expect(photoOffered(img(seen({ has_text: true, text_language: 'el' })), 'el')).toBe(true);
    expect(photoOffered(img(seen({ has_text: true, text_language: null })), 'el')).toBe(true);
  });

  it('does not offer a photo with text in another language', () => {
    expect(photoOffered(img(seen({ has_text: true, text_language: 'en' })), 'el')).toBe(false);
    expect(photoOffered(img(seen({ has_text: true, text_language: 'EN' })), 'el-GR')).toBe(false);
  });

  it('does not offer a photo narrower than the site displays its photos, or one whose size is unknown', () => {
    expect(photoOffered(img(seen({ width: 760 })), 'el', 684)).toBe(true);
    expect(photoOffered(img(seen({ width: 500 })), 'el')).toBe(false);
    expect(photoOffered(img(seen({ width: 760 })), 'el', 900)).toBe(false);
    expect(photoOffered(img(seen({ width: null })), 'el')).toBe(false);
  });

  it('takes the minimum from the width the site itself displays photos at', () => {
    const shown = (w: number): PageImage => ({ src: 'https://site.gr/' + w + Math.random(), alt: 'a', display_width: w });
    expect(siteMinPhotoWidth([760, 760, 760, 760, 160, 760].map(shown))).toBe(684);
    expect(siteMinPhotoWidth([760, 760].map(shown)), 'too few to tell').toBe(MIN_PHOTO_WIDTH);
  });

  it('treats an unversioned cache entry as unchecked, so it is verified again', () => {
    const old = { text: 'x', site_alt_ok: true, at: '2026-10-01T00:00:00Z' };
    expect(photoCheckCurrent(img(old), 'el')).toBe(false);
    expect(photoOffered(img(old), 'el')).toBe(false);
    expect(photoCheckCurrent(img(seen()), 'el')).toBe(true);
    expect(photoCheckCurrent(img(seen()), 'en')).toBe(false);
  });
});

describe('site-pages wiring', () => {
  const src = blankedSource('supabase/functions/seo-api/handlers/site-pages.ts');
  const verify = blankedSource('supabase/functions/seo-api/handlers/photo-verify.ts');

  it('offers only photos that pass photoOffered, and re-checks entries that are not current', () => {
    expect(src).toMatch(/\.filter\(\(im\) => photoOffered\(im, lang, minWidth\)\)/);
    expect(src).toMatch(/\.filter\(\(im\) => !photoCheckCurrent\(im, lang\)\)/);
    expect(src).not.toMatch(/\.filter\(\(im\) => im\.seen\?\.\[lang\]\)/);
  });

  it('the vision check asks for the text verdict and stores the measured size and version', () => {
    expect(verify).toMatch(/has_text: \{ type: 'boolean' \}/);
    expect(verify).toMatch(/required: \[[^\]]*'has_text'[^\]]*'text_language'/);
    expect(verify).toMatch(/imageSize\(file\.bytes\)/);
    expect(verify).toMatch(/v: PHOTO_CHECK_VERSION/);
  });
});
