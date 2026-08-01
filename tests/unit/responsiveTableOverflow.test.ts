/**
 * Responsive guard: a wide table must never be put in a wrapper that CLIPS it.
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
 * So this test pins the one thing that IS statically decidable and was the actual root cause:
 * a table sitting inside a wrapper that explicitly clips. `overflow-hidden` on a table wrapper is
 * always wrong on this platform — `<main>` already clips, so the wrapper adds nothing except the
 * guarantee that a too-wide table loses its right-hand columns with no scrollbar and no swipe.
 *
 * WHAT THIS DELIBERATELY DOES NOT ASSERT
 * --------------------------------------
 * "Every table has a scroll wrapper" was tried and rejected: it flags 70 sites while the audit's
 * element-level sweep found exactly ONE element actually clipping. Most bare tables fit fine, and
 * several hits are email-template HTML rather than app layout. A guard with 70 false positives
 * gets suppressed, and then it protects nothing.
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

const SCROLLS = ['overflow-x-auto', 'overflow-auto', 'overflow-x-scroll'];

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
          const line = src.slice(0, m.index!).split('\n').length;
          offenders.push(`${relative(ROOT, f).split('\\').join('/')}:${line}`);
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
});
