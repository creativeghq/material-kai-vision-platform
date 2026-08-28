/**
 * Responsive guard: a wide table must be REACHABLE on a phone, and a section rail must not
 * become a wall of navigation above the content.
 *
 * WHY THIS IS A SOURCE-LEVEL TEST AND NOT A MEASUREMENT
 * -----------------------------------------------------
 * The obvious check — render a route at 375px and assert `document.documentElement.scrollWidth
 * === 375` — is worthless on this platform, and audit #299 proved it by running it: all 20
 * authenticated routes returned exactly 375, zero overflow, everywhere. That is not a clean bill
 * of health. `Layout.tsx` puts `overflow-x-hidden` on `<main>`, so any child that overflows is
 * CLIPPED rather than scrolled and the document never widens. A document-scrollWidth assertion
 * passes today and would pass through real breakage, forever.
 *
 * Element-level measurement is the check that counts, but it needs a real layout engine — jsdom
 * has none, so `getBoundingClientRect()` returns zeros here. That measurement lives in the audit
 * (and would need a browser harness to automate).
 *
 * So this test pins what IS statically decidable, which is also what was actually wrong:
 *   1. a table inside a wrapper that explicitly CLIPS (the original #299 root cause), and
 *   2. a table with no horizontal scroller at all — 58 of them, every one silently losing its
 *      right-hand columns on a phone. The first version of this file deliberately did not assert
 *      (2) because "every table has a scroll wrapper" flagged 70 sites against ONE measured
 *      clip. That reasoning held only while the sites were unfixed: they are wrapped now, so the
 *      rule costs nothing to keep and is the only thing stopping the 59th.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const rel = (f: string) => relative(ROOT, f).split('\\').join('/');
const SCROLLS = ['overflow-x-auto', 'overflow-auto', 'overflow-x-scroll', 'table-scroll'];

/**
 * A `<table>` that a printed document draws on a fixed 210mm sheet. The sheet is what
 * overflows a phone, not the table inside it, so a per-table scroller would add a second
 * scrollbar to a surface that already has one — and `overflow` on a print surface is a known
 * way to drop content out of the printed page. Shrink-only: an entry here is a claim that the
 * file renders paper, not a screen.
 */
const PRINT_DOCUMENTS = new Set([
  'src/modules/finance/components/InvoiceDocument.tsx',
  'src/modules/quotes/components/QuoteDocument.tsx',
]);

const BACKSLASH = String.fromCharCode(92);

/**
 * Which offsets sit inside a string, template literal or comment. Needed because several files
 * build a PRINTABLE HTML document as a template literal, `<table>` and all — markup that never
 * enters this app's DOM and cannot take a `className`. The first pass of the wrapper codemod
 * put three React wrappers inside such strings; this is how they were found.
 */
function maskLiterals(s: string): Uint8Array {
  const mask = new Uint8Array(s.length);
  let i = 0;
  let mode: 'line' | 'block' | 'str' | null = null;
  let quote: string | null = null;
  while (i < s.length) {
    const c = s[i];
    const n = s[i + 1];
    if (mode === null) {
      if (c === '/' && n === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = 'str'; quote = c; mask[i] = 1; i++; continue; }
      i++; continue;
    }
    if (mode === 'line') { if (c === '\n') mode = null; else mask[i] = 1; i++; continue; }
    if (mode === 'block') {
      mask[i] = 1;
      if (c === '*' && n === '/') { mask[i + 1] = 1; mode = null; i += 2; continue; }
      i++; continue;
    }
    mask[i] = 1;
    if (c === BACKSLASH) { mask[i + 1] = 1; i += 2; continue; }
    if (c === quote) { mode = null; quote = null; i++; continue; }
    i++;
  }
  return mask;
}

