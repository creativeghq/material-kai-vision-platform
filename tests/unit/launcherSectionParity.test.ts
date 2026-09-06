/**
 * What the Apps menu offers must be what the app HAS.
 *
 * `deepLinkTargets.test.ts` guards the loud half — a launcher chip pointing at a `?tab=` key that
 * renders no pane. This is the quiet half, and `launcher-sections.ts` names it in its own header:
 *
 *     "a tab that EXISTS but is listed nowhere here — a gap, not a break."
 *
 * A gap raises nothing. Every chip present resolves, every test passes, and a section of the app is
 * simply unreachable from the menu. Finance had FIFTEEN: the page's rail carried 25 sections and
 * `LAUNCHER_SECTIONS.finance` was a hand-written 10, so Receipts, Credit Notes, Expenses, By
 * Supplier, Delivery Notes, Cheques, Planning, Assets, Time & Billing, AI Assessment, the myDATA
 * Book, myDATA Transmissions, Sourcing, Settings and the Supplier Portal were in the product and in
 * no menu. HR was missing Departments, Assets, Accounting, Departures and Ergani — the ministry
 * filing surface. CRM was missing Pipeline, its own first tab. Real Estate was missing Syndication.
 *
 * That header called it not machine-checkable. It is, in the two shapes that matter:
 *
 *   1. Finance is now DERIVED — the rail and the chips are one list (`FINANCE_SECTIONS`), so the
 *      gap cannot reopen by omission. What is pinned here is that the derivation is still a
 *      derivation and nobody has re-typed the list beside it.
 *   2. For a page whose rail is written as literal `<TabsTrigger value="…">`, the rail IS readable
 *      from source. Every trigger must be a chip or be named below with a reason.
 *
 * Exemptions are shrink-only and each carries the reason it is not a chip. "It felt like too many"
 * is not one of them — the App Launcher is how a phone reaches a section rail that does not fit.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LAUNCHER_SECTIONS } from '@/config/launcher-sections';
import { groupSections, gateLinks, type LinkGate } from '@/config/launcher-links';
import { FINANCE_SECTIONS, FINANCE_SECTION_GROUPS, financeRailRows } from '@/modules/finance/sections';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const tabOf = (to: string) => new URLSearchParams(to.split('?')[1] ?? '').get('tab');

// ─────────────────────────── Finance: one list, two surfaces ───────────────────────────

describe('Finance’s rail and its launcher chips are one list', () => {
  const chips = LAUNCHER_SECTIONS.finance;

  it('the page renders its rail FROM the shared list, not from its own triggers', () => {
    const page = read('src/pages/Admin/FinancePage.tsx');
    expect(page, 'FinancePage must build its rail from financeRailRows()').toContain('financeRailRows({ isAccountant })');
    // The 25 hand-written triggers are what drifted. A literal one reappearing is the second list
    // coming back, however innocent it looks.
    const rail = page.slice(page.indexOf('<TabsList'), page.indexOf('</TabsList>'));
    const literals = [...rail.matchAll(/<TabsTrigger\s+value="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
    expect(literals, `hand-written rail triggers are back: ${literals.join(', ')}`).toEqual([]);
  });

  it('every section the rail shows is offered as a chip — except the landing pane', () => {
    const listed = new Set(chips.map((c) => tabOf(c.to)));
    const missing = FINANCE_SECTIONS
      .filter((s) => !s.landing && !listed.has(s.value))
      .map((s) => `${s.label} (?tab=${s.value})`);
    expect(missing, `Finance sections reachable from no menu:\n${missing.join('\n')}`).toEqual([]);

    const landing = FINANCE_SECTIONS.filter((s) => s.landing).map((s) => s.value);
    expect(landing, 'exactly one landing pane').toEqual([FINANCE_TAB.dashboard]);
    // "Open Finance" already goes there; a chip beside it is a duplicate of the card's own action.
    expect(listed.has(FINANCE_TAB.dashboard)).toBe(false);
  });

  it('a chip carries the same label, URL and accountant gate as the rail row', () => {
    for (const s of FINANCE_SECTIONS.filter((x) => !x.landing)) {
      const chip = chips.find((c) => tabOf(c.to) === s.value);
      expect(chip, `no chip for ${s.value}`).toBeDefined();
      expect(chip!.label).toBe(s.label);
      expect(chip!.to).toBe(financeTabUrl(s.value));
      expect(chip!.icon).toBe(s.icon);
      // The page drops these rows for the invited accountant. A chip without the same gate opens
      // a tab that renders nothing — the launcher's own "live link to a wall" failure.
      expect(Boolean(chip!.hideForAccountant)).toBe(Boolean(s.hideForAccountant));
    }
  });

  it('withholds the operational chips from the invited accountant', () => {
    const open: LinkGate = { isModuleAvailable: () => true, can: () => true, isWorkspaceManager: true, isAccountant: false };
    const asAccountant = gateLinks(chips, { ...open, isAccountant: true }).map((c) => c.label);
    expect(asAccountant).not.toContain('Settings');
    expect(asAccountant).not.toContain('Supplier Portal');
    // …and still hands them the books, which is the whole point of the role.
    expect(asAccountant).toContain('Receivables');
    expect(asAccountant).toContain('myDATA Book (ΑΑΔΕ)');
    expect(gateLinks(chips, open).map((c) => c.label)).toContain('Settings');
  });

  it('every rail value is a declared Finance tab', () => {
    const declared = new Set<string>(Object.values(FINANCE_TAB));
    const stray = FINANCE_SECTIONS.filter((s) => !declared.has(s.value)).map((s) => s.value);
    expect(stray, `rail values spelled outside FINANCE_TAB: ${stray.join(', ')}`).toEqual([]);
  });
});

// ─────────────────────────── the rail as rendered ───────────────────────────

describe('financeRailRows', () => {
  const labels = (isAccountant: boolean) =>
    financeRailRows({ isAccountant }).map((r) => (r.kind === 'heading' ? `— ${r.label} —` : r.section.label));

  it('puts a heading before the first row of each group, and only there', () => {
    const rows = labels(false);
    expect(rows.filter((l) => l.startsWith('—'))).toEqual([
      `— ${FINANCE_SECTION_GROUPS.documents} —`,
      `— ${FINANCE_SECTION_GROUPS.tools} —`,
    ]);
    expect(rows[0]).toBe('Dashboard');
    expect(rows[rows.indexOf(`— ${FINANCE_SECTION_GROUPS.documents} —`) + 1]).toBe('Orders');
  });

  it('the landing pane leads the rail — the launcher drops it, the page does not', () => {
    expect(labels(false)[0]).toBe('Dashboard');
  });

  it('drops the operational rows for an accountant and keeps their headings', () => {
    const rows = labels(true);
    expect(rows).not.toContain('Settings');
    expect(rows).not.toContain('Supplier Portal');
    expect(rows).not.toContain('Time & Billing');
    // The heading must survive: every Tools row an accountant CAN see still sits under one.
    expect(rows).toContain(`— ${FINANCE_SECTION_GROUPS.tools} —`);
    expect(rows).toContain('Reports');
  });

  it('never leaves a heading with no rows under it', () => {
    for (const isAccountant of [false, true]) {
      const rows = financeRailRows({ isAccountant });
      rows.forEach((r, i) => {
        if (r.kind !== 'heading') return;
        expect(rows[i + 1]?.kind, `"${r.label}" heads nothing`).toBe('section');
      });
    }
  });

  it('only ever counts a section that asked to be counted', () => {
    const counted = financeRailRows({ isAccountant: false })
      .filter((r) => r.kind === 'section' && r.section.count)
      .map((r) => (r.kind === 'section' ? r.section.label : ''));
    expect(counted).toEqual(['Receivables', 'Payables', 'Follow-Ups']);
  });
});

// ─────────────────────────── grouping ───────────────────────────

describe('groupSections', () => {
  it('segments a list into its headed runs, in order', () => {
    const s = (label: string, group?: string) => ({ label, to: `/x?tab=${label}`, icon: FINANCE_SECTIONS[0].icon, ...(group ? { group } : {}) });
    expect(groupSections([s('a'), s('b', 'G'), s('c', 'G'), s('d', 'H')]).map((g) => [g.label, g.items.length]))
      .toEqual([[undefined, 1], ['G', 2], ['H', 1]]);
  });

  it('a list with no groups comes back as one unlabelled run — every other app’s behaviour', () => {
    const groups = groupSections(LAUNCHER_SECTIONS.crm);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeUndefined();
  });

  it('Finance’s chips group the way its rail does', () => {
    const groups = groupSections(LAUNCHER_SECTIONS.finance);
    expect(groups.map((g) => g.label)).toEqual([undefined, FINANCE_SECTION_GROUPS.documents, FINANCE_SECTION_GROUPS.tools]);
  });

  it('entries sharing a group are contiguous — the renderers segment in order', () => {
    // A non-contiguous group would render its heading twice with the same name, which reads as
    // two different sections of the app.
    for (const [appId, list] of Object.entries(LAUNCHER_SECTIONS)) {
      const labels = groupSections(list).map((g) => g.label).filter((l): l is string => l !== undefined);
      expect(new Set(labels).size, `${appId} repeats a group heading — its entries are interleaved`).toBe(labels.length);
    }
  });
});

// ─────────────────────────── every other tabbed app ───────────────────────────

/** Apps whose landing page writes its rail as literal triggers, so the rail is readable here. */
const RAIL_PAGES: Record<string, string> = {
  crm: 'src/modules/crm/pages/CRMPage.tsx',
  hr: 'src/modules/hr/pages/HRPage.tsx',
  'real-estate': 'src/modules/real-estate/pages/RealEstatePage.tsx',
  stock: 'src/modules/stock/pages/StockPage.tsx',
  'email-marketing': 'src/modules/email-marketing/pages/EmailMarketingPage.tsx',
};

