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
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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
    // THIS TEST HAD A PROVEN FALSE NEGATIVE (audit #309 item 5).
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
});

/**
 * Quote totals had the SAME shape of bug, found later (audit #307 findings 17/18/19): the money
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
});
