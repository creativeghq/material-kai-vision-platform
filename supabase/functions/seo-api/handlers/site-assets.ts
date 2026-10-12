/** Pure rules for links and photos pointing at an article's own site. Import-free (unit-tested). */

const LINK_RE = /(?<!!)\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g;
const CAPTION_RE = /^([ \t]*!\[[^\]]*\]\([^)\s]+\)[ \t]*)\n[ \t]*(?:\*[^*\n][^\n]*\*|_[^_\n][^\n]*_)[ \t]*$/gm;

export const trimSlash = (u: string): string => u.replace(/\/+$/, '');

const GREEKLISH_PAIRS: [string, string][] = [['ου', 'ou'], ['θ', 'th'], ['χ', 'ch'], ['ψ', 'ps']];
const GREEKLISH: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n',
  ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', ω: 'o',
};
const SLUG_STOPWORDS = new Set(['stin', 'ston', 'stis', 'stous', 'tous', 'tis', 'gia', 'kai', 'apo', 'me', 'the', 'and', 'for', 'with']);

/** A keyword as the words of a Greeklish URL slug: «πλακάκια terrazzo» → plakakia, terrazzo. */
export function slugTerms(text: string): string[] {
  let s = text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  for (const [gr, lat] of GREEKLISH_PAIRS) s = s.split(gr).join(lat);
  s = [...s].map((c) => GREEKLISH[c] ?? c).join('');
  return [...new Set(s.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !SLUG_STOPWORDS.has(w)))];
}

export function hostOf(u: string): string | null {
  try {
    return new URL(u).host.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** The facts a page states: content lines from its stored text, not navigation, menus or buttons. */
export function pageFacts(contentText: string | null | undefined, maxChars = 1500): string | null {
  if (!contentText) return null;
  const kept: string[] = [];
  let size = 0;
  for (const raw of contentText.split('\n').slice(1)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 20 || !/[.,:;·×–\d]/.test(line) || /→/.test(line)) continue;
    kept.push(line);
    size += line.length + 1;
    if (size >= maxChars) break;
  }
  return kept.length ? kept.join('\n').slice(0, maxChars) : null;
}

export interface ReviewEdit { find: string; replace: string; kind: string; note?: string }

/** The words of a page's last URL segment that can name it in prose (cersanit-terrazzo-stone-2-0 → cersanit, terrazzo, stone). */
export function slugNameWords(url: string): string[] {
  const last = trimSlash(url).split('/').pop() ?? '';
  return decodeURIComponent(last).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
}

/** The pages a piece of text uses: it links one, shows one of its photos, or names every word of its slug. */
export function pagesNamedIn<P extends { url: string; images: { src: string }[] }>(text: string, pages: P[]): P[] {
  const lower = text.toLowerCase();
  return pages.filter((p) => {
    const words = slugNameWords(p.url);
    return text.includes(trimSlash(p.url)) || p.images.some((i) => text.includes(i.src))
      || (words.length >= 2 && words.every((w) => lower.includes(w)));
  });
}

/** Every image in the markdown as src → its alt text. */
export function imageAlts(markdown: string): Map<string, string> {
  return new Map([...markdown.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)].map((m) => [m[2], m[1]] as const));
}

/** Reviewer edits by exact match: only text found once, and only if every URL in it survives. */
export function applyReviewEdits(
  markdown: string,
  edits: ReviewEdit[],
): { markdown: string; applied: ReviewEdit[]; skipped: (ReviewEdit & { why: string })[] } {
  let out = markdown;
  const applied: ReviewEdit[] = [];
  const skipped: (ReviewEdit & { why: string })[] = [];
  for (const e of edits) {
    if (!e.find || e.find === e.replace) {
      skipped.push({ ...e, why: 'empty or unchanged' });
      continue;
    }
    const count = out.split(e.find).length - 1;
    if (count !== 1) {
      skipped.push({ ...e, why: count === 0 ? 'text not found' : 'text not unique' });
      continue;
    }
    const urls = [...e.find.matchAll(/\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    if (urls.some((u) => !e.replace.includes(`](${u})`))) {
      skipped.push({ ...e, why: 'would drop a link or image' });
      continue;
    }
    out = out.replace(e.find, () => e.replace);
    applied.push(e);
  }
  return { markdown: out, applied, skipped };
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
/** Government, EU and standards-body sites: the only links an article may make outside its own site. */
const OFFICIAL_HOST = /(^|\.)(gov|gouv|gob|govt)(\.[a-z]{2,3})?$|\.gov\.[a-z]{2}$|(^|\.)(europa\.eu|iso\.org|cen\.eu|cenelec\.eu|iec\.ch|din\.de|elot\.gr|bsigroup\.com|ansi\.org)$/;

export function isOfficialHost(host: string | null): boolean {
  return !!host && OFFICIAL_HOST.test(host);
}

/**
 * The anchor names something (a capitalised name, not its first word) that the target page's title
 * and URL never mention: «πλακάκια στο Ρέθυμνο» pointing at the Athens copy of a page.
 */
export function anchorNamesOtherPlace(anchor: string, target: string): boolean {
  const fold = (x: string) => x.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const haystack = fold(target);
  const words = anchor.trim().split(/\s+/).slice(1);
  return words.some((w) => {
    const clean = w.replace(/[^\p{L}]/gu, '');
    if (clean.length < 4 || clean[0] !== clean[0].toUpperCase() || clean[0] === clean[0].toLowerCase()) return false;
    return !haystack.includes(fold(clean).slice(0, 5));
  });
}

export function applySiteAssetRules(
  markdown: string,
  siteHost: string,
  livePages: Set<string>,
  /** Offered photo URL → the description it is published with (its checked alt). */
  photos: Map<string, string>,
  /** Our page URL (no trailing slash) → its title, for checking what an anchor names. */
  titles: Map<string, string> = new Map(),
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
    if (hostOf(url) !== siteHost) {
      if (isOfficialHost(hostOf(url))) return link;
      unlinked += 1;
      return text;
    }
    const key = trimSlash(url);
    const title = titles.get(key);
    if (title && anchorNamesOtherPlace(text, `${title} ${key}`)) {
      unlinked += 1;
      return text;
    }
    if (livePages.has(key) && !linked.has(key)) {
      linked.add(key);
      return link;
    }
    unlinked += 1;
    return text;
  });
  return { markdown: out, removedImages, unlinked };
}
