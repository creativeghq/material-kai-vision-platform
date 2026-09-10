// GENERATED MIRROR of src/utils/safeUrl.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** URLs that are safe to put in an `href` or `src` of HTML we assemble by hand. */

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
