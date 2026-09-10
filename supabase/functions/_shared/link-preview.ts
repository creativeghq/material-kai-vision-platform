/** What a pasted link IS — read off the page's own metadata. */

/** The fields a preview card can show. Every one is optional — a page may state none of them. */
export interface LinkPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  laquo: '«', raquo: '»', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
  ldquo: '“', rdquo: '”', euro: '€', copy: '©', reg: '®', trade: '™',
};

/**
 * `&amp;` → `&`, for display in a text node.
 *
 * NOT a sanitiser and not the inverse of `escapeHtml`: it runs on a value that is on its way to
 * a JSX text node, where React escapes whatever it is given. Reversing entities before handing
 * the string to something that concatenates HTML would be the actual bug, which is why the only
 * consumer is a text node and this function is not exported anywhere near one.
 */
function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      // A code point outside the Unicode range, or a lone surrogate, comes back as the literal
      // text rather than as `String.fromCodePoint` throwing mid-preview.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Collapse the whitespace a `<meta>` across three source lines leaves in the value. */
function clean(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/**
 * Every `<meta>` in the document as `key → content`, keyed by whichever of `property` / `name` /
 * `itemprop` it used.
 *
 * One pass rather than a regex per field: attribute ORDER is not fixed (`<meta content="…"
 * property="og:title">` is as valid as the other way round), and a per-field pattern that assumes
 * one order silently misses every page written the other. First value wins, matching how a
 * browser resolves a duplicated `og:title`.
 */
function metaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const content = /\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!key || content == null) continue;
    const k = key.trim().toLowerCase();
    if (!out.has(k)) out.set(k, content);
  }
  return out;
}

/** An absolute https URL for the picture, or null. */
function absoluteImage(raw: string | null, base: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim(), base);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Read a page's own description of itself.
 *
 * Precedence is Open Graph → Twitter card → the ordinary document tags, which is the order of how
 * deliberately the page chose the value: `og:title` was written for exactly this card, `<title>`
 * was written for a browser tab.
 */
export function extractLinkPreview(html: string, finalUrl: string): LinkPreview {
  const head = html.slice(0, 512 * 1024);
  const meta = metaTags(head);
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = meta.get(k);
      if (v && v.trim()) return v;
    }
    return null;
  };

  const documentTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? null;

  let siteName = clean(pick('og:site_name', 'application-name'), 60);
  if (!siteName) {
    // The host is a worse answer than the page's own words and a much better one than nothing:
    // "showood.gr" tells the reader where the link goes, which is the first thing they want.
    try { siteName = new URL(finalUrl).hostname.replace(/^www\./, ''); } catch { siteName = null; }
  }

  return {
    title: clean(pick('og:title', 'twitter:title') ?? documentTitle, 160),
    description: clean(pick('og:description', 'twitter:description', 'description'), 300),
    imageUrl: absoluteImage(pick('og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'), finalUrl),
    siteName,
  };
}
