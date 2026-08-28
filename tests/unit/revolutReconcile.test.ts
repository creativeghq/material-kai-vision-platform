/**
 * Revolut bank-feed guard (#315).
 *
 * The integration shipped with zero tests over the code that decides where real money is
 * attributed. Two bug shapes it is here to stop, both of which were live:
 *
 * 1. **The feed is per-LEG, and it carries every kind of money movement.** The incoming
 *    matcher selected `direction=in AND state=completed` with NO type filter, so top-ups,
 *    pocket exchanges, refunds and fee legs all queued up asking to be matched to a
 *    customer invoice — one "unmatched bank payment" alert each. Worse, an internal
 *    pocket→pocket transfer produces an `in` leg that is indistinguishable from an
 *    incoming customer payment unless you look at its SIBLING legs.
 *
 * 2. **Settlement re-derived somewhere other than the one money path.** Every match must
 *    go through `recordInvoicePayment` / `payment_allocations`; a local `total - paid`
 *    here would be the sixth copy of the derivation CLAUDE.md exists to prevent.
 *
 * Plus the buyer-facing provider ORDER, which has already broken once: the registry
 * sorted alphabetically, so adding 'revolut' silently demoted 'stripe' to second and
 * flipped the pay page's preselected default for every existing Stripe seller.
 *
 * SCOPE: these read repo files. They pin the shape of the edge code (which vitest cannot
 * import — it is Deno source with .ts specifiers and Deno globals). Behaviour against the
 * live Revolut API is only ever proven by the sandbox checklist in the issue.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const RECONCILE = read('supabase/functions/_shared/revolut/reconcile.ts');
const SYNC = read('supabase/functions/_shared/revolut/sync-core.ts');
const REGISTRY = read('supabase/functions/_shared/payments/registry.ts');
const FEED_TAB = read('src/modules/finance/tabs/BankFeedTab.tsx');

/** One exported function's source, from its signature to the next top-level export. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.indexOf('\nexport ');
  return next === -1 ? rest : rest.slice(0, next);
}

/** The matcher's feed query, so we can assert on which rows it lets through. */
function matcherQuery(direction: 'in' | 'out'): string {
  const body = fnBody(RECONCILE, direction === 'in' ? 'reconcileWorkspaceRevolut' : 'reconcileOutgoingRevolut');
  return body.slice(0, body.indexOf('.limit('));
}

