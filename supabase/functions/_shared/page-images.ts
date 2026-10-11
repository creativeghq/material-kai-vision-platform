/** Content photos on a crawled page — what an article may place when it links to that page. */

export interface PageImage {
  src: string;
  alt: string;
}

/** Below this many pixels on the longer declared side an image is an icon, a logo or a chip. */
const MIN_DECLARED_PX = 300;
const MAX_ALT_CHARS = 200;

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[2] ?? m[3] ?? '') : null;
}

function decode(s: string): string {
  return s
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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
    if (/logo|λογότυπο/i.test(alt) || /logo/i.test(rawSrc)) continue;
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
    out.push({ src, alt: alt.slice(0, MAX_ALT_CHARS) });
  }
  return out;
}
