/** The RF code is offered before the IBANs, and states its OWN amount. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const pdf = read('supabase/functions/finance-invoice-pdf/index.ts');
const email = read('supabase/functions/finance-send-invoice-email/index.ts');
const rf = read('supabase/functions/_shared/payments/invoice-rf.ts');

describe('the PDF prints RF above the bank details', () => {
  it('the RF block comes before the account lines', () => {
    // Anchored on the condition's START, not its exact text: this guards the ORDER of the two
    // blocks, and it should not fail because the RF block grew a second condition.
    const rfBlock = pdf.search(/if \(rfCode\b/);
    const bankBlock = pdf.indexOf('if (payBits.length || accountLines.length) {');
    expect(rfBlock).toBeGreaterThan(-1);
    expect(bankBlock).toBeGreaterThan(-1);
    expect(rfBlock, 'RF must render before the IBAN block').toBeLessThan(bankBlock);
  });

  it('still prints the IBANs — RF does not replace them', () => {
    // RF is Greek-domestic and EUR-only. A foreign customer needs the account number.
    expect(pdf).toContain('IBAN ${a.iban}');
  });
});

describe('the invoice email carries the code', () => {
  it('mints it through the shared helper, not its own call', () => {
    expect(email).toContain("import { ensureInvoiceRf } from '../_shared/payments/invoice-rf.ts'");
    expect(email).toContain('await ensureInvoiceRf(supabase, invoice_id)');
  });

  it('renders it in the body and passes it to a workspace template', () => {
    expect(email).toContain('${rfHtml}');
    expect(email).toContain('rf_code: rfCode');
  });

  it('quotes the amount the CODE was minted for, never the invoice total', () => {
    expect(email).toMatch(/const rfAmount = money\(Number\(rf\.amount/);
    expect(email).toMatch(/Transfer exactly \$\{rfAmount\}/);
    // The bug this replaced: `Transfer exactly ${total}`, where `total` is inv.total.
    expect(email).not.toMatch(/Transfer exactly \$\{total\}/);
  });
});

describe('RF is only minted where it can actually settle', () => {
  it('refuses a document with nothing left to collect', () => {
    expect(rf).toMatch(/status === 'void' \|\| .*status === 'credit_noted' \|\| .*status === 'paid'/);
    expect(rf).toMatch(/if \(!\(payable > 0\)\) return null;/);
  });

  it('respects the workspace method toggle through the ONE shared parser', () => {
    // A hand-rolled parse here once disagreed with the registry's reading of the same value.
    expect(rf).toContain('parseEnabledMethods');
    expect(rf).toContain("includes('bank_reference')");
  });

  it('is currency-gated — RF is a Greek EUR instrument', () => {
    expect(rf).toContain('viva.currencies');
  });

  it('reuses a pending code for the same amount instead of minting a second', () => {
    // Two live codes for one invoice is two references a customer could pay against.
    expect(rf).toContain("eq('status', 'pending')");
    expect(rf).toContain('sameAmount(Number(existing.amount), payable)');
  });
});