describe('revolut reconciliation · what enters the matcher', () => {
  it('only reconciles transfers — never top-ups, exchanges, refunds or fees', () => {
    // Both directions must pin the type. Without it, own-money lines are offered as
    // customer payments and each one raises an alert.
    for (const dir of ['in', 'out'] as const) {
      expect(matcherQuery(dir)).toMatch(/\.eq\('type',\s*RECONCILABLE_TX_TYPE\)/);
    }
    expect(RECONCILE).toMatch(/RECONCILABLE_TX_TYPE\s*=\s*'transfer'/);
  });

  it('groups legs back onto their parent transaction before matching', () => {
    // A row is a fragment of a transaction. Matching one in isolation is how an internal
    // pocket move gets settled against a customer invoice.
    expect(RECONCILE).toMatch(/export async function loadLegShapes/);
    // The select must carry direction AND the parent's leg count — one row has to be able to say
    // whether the picture is complete (#359 CM-12). Pinned as "these fields are read", not as an
    // exact select string: the previous version pinned the literal list and broke the moment a
    // field was added, which teaches the next person to edit the test rather than think.
    const load = fnBody(RECONCILE, 'loadLegShapes');
    for (const field of ['transaction_id', 'direction', 'legs_total']) {
      expect(load, field).toContain(field);
    }
    expect(fnBody(RECONCILE, 'reconcileWorkspaceRevolut')).toMatch(/loadLegShapes\(/);
    expect(fnBody(RECONCILE, 'reconcileOutgoingRevolut')).toMatch(/loadLegShapes\(/);
  });

  it('treats a transaction with legs on both sides as internal, not as a payment', () => {
    // in + out legs, both ours = money never left the tenant. Stamped `ignored` so it
    // leaves the review surface instead of being re-suggested on every pass.
    expect(RECONCILE).toMatch(/shape!?\.outLegs\s*>\s*0/);
    expect(RECONCILE).toMatch(/shape!?\.inLegs\s*>\s*0/);
    expect(RECONCILE).toMatch(/match_status:\s*'ignored'/);
    // …and a transaction whose shape is not fully known is neither: it stays unmatched until the
    // missing legs sync (#359 CM-12). Reading an incomplete shape as external is what let a
    // pocket transfer settle a customer invoice.
    expect(RECONCILE).toMatch(/legShapeIsComplete\(shape\)/);
  });

  it('never auto-settles a payment split across several incoming legs', () => {
    expect(RECONCILE).toMatch(/const singleLeg = shape!?\.inLegs === 1/);
    // Both auto-settle branches must be gated on it; a fragment's amount matches nothing
    // and its reference matches everything.
    const branches = RECONCILE.match(/if \(singleLeg &&|else if \(singleLeg &&/g) ?? [];
    expect(branches.length).toBe(2);
  });
});

describe('revolut reconciliation · one money path', () => {
  it('settles incoming money only through recordInvoicePayment', () => {
    expect(fnBody(RECONCILE, 'settleTransaction')).toMatch(/recordInvoicePayment\(/);
    // Never a hand-written status or balance onto the document itself: paid-ness is
    // derived from allocations, and a second writer is how the badge and the ledger
    // start disagreeing.
    for (const table of ['invoices', 'supplier_bills', 'orders']) {
      expect(RECONCILE, `${table} must not be updated directly from the matcher`)
        .not.toMatch(new RegExp(`from\\('${table}'\\)[\\s\\S]{0,80}\\.update\\(`));
    }
  });

  it('allocates outgoing money against the bill rather than writing a paid flag', () => {
    const outgoing = fnBody(RECONCILE, 'reconcileOutgoingRevolut');
    expect(outgoing).toMatch(/from\('payment_allocations'\)/);
    expect(outgoing).toMatch(/supplier_bill_id:/);
    // amount_paid / amount_due on supplier_bills are trigger+generated-column maintained.
    expect(outgoing).not.toMatch(/amount_paid:/);
  });

  it('caps an auto-allocation at what the bill still owes', () => {
    expect(RECONCILE).toMatch(/Math\.min\(Number\(tx\.amount\), Number\(bill\.amount_due\)\)/);
  });
});

describe('revolut feed · nothing goes unnoticed', () => {
  it('alerts on unmatched money in BOTH directions', () => {
    expect(RECONCILE).toMatch(/notifyUnmatched\(service, workspaceId, recipientId, tx, 'in'\)/);
    expect(RECONCILE).toMatch(/notifyUnmatched\(service, workspaceId, recipientId, tx, 'out'\)/);
    // One per line, ever.
    expect(RECONCILE).toMatch(/unmatched_notified_at/);
  });

  it('does not address every alert to a member whose role is literally owner', () => {
    // A workspace run by an admin produced no notification AND no trace: the emit never
    // happened, so the flow-send probe could not see the miss.
    for (const src of [RECONCILE, SYNC]) {
      expect(src).toMatch(/financeNotifyRecipient\(/);
      expect(src).not.toMatch(/\.eq\('role',\s*'owner'\)/);
    }
  });

  it('re-reads stale non-terminal lines the list endpoint can no longer return', () => {
    // `/transactions?from=` filters on CREATION time: a pending line that completes later
    // is never listed again, so without this it stays pending forever and reconciliation
    // — which requires `completed` — never sees the money.
    expect(SYNC).toMatch(/async function recoverStaleTransactions/);
    expect(SYNC).toMatch(/getTransaction\(/);
    expect(SYNC).toMatch(/TERMINAL_STATES/);
    expect(SYNC).toMatch(/recovered/);
  });

  it('says so when the page walk did not cover the whole window', () => {
    expect(SYNC).toMatch(/truncated = true/);
    expect(SYNC).toMatch(/page cap reached/);
  });

  it('offers both directions in the feed review queue, transfers only', () => {
    const review = FEED_TAB.slice(FEED_TAB.indexOf("statusF === 'review'"));
    expect(review).toMatch(/\.eq\('type',\s*'transfer'\)/);
    expect(review.slice(0, 400)).not.toMatch(/\.eq\('direction',\s*'in'\)/);
  });
});

describe('payment provider registry', () => {
  it('keeps a deliberate buyer-facing order with new providers last', () => {
    // Alphabetical sorting once demoted stripe below revolut, flipping the pay page's
    // preselected provider for existing Stripe sellers.
    const match = REGISTRY.match(/const ORDER: Record<string, number> = \{([^}]*)\}/);
    expect(match, 'the explicit provider ORDER map is gone').toBeTruthy();
    const order = Object.fromEntries(
      (match![1].match(/(\w+):\s*(\d+)/g) ?? []).map((p) => {
        const [k, v] = p.split(':');
        return [k.trim(), Number(v)];
      }),
    );
    expect(order.stripe).toBe(0);
    expect(order.viva).toBe(1);
    expect(order.revolut).toBe(2);
  });

  it('registers every provider it orders, and orders every provider it registers', () => {
    const registered = [...REGISTRY.matchAll(/^\s{2}(\w+): \w+Provider,$/gm)].map((m) => m[1]);
    expect(registered.sort()).toEqual(['revolut', 'stripe', 'viva']);
    for (const slug of registered) {
      expect(REGISTRY).toMatch(new RegExp(`${slug}: \\d+`));
    }
  });

  it('fails closed when the module catalog cannot be read', () => {
    // Deciding who may take money: an unreadable catalog must not widen the set.
    const fn = REGISTRY.slice(REGISTRY.indexOf('async function publishedSlugs'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/return new Set\(\);/);
  });
});
