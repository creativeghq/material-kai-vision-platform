/**
 * Finance says what it knows, and only what it knows (#351 D2 / S1 / A4 / A5 / B3).
 *
 * Five findings, one theme: a screen stating something it had not established. A digest toggle
 * that saved nothing, a settlement read that returned "unpaid" when it had actually failed, two
 * figures on one screen disagreeing about the same money, and an issue date the operator chose and
 * the server discarded.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { EDITABLE_SETTING_KEYS } from '../../src/modules/finance/tabs/settingsKeys';

const ROOT = join(__dirname, '..', '..');
const raw = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const read = (p: string) => stripComments(raw(p));

const settingsTab = read('src/modules/finance/tabs/SettingsTab.tsx');
const ordersService = read('src/modules/finance/services/ordersService.ts');
const financeService = read('src/modules/finance/services/financeService.ts');
const ordersPanel = read('src/modules/finance/components/OrdersPanel.tsx');
const recordPayment = read('src/modules/finance/components/RecordPaymentDialog.tsx');
const financePage = read('src/pages/Admin/FinancePage.tsx');

describe('#351 D2 — every control on the settings screen is saved', () => {
  it('the digest fields are in the payload', () => {
    // They were not, while the Digest panel edited all five behind a "Save digest settings"
    // button that calls this same `save()`. `finance-digest-aggregate` gates on exactly those
    // fields, so the cron ran nightly and found nothing — measured: 0 workspaces enabled, 0
    // recipients, `digest_last_sent_at` NULL on all. It had never sent once.
    for (const k of ['digest_enabled', 'digest_frequency', 'digest_day_of_week', 'digest_hour_utc', 'digest_recipients']) {
      expect(EDITABLE_SETTING_KEYS as readonly string[], k).toContain(k);
    }
  });

  it('the payload is BUILT from that list, not spelled out again', () => {
    // A hand-kept object literal inside `save()` is what failed. A second copy would fail the
    // same way.
    expect(settingsTab).toMatch(/EDITABLE_SETTING_KEYS\.map\(\(k\) => \[k, settings\[k\]\]\)/);
  });

  it('every key this screen edits is in the list', () => {
    // The actual guard: a new control with no save is a red build rather than a switch that does
    // nothing. Covers both edit paths — `set('key', …)` and `onPatch({ key: … })`.
    const edited = new Set<string>();
    for (const m of settingsTab.matchAll(/\bset\('([a-z_]+)'/g)) edited.add(m[1]);
    for (const m of settingsTab.matchAll(/onPatch\(\{\s*([a-z_]+):/g)) edited.add(m[1]);
    // `section` is the tab router's own URL state, not a finance setting.
    edited.delete('section');
    expect(edited.size).toBeGreaterThan(20);
    const missing = [...edited].filter((k) => !(EDITABLE_SETTING_KEYS as readonly string[]).includes(k));
    expect(missing, `edited but never saved: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('#351 S1 — a settlement that could not be read is not "unpaid"', () => {
  it('orderBalances throws instead of returning an empty map', () => {
    const fn = ordersService.slice(ordersService.indexOf('async orderBalances'), ordersService.indexOf('async invoicedOrderIds'));
    expect(fn).toMatch(/const \{ data, error \} = await supabase\.rpc\('get_order_settlements'/);
    expect(fn).toMatch(/if \(error\) throw new Error\(`Could not read order settlements/);
  });

  it('getOrderFinance checks every read it makes', () => {
    // All six destructured `.data` only. Invoices missing means the order looks uninvoiced;
    // payments missing means it looks unpaid; the settlement RPC missing means `settled: 0`.
    expect(ordersService).toMatch(/\['settlement', settlement\]/);
    expect(ordersService).toMatch(/throw new Error\(`Could not read the order's \$\{what\}/);
  });

  it('the dashboard shows unknown rather than the cached word', () => {
    expect(financePage).toMatch(/const \[recentBalancesUnknown, setRecentBalancesUnknown\]/);
    expect(financePage).toMatch(/balancesUnknown=\{recentBalancesUnknown\}/);
    expect(financePage, 'the cached payment_status is rendered again')
      .not.toMatch(/balances\.get\(o\.id\)\?\.payment_status \?\? o\.payment_status/);
  });

  it('and says which kind of unknown it is', () => {
    // "the read failed" and "no settlement yet" are different facts, and only one is a fault.
    expect(raw('src/pages/Admin/FinancePage.tsx')).toMatch(/this is unknown, not unpaid/);
  });
});

describe('#351 A4/A5 — one screen, one derivation', () => {
  it('the cash ladder nets the covering order like the tile above it', () => {
    // `fin.profit` is `received - paid_out` and misses `coverPaid`. Rendering it raw put
    // "Paid to suppliers 600 / Net cash 400" a few centimetres above "Cash in bank now 1,000".
    const ladder = ordersPanel.slice(ordersPanel.indexOf('Earned vs Collected'));
    expect(ladder).toMatch(/Cash in bank now[\s\S]{0,400}fin\.received - fin\.paid_out - coverPaid/);
    expect(ladder, 'the raw profit figure is back').not.toMatch(/Cash in bank now[\s\S]{0,200}formatMoney\(fin\.profit,/);
  });

  it('the payment picker reads the derived status, not the cache', () => {
    expect(recordPayment).toMatch(/b\?\.payment_status === 'partial'/);
    expect(recordPayment, 'the cached column is printed beside the derived outstanding again')
      .not.toMatch(/o\.payment_status === 'partial'/);
  });
});

describe('#351 B3 — the issue date the operator chose', () => {
  it('the dialog sends it', () => {
    const dialog = read('src/modules/finance/components/NewInvoiceDialog.tsx');
    expect(dialog).toMatch(/markInvoiceIssued\(invoice\.id, issueDate \|\| null\)/);
  });

  it('the service converts it on the CLIENT, at noon', () => {
    // The client is the only place that knows the operator's calendar day — the DB session runs
    // in UTC, so deriving it there is the same defect one layer down (rule 1b). Noon so no offset
    // or DST transition can push the instant onto the day before or after.
    const fn = financeService.slice(financeService.indexOf('async markInvoiceIssued'), financeService.indexOf('async updateInvoice'));
    expect(fn).toMatch(/new Date\(y, m - 1, d, 12, 0, 0\)\.toISOString\(\)/);
    expect(fn).toMatch(/p_issued_at: issuedAt/);
  });

  it('omitting it still means now', () => {
    // Every existing caller passes one argument and must keep working.
    const fn = financeService.slice(financeService.indexOf('async markInvoiceIssued'), financeService.indexOf('async updateInvoice'));
    expect(fn).toMatch(/issuedOn\?: string \| null/);
    expect(fn).toMatch(/let issuedAt: string \| null = null/);
  });
});

describe('#351 D3 — report periods are local days', () => {
  it('both period builders use the shared local-date helper', () => {
    // `.toISOString().slice(0,10)` on a local-midnight Date is the UTC day: at UTC+3 "1 Aug"
    // serialises as "2026-07-31", so a 31 July invoice drops out of July's VAT.
    for (const rel of [
      'src/modules/finance/tabs/ReportsTab.tsx',
      'src/modules/finance/components/AccountingExportCard.tsx',
    ]) {
      const src = read(rel);
      expect(src, rel).toMatch(/toLocalISODate/);
      expect(src, `${rel} serialises a local date through UTC again`)
        .not.toMatch(/toISOString\(\)\.slice\(0, ?10\)/);
    }
  });
});

describe('#351 S6/A3/A2 — a money read that failed is not a small number', () => {
  const exportService = read('src/modules/finance/services/accountingExportService.ts');

  it('both journals check both of their reads', () => {
    // These destructured `data` only. If the invoices read failed while credit notes succeeded, a
    // month with EUR 10,000 of sales exported as EUR 0 of sales plus whatever credits existed —
    // and it went to an accountant as a complete journal.
    for (const marker of [
      'Sales journal: the invoices could not be read',
      'Sales journal: the credit notes could not be read',
      'Purchases journal: the supplier bills could not be read',
      'Purchases journal: the supplier credit notes could not be read',
    ]) {
      expect(exportService, marker).toContain(marker);
    }
  });

  it('a short export is refused outright, never handed over as complete', () => {
    const throws = exportService.match(/Nothing was exported/g) ?? [];
    expect(throws.length).toBeGreaterThanOrEqual(4);
  });

  it("the credit note's source-invoice read is checked too", () => {
    // An unnamed counterparty on a VAT journal is a row an accountant cannot post.
    expect(exportService).toMatch(/const \{ data: src, error: srcErr \}/);
  });

  it('a covering PO with an unread settlement is null, not zero', () => {
    // `settled: 0` / `outstanding: total` is a local re-derivation — the comment right above it
    // warns that would be "the sixth implementation of a money quantity". A fully-paid PO showed
    // as still owed, so the menu offered "Mark the supplier paid" for goods already paid.
    expect(ordersPanel).toMatch(/settled: number \| null; outstanding: number \| null;/);
    expect(ordersPanel).toMatch(/settled: bal \? Number\(bal\.get\(r\.id\)\?\.settled \?\? 0\) : null/);
    expect(ordersPanel, 'the zero fallback is back')
      .not.toMatch(/settled: Number\(bal\.get\(r\.id\)\?\.settled \?\? 0\),/);
  });

  it('and the screen says the cash figure may be too high', () => {
    expect(ordersPanel).toMatch(/coverSettlementUnknown/);
    expect(raw('src/modules/finance/components/OrdersPanel.tsx'))
      .toMatch(/may be higher than the real one/);
  });

  it('a failed document issue is reported, and does not also claim success', () => {
    expect(recordPayment).toMatch(/let issueDocError: string \| null = null;/);
    expect(recordPayment).toMatch(/document NOT issued/);
    // The plain success line only on a clean run — otherwise the operator gets both toasts.
    expect(recordPayment).toMatch(/\} else if \(!issueDocError\) \{/);
    expect(recordPayment, 'the empty catch is back').not.toMatch(/catch \{ \/\* issue separately from Actions \*\/ \}/);
  });
});