/**
 * Tabs deliberately absent from the menu, with the reason. SHRINK-ONLY: closing a gap means adding
 * the chip, not adding a line here.
 */
const NOT_A_CHIP: Record<string, Record<string, string>> = {
  crm: {},
  hr: { overview: 'the landing pane — "Open HR" already goes there' },
  'real-estate': { overview: 'the landing pane — "Open Real Estate" already goes there' },
  stock: { overview: 'the landing pane — "Open Warehouse" already goes there' },
  'email-marketing': {},
};

/** The triggers of a page's FIRST TabsList — its section rail, not a nested tab strip. */
function railTabs(file: string): string[] {
  const src = read(file);
  const start = src.indexOf('<TabsList');
  const end = src.indexOf('</TabsList>', start);
  expect(start, `${file}: no <TabsList> — this scan is reading nothing`).toBeGreaterThan(-1);
  return [...src.slice(start, end).matchAll(/<TabsTrigger\s[^>]*?\bvalue="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
}

describe('every tabbed app offers its whole rail', () => {
  it.each(Object.entries(RAIL_PAGES))('%s', (appId, file) => {
    const rail = railTabs(file);
    expect(rail.length, `${file}: parsed no triggers — a broken scan vouches for everything`).toBeGreaterThan(2);

    const listed = new Set((LAUNCHER_SECTIONS[appId] ?? []).map((c) => tabOf(c.to)));
    const exempt = NOT_A_CHIP[appId] ?? {};
    const missing = rail.filter((t) => !listed.has(t) && !(t in exempt));
    expect(
      missing,
      `${appId}: on the page and in no menu — ${missing.join(', ')}. Add a chip to LAUNCHER_SECTIONS.`
      + ' `deepLinkTargets` cannot see this: it only checks that the chips which DO exist resolve.',
    ).toEqual([]);
  });

  it('no exemption outlives the tab it was written for', () => {
    // An exemption for a tab that no longer exists is a stale note that makes the list look
    // considered while covering nothing.
    for (const [appId, exempt] of Object.entries(NOT_A_CHIP)) {
      const rail = new Set(railTabs(RAIL_PAGES[appId]));
      for (const tab of Object.keys(exempt)) {
        expect(rail.has(tab), `${appId}: exemption for ?tab=${tab}, which the page no longer renders`).toBe(true);
      }
    }
  });

  it('and no chip points at a tab the rail dropped', () => {
    // The other direction, for the same pages: a chip surviving a tab's removal resolves to a
    // blank pane. (deepLinkTargets checks this against TabsContent; the rail is the stricter test,
    // since a pane with no trigger is one the page itself will not offer.)
    for (const [appId, file] of Object.entries(RAIL_PAGES)) {
      const rail = new Set(railTabs(file));
      const stale = (LAUNCHER_SECTIONS[appId] ?? [])
        .map((c) => tabOf(c.to))
        .filter((t): t is string => t !== null && !rail.has(t));
      expect(stale, `${appId}: chips for tabs the rail no longer has — ${stale.join(', ')}`).toEqual([]);
    }
  });
});
