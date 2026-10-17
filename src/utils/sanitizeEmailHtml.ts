import DOMPurify from 'dompurify';

export interface SanitizedEmail {
  html: string;
  blockedImages: number;
}

const REMOTE = /^\s*(https?:)?\/\//i;
const REMOTE_ANYWHERE = /(^|[\s,'"(])(https?:)?\/\//i;
const cssRemoteUrl = () => /url\(\s*(['"]?)\s*(https?:)?\/\/[^)]*\1\s*\)/gi;
const cssImageSet = () => /(?:-webkit-)?image-set\((?:[^()]|\([^()]*\))*\)/gi;
const CSS_IMPORT = /@import[^;]*;?/gi;
function unescapeCss(css: string): string {
  return css
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, hex: string) => {
      const cp = parseInt(hex, 16);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    })
    .replace(/\\([^\n0-9a-f])/gi, '$1');
}
function blankCssUrls(raw: string): { css: string; count: number } {
  let count = 0;
  const css = raw.includes('\\') ? unescapeCss(raw) : raw;
  const out = css
    .replace(CSS_IMPORT, () => { count++; return ''; })
    .replace(cssImageSet(), (m) => {
      if (!REMOTE_ANYWHERE.test(m)) return m;
      count++;
      return 'none';
    })
    .replace(cssRemoteUrl(), () => { count++; return 'none'; });
  return { css: count ? out : raw, count };
}
const hasRemoteCandidate = (srcset: string) => srcset.split(',').some((c) => REMOTE.test(c));

export const INLINE_IMAGE_MAX = 12;
export const INLINE_IMAGE_BYTES = 3_000_000;

export function normalizeCid(raw: string): string {
  let s = raw.trim().replace(/^<|>$/g, '');
  try { s = decodeURIComponent(s); } catch { /* not percent-encoded */ }
  return s.toLowerCase();
}

/** Content-IDs an HTML body shows as `cid:` images. */
export function referencedCids(html: string | null | undefined): Set<string> {
  return new Set([...(html ?? '').matchAll(/\bcid:([^"'\s)>]+)/gi)].map((m) => normalizeCid(m[1].replace(/&amp;/g, '&'))));
}

function isInlineImageUrl(u: string): boolean {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return (!!origin && u.startsWith(`blob:${origin}/`)) || /^data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(u);
}

export function sanitizeEmailHtml(raw: string, allowRemoteImages: boolean, inlineImages?: Readonly<Record<string, string>>): SanitizedEmail {
  let blockedImages = 0;
  const purifier = DOMPurify();
  purifier.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    if (el.tagName === 'A' && el.getAttribute('href')) {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    if (!allowRemoteImages) {
      const src = el.getAttribute('src');
      if (['IMG', 'SOURCE', 'VIDEO', 'AUDIO'].includes(el.tagName) && src && REMOTE.test(src)) {
        el.setAttribute('data-blocked-src', src);
        el.removeAttribute('src');
        el.removeAttribute('srcset');
        blockedImages++;
      }
      const srcset = el.getAttribute('srcset');
      if (srcset && hasRemoteCandidate(srcset)) {
        el.removeAttribute('srcset');
        blockedImages++;
      }
      const poster = el.getAttribute('poster');
      if (poster && REMOTE.test(poster)) {
        el.removeAttribute('poster');
        blockedImages++;
      }
      if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
        for (const attr of ['href', 'xlink:href']) {
          if (REMOTE.test(el.getAttribute(attr) ?? '')) { el.removeAttribute(attr); blockedImages++; }
        }
      }
      if (el.hasAttribute('background') && REMOTE.test(el.getAttribute('background') ?? '')) {
        el.removeAttribute('background');
        blockedImages++;
      }
      const style = el.getAttribute('style');
      if (style) {
        const { css, count } = blankCssUrls(style);
        if (count) { el.setAttribute('style', css); blockedImages += count; }
      }
    }
    const cid = el.tagName === 'IMG' ? /^\s*cid:(.+)$/i.exec(el.getAttribute('src') ?? '') : null;
    if (cid) {
      const url = inlineImages?.[normalizeCid(cid[1])];
      if (url && isInlineImageUrl(url)) el.setAttribute('src', url);
      else el.removeAttribute('src');
    }
  });
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (allowRemoteImages || data.tagName !== 'style' || !node.textContent) return;
    const { css, count } = blankCssUrls(node.textContent);
    if (count) { node.textContent = css; blockedImages += count; }
  });
  const html = purifier.sanitize(raw, {
    FORBID_TAGS: ['script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'base', 'meta', 'link'],
    FORBID_ATTR: ['srcdoc', 'formaction'],
    ADD_ATTR: ['target'],
    WHOLE_DOCUMENT: false,
    FORCE_BODY: true,
  });
  return { html, blockedImages };
}
