/**
 * A link built from content we did not write goes through `safeHref` (#360 CB-11).
 *
 * Price monitoring, mention monitoring, the SEO surfaces and the agent result cards render
 * competitor titles, SERP snippets, tech-radar entries and source names — content authored by
 * anyone who can rank for a watched query, and (#352 A17) content that also reaches the model.
 * #358 established that React 18 still renders a `javascript:` href, so this is live rather than
 * theoretical.
 *
 * `safeHref` has existed since #357 AE-6 and was used in exactly ONE file. A rule written once and
 * applied nowhere is the shape this platform keeps meeting; the sweep guarded 38 sites across 13
 * files, and this test is what stops the 39th arriving unguarded.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { safeHref, safeImageSrc } from '../../src/utils/safeUrl';

const ROOT = join(__dirname, '..', '..');

/** The surfaces that render third-party or model-authored content. */
const SCANNED = [
  'src/components/features/ai',
  'src/components/business/price-monitoring',
  'src/components/business/mention-monitoring',
];

/**
 * Named exemptions, each with the reason. Shrink-only: an entry means `safeHref` is the WRONG
 * function for that value, never that somebody wanted the scan quiet.
 */
const EXEMPT: Array<{ file: string; expr: string; why: string }> = [
  {
    file: 'src/components/features/ai/AgentResultCard.tsx',
    expr: 'setupDest.route',
    why: 'An in-app route from appDestinations — safeHref only admits https/http/mailto and would refuse it.',
  },
];

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...tsxFiles(rel));
    else if (entry.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

describe('#360 CB-11 — the escaper is actually applied', () => {
  it('no scanned surface renders a bare expression into an href', () => {
    const offenders: string[] = [];
    for (const dir of SCANNED) {
      for (const rel of tsxFiles(dir)) {
        const src = readFileSync(join(ROOT, rel), 'utf8');
        for (const m of src.matchAll(/href=\{([^}]{1,90})\}/g)) {
          const expr = m.group?.(1) ?? m[1];
          const value = expr.trim();
          // A literal, an in-app template path and an anchor are all fine as written.
          if (value.startsWith("'") || value.startsWith('"')) continue;
          if (value.startsWith('`/') || value.startsWith('`#')) continue;
          if (value.startsWith('safeHref(')) continue;
          if (EXEMPT.some((e) => e.file === rel && e.expr === value)) continue;
          offenders.push(`${rel}: href={${value}}`);
        }
      }
    }
    expect(
      offenders,
      'These render a link from content we did not write. Wrap the value in safeHref '
      + '(@/utils/safeUrl), or add a named exemption with its reason:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('every exemption still exists, so the list cannot rot', () => {
    for (const e of EXEMPT) {
      const src = readFileSync(join(ROOT, e.file), 'utf8');
      expect(src, `${e.file} no longer contains ${e.expr}`).toContain(`href={${e.expr}}`);
      expect(e.why.length, 'an exemption without a reason').toBeGreaterThan(20);
    }
  });

  it('the markdown renderer is covered — that is where injected links land', () => {
    // An agent reply is markdown, and a link inside it came from whatever the model read.
    const src = readFileSync(join(ROOT, 'src/components/features/ai/MarkdownRenderer.tsx'), 'utf8');
    expect(src).toMatch(/href=\{safeHref\(href\)\}/);
  });
});

describe('#360 CB-11 — what safeHref actually refuses', () => {
  it('refuses the schemes that execute', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\u0000script:alert(1)',
      ' javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
    ]) {
      expect(safeHref(bad), bad).toBe('#');
    }
  });

  it('keeps the links people actually click', () => {
    expect(safeHref('https://example.com/a?b=c#d')).toBe('https://example.com/a?b=c#d');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com');
  });

  it('an empty or absent value is a dead link, not a crash', () => {
    expect(safeHref('')).toBe('#');
    expect(safeHref(undefined as unknown as string)).toBe('#');
    expect(safeHref(null as unknown as string)).toBe('#');
  });

  it('an image source is https-only and null when it is not', () => {
    // `null` rather than '#': an <img src="#"> requests the current page, which is a wasted
    // round trip and a broken icon; nothing is better.
    expect(safeImageSrc('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(safeImageSrc('javascript:alert(1)')).toBeNull();
    expect(safeImageSrc('mailto:a@b.c')).toBeNull();
  });
});
