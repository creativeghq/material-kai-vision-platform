/** The Finance dashboard states a P&L, and the P&L has an expense side. */
import { describe, it, expect } from 'vitest';

import { readSource, strippedSource, sourceIndex, posix } from '../helpers/sourceIndex';
import { aadeVerdict, booksVerdict, bookingStateCopy } from '@/modules/finance/pnlStatus';

const DASHBOARD = 'src/pages/Admin/FinancePage.tsx';
const INDEX = sourceIndex({ roots: ['src'] });

describe('the dashboard P&L includes expenses', () => {
  it('renders the expense-inclusive P&L, not only the gross-margin table', () => {
    const src = strippedSource(DASHBOARD);
    for (const component of ['PnlOverviewCard', 'PnlTrendCard']) {
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

  it('nothing calls a revenue-minus-COGS table a P&L', () => {
    // Narrow on purpose: a card that really IS income less expenses may of course be called a
    // Monthly P&L — PnlTrendCard is. What is banned is the pairing, a surface that says P&L in
    // the same breath as COGS or gross_margin, which is the card that misled for so long.
    const offenders = INDEX.stripped()
      .filter(([, src]) => /(Monthly P&(amp;)?L|Monthly PnL)/.test(src)
        && /(COGS|gross_margin)/.test(src))
      .map(([f]) => posix(f));
    expect(
      offenders,
      'A gross-margin table titled "P&L" is why nobody went looking for the operating expenses ' +
        'that were never in it. Call it Gross margin.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the expenses inbox is reachable where the work is, not on the dashboard', () => {
    // The booking card moved to By Supplier, beside the filing it depends on; the Expenses tab
    // keeps the read-only breakdown so its list cannot read as the whole story.
    const suppliers = strippedSource('src/modules/finance/tabs/ExpenseSuppliersTab.tsx');
    expect(suppliers, 'booking sits with filing').toMatch(/<ExpenseBacklogCard/);
    const docs = strippedSource('src/modules/finance/pages/DocumentsPage.tsx');
    expect(docs, 'the Expenses tab states what is in the inbox').toMatch(/<ExpenseBacklogSummary/);
    expect(strippedSource(DASHBOARD), 'and the dashboard does not repeat it')
      .not.toMatch(/<ExpenseBacklogCard/);
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
    // Once a document IS an expense the cost is in the P&L, and only voiding the bill or a
    // supplier credit note takes it out. The server refuses this, so offering it was a refusal
    // waiting to happen.
    expect(dlg, 'excluding an already-booked cost is not offered').toMatch(/disabled=\{alreadyBooked\}/);
    expect(dlg, 'nor submittable').toMatch(/disabled=\{busy \|\| \(outside && alreadyBooked\)\}/);
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

describe('the VAT return points the way it actually points', () => {
  it('labels the figure by its sign rather than always "payable"', () => {
    const card = strippedSource('src/modules/finance/components/PnlOverviewCard.tsx');
    // Calling it payable while negative says you owe money you are owed, and the sign table
    // lives once so the tile and the return cannot name one figure two ways.
    expect(card, 'a label derived from the sign').toMatch(/const vatLabel =/);
    expect(card).toMatch(/vatPayableLabel/);
    expect(card, 'the sign logic is spelled out here again').not.toMatch(/v < 0 ? 'VAT refundable'/);
  });

  it('renders the ΑΑΔΕ VAT it already fetches', () => {
    const card = strippedSource('src/modules/finance/components/PnlOverviewCard.tsx');
    // Both halves were returned by the RPC and neither reached the screen, so the one authority
    // figure the return can be checked against was unreachable.
    expect(card, 'AADE output VAT').toMatch(/aade_income_vat/);
    expect(card, 'AADE input VAT').toMatch(/aade_expense_vat/);
  });
});

describe('planning is two questions, and both can be acted on', () => {
  it('late lines and planned money are separate panes', () => {
    const tab = strippedSource('src/modules/finance/tabs/PlanningTab.tsx');
    // Stacked, the work queue pushed the money table below the fold and the page read as a
    // queue with a table under it.
    expect(tab, 'a tab strip, not a stack').toMatch(/<HubTabNav/);
    expect(tab, 'the late queue is one pane').toMatch(/pane === 'late' \? <LineWorkQueueCard/);
  });

  it('a planned payment can be edited, and offers only fields that save', () => {
    const tab = strippedSource('src/modules/finance/tabs/PlanningTab.tsx');
    expect(tab, 'rows open an edit').toMatch(/onEdit=\{setEditRow\}/);
    const dlg = strippedSource('src/modules/finance/components/NewPlannedPaymentDialog.tsx');
    expect(dlg, 'edit mode exists').toMatch(/editing = null/);
    // `updatePlannedPayment` carries neither direction nor currency, so an editable control for
    // them would save nothing and report that it had.
    expect(dlg, 'direction is fixed on edit').toMatch(/setDirection\(v as PlannedPaymentDirection\)\} disabled=\{isEdit\}/);
    expect(dlg, 'currency is fixed on edit').toMatch(/onValueChange=\{setCurrency\} disabled=\{isEdit\}/);
  });

  it('an expense is payable in one click wherever it is listed', () => {
    // The dialog was shared everywhere; the BUTTON was not. On an order, paying an attached
    // expense meant opening its ledger first — two clicks and a dialog hop from the row that
    // names it — while Payables and Planning paid in one.
    const orders = strippedSource('src/modules/finance/components/OrdersPanel.tsx');
    expect(orders, 'the expense row pays directly').toMatch(/setPayInOpen\(\{ amount: Number\(b\.amount_due\), expenseId: b\.id \}\)/);
  });

  it('settling one expense is not order-scoped, or it cannot settle anything', () => {
    // RecordPaymentDialog gates its expense list on `payingExpense && !orderId &&
    // !presetInvoiceId` on purpose: an order context is customer-scoped, and a supplier cost
    // inside it attaches money to the wrong side. Passed both, it loaded NO expenses — the
    // picker was empty and Save bounced on "Pick the expense" with nothing to pick.
    const dlg = strippedSource('src/modules/finance/components/RecordPaymentDialog.tsx');
    expect(dlg, 'the gate this depends on').toMatch(/allowExpense = payingExpense && !orderId && !presetInvoiceId/);

    const orders = strippedSource('src/modules/finance/components/OrdersPanel.tsx');
    // The expense branch must carry presetExpenseId and NOT orderId / presetInvoiceId.
    const branch = orders.slice(orders.indexOf('payInOpen?.expenseId'), orders.indexOf('{connectEmailGate}'));
    const expenseBranch = branch.slice(0, branch.indexOf(': {'));
    expect(expenseBranch, 'the expense branch targets the bill').toMatch(/presetExpenseId: payInOpen\.expenseId/);
    expect(expenseBranch, 'and drops the order scope').not.toMatch(/orderId:/);
    expect(expenseBranch, 'and the invoice scope').not.toMatch(/presetInvoiceId:/);
    // The order's party is the CUSTOMER on a sales order — the wrong payee for money going out.
    expect(expenseBranch, 'the payee comes from the bill').toMatch(/initialCounterparty: null/);
  });

  it('sendPayment has exactly one caller — the shared payment form', () => {
    // A second payout path is a second place for the rules about who may move money, and for the
    // FX and allocation guards, to live.
    const callers = INDEX.stripped()
      .filter(([f]) => !posix(f).endsWith('services/payoutService.ts'))
      .filter(([, src]) => /\bsendPayment\(/.test(src))
      .map(([f]) => posix(f));
    expect(callers, `unexpected payout callers:\n${callers.join('\n')}`)
      .toEqual(['src/modules/finance/components/RecordPaymentDialog.tsx']);
  });

  it('recording the money and closing the plan are one transaction', () => {
    const svc = strippedSource('src/modules/finance/services/financeService.ts');
    // Two client calls: the payment committed, the stamp failed, the screen said Failed, and the
    // operator pressed the only button offered — paying the same supplier twice.
    expect(svc, 'one RPC does both').toMatch(/rpc\('settle_planned_payment'/);
    expect(svc, 'and the two-step is gone').not.toMatch(/markPlannedPaymentPaid/);
    const tab = strippedSource('src/modules/finance/tabs/PlanningTab.tsx');
    expect(tab, 'both routes go through it').toMatch(/settlePlannedPayment\(row\.id\)/);
    expect(tab, 'including after the shared form').toMatch(/existingPaymentId: result\.paymentId/);
  });

  it('a SENT transfer does not close a plan — there is no payment row yet', () => {
    const dlg = strippedSource('src/modules/finance/components/RecordPaymentDialog.tsx');
    // Revolut sends the money; the bank feed writes the payment when it lands. Reporting that as
    // a settlement claims something the books cannot show.
    expect(dlg, 'the send path hands back no payment id').toMatch(/sent: out\.mode !== 'draft' && !out\.duplicate/);
    expect(dlg, 'a recorded payment hands its id back').toMatch(/onSaved\(\{ paymentId: recordedPaymentId \}\)/);
    const tab = strippedSource('src/modules/finance/tabs/PlanningTab.tsx');
    expect(tab, 'and only an id closes the plan').toMatch(/if \(!result\?\.paymentId\)/);
    // A draft has not left, and a duplicate never went. Three different facts, three sentences.
    expect(tab, 'a draft says nothing has left').toMatch(/result\?\.draft/);
    expect(tab, 'a duplicate says it was recognised').toMatch(/result\?\.duplicate/);
    // Nothing reconciles the bank feed back to a plan yet, so the copy must not promise it will.
    expect(tab, 'no promise that it closes itself').not.toMatch(/closes itself/);
  });

  it('a stale close is reported as the duplicate it is', () => {
    const tab = strippedSource('src/modules/finance/tabs/PlanningTab.tsx');
    // `already_paid` after recording means the plan was closed by something else and the payment
    // just made is attached to nothing — a duplicate, not a success.
    expect(tab, 'the outcome is read, not ignored').toMatch(/res\.outcome === 'already_paid'/);
    expect(tab, 'and reported destructively').toMatch(/check Payments for a duplicate/);
  });

  it('paying for real reuses the one payment form, not a second payout path', () => {
    const tab = strippedSource('src/modules/finance/tabs/PlanningTab.tsx');
    expect(tab, 'the shared dialog carries the send-or-record choice').toMatch(/<RecordPaymentDialog/);
    expect(tab, 'and there is no second sendPayment caller here').not.toMatch(/sendPayment\(/);
    // The payment is already recorded (possibly SENT) by the time the plan is closed, so a
    // failure to close must be said rather than swallowed.
    expect(tab, 'closing the plan reports its own failure').toMatch(/Payment recorded — the plan is still open/);
  });
});

describe('a recurring template never creates a cost on its own', () => {
  it('produces a PLAN by default, and only Expenses asks for a bill', () => {
    const svc = strippedSource('src/modules/finance/services/financeService.ts');
    // `bill` writes a supplier bill — and with auto_pay a PAYMENT — unattended, on a cron that is
    // already armed. It is never what a caller gets by forgetting to say.
    expect(svc, 'the safe default').toMatch(/const creates = input\.creates \?\? 'plan';/);
    expect(svc, 'a plan cannot pay itself').toMatch(/A recurring plan cannot pay itself/);
    const dlg = strippedSource('src/modules/finance/components/NewExpenseDialog.tsx');
    expect(dlg, 'the Expenses surface says bill explicitly').toMatch(/creates: 'bill'/);
    const card = strippedSource('src/modules/finance/components/RecurringPlansCard.tsx');
    expect(card, 'and Planning says plan').toMatch(/creates: 'plan'/);
    expect(card, 'Planning never offers auto-pay').not.toMatch(/autoPay/);
  });

  it('a plan template is not offered where a bill template belongs', () => {
    // Listed on Expenses it is described as generating a categorised bill each period, with an
    // Auto-pay column it can never use; offered as a leased asset's backing cost it creates none.
    const docs = strippedSource('src/modules/finance/pages/DocumentsPage.tsx');
    expect(docs, 'the Expenses recurring card filters').toMatch(/r\.creates !== 'plan'/);
    const assets = strippedSource('src/services/assetsService.ts');
    expect(assets, 'and so does the asset backing lookup').toMatch(/\.eq\('creates', 'bill'\)/);
  });

  it('there is ONE recurring system, not a second one beside it', () => {
    // A second table would be a second place for cadence, catch-up and the supplier link to live.
    const offenders = INDEX.stripped()
      .filter(([f]) => posix(f) !== 'src/integrations/supabase/types.ts')
      .filter(([, src]) => /recurring_plans|recurring_plan_templates/.test(src))
      .map(([f]) => posix(f));
    expect(offenders, `a second recurring store:\n${offenders.join('\n')}`).toEqual([]);
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
