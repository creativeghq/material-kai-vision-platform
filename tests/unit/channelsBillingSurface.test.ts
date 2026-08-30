/**
 * The channels billing tables have a reader, and it says which kind of empty it is (#383 part 1).
 *
 * `whatsapp_cost_reconciliation` (nightly 04:20) and `channel_recurring_charges` (1st of the month
 * 05:10) were written by cron and rendered NOWHERE. Both are empty today, which is exactly the
 * moment to build the surface: the alternative is the first month's data arriving with nobody
 * watching, and the row that matters most — `status = 'failed'`, a workspace that could not pay
 * for its numbers — being written and never seen while the platform keeps paying Zernio for them.
 *
 * Three things here are wrong-but-plausible if they regress, which is why they are pinned:
 *
 *  1. **`cost_available = false` is not `$0`.** Meta withholds COST for a WABA on a Solution
 *     Partner's credit line — our situation today — so a zero reads as a free month. Same for the
 *     margin: a margin against an unknown cost is a guess with a decimal point.
 *  2. **A failed charge is not just another row.** Sorted chronologically it is buried by the
 *     newest month. `needs_attention` is derived in SQL so this list and any future alert cannot
 *     disagree about what counts as a problem.
 *  3. **"No charges yet" and "the reader failed" are opposite facts.** One is healthy in month
 *     one; the other means the number you are looking at is not evidence of anything.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const src = (p: string) => stripComments(read(p));

const PANEL = 'src/components/Admin/OperationsDashboard/ChannelsCostPanel.tsx';
const TENANT = 'src/modules/messaging/components/PhoneNumbersTab.tsx';

describe('#383 — the operator can see what was billed and what failed', () => {
  it('reads both tables through their own self-guarding RPCs', () => {
    const panel = src(PANEL);
    expect(panel).toMatch(/rpc\('admin_whatsapp_reconciliation'/);
    expect(panel).toMatch(/rpc\('admin_channel_charges'/);
    // Never the raw tables: they carry no operator-only policy, and a direct select would either
    // return nothing or return another tenant's billing depending on the policy of the day.
    expect(panel, 'reading the billing tables directly').not.toMatch(/from\('whatsapp_cost_reconciliation'\)/);
    expect(panel, 'reading the billing tables directly').not.toMatch(/from\('channel_recurring_charges'\)/);
  });

  it('an unreported Meta cost renders as words, not as zero', () => {
    const panel = src(PANEL);
    expect(panel).toMatch(/cost_available[\s\S]{0,200}not reported/);
    // And the margin beside it withholds too.
    expect(panel).toMatch(/margin_usd == null[\s\S]{0,120}unknown/);
  });

  it('nothing recomputes the margin or the credit price in the component', () => {
    // One derivation per money quantity. The RPC already applies the $0.085 SALE price — the same
    // figure `admin_channels_cost_overview` uses, and for the same reason: the debit engine
    // ACCOUNTS credits at $0.01, and reading that would understate every margin by ~8.5×.
    const panel = src(PANEL);
    // The number may APPEAR — the card explains the pricing to the reader, which is the point of
    // the note. What must not appear is arithmetic with it.
    expect(panel, 'the credit sale price is being applied a second time')
      .not.toMatch(/[*/]\s*0\.085|0\.085\s*[*/]/);
    expect(panel, 'margin is being recomputed here').not.toMatch(/billed_usd\s*-\s*cost_usd/);
  });

  it('failures are pinned by a verdict derived in SQL, not by a local rule', () => {
    const panel = src(PANEL);
    expect(panel).toMatch(/needs_attention/);
    // A second local definition of "is this a problem" would drift from the one the ordering uses.
    expect(panel, 'the component re-decides what counts as a failure')
      .not.toMatch(/status === 'failed'[\s\S]{0,40}\|\|[\s\S]{0,60}status === 'skipped'/);
  });

  it('a skip says WHY, because the healthy and unhealthy ones look identical', () => {
    // "already billed this month" is idempotency working; "no owner to bill" is a workspace nobody
    // can charge. The status column shows both as `skipped`.
    expect(src(PANEL)).toMatch(/skip_reason/);
  });

  it('the empty states distinguish "nothing yet" from "could not read"', () => {
    const panel = src(PANEL);
    expect(panel).toMatch(/everRan\?\.charges === false/);
    expect(panel).toMatch(/everRan\?\.recon === false/);
    // The healthy branch names the cron, so a reader can tell whether it is early or broken.
    expect(panel).toMatch(/bill-channels-monthly runs/);
    expect(panel).toMatch(/reconcile-whatsapp-costs runs/);
  });
});

describe('#383 1c — the tenant sees what they are charged', () => {
  it('the numbers tab reads its own charges', () => {
    // `channel_recurring_charges` already carries a workspace-member SELECT policy, so this needs
    // no operator RPC — and a recurring charge a customer cannot see is a support ticket waiting.
    const tenant = src(TENANT);
    expect(tenant).toMatch(/from\('channel_recurring_charges'\)/);
    expect(tenant).toMatch(/Monthly charges/);
  });

  it('and surfaces its own failed ones', () => {
    expect(src(TENANT)).toMatch(/failedCharges/);
  });
});
