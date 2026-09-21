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
    for (const s of ['bookable', 'booked', 'dismissed', 'cancelled', 'settled_outside', 'payroll', 'credit_note', 'no_value', 'out_of_scope']) {
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

describe('a cost kept out of the P&L is stated, never simply absent', () => {
  it('the excluded total is rendered beside the figures it is missing from', () => {
    const card = strippedSource('src/modules/finance/components/PnlOverviewCard.tsx');
    expect(card, 'excluded costs must be counted on screen').toMatch(/excluded_docs/);
    expect(card, 'and carry their money').toMatch(/excluded_total/);
  });

  it('a write is offered only to the role the RPC accepts', () => {
    // These gate on is_workspace_finance_manager. isAccountant was the wrong twin: it offered the
    // action to sales and warehouse, who are refused, and blocked nobody else.
    const panel = strippedSource('src/modules/finance/components/OrderWorklistPanel.tsx');
    expect(panel, 'the worklist dismissal is manager-gated').toMatch(/isWorkspaceManager/);
    expect(panel).not.toMatch(/readOnly = isAccountant/);
  });

  it('the settle item is offered only where the server accepts it', () => {
    const menu = strippedSource('src/modules/finance/components/InboundDocActionsMenu.tsx');
    // Payroll, credit notes and value-less delivery notes all reached a dialog whose only
    // possible ending was the server refusing.
    expect(menu, 'one predicate, naming its own reason').toMatch(/settleBlockedReason/);
    expect(menu, 'and the item asks it').toMatch(/!canSettle/);
  });

  it('the dialog states the consequence before the button, not after', () => {
    const dlg = strippedSource('src/modules/finance/components/SettleExpenseDialog.tsx');
    // The two answers put the same document in two different sets of books, so the sentence that
    // says which has to be on screen while the choice is still open.
    expect(dlg, 'the no-account branch must say it is excluded').toMatch(/kept OUT of the P&L/);
    expect(dlg, 'and the account branch must say it counts').toMatch(/counts in the P&L/);
    expect(dlg, 'the paid-on date is the operator\'s day, not UTC').toMatch(/todayLocalISO/);
    // Prefilling the document total settles a part-paid bill for more than it owes, and the
    // allocation then refuses the whole run.
    expect(dlg, 'a blank amount means whatever is still due').toMatch(/Whatever is still due/);
    // The reverse-charge net/gross rule has ONE statement.
    expect(dlg, 'reuses invoicedTotal').toMatch(/invoicedTotal\(doc\)/);
    // An empty account picker and one that could not load look identical, and the second leaves
    // "settled outside" as the only option — silently excluding a real cost.
    expect(dlg, 'a failed account read says so').toMatch(/accountsError/);
    // A payment is recorded in the BILL's currency, so another account's balance would move by an
    // amount it is not denominated in.
    expect(dlg, 'accounts are filtered to the document currency').toMatch(/a\.currency === currency/);
  });

  it('excluding is reversible, and the undo sits with the action', () => {
    const menu = strippedSource('src/modules/finance/components/InboundDocActionsMenu.tsx');
    expect(menu, 'the menu offers the undo when already excluded').toMatch(/settledOutside \?/);
    expect(menu, 'and the settle action otherwise').toMatch(/onSettle=?\}?/);
    const svc = strippedSource('src/modules/finance/services/inboundService.ts');
    expect(svc, 'the undo reaches the server').toMatch(/unsettle_inbound_document/);
  });

  it('the new columns are SELECTed, or the marker is invisible to the UI', () => {
    // inbound_documents is read through an explicit column list. A column left out of it reads as
    // undefined forever, and the undo would simply never appear.
    const svc = strippedSource('src/modules/finance/services/inboundService.ts');
    expect(svc, 'settled_outside_at must be in LIST_COLUMNS').toMatch(/'settled_outside_at'/);
  });

  it('the supplier record separates excluded costs from work outstanding', () => {
    const card = strippedSource('src/modules/finance/components/SupplierInboundDocs.tsx');
    expect(card, 'a tile of its own').toMatch(/settled_outside_documents/);
    // Counting a deliberately-excluded document as "not in your books yet" means the one number a
    // supplier page can drive to zero never reaches it.
    expect(card, '"not in books" must exclude them').toMatch(/!d\.settled_outside_at/);
  });
});

describe('a work queue never shrinks silently', () => {
  it('hiding an order from Needs action says so and offers it back', () => {
    const panel = strippedSource('src/modules/finance/components/OrderWorklistPanel.tsx');
    expect(panel, 'the hidden count is on screen').toMatch(/hidden\.length/);
    expect(panel, 'and restoring is a click').toMatch(/restore_order_to_worklist/);
    // Nothing waiting AND nothing hidden is the only empty case: "no work" and "work you told me
    // to stop showing" must not render identically.
    expect(panel).toMatch(/rows\.length === 0 && hidden\.length === 0/);
  });
});

describe('a received document is fetched, not authored', () => {
  it('the credit-note action is side-aware', () => {
    const page = strippedSource('src/modules/finance/pages/DocumentsPage.tsx');
    // This button was blind to the side and opened the CUSTOMER dialog on "Received from
    // suppliers", so the only way to fill that list was to re-key what myDATA already held.
    expect(page, 'creating is customer-side only').toMatch(/creditSide === 'customer' && !isAccountant/);
    expect(page, 'the received side fetches').toMatch(/creditSide === 'supplier' && isWorkspaceManager/);
    expect(page, 'from myDATA').toMatch(/fetchSupplierCreditNotes/);
  });

  it('an incomplete received list says it is incomplete', () => {
    const page = strippedSource('src/modules/finance/pages/DocumentsPage.tsx');
    expect(page, 'the waiting count is surfaced').toMatch(/scnWaiting/);
  });
});

describe('customer credit is not an overpayment', () => {
  it('the word appears nowhere in the product', () => {
    const offenders = INDEX.stripped()
      .filter(([, src]) => /overpayment/i.test(src))
      .map(([f]) => posix(f));
    expect(
      offenders,
      'Money a customer has with us is credit we hold, and it is profit until they spend it — ' +
        'calling it an overpayment reads as an error somebody made.\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});
