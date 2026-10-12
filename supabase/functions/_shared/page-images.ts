/** Content photos on a crawled page — what an article may place when it links to that page. */

export interface PhotoSeen {
  text: string;
  site_alt_ok: boolean;
  at: string;
  /** Words or letters are part of the image itself, in `text_language` (null: no language, e.g. a brand mark). */
  has_text?: boolean;
  text_language?: string | null;
  /** Real pixel size read from the file; null when the header could not be read. */
  width?: number | null;
  height?: number | null;
  v?: number;
}

export interface PageImage {
  src: string;
  alt: string;
  /** The width the page displays it at (its <img width>), when declared. */
  display_width?: number;
  /** What a vision check saw, per article language — the only description an article may print. */
  seen?: Record<string, PhotoSeen>;
}

/** A cached check older than this lacks the text and size verdicts, so it is run again. */
export const PHOTO_CHECK_VERSION = 2;
/** The minimum when the site states no display width for its images. */
export const MIN_PHOTO_WIDTH = 600;

const baseLang = (code: string) => code.toLowerCase().split(/[-_]/)[0];

export function photoCheckCurrent(im: PageImage, lang: string): boolean {
  return im.seen?.[lang]?.v === PHOTO_CHECK_VERSION;
}

/** 90% of the width the site itself displays its photos at (median of declared widths), else MIN_PHOTO_WIDTH. */
export function siteMinPhotoWidth(images: PageImage[]): number {
  const widths = images.map((i) => i.display_width ?? 0).filter((w) => w >= MIN_DECLARED_PX).sort((a, b) => a - b);
  if (widths.length < 5) return MIN_PHOTO_WIDTH;
  return Math.round(widths[Math.floor(widths.length / 2)] * 0.9);
}

/** Checked at the current version, wide enough for the site, and any text baked into it is in the article's language. */
export function photoOffered(im: PageImage, lang: string, minWidth = MIN_PHOTO_WIDTH): boolean {
  const s = im.seen?.[lang];
  if (!s || s.v !== PHOTO_CHECK_VERSION) return false;
  if (!(Number(s.width) >= minWidth)) return false;
  return !(s.has_text && s.text_language && baseLang(s.text_language) !== baseLang(lang));
}

/** Below this many pixels on the longer declared side an image is an icon, a logo or a chip. */
const MIN_DECLARED_PX = 300;
const MAX_ALT_CHARS = 200;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? '') : null;
}

function decode(s: string): string {
  return s.replace(
    /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|(amp|lt|gt|quot|apos|nbsp));/g,
    (_m, dec: string, hex: string, name: string) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[name] ?? ' ';
    },
  );
}

/**
 * `<img>` tags that carry a description (`alt`) and are photo-sized, as absolute https URLs.
 *
 * An empty alt is the page saying "decorative", and a logo is a brand mark, not a picture of the
 * product — neither may be lifted into an article, so both are dropped. De-duplicated by src.
 */
export function extractContentImages(html: string, pageUrl: string, max = 6): PageImage[] {
  const out: PageImage[] = [];
  const seen = new Set<string>();
  for (const [tag] of html.matchAll(/<img\b[^>]*>/gi)) {
    if (out.length >= max) break;
    const rawSrc = attr(tag, 'src');
    const alt = decode(attr(tag, 'alt') ?? '').replace(/\s+/g, ' ').trim();
    if (!rawSrc || !alt || rawSrc.startsWith('data:')) continue;
    // An SVG is an icon or a badge, never a product photograph.
    if (/logo|λογότυπο/i.test(alt) || /logo|\.svg(?:[?#]|$)/i.test(rawSrc)) continue;
    if (attr(tag, 'aria-hidden') === 'true') continue;

    const w = Number(attr(tag, 'width')) || 0;
    const h = Number(attr(tag, 'height')) || 0;
    if ((w || h) && Math.max(w, h) < MIN_DECLARED_PX) continue;

    let src: string;
    try {
      const u = new URL(decode(rawSrc), pageUrl);
      if (u.protocol !== 'https:') continue;
      src = u.toString();
    } catch {
      continue;
    }
    if (seen.has(src)) continue;
    seen.add(src);
    out.push({ src, alt: alt.slice(0, MAX_ALT_CHARS), ...(w ? { display_width: w } : {}) });
  }
  return out;
}
