/**
 * One implementation per date primitive — the same rule `moneyPrimitives.test.ts` enforces for
 * money, for the same reason.
 *
 * `formatDate`/`fmtDate` was declared in eighteen files and `timeAgo` in eleven. Several passed
 * `undefined` as the locale, which hands the decision to the viewer's browser: the same timestamp
 * rendered "Aug 5, 2026" for one user and "5 Αυγ 2026" for another, on the same screen, against the
 * English-default rule. Nothing about that is visible in a diff or a type.
 *
 * The guard permits a local declaration that DELEGATES (the file imports from `@/utils/datetime`),
 * because several call sites legitimately wrap the canonical with their own options — a `fallback`
 * of "Never", a null return, `withTime`. What it forbids is a fresh `Intl`/`toLocale*` formatter.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatDate, timeAgo } from '@/utils/datetime';

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((p) => ({ path: p.replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));
const rel = (p: string) => p.slice(p.indexOf('/src/') + 1);

/**
 * Deliberate non-delegating implementations, each for a stated reason. Adding to this list is a
 * decision, which is the point — it is far harder to do by accident than declaring another helper.
 */
const ALLOWED = new Set([
  'src/modules/quotes/components/QuoteDocument.tsx',   // en-GB dd/mm/yyyy on a printed document
  'src/pages/AppointmentsPage.tsx',                    // date-only parsed as T00:00:00 (UTC shift)
  'src/modules/quotes/components/QuoteRequestModal.tsx', // month:'long'
  'src/pages/Inbox/InboxPage.tsx',                     // compact relative time, no "ago"
  'src/components/core/Profile/WebsiteDomainIntelPanel.tsx', // today/yesterday granularity
  'src/modules/social-media/pages/SocialMediaAccountsPage.tsx', // hours upward
  'src/modules/social-media/components/SocialAccountsTab.tsx',  // no "just now" floor
  'src/components/business/price-monitoring/ProductMonitorTab.tsx', // renders future times
  'src/modules/projects/components/tabs/TimelineTab.tsx',  // same-day time-only variant
]);

describe.each(['formatDate', 'fmtDate', 'timeAgo'])('%s is not re-implemented', (ident) => {
  it('any local declaration delegates to @/utils/datetime', () => {
    const decl = new RegExp(`(const\\s+${ident}\\s*=\\s*\\(|function\\s+${ident}\\s*\\()`);
    const offenders = FILES.filter(({ path, src }) =>
      !path.endsWith('/src/utils/datetime.ts')
      && !ALLOWED.has(rel(path))
      && decl.test(src)
      && !/from '@\/utils\/datetime'/.test(src))
      .map(({ path }) => rel(path));
    expect(offenders, `import from "@/utils/datetime" instead of declaring ${ident}`).toEqual([]);
  });
});

describe('the behaviours the copies had lost', () => {
  it('pins the locale rather than deferring to the browser', () => {
    // en-US: month-first. A browser-locale formatter would render this day-first in most of Europe.
    expect(formatDate('2026-08-05T10:30:00Z')).toMatch(/Aug 5, 2026/);
  });

  it('dashes an unknown value instead of echoing it back', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate(null, { fallback: 'Never' })).toBe('Never');
  });

  it('timeAgo floors at "just now" and never returns a negative', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
    expect(timeAgo(new Date(Date.now() + 60_000).toISOString())).toBe('just now');
    expect(timeAgo(null)).toBe('never');
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000).toISOString())).toBe('3h ago');
  });
});
