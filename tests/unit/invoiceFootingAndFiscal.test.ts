/**
 * The document adds up, the transmission failure is reported, and an internal transfer cannot
 * settle a customer invoice (#351 B2 / B1 / D1).
 *
 * B2 is arithmetic, and the arithmetic is checked here rather than asserted about: three lines of
 * €10.10 at 24% give raw VAT 2.424 each. The printed analysis sums per-line ROUNDED values (7.26);
 * the header rounded the raw sum ONCE (7.27). One cent apart on a document a customer reads and an
 * auditor checks — and myDATA rejects a document whose lines do not foot to its header.
 *
 * The comment in `totals` states that exact rule and applies it to NET. It was never applied to
 * VAT, and — found while fixing it — the cash discount scaled the header without scaling the lines,
 * so with "paid upfront" ticked the net did not foot either.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { round2 } from '../../src/utils/decimal';
import { vatOfRaw } from '../../src/modules/finance/lib/vatMath';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const dialog = read('src/modules/finance/components/NewInvoiceDialog.tsx');
const renderData = read('src/modules/finance/invoice-templates/renderData.ts');
const revolutApi = read('supabase/functions/revolut-api/index.ts');
const bankFeed = read('src/modules/finance/tabs/BankFeedTab.tsx');

/**
 * The SHIPPED primitives, imported — not re-implemented (`tests/unit/moneyPrimitives.test.ts`
 * forbids a local copy of cent rounding, and it is right to: a test that rounds differently from
 * the code proves nothing about the code). Both modules are dependency-free by design.
 */

describe('#351 B2 — the printed analysis foots to the header', () => {
  it('the header is the sum of the per-line ROUNDED VAT', () => {
    const lines = [10.10, 10.10, 10.10];
    const pct = 24;
    const analysis = round2(lines.reduce((a, n) => a + round2(vatOfRaw(round2(n), pct)), 0));
    const header = round2(lines.reduce((a, n) => a + round2(vatOfRaw(round2(n), pct)), 0));
    expect(analysis).toBe(7.26);
    expect(header).toBe(analysis);
  });

  it('the OLD rule really did differ — this is not a hypothetical cent', () => {
    const lines = [10.10, 10.10, 10.10];
    const pct = 24;
    const oldHeader = round2(lines.reduce((a, n) => a + vatOfRaw(round2(n), pct), 0));
    const analysis = round2(lines.reduce((a, n) => a + round2(vatOfRaw(round2(n), pct)), 0));
    expect(oldHeader).toBe(7.27);
    expect(oldHeader).not.toBe(analysis);
  });

  it('a cash discount scales the LINES, so the net still foots', () => {
    const lines = [10.10, 10.10, 10.10];
    const factor = 0.97;
    const scaled = lines.map((n) => round2(round2(n) * factor));
    expect(scaled).toEqual([9.8, 9.8, 9.8]);
    expect(round2(scaled.reduce((a, b) => a + b, 0))).toBe(29.4);
  });

  it('the dialog rounds VAT per line and stores it', () => {
    expect(dialog).toMatch(/net \+= lineNet; vat \+= round2\(vatOfRaw\(lineNet, pct\)\);/);
    expect(dialog).toMatch(/vat_amount: round2\(vatOfRaw\(round2\(net\), pct\) \* cashFactorForLines\)/);
    expect(dialog, 'the header rounds the raw sum once again')
      .not.toMatch(/vat \+= vatOfRaw\(lineNet, pct\);/);
  });

  it('the stored lines carry the cash factor the header applies', () => {
    expect(dialog).toMatch(/const cashFactorForLines = paidUpfront \? \(1 - cashPct \/ 100\) : 1;/);
    expect(dialog).toMatch(/net_value: round2\(round2\(net\) \* cashFactorForLines\)/);
    expect(dialog, 'the header scales the accumulated total again').not.toMatch(/net = net \* cashFactor;/);
  });

  it('the renderer prefers the stored figure, which is why storing it settles this', () => {
    expect(renderData).toMatch(/it\.vat_amount != null \? Number\(it\.vat_amount\) : vatOf\(net, pct\)/);
  });
});

describe('#351 B1 — a myDATA failure is reported whatever code it carries', () => {
  it('every ok:false is surfaced, not only insufficient_credits', () => {
    // `finance-issue-invoice`'s catch builds `{ ok: false, error }` with NO code, inside a 200 —
    // so a connector outage, a signature failure or a Novus timeout fell through to "Invoice
    // created" and an untransmitted legal document.
    expect(dialog).toMatch(/fr\.ok === false && fr\.code !== 'insufficient_credits'/);
    expect(dialog).toMatch(/Invoice issued — NOT sent to myDATA/);
  });

  it('the credits case keeps its own top-up action', () => {
    // Two different remedies: top up, or resolve the outage and retransmit.
    expect(dialog).toMatch(/fr\.code === 'insufficient_credits'/);
    expect(dialog).toMatch(/Top up/);
  });
});

describe('#351 D1 — an internal leg cannot settle anything', () => {
  it('the server refuses it on BOTH manual match paths', () => {
    expect(revolutApi).toMatch(/async function assertNotInternalLeg/);
    const invoiceMatch = revolutApi.slice(revolutApi.indexOf("case 'confirm-match'"), revolutApi.indexOf("case 'confirm-bill-match'"));
    const billMatch = revolutApi.slice(revolutApi.indexOf("case 'confirm-bill-match'"));
    expect(invoiceMatch).toMatch(/await assertNotInternalLeg\(service, workspaceId, tx\)/);
    expect(billMatch.slice(0, 2000)).toMatch(/await assertNotInternalLeg\(service, workspaceId, tx\)/);
  });

  it('an unknown shape is refused too, not assumed external', () => {
    const fn = revolutApi.slice(revolutApi.indexOf('async function assertNotInternalLeg'));
    expect(fn.slice(0, 1200)).toMatch(/legShapeIsComplete\(shape\)/);
    expect(fn.slice(0, 1200)).toMatch(/HttpError\(\s*409,/);
  });

  it('the check runs BEFORE anything is settled', () => {
    const invoiceMatch = revolutApi.slice(revolutApi.indexOf("case 'confirm-match'"), revolutApi.indexOf("case 'confirm-bill-match'"));
    const guard = invoiceMatch.indexOf('assertNotInternalLeg');
    const settle = invoiceMatch.indexOf('settleTransaction');
    expect(guard).toBeGreaterThan(-1);
    expect(settle).toBeGreaterThan(-1);
    expect(guard < settle).toBe(true);
  });

  it('the feed stops offering the action on an ignored row', () => {
    // `ignored` is how the auto-matcher stamps BOTH legs of an internal move — not `matched` —
    // which is why these actions stayed offered on money that never came from outside.
    expect(bankFeed).toMatch(/r\.match_status !== 'matched' && r\.match_status !== 'ignored'/);
  });
});
