/** The 0%-VAT invoice gate: SQL refuses, TypeScript explains. */
import { describe, expect, it } from 'vitest';

import { invoiceGenerationErrorMessage } from '@/modules/finance/utils/invoiceGateMessage';

/** The exact shape `generate_invoice_from_order` raises, as PostgREST delivers it. */
const gateError = (lines: string[]) => ({
  message: `vat_exemption_required: ${lines.length} line(s) carry 0% VAT with no exemption reason: ${lines.join(', ')}`,
});

describe('invoiceGenerationErrorMessage', () => {
  it('names the offending lines instead of leaking the machine prefix', () => {
    const msg = invoiceGenerationErrorMessage(gateError(['Scaffolding']));

    expect(msg).not.toContain('vat_exemption_required');
    expect(msg).toContain('Scaffolding');
    expect(msg).toContain('1 line(s) carry 0% VAT');
  });

  it('keeps every line name when several are blocking', () => {
    const msg = invoiceGenerationErrorMessage(gateError(['Scaffolding', 'Delivery', 'Assembly']));

    for (const line of ['Scaffolding', 'Delivery', 'Assembly']) expect(msg).toContain(line);
  });

  it('tells the operator both places the reason can live', () => {
    // The line's own cause OR the customer's standing `vat_exemption_reason` satisfies the gate —
    // an operator told only about the line would re-enter it on every future order for a
    // permanently exempt buyer.
    const msg = invoiceGenerationErrorMessage(gateError(['Scaffolding']));

    expect(msg).toMatch(/on the line/i);
    expect(msg).toMatch(/customer/i);
  });

  /**
   * The second refusal. Once the operator can PICK Invoice vs Retail receipt, the pick has to be
   * checked where the buyer is visible — AADE rejects a τιμολόγιο issued to a party with no ΑΦΜ,
   * and a menu rendered in the browser is not evidence of one.
   */
  it('explains a τιμολόγιο refused for a buyer with no ΑΦΜ, and says how to fix it', () => {
    const msg = invoiceGenerationErrorMessage({
      message: 'invoice_requires_vat_id: this buyer has no VAT number, and AADE rejects a τιμολόγιο issued to a consumer. Issue a retail receipt (ΑΛΠ) instead.',
    });

    expect(msg).not.toContain('invoice_requires_vat_id');
    expect(msg).toMatch(/ΑΛΠ/);
    expect(msg).toMatch(/ΑΦΜ/);
  });

  it('passes an unrelated failure through unchanged', () => {
    // Only the gate is translated. Swallowing or rewording other errors would hide real faults —
    // "not authorized" must still read as "not authorized".
    expect(invoiceGenerationErrorMessage({ message: 'not authorized' })).toBe('not authorized');
    expect(invoiceGenerationErrorMessage(new Error('connection reset'))).toBe('connection reset');
  });

  it('never throws on a malformed error value', () => {
    // A toast handler is the last line of defence; if this throws, the operator sees nothing at all.
    expect(() => invoiceGenerationErrorMessage(null)).not.toThrow();
    expect(() => invoiceGenerationErrorMessage(undefined)).not.toThrow();
    expect(() => invoiceGenerationErrorMessage('plain string')).not.toThrow();
    expect(invoiceGenerationErrorMessage('plain string')).toBe('plain string');
  });
});
