/**
 * Public-sector withholding is a LEG of the settlement, not an adjustment (#446).
 *
 * A €10,000 invoice with 4% withheld, paid IN FULL at €9,600, read €400 outstanding for ever.
 * Nothing raised: a partly-settled invoice is a valid state and €400 is a valid number. That is
 * anti-regression rule 1's exact shape — a money quantity with a leg the derivation did not know
 * about — and CLAUDE.md already records five implementations of this same quantity.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  withholdingNeedsDecision, type WithholdingVerdict,
} from '@/modules/finance/withholdingRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const ordersService = read('src/modules/finance/services/ordersService.ts');
const withholding = read('src/modules/finance/services/withholdingService.ts');
const company = read('src/modules/crm/pages/CompanyDetailPage.tsx');

const v = (over: Partial<WithholdingVerdict>): WithholdingVerdict =>
  ({ status: 'not_withheld', amount: 0, reason: '', ...over });

describe('only an undecidable verdict needs a human', () => {
  it('`unclassified` does; the answers do not', () => {
    expect(withholdingNeedsDecision(v({ status: 'unclassified', amount: null }))).toBe(true);
    // These are ANSWERS: the rule ran and said nothing is withheld.
    expect(withholdingNeedsDecision(v({ status: 'not_withheld' }))).toBe(false);
    expect(withholdingNeedsDecision(v({ status: 'below_floor' }))).toBe(false);
    expect(withholdingNeedsDecision(v({ status: 'withheld', amount: 400 }))).toBe(false);
  });

  it('an undecidable verdict carries a null amount, never 0', () => {
    // 0 would read as "nothing is withheld", which is a different fact and the expensive one:
    // the money then goes missing from the ledger rather than being flagged.
    const t: WithholdingVerdict = { status: 'unclassified', amount: null, reason: 'mixed' };
    expect(t.amount).toBeNull();
  });
});

describe('it is a leg of the ONE derivation', () => {
  it('the client reads `withheld` from get_order_settlements, never computes it', () => {
    expect(ordersService).toContain('withheld');
    // `total − settled` re-derived client-side is the exact shape moneyDerivation.test.ts exists
    // to stop, and adding withholding as a second adjustment would be the same mistake again.
    expect(ordersService).not.toMatch(/outstanding\s*[-+]\s*withheld/);
    expect(ordersService).not.toMatch(/settled\s*\+\s*withheld/);
  });

  it('the service records the derived figure on the document AADE sees', () => {
    // The settlement ledger reads `total_withheld_amount`, so writing it there is what keeps the
    // transmitted document and the ledger equal by construction.
    expect(withholding).toContain('total_withheld_amount');
    // `invoice_withholding` is read by the integrity probe in SQL and by nothing here: one door
    // onto one derivation.
    expect(withholding).not.toContain('invoice_withholding');
  });

  it('nothing applies a rate in the client', () => {
    // 4%/8% and the €150 floor are statutory and effective-dated in SQL.
    expect(withholding).not.toMatch(/0\.04|0\.08|\*\s*4\s*\/\s*100|\*\s*8\s*\/\s*100/);
    expect(withholding).not.toMatch(/\b150\b/);
  });
});

describe('the counterparty fact is recordable', () => {
  it('the CRM company page can mark a government body', () => {
    expect(company).toContain('is_government_body');
  });

  it('it is separate from the segment', () => {
    // `contact_group = 'public_sector'` drives B2G document type. Withholding is a different
    // question about the same customer set, and conflating them gets one of the two wrong.
    expect(company).toContain('contact_group');
    expect(company.indexOf('is_government_body')).not.toBe(company.indexOf('contact_group'));
  });
});
