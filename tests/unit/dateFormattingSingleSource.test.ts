import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatDate } from '@/utils/datetime';

/**
 * Dates render through one formatter, in one locale (#329).
 *
 * `new Date(x).toLocaleDateString()` uses the BROWSER's locale, so the same timestamp rendered
 * "Aug 5, 2026" for one user and "5 Αυγ 2026" for another, on the same screen, with nothing in the
 * code to say so. `formatDate` pins `en-US` for the same reason `formatMoney` pins `en-IE`:
 * English is the platform default for all UI and documents.
 *
 * 244 call sites were migrated in one pass. This stops the 245th.
 *
 * SCOPE — deliberately narrow, and the narrowness is the point:
 *
 *  • Only `new Date(…).toLocale*String()` is forbidden, where the receiver is PROVABLY a Date.
 *  • Bare `someVar.toLocaleString()` is NOT flagged. 133 of those exist and many are numbers —
 *    `credits.toLocaleString()`, `count.toLocaleString()` — where "fixing" them with a date
 *    formatter would be catastrophic. They have the same browser-locale problem for thousand
 *    separators, but that needs a number formatter and a typed pass, not this rule.
 *  • Calls passing an options object are NOT flagged: the caller asked for a specific shape on
 *    purpose (`{ month: 'short', year: '2-digit' }`), and `formatDate` cannot express all of them.
 *  • `toLocaleTimeString` is NOT flagged — `formatDate` has no time-only mode, so there is
 *    nowhere to send those 6 call sites yet.
 *
 * A guard that flagged the ambiguous cases would be either wrong or ignored. This one is neither.
 */
const SCAN_ROOT = 'src';
const CANONICAL = 'src/utils/datetime.ts';

/** Documented, deliberate exceptions — each keeps its own formatter for a stated reason. */
const ALLOWED: Record<string, string> = {
  // A printed customer document, deliberately dd/mm/yyyy in en-GB.
  'src/modules/quotes/components/QuoteDocument.tsx': 'printed customer document uses en-GB dd/mm/yyyy',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function offenders(): string[] {
  const found: string[] = [];
  for (const file of walk(SCAN_ROOT)) {
    const rel = relative(process.cwd(), file).split('\\').join('/');
    if (rel === CANONICAL || rel in ALLOWED) continue;
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[ \t]*\/\/.*$/gm, '');
    // (a) `new Date(…).toLocale*String()` with NO arguments — the plain browser-locale form.
    if (/new Date\([^;]*?\)\.toLocale(Date)?String\(\s*\)/.test(src)) { found.push(rel); continue; }
    // (b) An explicit options object but `undefined` / `[]` as the LOCALE. The shape is
    // deliberate; the locale is still the browser's, which is the same bug wearing a disguise.
    // 25 call sites looked intentional purely because they passed options.
    if (/\.toLocale(Date|Time)?String\(\s*(undefined|\[\])\s*,/.test(src)) found.push(rel);
  }
  return [...new Set(found)];
}

describe('date formatting has a single source (#329)', () => {
  it('finds files to scan (guards against a vacuous pass)', () => {
    expect(walk(SCAN_ROOT).length, 'source scan found no files — SCAN_ROOT is wrong').toBeGreaterThan(500);
  });

  it('nothing renders a Date through the browser locale', () => {
    expect(
      offenders(),
      'These call toLocaleDateString()/toLocaleString() on a Date with no locale, so the browser '
      + 'decides the format and the same timestamp reads differently for different users. Import '
      + '`formatDate` from @/utils/datetime — `formatDate(x)` for a date, '
      + '`formatDate(x, { withTime: true })` with the time. If a call site genuinely needs its own '
      + 'format, pass an explicit options object (which this rule ignores) and say why.\n',
    ).toEqual([]);
  });

  it('formatDate is stable and handles the empty cases', () => {
    // `new Date(x).toLocaleDateString()` renders "Invalid Date" for junk and throws nothing for
    // null; formatDate returns the fallback for both, which is what every migrated site now shows.
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not a date')).toBe('—');
    expect(formatDate('2026-08-09T10:30:00Z')).toContain('2026');
    expect(formatDate('2026-08-09T10:30:00Z', { withTime: true })).toMatch(/\d{1,2}:\d{2}/);
  });

  it('the exception list stays honest', () => {
    // An entry that no longer needs the exception is debt pretending to be a decision.
    for (const [file, reason] of Object.entries(ALLOWED)) {
      const src = readFileSync(file, 'utf8');
      expect(
        /toLocale(Date|Time)?String\(/.test(src),
        `${file} is exempted (${reason}) but no longer formats dates itself — drop the exemption`,
      ).toBe(true);
    }
  });
});
