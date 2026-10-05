import DOMPurify from 'dompurify';

export interface SanitizedEmail {
  html: string;
  blockedImages: number;
}

const REMOTE = /^\s*(https?:)?\/\//i;
const cssRemoteUrl = () => /url\(\s*(['"]?)\s*(https?:)?\/\/[^)]*\1\s*\)/gi;
const CSS_IMPORT = /@import[^;]*;?/gi;
function blankCssUrls(css: string): { css: string; count: number } {
  let count = 0;
  const out = css.replace(CSS_IMPORT, () => { count++; return ''; }).replace(cssRemoteUrl(), () => { count++; return 'none'; });
  return { css: out, count };
}

export function sanitizeEmailHtml(raw: string, allowRemoteImages: boolean): SanitizedEmail {
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
      if (el.tagName === 'IMG' && src && REMOTE.test(src)) {
        el.setAttribute('data-blocked-src', src);
        el.removeAttribute('src');
        el.removeAttribute('srcset');
        blockedImages++;
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
    if (el.tagName === 'IMG' && /^\s*cid:/i.test(el.getAttribute('src') ?? '')) el.removeAttribute('src');
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
