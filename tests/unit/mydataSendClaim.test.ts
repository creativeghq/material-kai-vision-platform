/** Guard (#479 F6): an expense filing is claimed before ΑΑΔΕ is called, and its stamp is checked. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';

const src = blankComments(readFileSync(join(__dirname, '..', '..', 'supabase', 'functions', 'finance-mydata-send', 'index.ts'), 'utf8'));
const send = src.slice(src.indexOf("case 'send':"));

describe('finance-mydata-send send', () => {
  it('claims the document before posting SendInvoices', () => {
    const claim = send.indexOf(".is('mydata_mark', null)");
    const post = send.indexOf("post(creds, 'SendInvoices'");
    expect(claim).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(claim);
  });

  it('records an unanswered filing as indeterminate and checks the stamp', () => {
    expect(send).toMatch(/transmit_error: `indeterminate:/);
    expect(send).toMatch(/const \{ error: stampErr \}/);
    expect(send).toMatch(/if \(stampErr\)/);
  });
});
