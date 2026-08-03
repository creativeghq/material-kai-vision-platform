/**
 * escapeHtml twin-parity guard (invariant 11).
 *
 * Invariant 11 exists because there were once ~6 hand-rolled escapers at THREE different
 * strengths — the weakest escaped only `& < >`, which is attribute-unsafe, and CLAUDE.md
 * pointed everyone at it. The fix was one canonical implementation per runtime.
 *
 * There are three runtimes that genuinely cannot share a module:
 *   • src/utils/escapeHtml.ts            — Vite bundle (resolves the `@/` alias)
 *   • supabase/functions/_shared/html.ts — Deno edge (resolves by URL)
 *   • api/_shared/html.js                — Vercel Node functions (plain ESM .js, no TS step)
 *
 * Until now the first two were kept identical "by convention", which is precisely the
 * mechanism that failed the first time. This test makes drift impossible instead: all three
 * are imported for real and must agree, character for character, on a corpus that includes
 * every character they special-case plus the attribute-breakout payloads the escaper exists
 * to stop. If someone adds a fourth copy, add it to IMPLS — do not weaken this list.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { escapeHtml as frontendEscape } from '@/utils/escapeHtml';
import { escapeHtml as edgeEscape } from '../../supabase/functions/_shared/html';
// @ts-expect-error — plain ESM .js with no type declarations; runtime behaviour is the contract.
import { escapeHtml as vercelEscape } from '../../api/_shared/html.js';

const IMPLS: Array<[string, (s: unknown) => string]> = [
  ['src/utils/escapeHtml.ts', frontendEscape],
  ['supabase/functions/_shared/html.ts', edgeEscape],
  ['api/_shared/html.js', vercelEscape as (s: unknown) => string],
];

const CORPUS: unknown[] = [
  // The five characters every twin must escape.
  '&', '<', '>', '"', "'",
  '& < > " \'',
  // Attribute breakout — the payload class the escaper exists to stop.
  'x" onerror="alert(1)',
  "x' onerror='alert(1)",
  '"><script>alert(1)</script>',
  '</title><script>alert(1)</script>',
  // Double-escaping must be stable and identical across twins.
  '&amp;', '&lt;script&gt;', '&&&', '&#39;',
  // Nullish + non-string inputs: `String(s ?? '')` vs a hand-rolled `s == null ? '' : s`
  // agree on these, and a future rewrite must not quietly change that.
  null, undefined, 0, 1, false, true, NaN, '',
  // Plain text must pass through untouched.
  'Καλημέρα', 'Ελληνικά πλακάκια 60x60', 'plain text', 'a-b_c.d/e:f',
  // Realistic tenant/AI-supplied content.
  'Tiles & Stone Ltd — "premium" range',
  "L'Atelier <Design> & Co",
];

describe('escapeHtml — canonical twins agree', () => {
  it.each(CORPUS.map((v) => [JSON.stringify(v) ?? String(v), v]))(
    'all three implementations produce identical output for %s',
    (_label, input) => {
      const [[refName, ref], ...rest] = IMPLS;
      const expected = ref(input);
      for (const [name, fn] of rest) {
        expect(
          fn(input),
          `${name} diverged from ${refName} — the twins have drifted, which is exactly the ` +
            `failure invariant 11 exists to prevent. Make them byte-equivalent again.`,
        ).toBe(expected);
      }
    },
  );

  it('escapes the full & < > " \' set (attribute-safe), not just & < >', () => {
    for (const [name, fn] of IMPLS) {
      expect(fn('& < > " \''), `${name} is not attribute-safe`).toBe(
        '&amp; &lt; &gt; &quot; &#39;',
      );
    }
  });

  it('leaves no raw quote that could close an HTML attribute', () => {
    for (const [name, fn] of IMPLS) {
      const out = fn('x" onerror="alert(1)');
      expect(out, `${name} left a raw double quote — attribute breakout`).not.toContain('"');
      expect(out, `${name} left a raw single quote — attribute breakout`).not.toContain("'");
      expect(out, `${name} left a raw angle bracket`).not.toMatch(/[<>]/);
    }
  });

  it('is idempotent-safe: escaping already-escaped text does not corrupt the twins differently', () => {
    const twice = IMPLS.map(([, fn]) => fn(fn('<a href="x">&</a>')));
    expect(new Set(twice).size, 'twins disagree on double-escaped input').toBe(1);
  });
});

/**
 * The Vercel twin is a `.js` file that Vercel compiles on its own — nothing else in the repo
 * would notice if it were deleted or renamed, and kb-prerender would then fall back to a fresh
 * hand-rolled copy. Pin the import so that regression fails here rather than in production HTML.
 */
describe('api/kb-prerender.js uses the canonical escaper', () => {
  const src = readFileSync(join(process.cwd(), 'api/kb-prerender.js'), 'utf8');

  it('imports escapeHtml from the shared module', () => {
    expect(src, 'kb-prerender no longer imports the canonical escaper').toMatch(
      /import\s*\{[^}]*\bescapeHtml\b[^}]*\}\s*from\s*['"]\.\/_shared\/html\.js['"]/,
    );
  });

  it('does not define a local escaper', () => {
    expect(
      src,
      'a hand-rolled escapeHtml is back in kb-prerender.js — import the shared one instead',
    ).not.toMatch(/function\s+escapeHtml\s*\(|const\s+escapeHtml\s*=/);
  });
});
