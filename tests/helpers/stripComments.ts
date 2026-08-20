/**
 * The one way a guard test strips comments from source it is about to assert against.
 *
 * There were TEN implementations across 41 test files, and — like every other set of copies this
 * codebase has found — they had drifted to different strengths. Thirty of them ran
 *
 *     src.replace(BLOCK_COMMENTS, '').replace(LINE_COMMENTS, '')
 *
 * which is wrong in a way that is invisible from the test's own output. A `//` comment
 * containing `/*` opens a block comment as far as that first `replace` is concerned, and it
 * closes at the next `*​/` anywhere below — deleting every line in between. `mivaa-gateway`
 * documents MIVAA's excluded prefixes as `/api/rag/*` in ordinary line comments, so 10,000
 * characters of real code disappeared before any assertion ran. Three other edge functions were
 * affected the same way.
 *
 * A guard that silently stops seeing the code it guards does not fail. It PASSES — it finds
 * nothing to object to, reports green, and keeps reporting green while the thing it was written
 * to prevent walks back in. That is the worst available failure mode for a test whose entire job
 * is to notice.
 *
 * Swapping the two replaces fixes that case and still loses to `'image/*'` — a `/*` inside a
 * string literal, which no ordering can help with. So this is a scanner rather than a pair of
 * regexes: one pass, tracking whether it is inside a string, and therefore correct on both.
 *
 * Two contracts, because callers genuinely need both:
 *   • `stripComments` removes the comment text. Use it when asserting on WHAT the source says.
 *   • `blankComments` replaces it with spaces, preserving every byte offset, line and column.
 *     Use it when reporting a line number, slicing by index, or comparing positions.
 *
 * `stripComments` NORMALIZES CRLF to LF; `blankComments` deliberately does not, because it would
 * cost exactly the byte-for-byte alignment that is its whole reason to exist. A guard's anchor
 * describes source STRUCTURE — say `"from('quote_items')\n      .insert({"` — not a byte
 * encoding, and on a Windows checkout with `core.autocrlf=true` every one of those newlines is
 * CR LF on disk, so the anchor cannot match. `quoteCostBasis` failed exactly that way locally
 * while passing in CI, where the checkout is LF. A guard that is red on one platform and green on
 * the other teaches people to stop reading `npm test`, which is the same muting problem the rest
 * of this file exists to prevent.
 *
 * A `blankComments` caller that needs both alignment AND a multi-line anchor must normalize the
 * source itself, before reading, so that offsets and anchors agree on one representation.
 */

type Mode = 'strip' | 'blank';

/**
 * One pass, appending SLICES rather than characters.
 *
 * The obvious `out += src[i]` version is correct and unusable: 41 guard tests each sweep up to
 * 1,455 files, and per-character concatenation on that volume exhausts the V8 heap outright —
 * the suite died with "Reached heap limit" rather than a test failure. Ordinary code is copied
 * as one slice between boundaries, so allocations scale with the number of comments and strings
 * in a file, not with its length.
 */
function scan(src: string, mode: Mode): string {
  const n = src.length;
  const parts: string[] = [];
  let copied = 0; // start of the pending run of ordinary code
  let i = 0;

  /** Comment replacement: nothing, or whitespace of the same shape. Newlines survive both. */
  const erase = (text: string) =>
    mode === 'blank' ? text.replace(/[^\n]/g, ' ') : text.replace(/[^\n]/g, '');

  /** Flush ordinary code up to `end`, then emit the erased comment `src[end..stop)`. */
  const emitComment = (end: number, stop: number) => {
    if (end > copied) parts.push(src.slice(copied, end));
    parts.push(erase(src.slice(end, stop)));
    copied = stop;
  };

  while (i < n) {
    const c = src.charCodeAt(i);

    // Only three characters can start something interesting: / " ' `
    if (c !== 47 /* / */ && c !== 34 /* " */ && c !== 39 /* ' */ && c !== 96 /* ` */) {
      i++;
      continue;
    }

    if (c === 47) {
      const next = src.charCodeAt(i + 1);

      // ── line comment ──────────────────────────────────────────────────────────────────────
      if (next === 47) {
        let j = i + 2;
        while (j < n && src.charCodeAt(j) !== 10) j++;
        emitComment(i, j);
        i = j;
        continue;
      }

      // ── block comment ─────────────────────────────────────────────────────────────────────
      if (next === 42 /* * */) {
        const close = src.indexOf('*/', i + 2);
        const j = close === -1 ? n : close + 2;
        emitComment(i, j);
        i = j;
        continue;
      }

      i++;
      continue;
    }

    // ── string literal — skipped over, so a `/*` inside it never opens a comment ────────────
    const quote = c;
    let j = i + 1;
    while (j < n) {
      const ch = src.charCodeAt(j);
      if (ch === 92 /* \ */) { j += 2; continue; }
      if (ch === quote) { j++; break; }
      // An unterminated ' or " cannot span lines. Bail at the newline rather than swallowing
      // the rest of the file when the quote was really an apostrophe or a regex character class.
      if (ch === 10 && quote !== 96) break;
      j++;
    }
    i = j; // left in the pending run — string contents are ordinary code
  }

  if (copied < n) parts.push(src.slice(copied));
  return parts.join('');
}

/**
 * Source with comment TEXT removed, and CRLF normalized to LF. Newlines are preserved; offsets
 * are not — which is what makes the normalization free here and impossible in `blankComments`.
 */
export function stripComments(src: string): string {
  return scan(src.indexOf('\r') === -1 ? src : src.replace(/\r\n/g, '\n'), 'strip');
}

/**
 * Source with comments replaced by spaces — same length, same line and column for everything
 * that is not a comment. Use when an assertion reports a line number or slices by index.
 */
export function blankComments(src: string): string {
  return scan(src, 'blank');
}
