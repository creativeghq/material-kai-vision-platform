// GENERATED MIRROR of src/utils/messageLinks.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * Finding the links in a message, once.
 *
 * A message body renders as text and its links resolve to preview cards, and those are two
 * readers of the same string: a bubble that shows a card for a URL it did not make clickable —
 * or makes a fragment clickable that the card was never fetched for — is one string parsed twice.
 * So it is parsed here, and both consumers read the result.
 *
 * Import-free on purpose: message bodies are also read server-side, and this is the module a
 * second runtime mirrors rather than re-derives.
 */

export interface TextSegment {
  kind: 'text';
  value: string;
}

export interface LinkSegment {
  kind: 'link';
  /** What the message actually said — rendered as the link's text. */
  value: string;
  /** Where it goes. Identical to `value` today; separate so a display form can be shortened. */
  href: string;
}

export type MessageSegment = TextSegment | LinkSegment;

/**
 * Trailing punctuation belongs to the SENTENCE, not to the URL.
 *
 * `Have a look at https://example.com/a.` ends in a full stop, and a link that swallows it 404s.
 * A closing bracket is the awkward one, because it goes both ways: `…_(disambiguation)` is a real
 * path segment and `(see https://x.com/a)` is not — so it is only trimmed when the URL never
 * opened one.
 */
function trimTrailingPunctuation(url: string): string {
  let out = url;
  for (;;) {
    const last = out[out.length - 1];
    if (!last) break;
    if ('.,;:!?’\'"«»'.includes(last)) { out = out.slice(0, -1); continue; }
    if (last === ')' && !out.includes('(')) { out = out.slice(0, -1); continue; }
    if (last === ']' && !out.includes('[')) { out = out.slice(0, -1); continue; }
    if (last === '}' && !out.includes('{')) { out = out.slice(0, -1); continue; }
    break;
  }
  return out;
}

/**
 * Split a message body into plain runs and links.
 *
 * `http`/`https` only. A bare `showood.gr` is left as text deliberately: guessing a scheme onto
 * something that merely looks domain-shaped turns "call me at 12.30pm" and every price ending in
 * `.gr`-adjacent text into a link, and a wrong link in a customer conversation is worse than a
 * URL the operator has to copy.
 */
export function splitMessageLinks(body: string | null | undefined): MessageSegment[] {
  if (!body) return [];
  const segments: MessageSegment[] = [];
  const pattern = /https?:\/\/[^\s<>"']+/gi;
  let cursor = 0;
  for (;;) {
    const match = pattern.exec(body);
    if (!match) break;
    const raw = match[0];
    const url = trimTrailingPunctuation(raw);
    // The punctuation trimmed off the end is still part of the sentence and must be rendered.
    const start = match.index;
    const end = start + url.length;
    if (start > cursor) segments.push({ kind: 'text', value: body.slice(cursor, start) });
    // A scheme with nothing after it is not a link. `https://` alone is 8 characters.
    if (url.length > 10) segments.push({ kind: 'link', value: url, href: url });
    else segments.push({ kind: 'text', value: url });
    cursor = end;
    pattern.lastIndex = start + raw.length;
  }
  if (cursor < body.length) segments.push({ kind: 'text', value: body.slice(cursor) });
  return segments;
}

/**
 * The distinct URLs in a body, in order.
 *
 * Deduplicated because the same link pasted twice is one page to fetch, and capped because a
 * message can carry twenty and a wall of twenty cards is not a message any more.
 */
export function messageUrls(body: string | null | undefined, limit = 3): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const seg of splitMessageLinks(body)) {
    if (seg.kind !== 'link') continue;
    const key = seg.href.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(seg.href);
    if (urls.length >= limit) break;
  }
  return urls;
}

/**
 * A URL as a person reads it — host plus a hint of the path.
 *
 * The message in the screenshot was a 180-character percent-encoded Greek slug rendered in full,
 * which is unreadable and pushed every other word off the bubble. The link still GOES to the
 * whole URL; only its label is shortened.
 */
export function shortenUrlForDisplay(url: string, maxLength = 48): string {
  let host = url;
  let rest = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname.replace(/^www\./, '');
    rest = decodeURIComponent(parsed.pathname).replace(/\/$/, '');
  } catch {
    return url.length > maxLength ? `${url.slice(0, maxLength - 1)}…` : url;
  }
  const full = `${host}${rest}`;
  if (full.length <= maxLength) return full;
  // The END of a path is the identifying part (`/products/wpc-decking-360`), so the middle goes
  // rather than the tail — truncating from the right leaves every link on a site looking alike.
  const keepTail = Math.max(0, maxLength - host.length - 2);
  return keepTail < 8 ? `${host}…` : `${host}…${rest.slice(-keepTail)}`;
}
