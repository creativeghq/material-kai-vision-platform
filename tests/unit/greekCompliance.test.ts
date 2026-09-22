/**
 * The απογραφή and the pre-filled VAT rules (#452, #445).
 *
 * Both are asymmetric, and both have a state that looks like compliance and is not. myDATA income
 * is a FLOOR and myDATA expenses are a CEILING: declaring more income is always allowed, declaring
 * more expenses forfeits the deduction outright. Getting the direction the wrong way round is the
 * expensive mistake.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  incomeBreaches, expenseBreaches, deviationIsDeclared, prefillBlocks,
  thirdPartyLineMayBeValued, rollForwardIncomplete, MEASUREMENT_LABEL, DEVIATION_DOCUMENT,
  type PrefillVerdict, type RollForward, type MeasurementMethod,
} from '@/modules/finance/greekComplianceRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/greekComplianceService.ts');
const vatCard = read('src/modules/finance/components/VatReturnPanel.tsx');
const apografi = read('src/modules/stock/components/ApografiPanel.tsx');
const financePage = read('src/pages/Admin/FinancePage.tsx');
const stockPage = read('src/modules/stock/pages/StockPage.tsx');

describe('income is a floor and expenses are a ceiling', () => {
  it('declaring MORE income is always allowed', () => {
    // The rule is one-directional. Treating it as a symmetric variance would flag the one case
    // that is explicitly permitted without limit.
    expect(incomeBreaches(130000, 100000)).toBe('ok');
    expect(incomeBreaches(100000, 100000)).toBe('ok');
  });

  it('declaring LESS income breaches once past the tolerance', () => {
    expect(incomeBreaches(80000, 100000)).toBe('within_tolerance');
    expect(incomeBreaches(60000, 100000)).toBe('breach');
  });

  it('declaring MORE expenses is the expensive direction', () => {
    // Under άρθρο 3 §2β the deductions and the related deductible expenses are NOT TAKEN INTO
    // ACCOUNT. There is no warning state in the law.
    expect(expenseBreaches(60000, 60000)).toBe('ok');
    expect(expenseBreaches(40000, 60000)).toBe('ok');
    expect(expenseBreaches(70000, 60000)).toBe('within_tolerance');
    expect(expenseBreaches(90000, 60000)).toBe('breach');
  });

  it('the tolerance is 30% on each side by default', () => {
    // Α.1020/2024 άρθρο 4, confirmed in AADE's Ε3 FAQ of 13.03.2026.
    expect(expenseBreaches(78000, 60000)).toBe('within_tolerance');
    expect(expenseBreaches(78001, 60000)).toBe('breach');
  });
});

describe('the escape hatch is a transmission, not a note', () => {
  it('a deviation with no MARK has not been declared', () => {
    expect(deviationIsDeclared({ mydata_mark: '400001234567890' })).toBe(true);
    expect(deviationIsDeclared({ mydata_mark: null })).toBe(false);
    expect(deviationIsDeclared({})).toBe(false);
  });

  it('each side has its fixed document type and characterisation', () => {
    // 11.4 with 1.95 on income, 14.30 with 2.4 on expenses — the pairing is fixed by the decision,
    // not a choice.
    expect(DEVIATION_DOCUMENT.income.type).toBe('11.4');
    expect(DEVIATION_DOCUMENT.income.characterisation).toBe('1.95');
    expect(DEVIATION_DOCUMENT.expense.type).toBe('14.30');
    expect(DEVIATION_DOCUMENT.expense.characterisation).toBe('2.4');
  });

  it('the card says an untransmitted deviation is still just a difference', () => {
    expect(vatCard).toMatch(/still just a difference/);
    expect(vatCard).toMatch(/The escape hatch is a transmission, not/);
  });

  it('only a breach blocks', () => {
    const v = (over: Partial<PrefillVerdict>): PrefillVerdict => ({ status: 'ok', reason: '', ...over });
    expect(prefillBlocks(v({ status: 'breach' }))).toBe(true);
    expect(prefillBlocks(v({ status: 'tolerance' }))).toBe(false);
    expect(prefillBlocks(v({ status: 'no_mydata_figures' }))).toBe(false);
    expect(prefillBlocks(null)).toBe(false);
  });
});

describe('third-party stock is quantity-only', () => {
  it('consigned goods can never carry a valuation', () => {
    // Ν.4308/2014 άρθρο 4 §5 gives them description, unit and quantity per location and NO unit
    // valuation, because valuing them puts somebody else's inventory on our balance sheet.
    expect(thirdPartyLineMayBeValued()).toBe(false);
  });

  it('the panel says so rather than showing a blank', () => {
    expect(apografi).toMatch(/not ours to value/);
  });
});

describe('the count date is not the reference date', () => {
  it('an unfinished roll-forward is visible', () => {
    const r = (over: Partial<RollForward>): RollForward => ({ status: 'clean', reason: '', ...over });
    expect(rollForwardIncomplete(r({ status: 'moved', movements_between: 12 }))).toBe(true);
    // `partial` matters most: lines nobody could link stand as counted, which is an assumption.
    expect(rollForwardIncomplete(r({ status: 'partial', unlinked_lines: 3 }))).toBe(true);
    expect(rollForwardIncomplete(r({ status: 'clean' }))).toBe(false);
    expect(rollForwardIncomplete(r({ status: 'same_day' }))).toBe(false);
    expect(rollForwardIncomplete(null)).toBe(false);
  });

  it('how a quantity was established is recorded, not assumed', () => {
    // Άρθρο 4 §4(γ) allows indirect techniques where reliable and documented, and a count and an
    // estimate are different facts.
    const ms: MeasurementMethod[] = ['physical_count', 'indirect', 'roll_forward'];
    for (const m of ms) expect(MEASUREMENT_LABEL[m]).toBeTruthy();
  });
});

describe('both are derived in SQL and reachable', () => {
  it('the service reads the derivations', () => {
    expect(service).toContain('vat_prefill_verdict');
    expect(service).toContain('apografi_roll_forward');
  });

  it('nothing re-derives the rules in the client beyond the pure predicates', () => {
    expect(vatCard).not.toMatch(/mydata_expenses\s*\*|tolerance_percent\s*\//);
  });

  it('they are mounted where each belongs', () => {
    expect(financePage).toContain('VatReturnPanel');
    expect(stockPage).toContain('ApografiPanel');
  });

  it('a failed read is unknown, not compliant', () => {
    expect(vatCard).toMatch(/not a statement that[\s\S]{0,20}nothing is due/);
    expect(apografi).toMatch(/not a statement that none exist/);
  });
});
