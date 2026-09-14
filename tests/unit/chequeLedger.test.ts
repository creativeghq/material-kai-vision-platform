/**
 * A post-dated cheque is an asset that changes hands (#423).
 *
 * `cheques` was a flat row that could only clear or bounce, so the commonest Greek B2B move —
 * taking a customer's cheque and endorsing it to a supplier — could not be recorded at all. No
 * international product models any of this; it is table stakes here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  chequeIsSpendable, allowedActions, chequeIsUndated, bounceUnwinds,
  HOLDER_LABEL, ACTION_LABEL,
  type ChequeRow, type ChequeHolder,
} from '@/modules/finance/chequeRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/chequeLedgerService.ts');
const card = read('src/modules/finance/components/ChequePortfolioCard.tsx');
const docs = read('src/modules/finance/pages/DocumentsPage.tsx');

const cheque = (over: Partial<ChequeRow>): ChequeRow => ({
  id: 'c', cheque_number: '0001', amount: 5000,
  due_date: '2026-10-01', maturity_date: '2026-11-01',
  status: 'pending', current_holder: 'us',
  is_pledged: false, is_transferable: true, pledged_reason: null, ...over,
});

describe('a pledged security is out of reach', () => {
  it('it is not spendable, whatever else is true of it', () => {
    // Soft1's «Δεσμευμένο» exists precisely so an already-committed cheque cannot be spent twice.
    expect(chequeIsSpendable(cheque({}))).toBe(true);
    expect(chequeIsSpendable(cheque({ is_pledged: true }))).toBe(false);
    expect(chequeIsSpendable(cheque({ current_holder: 'endorsed' }))).toBe(false);
    expect(chequeIsSpendable(cheque({ status: 'bounced' }))).toBe(false);
  });

  it('and it offers no move that would spend it', () => {
    const moves = allowedActions(cheque({ is_pledged: true }));
    expect(moves).not.toContain('endorsed');
    expect(moves).not.toContain('discounted');
    expect(moves).not.toContain('factored');
  });

  it('a non-transferable cheque can still be discounted, but not endorsed', () => {
    const moves = allowedActions(cheque({ is_transferable: false }));
    expect(moves).not.toContain('endorsed');
    expect(moves).not.toContain('factored');
    expect(moves).toContain('discounted');
  });

  it('a settled cheque offers nothing at all', () => {
    expect(allowedActions(cheque({ status: 'cleared' }))).toEqual([]);
  });
});

describe('a bounce unwinds more than the cheque', () => {
  it('an endorsed cheque revives the customer debt as well as the payable', () => {
    // Two reversals from one event, and the second is the one that gets forgotten.
    const unwinds = bounceUnwinds(cheque({ current_holder: 'endorsed' }));
    expect(unwinds.some((u) => /payable/i.test(u))).toBe(true);
    expect(unwinds.some((u) => /customer's debt revives/i.test(u))).toBe(true);
  });

  it('a discounted cheque leaves the fee already spent', () => {
    const unwinds = bounceUnwinds(cheque({ current_holder: 'discounted' }));
    expect(unwinds.some((u) => /fee is already spent/i.test(u))).toBe(true);
  });

  it('one in hand only comes back to us', () => {
    expect(bounceUnwinds(cheque({ current_holder: 'us' }))).toHaveLength(1);
  });
});

describe('maturity is not the invoice due date', () => {
  it('a cheque with no maturity can never show as due', () => {
    // Which is NOT the same as not being due — it is the date nobody entered, and the cheque ages
    // quietly out of every list that sorts by it.
    expect(chequeIsUndated(cheque({ maturity_date: null }))).toBe(true);
    expect(chequeIsUndated(cheque({ maturity_date: '2026-11-01' }))).toBe(false);
    expect(chequeIsUndated(cheque({ maturity_date: null, status: 'cleared' }))).toBe(false);
  });

  it('the card says so rather than leaving the column blank', () => {
    expect(card).toMatch(/can never show as due/);
  });
});

describe('every hand it passes through has a name', () => {
  it('the Greek terms are the ones an operator will look for', () => {
    const holders: ChequeHolder[] = ['us', 'endorsed', 'discounted', 'factored', 'settled'];
    for (const h of holders) expect(HOLDER_LABEL[h]).toBeTruthy();
    expect(HOLDER_LABEL.endorsed).toMatch(/οπισθογράφηση/);
    expect(HOLDER_LABEL.discounted).toMatch(/προεξόφληση/);
    expect(ACTION_LABEL.bounced).toMatch(/ακάλυπτη/);
  });
});

describe('the chain is written by one writer', () => {
  it('the move goes through the RPC, not through two updates', () => {
    // The holder and the chain cannot disagree if one statement writes both — and the server
    // refuses a pledged security rather than trusting the screen to have hidden it.
    expect(service).toContain('endorse_cheque');
    expect(service).not.toMatch(/from\('cheque_endorsements'\)[\s\S]{0,80}\.insert/);
  });

  it('it is reachable from the cheques tab', () => {
    expect(docs).toContain('ChequePortfolioCard');
  });

  it('a failed read is unknown, not empty', () => {
    expect(card).toMatch(/not a statement that nothing is[\s\S]{0,20}in hand/);
  });
});
