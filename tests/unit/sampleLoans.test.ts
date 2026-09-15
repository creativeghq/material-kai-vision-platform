/**
 * Sample loans and display stock (#427).
 *
 * TilesPOS states the rule better than any ERP does: "A borrowed sample with a follow-up date is a
 * warm lead. A borrowed sample nobody wrote down is just missing inventory." The load-bearing case
 * is the one in between — a loan with a record and NO date, which can never be chased.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  LOAN_STATUS_LABEL, loanIsUnchaseable, loanIsOverdue, loanIsSettled, describeLoan,
  type SampleLoanRow, type LoanStatus,
} from '@/modules/crm/sampleLoanRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/crm/services/sampleLoanService.ts');
const card = read('src/modules/crm/components/SampleLoansCard.tsx');
const page = read('src/modules/crm/pages/CompanyDetailPage.tsx');

const loan = (over: Partial<SampleLoanRow>): SampleLoanRow => ({
  id: 'l', borrower_name: 'Mr Papadopoulos', company_id: 'c',
  loaned_on: '2026-08-01', due_back_on: '2026-08-15', returned_on: null,
  status: 'out', converted_order_id: null, notes: null, ...over,
});

/** The OPERATOR's day, as a plain ISO date — the rules module takes it, so it stays import-free. */
const AS_OF = '2026-09-01';

describe('a loan with no due date can never be chased', () => {
  it('undated is its own failure, not a quiet success', () => {
    // It can never be overdue, which is NOT the same as being on time — and it is the state a
    // sample quietly disappears in.
    expect(loanIsUnchaseable(loan({ due_back_on: null }))).toBe(true);
    expect(loanIsUnchaseable(loan({ due_back_on: '2026-08-15' }))).toBe(false);
    // A returned loan with no date is finished, not unchaseable.
    expect(loanIsUnchaseable(loan({ status: 'returned', due_back_on: null }))).toBe(false);
  });

  it('an undated loan never reports as overdue', () => {
    expect(loanIsOverdue(loan({ due_back_on: null }), AS_OF)).toBe(false);
    expect(loanIsOverdue(loan({ due_back_on: '2026-08-15' }), AS_OF)).toBe(true);
    expect(loanIsOverdue(loan({ due_back_on: '2026-12-01' }), AS_OF)).toBe(false);
    expect(loanIsOverdue(loan({ status: 'returned', due_back_on: '2026-08-15' }), AS_OF)).toBe(false);
  });

  it('due TODAY is not yet overdue — the customer has until close of business', () => {
    // Comparing UTC midnight against `now` made a loan due today read as overdue from local
    // midnight, so the showroom chased someone who was still within their date.
    expect(loanIsOverdue(loan({ due_back_on: AS_OF }), AS_OF)).toBe(false);
    expect(loanIsOverdue(loan({ due_back_on: '2026-08-31' }), AS_OF)).toBe(true);
  });

  it('the description says which of the two it is', () => {
    expect(describeLoan(loan({ due_back_on: null }), AS_OF))
      .toBe('Out with no date — nobody will ever chase this');
    expect(describeLoan(loan({ status: 'converted' }), AS_OF)).toBe('Became an order');
    expect(describeLoan(loan({ status: 'written_off' }), AS_OF)).toBe('Written off — gone');
  });
});

describe('the conversion rate divides by FINISHED loans', () => {
  it('a live loan is neither a success nor a failure yet', () => {
    // Counting live loans as failures understates the rate while they are still perfectly capable
    // of converting.
    expect(loanIsSettled(loan({ status: 'converted' }))).toBe(true);
    expect(loanIsSettled(loan({ status: 'written_off' }))).toBe(true);
    expect(loanIsSettled(loan({ status: 'out' }))).toBe(false);
    // A RETURNED sample is finished and did not convert. Leaving it out of the denominator made
    // one conversion against nine returns read as 100%.
    expect(loanIsSettled(loan({ status: 'returned' }))).toBe(true);
  });

  it('the card shows the derived rate rather than computing one', () => {
    expect(card).toContain('position.conversion_rate');
    expect(card).not.toMatch(/converted\s*\/\s*\(/);
  });
});

describe('every state has a name', () => {
  it('all four read as something an operator would say', () => {
    const states: LoanStatus[] = ['out', 'returned', 'converted', 'written_off'];
    for (const s of states) expect(LOAN_STATUS_LABEL[s]).toBeTruthy();
    expect(LOAN_STATUS_LABEL.written_off).toMatch(/Written off/);
  });
});

describe('it lives on the customer record', () => {
  it('the service reads the derivation and closes with the fact it needs', () => {
    expect(service).toContain('sample_loan_position');
    // A CHECK refuses `returned` with no date and `converted` with no order, because "it came
    // back" with no date is the state a sample disappears in.
    expect(service).toContain('returned_on');
    expect(service).toContain('converted_order_id');
  });

  it('it is mounted on the company, not in a loose list', () => {
    expect(page).toContain('SampleLoansCard');
    expect(page).toMatch(/companyId=\{company\.id\}/);
  });

  it('a failed read is unknown, not "nothing is out"', () => {
    expect(card).toMatch(/not a statement that nothing is[\s\S]{0,20}out/);
  });

  it('the default due date is a date, not a blank', () => {
    // The whole mechanic is the follow-up date, so the form starts with one rather than making
    // "no date" the path of least resistance.
    expect(card).toContain('localISODateOffset(14)');
  });
});
