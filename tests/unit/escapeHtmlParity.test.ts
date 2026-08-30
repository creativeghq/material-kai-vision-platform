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
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

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
/**
 * NOBODY HAND-ROLLS A FIFTH ONE.
 *
 * The guard below this only ever looked at `api/kb-prerender.js`, and only for something NAMED
 * `escapeHtml`. Neither condition caught what was actually there: two moodboard functions
 * assembling HTML and sanitising with an inline
 *
 *     String(title ?? '…').replace(/[<>&]/g, '')
 *
 * — unnamed, so invisible to a name check, in files the old guard never read. And it STRIPPED the
 * characters rather than escaping them, which is both weaker than the canonical set (no `"` or
 * `'`) and lossy in a way users saw: a moodboard called "Kitchen & Bath" reached its owner's
 * dormancy-warning email as "Kitchen  Bath".
 *
 * So this asks the question structurally: a file that BUILDS HTML and sanitises with a character
 * class over `< > &` must be using the canonical escaper.
 *
 * TWO CONTRACTS ARE DELIBERATELY NOT HTML and are exempt by path, each with its reason — the
 * CLAUDE.md rule says as much: "escapeHtml is HTML-only: it is NOT a PostgREST filter sanitizer, a
 * CSV quoter, or an XML escaper (separate contracts — never name them `esc`)".
 */
describe('no hand-rolled HTML escaper anywhere', () => {
  /**
   * Specific tags, and CASE-SENSITIVE. A `<serp_data>` prompt fence must not read as markup,
   * and neither must a SOAP `<Body>` — matching case-insensitively made the myDATA envelope
   * look like an HTML page, which the exemption self-check below caught immediately. HTML in
   * these templates is written lowercase; SOAP elements are capitalised.
   */
  const BUILDS_HTML = /<!doctype|<!DOCTYPE|<html[ >]|<body[ >]|<div\s|<p\s|<h1\s|<h2\s|<a\s+href|<td\s|<tr>/;
  /** A character-class replace touching the HTML metacharacters — the hand-rolled shape. */
  const STRIPS = /\.replace\(\s*\/\[[^\]]*[<>&][^\]]*\]\/g/;

  /** Not HTML, and correctly not using escapeHtml. Each entry states the real contract. */
  const NOT_HTML: Record<string, string> = {
    'supabase/functions/_shared/aade/soap.ts':
      'XML for the myDATA SOAP envelope — a different escaping contract, sanctioned by CLAUDE.md',
    'supabase/functions/seo-api/handlers/untrusted.ts':
      'a prompt-injection fence (invariant 9): angle brackets are neutralised so scraped text cannot forge a delimiter',
  };

  function walk(dir: string, out: string[] = []): string[] {
    let entries: ReturnType<typeof readdirSync>;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, out);
      else if (/\.(ts|tsx|js)$/.test(e.name) && !/\.test\.|\.generated\./.test(e.name)) out.push(p);
    }
    return out;
  }

  const files = ['supabase/functions', 'api'].flatMap((r) => walk(join(process.cwd(), r)));

  it('is actually scanning, and can still recognise both halves of the shape', () => {
    expect(files.length, 'no sources found — this guard is pointed at nothing').toBeGreaterThan(50);
    expect(STRIPS.test("String(t).replace(/[<>&]/g, '')"), 'must see the inline stripper').toBe(true);
    expect(BUILDS_HTML.test('<div style="x">'), 'must see HTML assembly').toBe(true);
    expect(BUILDS_HTML.test("const FENCE_OPEN = '<serp_data>';"), 'must NOT call a prompt fence HTML').toBe(false);
  });

  it('every file that builds HTML and sanitises uses the canonical escaper', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (!STRIPS.test(src) || !BUILDS_HTML.test(src)) continue;
      const rel = relative(process.cwd(), f).split('\\').join('/');
      if (rel in NOT_HTML) continue;
      if (!/\bescapeHtml\b/.test(src)) offenders.push(rel);
    }
    expect(
      offenders,
      'These assemble HTML and sanitise with their own character class. Import escapeHtml from the '
      + 'shared module — a local copy drifts, and stripping characters instead of escaping them '
      + 'also mangles ordinary text containing an ampersand.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('every exemption still exists and still is what it claims', () => {
    // An exemption whose file is gone, or which quietly became HTML, is a hole with a comment.
    for (const [rel, reason] of Object.entries(NOT_HTML)) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src.length, `${rel} is gone — drop its exemption (${reason})`).toBeGreaterThan(0);
      expect(BUILDS_HTML.test(src), `${rel} now builds HTML and can no longer be exempt`).toBe(false);
    }
  });
});

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
