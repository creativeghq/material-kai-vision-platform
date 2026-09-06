// GENERATED MIRROR of src/utils/safeUrl.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * URLs that are safe to put in an `href` or `src` of HTML we assemble by hand.
 *
 * A DIFFERENT CONTRACT FROM `escapeHtml`, and both are needed. Escaping stops a value breaking
 * OUT of its attribute (`" onclick=…`); it does nothing about the value being a live
 * `javascript:` URL, which is already inside the quotes and perfectly well-formed. Invariant 11
 * names `escapeHtml` as the canonical escaper and is explicit that it is HTML escaping ONLY —
 * so this sits beside it rather than inside it.
 *
 * WHY IT EXISTS AT ALL (#357 AE-6). `EmailTemplateBuilderPage` assembles campaign HTML from
 * product titles, subtitles and URLs and stores it. Product data reaches this platform from PDF
 * extraction and supplier XML — CLAUDE.md treats both as untrusted — so a `url` field is
 * attacker-influenced text that ends up in an `href` in somebody's inbox.
 *
 * ALLOWLIST, NOT A DENYLIST. `javascript:` is the one everybody remembers; `data:`, `vbscript:`
 * and `file:` are the ones they forget, and the next one has not been invented yet. Only
 * `http:`, `https:` and `mailto:` pass.
 *
 * NO RELATIVE URLS. They are legitimate on a web page and meaningless in an email — there is no
 * base to resolve against, so a relative href is a dead link at best. Refusing them keeps the
 * rule simple enough to hold in one's head.
 */

/** Where a refused URL points instead. `#` is inert in every mail client. */
const INERT = '#';

/**
 * Control characters and spaces are stripped BEFORE the scheme is read.
 * `java\tscript:` and `java\nscript:` are parsed as `javascript:` by browsers and by some mail
 * clients, so a check against the raw string can be walked straight past.
 */
const STRIP_INVISIBLE = /[\u0000-\u0020\u007f-\u009f]/g;

export function safeHref(url: unknown, fallback: string = INERT): string {
  const raw = String(url ?? '').replace(STRIP_INVISIBLE, '');
  if (!raw) return fallback;
  return /^(?:https?|mailto):/i.test(raw) ? raw : fallback;
}

/**
 * The same rule for an image `src`, minus `mailto:` — which is not an image and, in a mail
 * client, is a broken-image icon at best.
 *
 * Returns `null` rather than a fallback: a caller that cannot show an image should render its
 * own placeholder, not an `<img>` pointing at `#`.
 */
export function safeImageSrc(url: unknown): string | null {
  const raw = String(url ?? '').replace(STRIP_INVISIBLE, '');
  if (!raw) return null;
  return /^https?:/i.test(raw) ? raw : null;
}