describe('wide tables are reachable on a phone', () => {
  const files = walk(SRC);

  it('finds components to scan', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('no <table> sits in a wrapper that explicitly clips it', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<table\b/g)) {
        // The nearest preceding markup — far enough to catch the wrapper, near enough not to
        // pick up an unrelated container several elements up.
        const back = src.slice(Math.max(0, m.index! - 300), m.index!);
        if (back.includes('overflow-hidden') && !SCROLLS.some((k) => back.includes(k))) {
          offenders.push(`${rel(f)}:${src.slice(0, m.index!).split('\n').length}`);
        }
      }
    }
    expect(
      offenders,
      'These tables are inside an `overflow-hidden` wrapper. `<main>` already clips (Layout.tsx), ' +
      'so this guarantees the right-hand columns vanish on a narrow viewport with no scrollbar and ' +
      'no swipe to recover them — silently, which is why audit #299 went unreported for so long. ' +
      'Use `overflow-x-auto`.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('every rendered <table> has a horizontal scroller', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (PRINT_DOCUMENTS.has(rel(f))) continue;
      const src = readFileSync(f, 'utf8');
      const mask = maskLiterals(src);
      for (const m of src.matchAll(/<table\b/g)) {
        if (mask[m.index!]) continue; // an HTML string or a comment, not this app's DOM
        const back = src.slice(Math.max(0, m.index! - 400), m.index!);
        if (!SCROLLS.some((k) => back.includes(k))) {
          offenders.push(`${rel(f)}:${src.slice(0, m.index!).split('\n').length}`);
        }
      }
    }
    expect(
      offenders,
      'A table with no scroll container loses its right-hand columns on a phone — `<main>` is ' +
      '`overflow-x-hidden`, so the overflow is clipped rather than scrolled and NOTHING indicates ' +
      'the columns exist. On a finance table the column that goes is the money. Wrap it: ' +
      '`<div className="table-scroll">` (see index.css), or use the shared `Table` primitive, ' +
      'which carries its own.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('.table-scroll never lands inside an HTML string', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      // A React className in raw HTML is inert: the wrapper renders as an unstyled <div> and the
      // attribute is ignored, so the table it was meant to rescue scrolls nowhere.
      for (const m of src.matchAll(/<div className="table-scroll">\s*\r?\n\s*<table([^>]*)>/g)) {
        if (!/className=/.test(m[1])) offenders.push(`${rel(f)}:${src.slice(0, m.index!).split('\n').length}`);
      }
    }
    expect(
      offenders,
      'A `table-scroll` wrapper is sitting in front of a `<table>` with no `className` — that is ' +
      'raw HTML built as a string (a printable document), where `className` means nothing.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The clip that makes the above matter. If someone removes it, horizontal overflow becomes
   * visible again (a page that rocks sideways) — noisy, but no longer silent, and the guidance in
   * `.claude/design-system.md` about why table wrappers must scroll would need revisiting.
   * Pinned so that removal is a deliberate, reviewed decision rather than a drive-by.
   */
  it('Layout still clips <main>, which is what makes the rule above necessary', () => {
    const layout = readFileSync(join(SRC, 'components/core/Layout.tsx'), 'utf8');
    // `<main` also appears in a prose comment a few lines above the element, so match the
    // opening tag itself. (The first draft of this test matched that comment and failed —
    // which is at least a demonstration that the assertion runs.)
    const main = layout.split('\n').find((l) => /<main[\s>]/.test(l) && l.includes('className'));
    expect(main, 'Layout.tsx no longer renders a <main> — re-check the responsive guard').toBeTruthy();
    expect(
      main!.includes('overflow-x-hidden'),
      'Layout no longer clips <main>. That is not necessarily wrong — it makes overflow LOUD ' +
      'instead of silent — but the table-wrapper rule and the design-system note both reference ' +
      'it, so update them in the same change.',
    ).toBe(true);
  });

  it('.table-scroll is defined once, in index.css', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    expect(css).toContain('.table-scroll {');
    expect(css).toMatch(/\.table-scroll\s*\{[^}]*overflow-x:\s*auto/);
    // Headers on one line are half the fix: without it the browser resolves the overflow by
    // wrapping every header into three lines, so nothing overflows, no scrollbar appears, and
    // the table "fits" while being unreadable.
    expect(css).toMatch(/\.table-scroll > table > thead th\s*\{[^}]*white-space:\s*nowrap/);
  });
});

describe('a section rail is a strip on a phone, not a wall', () => {
  const files = walk(SRC);

  it('every vertical rail opts into .section-rail', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/<TabsList\b[\s\S]{0,400}?className=(?:"([^"]*)"|\{cn\(([\s\S]*?)\)\})/g)) {
        const cls = m[1] ?? m[2] ?? '';
        // A rail is a TabsList that becomes a COLUMN at some breakpoint. A plain horizontal tab
        // strip is already fine — the base TabsList rules handle it.
        if (!/\b(sm|md|lg|xl):flex-col\b/.test(cls)) continue;
        if (!cls.includes('section-rail')) {
          offenders.push(`${rel(f)}:${src.slice(0, m.index!).split('\n').length}`);
        }
      }
    }
    expect(
      offenders,
      'This TabsList is a vertical rail on desktop and has no `.section-rail`. Below `lg` it will ' +
      'therefore stack (or wrap) every section full-width above the page, pushing the content the ' +
      'reader asked for below the fold — the shape that made Finance, HR, Stock, Blueprints, ' +
      'Templates and the CRM detail pages read as "it just lists the tabs and drops everything ' +
      'below". Add `section-rail` to the className.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('a rail collapses at the SAME breakpoint the CSS uses', () => {
    // `.section-rail` is a `max-width: 1023px` media query — i.e. it hands back control at `lg`.
    // A rail whose Tailwind classes go vertical at `sm` or `md` spends 640–1023px with the CSS
    // forcing a row and the utilities asking for a column: whichever wins is an accident.
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/className="([^"]*section-rail[^"]*)"/g)) {
        if (/\b(sm|md|xl):flex-col\b/.test(m[1])) {
          offenders.push(`${rel(f)}:${src.slice(0, m.index!).split('\n').length}`);
        }
      }
    }
    expect(
      offenders,
      'A `.section-rail` goes vertical at a breakpoint other than `lg`, but the CSS strips it ' +
      'below 1024px. Use `lg:flex-col`, or change the media query — not one of the two.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  it('HubSideNav — the archetype — carries the class', () => {
    const nav = readFileSync(join(SRC, 'components/core/hub/HubSideNav.tsx'), 'utf8');
    expect(nav).toContain("'section-rail scroll-y-clean");
    // The strip flattens `group > ul > li > a` with `display: contents`, and hides group
    // captions. Both hang off these hooks; drop them and the rail silently stacks again.
    expect(nav, 'group wrappers need data-rail-group for the strip to flatten them').toContain('data-rail-group');
    expect(nav, 'group captions need data-rail-heading to be hidden in the strip').toContain('data-rail-heading');
  });

  it('.section-rail is defined once, and only below lg', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');
    expect(css).toContain('.section-rail {');
    expect(css).not.toContain('.finance-tabs-list');
    const block = css.slice(css.indexOf('@media (max-width: 1023px)'));
    expect(block.slice(0, block.indexOf('\n}\n\n') + 1)).toContain('.section-rail');
  });
});
