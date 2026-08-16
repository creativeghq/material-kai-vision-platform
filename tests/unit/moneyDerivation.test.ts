/**
 * Money-derivation guard.
 *
 * The bug this exists to stop: "how much is still owed on this order" was implemented FIVE times
 * — twice in SQL (`recompute_order_payment_status`, `dic_detect__finance_order_over_settled`) and
 * three times in TypeScript (`settledByOrder` + OrdersPanel, `listUninvoicedOutstanding`,
 * `orderSettled`). Four applied the rule "a sales order settles on money IN, a purchase order on
 * money OUT" correctly; one netted the two directions. The result was an order row showing
 * `Payment: Paid` next to `Outstanding: €945` — the exact amount we had paid our supplier —
 * with the DB perfectly consistent the whole time.
 *
 * No stored-data integrity check can see that, because nothing was wrong with the stored data.
 * No typecheck can see it, because a wrong number is a valid `number`. The only durable fix is to
 * have ONE derivation, in SQL, and let TypeScript format the answer.
 *
 * So: `get_order_settlements` returns `settled` / `outstanding` / `payment_status` already
 * derived, and this test fails the build if the finance client-side code starts doing the
 * arithmetic again.
 *
 * SCOPE — read this before assuming a clean run means the invariant holds.
 * These tests scan REPO FILES, so they can only ever see the TypeScript half. This project's SQL
 * is applied through the Supabase MCP and never committed as a file (CLAUDE.md), so a function
 * body exists only in `pg_proc` and is invisible here. That is not hypothetical: audit #271 item 3
 * was a violation in `issue_invoice_from_quote`, which built an invoice from the quote's stale
 * `grand_total` while every TypeScript path correctly read the derivation — these tests passed
 * throughout, and a second copy of the same bug sat in `create_project_progress_invoice`.
 *
 * The SQL half is guarded in SQL, by the `finance.money_fn_bypasses_derivation` integrity check
 * (`dic_detect__finance_money_fn_bypasses_derivation`), plus `finance.derived_doc_drift` comparing
 * each invoice to its source quote's DERIVED total. Adding a money derivation to SQL means adding
 * it there — a green `npm test` says nothing about it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const FINANCE_DIRS = [
  'src/modules/finance',
  'src/modules/quotes',
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the old bug doesn't trip the scanner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('order settlement has exactly one derivation', () => {
  const files = FINANCE_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('finds finance sources to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  /**
   * Re-applying the direction rule in TypeScript is the specific mistake. `settled_in` and
   * `settled_out` are returned for DISPLAY (an order page shows both sides of the trade); the
   * moment one of them is picked by order type, someone is restating the rule.
   */
  it('never picks a settlement half by order type in TypeScript', () => {
    const offenders: string[] = [];
    // Any line that branches on the order type AND reaches for one of the two halves — whether
    // it names them (`fin.settled_in`) or aliases them (`s?.in` / `s?.out`, which is how the
    // original bug was written after its first fix).
    const HALF = String.raw`(?:\bsettled_(?:in|out)\b|\bsettled(?:In|Out)\b|[?.]\s*\b(?:in|out)\b\s*\?\?)`;
    const RE = new RegExp(`order_type[^\\n]*${HALF}|${HALF}[^\\n]*order_type`);
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (RE.test(line)) offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'Pick the settlement side in SQL, not here. `get_order_settlements` already returns ' +
      '`settled` (the direction-correct half) and `outstanding`. Read those.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * `total − settled` is the outstanding formula. It belongs in `get_order_settlements`, which is
   * also what drives `payment_status` and the `finance.order_payment_status_drift` check — so the
   * badge and the balance are incapable of disagreeing.
   */
  it('never recomputes outstanding as total − settled in TypeScript', () => {
    const offenders: string[] = [];
    // THIS TEST HAD A PROVEN FALSE NEGATIVE.
    // The old pattern ended `[-−]\s*(settled|paid|net)\b`, requiring the word to start right
    // after the minus. A live reintroduction at OrdersPanel.tsx:1778 read
    //     Math.max(0, Math.round((Number(order.total) - orderSettled()) * 100) / 100)
    // and sailed straight through, because `\bsettled` does not match inside the identifier
    // `orderSettled`. A text-pattern rule is only ever as strong as the names people happen to
    // pick — and whoever wrote the sixth derivation naturally named the helper after the thing
    // it returned. No leading \b now, so orderSettled / totalPaid / netSettled all count.
    const RE = /\btotal\b[^\n]{0,40}[-−]\s*[A-Za-z_$.]*(settled|paid|net)/i;
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (RE.test(line)) offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'Outstanding is derived once, in `get_order_settlements`. Read `outstanding` from ' +
      '`ordersService.orderBalances()` instead of subtracting here.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The structural half, which carries the real weight.
   *
   * The pattern rule above can always be dodged by a name nobody predicted — that is how the
   * sixth derivation got in. This one makes a claim naming cannot escape: `outstanding` is a
   * value you READ from the derivation, never one you ASSIGN from arithmetic. Any
   * `const outstanding = <expression containing an operator>` is a re-derivation regardless of
   * what the operands are called.
   *
   * Allowed: `= fin.outstanding`, `= balances.get(id)?.outstanding ?? 0`, `= row.outstanding`.
   * Rejected: `= Math.max(0, total - anythingAtAll)`.
   */
  it('assigns `outstanding` only by reading it, never by arithmetic', () => {
    const offenders: string[] = [];
    // `const outstanding[: type] = ...` up to the end of the line.
    const DECL = /\b(?:const|let|var)\s+outstanding\s*(?::[^=]+)?=\s*(.+)$/;
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        const m = DECL.exec(line);
        if (!m) continue;
        const rhs = m[1];
        // A read looks like `x.outstanding`, possibly with ?? / optional chaining. Arithmetic
        // operators or Math.* on the right-hand side mean it is being computed here instead.
        const reads = /\.outstanding\b/.test(rhs);
        const computes = /[-+*/]|Math\./.test(rhs.replace(/\?\?/g, ''));
        if (!reads || computes) {
          offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      'Outstanding is derived ONCE, in `get_order_settlements`, and returned already ' +
      'direction-resolved. Read it (`fin.outstanding`) — do not recompute it here. This is the ' +
      'assertion the pattern rule above could not make, and the one that would have caught the ' +
      'OrdersPanel reintroduction.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /** The RPC is the single source; nothing should hand-roll the allocation sum around it. */
  it('reads settlement only through ordersService.orderBalances / get_order_settlements', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      // A direct allocation query joined to payment direction = a private settlement derivation.
      if (/from\(['"]payment_allocations['"]\)[\s\S]{0,200}payments?\s*\([^)]*direction/.test(src)) {
        offenders.push(relative(ROOT, f));
      }
    }
    expect(
      offenders,
      'Summing payment_allocations by direction IS the settlement rule. Call ' +
      '`ordersService.orderBalances()` so there stays exactly one copy of it.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The DISPLAY half of the same invariant, and the one that kept slipping.
   *
   * `orders.payment_status` is a CACHE of what `get_order_settlements` derives, maintained by
   * `recompute_order_payment_status`. Reading it is not arithmetic, so none of the rules above can
   * see it — and every rule above passed while three different screens rendered it. The orders LIST
   * was fixed to read the derivation ("Paid" was appearing beside a non-zero Outstanding); the order
   * DETAIL header and the finance dashboard's Recent-orders card were not, so the same order read
   * one way in the table and another way one click deeper.
   *
   * The claim: every site that indexes the label map must consult the derivation. Falling back to
   * the cached column when the balance has not loaded yet is fine — leading with it is not.
   * Scanned across all of `src`, not just the finance dirs: two of the three offenders lived
   * outside them, which is why a finance-scoped scan reported this clean.
   */
  it('renders the order payment badge from the derivation, never the cached column', () => {
    const offenders: string[] = [];
    // The index expression is the whole question — `ORDER_PAYMENT_LABEL[s]` in a filter-options
    // builder maps over the map's own keys and is not a status read at all.
    const SITE = /ORDER_PAYMENT_LABEL\[([^\]]*)\]/g;
    // Consulted the derivation: `fin?.payment_status`, `balances.get(id)?.payment_status`,
    // `balanceById.get(r.id)?.…`, `settlement.payment_status`.
    const DERIVED = /\b(fin|balance|balances|balanceById|settlement|settled|derived)\w*\s*[?.]/i;
    for (const f of walk(join(ROOT, 'src'))) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        for (const m of line.matchAll(SITE)) {
          const idx = m[1];
          if (!/\.payment_status\b/.test(idx)) continue;
          if (DERIVED.test(idx)) continue;
          offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      'The payment word comes from `get_order_settlements`, not from the cached ' +
      '`orders.payment_status` column. Read `fin.payment_status` (getOrderFinance) or ' +
      '`ordersService.orderBalances(ids).get(id)?.payment_status`, falling back to the column only ' +
      'while that load is in flight.\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});

/**
 * Quote totals had the SAME shape of bug, found later: the money
 * chain subtotal -> cash discount -> +extras -> VAT -> grand total was implemented THREE times in
 * TypeScript and ZERO times in SQL. They rounded differently, so `priceAfterDiscount + vat` and
 * `final` could disagree by a cent — and none of them folded in `extras_total`, so a customer
 * accepting a EUR 500 upsell signed a document reading Price 1000 / Extras 500 / VAT 240 /
 * Final 1240 and was never billed for the upsell.
 *
 * `public.get_quote_totals(uuid[])` is now the single source and `reprice_quote_items` the only
 * write path. Exactly ONE TypeScript function may mirror the arithmetic —
 * `previewTotalsBreakdown`, which answers "what would this come to if I saved these prices?" for
 * prices that are not in the database yet. These tests fail the build if a second one appears.
 */
describe('quote totals have exactly one derivation', () => {
  const posix = (p: string) => relative(ROOT, p).split('\\').join('/');

  /**
   * Deliberately narrower than FINANCE_DIRS. The VAT-step pattern is generic — the wider scan
   * flagged `timeTrackingService` and `tripExpenseService`, which compute VAT for time entries
   * and trip expenses. Those are DIFFERENT money quantities with their own derivations, and
   * pointing this failure at them would send someone to "fix" a non-bug by routing a timesheet
   * through get_quote_totals. Quote money lives in these paths.
   */
  const files = [
    ...walk(join(ROOT, 'src/modules/quotes')),
    join(ROOT, 'src/pages/PublicQuotePage.tsx'),
  ].filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });

  it('finds quote sources to scan', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  /** The one sanctioned mirror, for unsaved prices only. */
  const QUOTE_TOTALS_SOURCE = 'src/modules/quotes/utils/quoteTotals.ts';

  /**
   * The one sanctioned reader of the paid-upfront rule. `previewTotalsBreakdown` needs the
   * percentage as an INPUT before anything is saved, and it has to be the same percentage
   * `get_quote_totals` will pick — so this query mirrors that ORDER BY sort_order / LIMIT 1
   * deliberately. It is a lookup, not a second derivation of the total. The copy that made
   * this a finding was the inline duplicate inside QuotePDFService.saveItemPrices, which is
   * gone: that path now derives in SQL and never asks for the percentage at all.
   */
  const CASH_DISCOUNT_SOURCE = 'src/modules/finance/services/financeService.ts';

  it('computes VAT from a net base in exactly one place', () => {
    const offenders: string[] = [];
    // `<net|taxable|afterDiscount…> * (vatRate / 100)` — the VAT step itself.
    // Case-insensitive and WITHOUT a leading \b on purpose. Both were wrong in the first
    // draft of this test, which then passed against the very line it was written to catch:
    // `pricingNetAfterCash * (pricingVatRate / 100)` carries its "net" mid-identifier, so
    // `\bnet` never matched. A guard that cannot fail is worth less than no guard at all —
    // it reports the codebase clean. Verified against both real offenders before landing.
    const RE = /(net|taxable|aftercash|afterdiscount|priceafter)\w*\s*\*\s*\(?\s*\w*vat\w*\s*\/\s*100/i;
    for (const f of files) {
      if (posix(f) === QUOTE_TOTALS_SOURCE) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (RE.test(line)) offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'Quote VAT is derived once, in `public.get_quote_totals`. Persist through ' +
      '`reprice_quote_items` and render what it returns; for an unsaved preview call ' +
      `\`previewTotalsBreakdown\` in ${QUOTE_TOTALS_SOURCE}.\n` + offenders.join('\n'),
    ).toEqual([]);
  });

  it('never re-resolves the cash-discount rule with its own query', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (posix(f) === CASH_DISCOUNT_SOURCE) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      // A copy of the pricing_custom_rules lookup = a second definition of the discount input.
      if (/from\(['"]pricing_custom_rules['"]\)[\s\S]{0,300}cash_payment/.test(src)) {
        offenders.push(posix(f));
      }
    }
    expect(
      offenders,
      'The paid-upfront discount is resolved inside `get_quote_totals` for anything that ' +
      `persists, and read once via \`${CASH_DISCOUNT_SOURCE}\` for the unsaved preview. ` +
      'Do not add a third copy of the query.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('saves quote pricing only through the atomic RPC', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      // Writing the cached totals directly bypasses the derivation AND the drift check.
      if (/from\(['"]quotes['"]\)[\s\S]{0,200}\.update\(\{[\s\S]{0,300}grand_total/.test(src)) {
        offenders.push(posix(f));
      }
    }
    expect(
      offenders,
      'Call `reprice_quote_items`, which restamps quotes from `get_quote_totals()` in one ' +
      'transaction. Writing grand_total by hand is what the `finance.quote_totals_drift` ' +
      'integrity check exists to catch.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * A CONFIGURED line is a fourth thing that can carry a wrong number, and it went wrong by
   * OMISSION rather than by arithmetic: the agent's `create_quote` took `product_id` + price and
   * had no configuration field at all, so a selection the customer configured degraded to the base
   * product — quoted at the base, invoiced at the upgrade. Nothing disagreed about a derivation;
   * the option delta was simply dropped on the way to the quote (#341 join 3).
   *
   * `add_configuration_to_quote` reads the options, checks the option rules, prices through
   * `get_configured_product_price` and inserts the row in ONE statement, so the price is frozen in
   * the same breath it is read. Whoever WRITES the line must therefore not price the configuration
   * itself — that would reopen the window between reading and freezing, and give a second place to
   * "adjust" the figure on the way past.
   */
  const QUOTE_ITEM_WRITERS = [
    ...walk(join(ROOT, 'src/modules/quotes')),
    ...walk(join(ROOT, 'src/services')),
    ...walk(join(ROOT, 'supabase/functions/_shared/tools')),
  ].filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });

  it('nothing that inserts a quote line also prices a configuration itself', () => {
    const offenders: string[] = [];
    for (const f of QUOTE_ITEM_WRITERS) {
      const src = stripComments(readFileSync(f, 'utf8'));
      const writesLines = /from\(['"]quote_items['"]\)[\s\S]{0,200}\.(insert|upsert)\(/.test(src);
      if (writesLines && src.includes('get_configured_product_price')) offenders.push(posix(f));
    }
    expect(
      offenders,
      'A file that inserts quote_items must not call `get_configured_product_price` — route the ' +
      'line through `add_configuration_to_quote`, which prices and freezes it in one statement.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  it('the agent can still carry a configuration onto a quote', () => {
    // The other half of the same rule. Without this, "route it through the RPC" is satisfied just
    // as well by dropping the capability again — which is the state that produced the bug.
    const src = readFileSync(join(ROOT, 'supabase/functions/_shared/tools/quote-tools.ts'), 'utf8');
    expect(src, 'create_quote must accept a configuration_id line').toContain('configuration_id');
    expect(src, 'configured lines must be inserted by the RPC').toContain('add_configuration_to_quote');
  });
});

/**
 * Rent received — the THIRD money quantity to acquire the same shape, found reviewing #281.
 *
 * `property_rent_charges` carries a hand-set `status`/`paid_amount`, set from the Lettings tab. It
 * can ALSO carry an `invoice_id`, and then the tenant's money arrives in Finance as a
 * `payment_allocations` row that the rent charge never hears about. Two answers to "how much rent
 * has this tenancy actually received", nothing reconciling them:
 *
 *   - `landlord-statement` summed `status === 'paid'`, so a tenant who paid the rent invoice by
 *     card left the landlord statement reporting the rent as still outstanding and `net_to_landlord`
 *     short by exactly that amount — while Finance showed the invoice paid.
 *
 * Same signature as the order bug: stored data flawless, derived number wrong, invisible to both
 * the typecheck and every stored-data integrity check.
 *
 * `public.get_rent_charge_settlements(uuid[])` is now the single source (invoiced → the ledger;
 * uninvoiced → the manual flag, which is then the only record of the money), read through
 * `withRentSettlements`. `realestate.rent_charge_status_drift` guards the SQL half.
 */
describe('rent settlement has exactly one derivation', () => {
  const posix = (p: string) => relative(ROOT, p).split('\\').join('/');
  // Both halves of the module: the edge function is where the offending sum actually lived, so a
  // scan limited to src/ would have reported this clean.
  const files = [
    ...walk(join(ROOT, 'src/modules/real-estate')),
    ...walk(join(ROOT, 'supabase/functions/real-estate-api')),
    ...walk(join(ROOT, 'supabase/functions/real-estate-rent-invoicing')),
    ...walk(join(ROOT, 'supabase/functions/_shared/real-estate.ts')),
    join(ROOT, 'supabase/functions/_shared/real-estate.ts'),
  ].filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });

  /** The one sanctioned reader of the RPC — the helper every consumer goes through. */
  const RENT_SETTLEMENT_SOURCE = 'supabase/functions/_shared/real-estate.ts';

  it('finds real-estate sources to scan', () => {
    expect(files.length).toBeGreaterThan(3);
  });

  /**
   * The historical offender, verbatim in shape: filter the charges by the stored paid flag, then
   * reduce them into a money total. Matching filter+reduce on one line is what `landlord-statement`
   * did; the multi-line form is caught by the structural test below.
   */
  it('never totals rent by filtering on the stored paid flag', () => {
    const offenders: string[] = [];
    const RE = /\.filter\([^\n]*status\s*===?\s*['"](?:paid|waived)['"][^\n]*\)[^\n]*\.reduce\(/;
    for (const f of files) {
      if (posix(f) === RENT_SETTLEMENT_SOURCE) continue; // holds the documented fallback
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (RE.test(line)) offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'An invoiced rent charge is settled by the Finance ledger — its stored `status` does not ' +
      'move when the tenant pays. Sum `settled` / `outstanding` from `withRentSettlements()` ' +
      '(get_rent_charge_settlements) instead.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The structural claim, which naming cannot dodge (the lesson from the OrdersPanel reintroduction):
   * rent received is a value you READ from the derivation, never one you ASSIGN from arithmetic.
   */
  it('assigns rent received only by reading the derivation', () => {
    const offenders: string[] = [];
    const DECL = /\b(?:const|let|var)\s+(?:rentReceived|rent_received|rentSettled|rentOutstanding|rent_outstanding)\s*(?::[^=]+)?=\s*(.+)$/;
    for (const f of files) {
      if (posix(f) === RENT_SETTLEMENT_SOURCE) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        const m = DECL.exec(line);
        if (!m) continue;
        // A read reduces over the DERIVED fields; anything else is arithmetic on raw charge rows.
        if (!/\b(?:settled|outstanding|payment_status)\b/.test(m[1])) {
          offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      'Rent received/outstanding is derived ONCE, in `get_rent_charge_settlements`. Read `settled` ' +
      'and `outstanding` off the rows `withRentSettlements()` returns.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /** Nothing outside the shared helper should hand-roll the allocation sum for rent. */
  it('reads rent settlement only through the shared helper', () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (posix(f) === RENT_SETTLEMENT_SOURCE) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      if (/from\(['"]payment_allocations['"]\)/.test(src)) offenders.push(posix(f));
    }
    expect(
      offenders,
      'Summing payment_allocations IS the settlement rule. Call `withRentSettlements()` so there ' +
      'stays exactly one copy of it.\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});

/**
 * Project job cost — the FOURTH money quantity, added with WS2 of #285.
 *
 * Project margin has the same latent shape as the three above: it is assembled from four inputs
 * that each already live somewhere else (accepted quotes, issued invoices, supplier bills, logged
 * time), so the tempting move is to fetch the four lists into the Finance tab and subtract. That
 * is precisely how the order bug was written. Two specific traps here:
 *
 *   - `contracted_revenue` (accepted quotes) and `billed_revenue` (issued invoices) are two views
 *     of the SAME revenue. An invoice normally derives from a quote, so adding them double-counts.
 *   - `committed_cost` (open POs) and `supplier_cost` (bills) overlap the moment a bill is received
 *     against a PO. `get_project_pnl` nets the bill off the commitment; a client-side sum would not.
 *
 * `public.get_project_pnl(uuid)` is the single source and delegates labor to
 * `public.get_project_labor(uuid)` rather than re-summing `time_entries`, so the job-cost card and
 * the labor strip are incapable of disagreeing. These tests fail the build if the projects module
 * starts doing any of that arithmetic itself.
 */
describe('project job cost has exactly one derivation', () => {
  const posix = (p: string) => relative(ROOT, p).split('\\').join('/');
  const files = walk(join(ROOT, 'src/modules/projects'));

  it('finds project sources to scan', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  /**
   * Structural claim, the one naming cannot dodge: every P&L figure is READ from the derivation,
   * never ASSIGNED from arithmetic.
   */
  const PNL_DECL =
    /\b(?:const|let|var)\s+(?:marginAmount|margin_amount|marginPct|laborCost|labor_cost|actualCost|actual_cost|committedCost|committed_cost|billedRevenue|contractedRevenue|projectWip|expenseCost|expense_cost)\s*(?::[^=]+)?=\s*(.+)$/;

  /** Querying the raw inputs inside the projects module IS a private job-cost derivation. */
  const RAW_INPUT_QUERY = /from\(['"](?:time_entries)['"]\)/;

  it('the patterns actually match a violation', () => {
    // A guard that cannot fail reports the codebase clean forever. Both rules are pinned against
    // the shape they exist to catch, written the way someone would naturally write it.
    const badDecl = '    const marginAmount = billedRevenue - (supplierCost + laborCost);';
    const m = PNL_DECL.exec(badDecl);
    expect(m, 'declaration pattern must match hand-rolled margin').not.toBeNull();
    expect(/[-+*/]|Math\./.test(m![1])).toBe(true);

    // Expense cost is the newest component of actual_cost and the easiest to re-sum by hand,
    // because trip_expense_items sits right there with an `amount` column.
    const badExpense = '    const expenseCost = items.reduce((s, e) => s + e.amount, 0);';
    const me = PNL_DECL.exec(badExpense);
    expect(me, 'declaration pattern must match a hand-rolled expense sum').not.toBeNull();
    expect(/[-+*/]|Math\./.test(me![1])).toBe(true);

    const goodDecl = '    const marginAmount = pnl.margin_amount;';
    const g = PNL_DECL.exec(goodDecl);
    expect(/[-+*/]|Math\./.test(g![1])).toBe(false);

    expect(RAW_INPUT_QUERY.test(`supabase.from('time_entries').select('minutes, hourly_rate')`)).toBe(true);
  });

  it('assigns P&L figures only by reading the derivation', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        const m = PNL_DECL.exec(line);
        if (!m) continue;
        if (/[-+*/]|Math\./.test(m[1].replace(/\?\?/g, ''))) {
          offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      'Project margin, labor and committed cost are derived ONCE, in `public.get_project_pnl`. ' +
      'Read them off `projectsService.getProjectPnl()` — do not subtract here.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('never re-sums time_entries for labor cost in the projects module', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      if (RAW_INPUT_QUERY.test(src)) offenders.push(posix(f));
    }
    expect(
      offenders,
      'Labor cost is derived by `public.get_project_labor`, which `get_project_pnl` calls. Read ' +
      'it via `timeTrackingService.getProjectLabor()` rather than summing minutes x rate here — ' +
      'a second copy is how the job-cost card and the labor strip start disagreeing.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

});

/**
 * Asset book value — the FIFTH, and the one that was already live when WS8 of #285 found it.
 *
 * `assetsService.computeDepreciation` computed straight-line book value in TypeScript. It was the
 * only implementation, so nothing disagreed with it *yet* — but it silently returned null for
 * `declining_balance` and kept depreciating an asset after it had been disposed of, because a
 * client-side helper has no reason to know about `disposed_on`. `public.get_asset_book_values` is
 * now the single source and handles both.
 */
describe('asset book value has exactly one derivation', () => {
  const posix = (p: string) => relative(ROOT, p).split('\\').join('/');
  const files = [
    join(ROOT, 'src/services/assetsService.ts'),
    ...walk(join(ROOT, 'src/components/business/assets')),
  ].filter((f) => { try { return statSync(f).isFile(); } catch { return false; } });

  it('finds asset sources to scan', () => {
    expect(files.length).toBeGreaterThan(1);
  });

  /** Book value / accumulated depreciation are READ from the RPC, never assigned from arithmetic. */
  const DECL =
    /\b(?:const|let|var)\s+(?:bookValue|book_value|accumulated|accumulatedDepreciation|monthlyDepreciation|monthly|depreciable)\s*(?::[^=]+)?=\s*(.+)$/;

  it('the pattern actually matches the code it replaced', () => {
    // These are the real lines from the deleted computeDepreciation helper. If the pattern stops
    // matching them, the guard has quietly stopped guarding.
    for (const bad of [
      '  const depreciable = Math.max(0, cost - salvage);',
      '  const monthly = depreciable / life;',
      '  const accumulated = Math.min(depreciable, elapsed * monthly);',
    ]) {
      const m = DECL.exec(bad);
      expect(m, `pattern must match: ${bad}`).not.toBeNull();
      expect(/[-+*/]|Math\./.test(m![1])).toBe(true);
    }
    const good = '  const bookValue = row.book_value;';
    expect(/[-+*/]|Math\./.test(DECL.exec(good)![1])).toBe(false);
  });

  it('assigns book value only by reading the derivation', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        const m = DECL.exec(line);
        if (!m) continue;
        if (/[-+*/]|Math\./.test(m[1].replace(/\?\?/g, ''))) {
          offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    expect(
      offenders,
      'Book value is derived ONCE, in `public.get_asset_book_values` — which also handles ' +
      'declining balance and stops at `disposed_on`. Read it; do not recompute it here.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('the line sell price has exactly one derivation', () => {
  /**
   * #347 defect 18 — the fourth money derivation, and the one that hid longest.
   *
   * `get_product_price_for_workspace` is the single price resolver: cost -> retail -> the discount
   * ladder -> quantity breaks. But the CATEGORY custom rules (`category_extra`, `volume_category`)
   * were resolved in TypeScript, in `QuotesService._layerBFactor`, which read
   * `pricing_custom_rules` from the client, sorted by category ancestry, and multiplied
   * `1 - pct/100` onto whatever the resolver had already returned.
   *
   * It ran at two call sites in QuotesService and nowhere else. So the same product, for the same
   * customer, at the same quantity, cost one thing on a quote and a different thing on an order —
   * and the order was never told these rules existed. Nothing failed. Both numbers were valid.
   *
   * Phase 1.1 moved them into the resolver, preserving the multiply-on-top semantics exactly, so
   * `suggested_sell` / `final_sell` is now the WHOLE answer. `cash_payment` deliberately stays
   * document-level (it reduces the subtotal before VAT, not a line price) with its own single
   * source, `get_workspace_cash_discount_pct`.
   *
   * SCOPE: same caveat as every block in this file — TypeScript only. The SQL half is the
   * resolver itself, which is not committed as a file.
   */
  const files = FINANCE_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const posix = (p: string) => relative(ROOT, p).split(sep).join('/');

  /**
   * The rules table has exactly two legitimate client-side uses, and both are AUTHORING: the
   * admin card that edits rules, and the service methods behind it (list / upsert / delete).
   * Neither asks "which rule applies to this product" — that question belongs to SQL.
   */
  const AUTHORING = [
    'src/modules/finance/components/CustomPricingRulesCard.tsx',
    'src/modules/finance/services/financeService.ts',
  ];

  it('finds finance and quote sources to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('only the authoring surfaces touch pricing_custom_rules at all', () => {
    const offenders = files
      .filter((f) => !AUTHORING.includes(posix(f)))
      .filter((f) => /pricing_custom_rules/.test(stripComments(readFileSync(f, 'utf8'))))
      .map(posix);
    expect(
      offenders,
      'pricing_custom_rules is APPLIED by get_product_price_for_workspace (line discounts) and ' +
      'get_workspace_cash_discount_pct (the document cash discount). Touching it anywhere else ' +
      'is a second answer to "what does this cost".' + offenders.join(', '),
    ).toEqual([]);
  });

  it('nobody looks a rule up BY TYPE — that is policy, and policy lives in SQL', () => {
    // The precise shape of both deleted copies: `.eq('rule_type', 'cash_payment')` in
    // financeService and again, hand-written, in quote-tools.ts. Asking the table WHICH rule
    // applies is applying policy; the CRUD above merely lists rows for an editor.
    const LOOKUP = /\.eq\(\s*['"]rule_type['"]/;
    const offenders = files
      .filter((f) => LOOKUP.test(stripComments(readFileSync(f, 'utf8'))))
      .map(posix);
    expect(
      offenders,
      'Look the rule up in SQL — get_workspace_cash_discount_pct, or the resolver. ' +
      offenders.join(', '),
    ).toEqual([]);
    // Guard the guard: a pattern that matches nothing real is a green tick that means nothing.
    expect(LOOKUP.test(".eq('rule_type', 'cash_payment')")).toBe(true);
    expect(LOOKUP.test(".eq('id', id)")).toBe(false);
  });

  it('does not reintroduce a Layer-B style factor', () => {
    const offenders = files
      .filter((f) => stripComments(readFileSync(f, 'utf8')).includes('layerBFactor'))
      .map(posix);
    expect(
      offenders,
      '_layerBFactor was deleted in #347 phase 1.2 — the category rules live in the resolver.',
    ).toEqual([]);
  });

  it('never multiplies a resolver price by a locally computed factor', () => {
    const SCALE = /\b(suggested_sell|final_sell|unitPrice|recomputed)\b[^\n;]*\*\s*factor\b/;
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (SCALE.test(line)) offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'The resolver returns the FINAL sell price — ladder, quantity break and category rules ' +
      'included. Scaling it afterwards is a second derivation.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the scanner would catch the code that was deleted', () => {
    // Guard the guard: a pattern that matches nothing real is a green tick that means nothing.
    const SCALE = /\b(suggested_sell|final_sell|unitPrice|recomputed)\b[^\n;]*\*\s*factor\b/;
    expect(SCALE.test('recomputed = Math.round(recomputed * factor * 100) / 100;')).toBe(true);
    expect(SCALE.test('if (factor < 1) unitPrice = Math.round(unitPrice * factor * 100) / 100;')).toBe(true);
    expect(SCALE.test('const total = unitPrice * quantity;')).toBe(false);
  });
});

/**
 * The product catalog price (`product_prices`) — one derivation, and one upsert target.
 *
 * Two separate defects met on this table (#367) and each hid the other.
 *
 * 1. `discount_price` was derived in THREE TypeScript places — PriceLookupDrawer,
 *    ProductPricingCard, marketplacePricingService.setListPrice. Two rounded to 2dp, one did
 *    not, and the unrounded copy travelled out of the drawer into `quote_items.discounted_price`
 *    and `order_items.unit_price`, both unconstrained `numeric`, which store a float tail
 *    verbatim. 67.00000000000001 next to 67 is enough for `discounted_price !== unit_price` to
 *    read as a discount, so a quote line rendered a struck-through 67 above 67.00.
 *    The column is now GENERATED ALWAYS in Postgres. A fourth copy cannot be written: the
 *    insert fails with 428C9.
 *
 * 2. Every writer named `onConflict: 'workspace_id,product_id'`, but the only unique index is
 *    (workspace_id, product_id, variant_key) NULLS NOT DISTINCT. That is not a narrower match —
 *    Postgres raises 42P10, so every catalog price save failed. The two frontend sites threw
 *    (visible), the MIVAA one logged a warning and returned success (silent). The table held one
 *    row platform-wide.
 *
 * SCOPE: this scans repo files, so it sees the TypeScript half only. The MIVAA writer
 * (`app/api/products.py`) lives in a submodule that is EMPTY in CI — a scan of it here would
 * report "no offenders" for the wrong reason, so it is deliberately not scanned. The generated
 * column is the backstop that covers every runtime at once.
 */
describe('the product catalog price has one derivation and one upsert target', () => {
  const posix = (p: string) => relative(ROOT, p).split(sep).join('/');
  const PRICE_DIRS = [
    'src/components/features/pricing',
    'src/components/business/marketplace',
    'src/modules/finance',
    'src/modules/quotes',
    'src/services',
  ];
  const files = PRICE_DIRS
    .flatMap((d) => walk(join(ROOT, d)))
    // GENERATED by `supabase gen types`; it names every column of every table by definition.
    .filter((f) => posix(f) !== 'src/integrations/supabase/types.ts');

  it('finds the pricing sources to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('never writes or derives discount_price in TypeScript', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const [i, line] of src.split('\n').entries()) {
        if (/\bdiscount_price\b/.test(line)) offenders.push(`${posix(f)}:${i + 1}: ${line.trim().slice(0, 120)}`);
      }
    }
    expect(
      offenders,
      'product_prices.discount_price is GENERATED ALWAYS AS round(list_price * (1 - ' +
      'discount_percent/100), 2). Reading it is pointless (nothing consumes it) and writing it ' +
      'raises 428C9. Derive nothing here.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * Scoped to the `product_prices` statement itself, not the file. A file-wide scan flagged
   * `storefrontService.saveConfig`, whose `onConflict: 'workspace_id'` is right for
   * `workspace_storefront` and merely shares a file with a product_prices read.
   */
  const productPriceUpserts = (src: string): { line: number; target: string | null }[] => {
    const out: { line: number; target: string | null }[] = [];
    const starts = [...src.matchAll(/\.from\(\s*['"]product_prices['"]\s*\)/g)];
    for (const s of starts) {
      const from = s.index ?? 0;
      // The statement runs until the next `.from(` on any table, or the end of the file.
      const nextFrom = src.slice(from + 1).search(/\.from\(/);
      const stmt = src.slice(from, nextFrom === -1 ? undefined : from + 1 + nextFrom);
      if (!/\.upsert\(/.test(stmt)) continue;
      const m = /onConflict:\s*['"]([^'"]+)['"]/.exec(stmt);
      out.push({ line: src.slice(0, from).split('\n').length, target: m ? m[1] : null });
    }
    return out;
  };

  it('every product_prices upsert names the full unique-index tuple', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const u of productPriceUpserts(src)) {
        if (u.target !== 'workspace_id,product_id,variant_key') {
          // A missing onConflict is not a lucky escape: it infers the primary key `id`, which a
          // new row never supplies, so the upsert inserts a duplicate instead of updating.
          offenders.push(`${posix(f)}:${u.line}: onConflict ${u.target === null ? '(absent)' : `'${u.target}'`}`);
        }
      }
    }
    expect(
      offenders,
      "The unique index is (workspace_id, product_id, variant_key) NULLS NOT DISTINCT. Any other " +
      'column list is 42P10 "no unique or exclusion constraint matching the ON CONFLICT ' +
      'specification" — a 100% failure, not a looser match. If the index changes, change it here ' +
      'too; this constant is the only thing tying the two together.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the scanners would catch the code they replaced', () => {
    // Guard the guard: a pattern that matches nothing real is a green tick that means nothing.
    const DERIVE = /\bdiscount_price\b/;
    expect(DERIVE.test('discount_price: lp != null && dp != null ? Math.round(lp * (1 - dp / 100) * 100) / 100 : null,')).toBe(true);
    expect(DERIVE.test('const discount_price = proposal?.list_price && discount_percent != null')).toBe(true);
    expect(DERIVE.test('discount_percent: opts.discountPercent,')).toBe(false);

    // The exact shape of the three sites that failed 42P10, and the one that never did.
    const broken = "supabase.from('product_prices').upsert({ workspace_id: w }, { onConflict: 'workspace_id,product_id' });";
    expect(productPriceUpserts(broken)).toEqual([{ line: 1, target: 'workspace_id,product_id' }]);
    const fixed = "supabase.from('product_prices').upsert({ workspace_id: w }, { onConflict: 'workspace_id,product_id,variant_key' });";
    expect(productPriceUpserts(fixed)).toEqual([{ line: 1, target: 'workspace_id,product_id,variant_key' }]);
    expect(productPriceUpserts("supabase.from('product_prices').upsert({ a: 1 });")).toEqual([{ line: 1, target: null }]);
    // Another table's upsert, and a product_prices READ, are both none of its business.
    expect(productPriceUpserts("supabase.from('workspace_storefront').upsert(c, { onConflict: 'workspace_id' });")).toEqual([]);
    expect(productPriceUpserts("supabase.from('product_prices').select('list_price').eq('id', id);")).toEqual([]);
    // A product_prices read must not absorb the NEXT statement's onConflict — the false positive
    // this replaced.
    expect(productPriceUpserts(
      "supabase.from('product_prices').select('x');\nsupabase.from('workspace_storefront').upsert(c, { onConflict: 'workspace_id' });",
    )).toEqual([]);
  });
});
