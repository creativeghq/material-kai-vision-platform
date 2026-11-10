import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

import { stripComments } from '../helpers/stripComments';

const src = (p: string) => stripComments(readFileSync(p, 'utf8'));

describe('defaults that reach the customer', () => {
  it('the bank sync never puts an account on the invoice by itself', () => {
    const sync = src('supabase/functions/_shared/revolut/sync-core.ts');
    expect(sync.match(/show_on_invoice:\s*\S+/g)).toEqual(['show_on_invoice: false,']);
  });

  it('the invoice form resets the payment method through the named code, never a literal (3 is CASH)', () => {
    const dialog = src('src/modules/finance/components/NewInvoiceDialog.tsx');
    expect(dialog).not.toMatch(/setPaymentMethodCode\(\s*['"]\d+['"]\s*\)/);
  });
});
