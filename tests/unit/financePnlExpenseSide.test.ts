/** The Finance dashboard states a P&L, and the P&L has an expense side. */
import { describe, it, expect } from 'vitest';

import { readSource, strippedSource, sourceIndex, posix } from '../helpers/sourceIndex';
import { aadeVerdict, booksVerdict, bookingStateCopy } from '@/modules/finance/pnlStatus';

const DASHBOARD = 'src/pages/Admin/FinancePage.tsx';
const INDEX = sourceIndex({ roots: ['src'] });

describe('the dashboard P&L includes expenses', () => {
  it('renders the expense-inclusive P&L, not only the gross-margin table', () => {
    const src = strippedSource(DASHBOARD);
    for (const component of ['PnlOverviewCard', 'PnlTrendCard', 'ExpenseBacklogCard']) {
      expect(
        src,
        `${DASHBOARD} must render <${component}>. Until 2026-09-21 this dashboard had five KPI ` +
          'tiles of which one was expense-side, and a card titled "Monthly P&L" whose columns ' +
          'were Revenue / COGS / Margin — no operating expense could ever appear in it.',
      ).toMatch(new RegExp(`<${component}\\b`));
    }
  });

  it('reads the P&L from get_finance_pnl_overview, never from the gross-margin RPC', () => {
    const service = strippedSource('src/modules/finance/services/financeService.ts');
    expect(service).toMatch(/rpc\('get_finance_pnl_overview'/);
    expect(service).toMatch(/rpc\('get_finance_pnl_monthly'/);
    // getPnlOverview and getMonthlyPnl answer different questions and must not collapse into one.
    expect(
      service.match(/rpc\('get_monthly_pnl'/g) ?? [],
      'get_monthly_pnl is gross margin (revenue − COGS). It has exactly one caller.',
    ).toHaveLength(1);
  });

  it('no card still calls a revenue-minus-COGS table a P&L', () => {
    const offenders = INDEX.stripped()
      .filter(([, src]) => /(Monthly P&(amp;)?L|Monthly PnL)/.test(src))
      .map(([f]) => posix(f));
    expect(
      offenders,
      'A gross-margin table titled "P&L" is why nobody went looking for the operating expenses ' +
        'that were never in it. Call it Gross margin.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the P&L read is not swallowed by the best-effort insights catch', () => {
    const src = strippedSource(DASHBOARD);
    expect(src, 'the P&L needs its own loader').toMatch(/const loadPnl = async/);
    expect(
      src,
      'a failed P&L read must reach the card as an ERROR. Swallowed, it renders as income and ' +
        'expenses of zero — a claim about the business rather than a missing read.',
    ).toMatch(/setPnlError\(/);
    // The one period control the whole dashboard reads, so two blocks cannot state two windows.
    expect(
      (readSource(DASHBOARD).match(/onValueChange=\{\(v\) => setDashPeriod\(/g) ?? []).length,
      'there must be exactly one dashboard period selector',
    ).toBe(1);
  });
});

describe('ΑΑΔΕ confirms our books; it is never merged into them', () => {
  it('no surface adds an aade_ figure to a books_ figure', () => {
    const offenders: string[] = [];
    for (const [file, src] of INDEX.stripped()) {
      // A books figure and an AADE figure on either side of + or − is the merge this forbids:
      // the result is a total no document backs, and it looks exactly like a real number.
      if (/\baade_[a-z_]+\s*[+\-]\s*[a-z.?]*books_/.test(src)
        || /\bbooks_[a-z_]+\s*[+\-]\s*[a-z.?]*aade_/.test(src)) {
        offenders.push(posix(file));
      }
    }
    expect(
      offenders,
      'The ΑΑΔΕ book is the tax authority\'s aggregate of documents filed against our ΑΦΜ. It ' +
        'CONFIRMS our figures or contradicts them — where they disagree, state the difference. ' +
        '(expense_gap_net is that difference, and SQL derives it.)\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the card shows the difference rather than reconciling it away', () => {
    const card = strippedSource('src/modules/finance/components/PnlOverviewCard.tsx');
    expect(card, 'the gap is derived in SQL and only rendered here').toMatch(/expense_gap_net/);
    expect(card, 'the gap must name the work that closes it').toMatch(/unbooked_docs/);
    // `collector_failed` fires when ANY month failed, and the months that DID read still produce
    // a gap — so the tiles said "Could not reach ΑΑΔΕ" while the strip asserted the shortfall.
    expect(
      card,
      'the gap banner must not assert a figure the ΑΑΔΕ status calls unknown',
    ).toMatch(/showGap = [^;]*aade\.hasFigures/);
  });

  it('no money is printed under a currency it is not denominated in', () => {
    const card = strippedSource('src/modules/finance/components/PnlOverviewCard.tsx');
    // The settlement block sums supplier_bills and vw_ap_aging, which have their OWN currency —
    // it printed under the books currency, whose MIXED fallback is EUR.
    expect(card, 'settlement figures carry their own currency').toMatch(/settleCcy/);
    expect(card, 'and are withheld when that currency is not single').toMatch(/settle\.hasFigures \?/);

    const trend = strippedSource('src/modules/finance/components/PnlTrendCard.tsx');
    expect(trend, 'each month names its own currency').toMatch(/currency: string;/);
    expect(trend, 'a mixed month renders its reason, not bars').toMatch(/booksVerdict\(r\.books_status\)/);
  });
});

describe('a P&L figure carries the verdict on itself', () => {
  it('an unrecognised status fails closed to unknown, never to a number', () => {
    for (const bogus of ['', 'sort_of', 'OK', 'ok ', 'undefined']) {
      expect(aadeVerdict(bogus).hasFigures, `aade "${bogus}" must not render as fact`).toBe(false);
      expect(booksVerdict(bogus).hasFigures, `books "${bogus}" must not render as fact`).toBe(false);
    }
    expect(aadeVerdict(null).hasFigures).toBe(false);
    expect(aadeVerdict(undefined).hasFigures).toBe(false);
  });

  it('distinguishes "answered, nothing there" from "we could not ask"', () => {
    // A genuine zero and an unknown are the pair this whole vocabulary exists to keep apart.
    expect(aadeVerdict('no_data').hasFigures).toBe(true);
    expect(aadeVerdict('ok').hasFigures).toBe(true);
    expect(aadeVerdict('partial').hasFigures).toBe(true);
    for (const s of ['not_collected', 'collector_failed', 'not_connected']) {
      expect(aadeVerdict(s).hasFigures, `${s} is unknown, not zero`).toBe(false);
    }
    expect(booksVerdict('mixed_currency').hasFigures, 'never sum across currencies').toBe(false);
  });

  it('every booking state the view can emit has copy that names why', () => {
    for (const s of ['bookable', 'booked', 'dismissed', 'cancelled', 'payroll', 'credit_note', 'no_value', 'out_of_scope']) {
      expect(bookingStateCopy(s).label, `${s} needs a label`).toBeTruthy();
      expect(bookingStateCopy(s).detail.length, `${s} needs a reason`).toBeGreaterThan(10);
    }
  });
});

describe('building near the expenses queue never drains it', () => {
  it('no client code turns on auto-conversion or calls the autoconvert cron RPC', () => {
    const offenders = INDEX.stripped()
      // The generated Database types NAME every RPC in the schema. A type declaration is not a
      // call, and the fix for a generated file is at the generator.
      .filter(([f]) => posix(f) !== 'src/integrations/supabase/types.ts')
      .filter(([, src]) => /autoconvert_inbound_docs|auto_convert_inbound_expenses\s*[:=]\s*true/.test(src))
      .map(([f]) => posix(f));
    expect(
      offenders,
      'auto_convert_inbound_expenses is off in every workspace and drains the received-document ' +
        'queue into supplier bills with no human. A booking run is an operator pressing Book.\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('every booking call is bounded and names its target', () => {
    const service = strippedSource('src/modules/finance/services/inboundService.ts');
    expect(service, 'bookIssuer must pass a limit').toMatch(/p_limit:\s*opts\.limit\s*\?\?\s*\d+/);
    expect(service, 'booking names one issuer').toMatch(/p_issuer_vat:\s*issuerVat/);

    const card = strippedSource('src/modules/finance/components/ExpenseBacklogCard.tsx');
    expect(card, 'the UI books one named supplier at a time').toMatch(/bookIssuer\(workspaceId, vat,/);
    expect(card, 'and in a bounded batch').toMatch(/limit: BATCH/);
    expect(
      card,
      'a run that booked nothing must not report success',
    ).toMatch(/res\.booked === 0 \? 'destructive'/);
  });

  it('the Book button offers exactly what book() will act on', () => {
    const card = strippedSource('src/modules/finance/components/ExpenseBacklogCard.tsx');
    // The enable test and the act test were two different predicates: `category_pending` for the
    // button, the category id for the call. A supplier whose documents already carried categories
    // but had no issuer-default row got an enabled button whose click did nothing at all.
    expect(card, 'one predicate decides both').toMatch(/disabled=\{!bookable/);
    expect(card, 'and book\(\) asks the same one').toMatch(/if \(!canBookRow\(row, choice\)\) return;/);
    expect(card, 'a disabled button names what would unblock it').toMatch(/blockedReason\(/);
  });

  it('a failed inbox read never renders as an empty inbox', () => {
    const card = strippedSource('src/modules/finance/components/ExpenseBacklogCard.tsx');
    expect(
      card,
      'the read clears the rows, so the empty state must branch on `error` — it announced ' +
        '"Nothing has been filed against you" over 1,705 waiting documents.',
    ).toMatch(/title=\{error/);
  });

  it('booking is by ΑΦΜ, and a document without one says so instead of failing', () => {
    const service = strippedSource('src/modules/finance/services/inboundService.ts');
    expect(service, 'issuer_vat is nullable in the view').toMatch(/issuer_vat: string \| null;/);
    const card = strippedSource('src/modules/finance/components/ExpenseBacklogCard.tsx');
    expect(card, 'a null ΑΦΜ cannot be a React key').not.toMatch(/key=\{row\.issuer_vat\}/);
  });

  it('every async error helper is awaited before it is thrown', () => {
    // Un-awaited, `edgeError` throws a Promise and the catch toasts "[object Promise]".
    const offenders = INDEX.stripped()
      .filter(([, src]) => /throw\s+edgeError\(/.test(src))
      .map(([f]) => posix(f));
    expect(offenders, `use \`throw await edgeError(...)\`: ${offenders.join(', ')}`).toEqual([]);
  });
});
