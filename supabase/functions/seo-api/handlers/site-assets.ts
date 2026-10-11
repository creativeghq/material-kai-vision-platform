/** Pure rules for links and photos pointing at an article's own site. Import-free (unit-tested). */

const LINK_RE = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;
const CAPTION_RE = /^([ \t]*!\[[^\]]*\]\([^)\s]+\)[ \t]*)\n[ \t]*(?:\*[^*\n][^\n]*\*|_[^_\n][^\n]*_)[ \t]*$/gm;

export const trimSlash = (u: string): string => u.replace(/\/+$/, '');

export function hostOf(u: string): string | null {
  try {
    return new URL(u).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Every link (not image) in the markdown whose host is `siteHost`. */
export function siteLinkUrls(markdown: string, siteHost: string): string[] {
  return [...markdown.matchAll(LINK_RE)].map((m) => m[2]).filter((u) => hostOf(u) === siteHost);
}

/** Markdown links (not images) whose host is the article's own site. */
export function countSiteLinks(markdown: string, siteUrl?: string | null): number {
  const host = siteUrl ? hostOf(siteUrl) : null;
  return host ? siteLinkUrls(markdown, host).length : 0;
}

/**
 * Keep a photo only if it is one we offered, and only its first placement; keep a link to our own
 * site only if it names a live page, and only its first link. An offending link is unwrapped to its
 * anchor text, so the sentence survives. Links to other sites are not ours to judge here.
 */
export function applySiteAssetRules(
  markdown: string,
  siteHost: string,
  livePages: Set<string>,
  /** Offered photo URL → the description it is published with (its checked alt). */
  photos: Map<string, string>,
): { markdown: string; removedImages: number; unlinked: number } {
  let removedImages = 0;
  let unlinked = 0;
  const placed = new Set<string>();
  // A caption is the model describing a photo it never saw: the line right under an image goes.
  let out = markdown.replace(CAPTION_RE, '$1');
  out = out.replace(IMAGE_RE, (_img, src: string) => {
    if (photos.has(src) && !placed.has(src)) {
      placed.add(src);
      return `![${photos.get(src)!.replace(/[[\]]/g, '')}](${src})`;
    }
    removedImages += 1;
    return '';
  });
  if (removedImages) out = out.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n');
  const linked = new Set<string>();
  out = out.replace(LINK_RE, (link, text: string, url: string) => {
    if (hostOf(url) !== siteHost) return link;
    const key = trimSlash(url);
    if (livePages.has(key) && !linked.has(key)) {
      linked.add(key);
      return link;
    }
    unlinked += 1;
    return text;
  });
  return { markdown: out, removedImages, unlinked };
}
