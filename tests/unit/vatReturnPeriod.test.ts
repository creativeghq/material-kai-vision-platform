import { describe, it, expect } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';
import { aadeVerdict } from '@/modules/finance/pnlStatus';
import {
  vatReturnLineLabel, sortVatReturnLines, vatPayableLabel, vatPeriodPresets,
  residualVerdict, vatDifferenceLines, worseAadeStatus, RESIDUAL_EPSILON,
  type VatReturnSnapshot,
} from '@/modules/finance/vatReturn';

const PANEL = strippedSource('src/modules/finance/components/VatReturnPanel.tsx');
const REPORTS = strippedSource('src/modules/finance/tabs/ReportsTab.tsx');
const SERVICE = strippedSource('src/modules/finance/services/greekComplianceService.ts');

const snapshot = (over: Partial<VatReturnSnapshot> = {}): VatReturnSnapshot => ({
  period: { from: '2026-07-01', to: '2026-09-30', months: 3, aligned_to_months: true },
  ours: {
    rates: [], output_vat: 0, input_vat: 0, payable: 0,
    income_net: 0, expense_net: 0, doc_count: 0, status: 'ok',
  },
  aade: {
    income_net: 0, income_vat: 0, income_docs: 0,
    expense_net: 0, expense_vat: 0, expense_docs: 0,
    payable: 0, income_status: 'ok', expense_status: 'ok',
  },
  difference: {
    income_net: 0, expense_net: 0, payable: 0, income_residual: 0, expense_residual: 0,
  },
  explained: {
    unbooked_expenses: { count: 0, net: 0, vat: 0 },
    untransmitted_invoices: { count: 0, net: 0, vat: 0 },
    bills_without_inbound: { count: 0, net: 0, vat: 0 },
    deviations: {
      declared_count: 0, declared_amount: 0, undeclared_count: 0, undeclared_amount: 0,
    },
  },
  prefill_period_id: null,
  ...over,
});

describe('a line of the return is named once', () => {
  it('and Reports reads that name rather than spelling it again', () => {
    expect(REPORTS).toMatch(/vatReturnLineLabel\(/);
    expect(REPORTS, 'the report writes its own line labels again')
      .not.toMatch(/Intra-EU acquisitions/);
    expect(PANEL).toMatch(/vatReturnLineLabel\(/);
  });

  it('the reverse charge is TWO lines, because it is two entries', () => {
    expect(vatReturnLineLabel('reverse_charge_output', null)).not.toEqual(
      vatReturnLineLabel('reverse_charge_input', null));
    expect(vatReturnLineLabel('reverse_charge_output', null)).toMatch(/self-assessed/);
    expect(vatReturnLineLabel('reverse_charge_input', null)).toMatch(/reclaimed/);
  });

  it('an unknown section prints its key rather than an empty cell', () => {
    expect(vatReturnLineLabel('something_new', null)).toBe('something_new');
  });

  it('and the lines read in filing order, not union order', () => {
    const sorted = sortVatReturnLines([
      { section: 'reverse_charge_input', vat_rate: null, net: 0, vat: 1, doc_count: 1 },
      { section: 'output', vat_rate: 13, net: 1, vat: 1, doc_count: 1 },
      { section: 'output', vat_rate: 24, net: 1, vat: 1, doc_count: 1 },
      { section: 'input', vat_rate: null, net: 1, vat: 1, doc_count: 1 },
    ]).map((r) => `${r.section}:${r.vat_rate ?? '-'}`);
    expect(sorted).toEqual(['output:24', 'output:13', 'input:-', 'reverse_charge_input:-']);
  });
});

describe('a figure ΑΑΔΕ did not give us is not a zero', () => {
  it('the period-not-comparable case has a stated reason', () => {
    const v = aadeVerdict('period_not_comparable');
    expect(v.hasFigures).toBe(false);
    expect(v.detail).toMatch(/calendar month/i);
  });

  it('and the panel renders the reason instead of the number when there is none', () => {
    expect(PANEL).toMatch(/verdict && !verdict\.hasFigures/);
    expect(PANEL).toMatch(/value == null/);
    expect(PANEL, 'a figure falls back to 0 somewhere in the panel')
      .not.toMatch(/(income_net|expense_net|payable)\s*\?\?\s*0/);
  });

  it('a mid-month period says so rather than comparing three months to six weeks', () => {
    expect(PANEL).toMatch(/!snap\.period\.aligned_to_months/);
  });
});

describe('TypeScript formats, SQL derives', () => {
  it('the panel never re-adds a VAT total', () => {
    expect(PANEL, 'the payable is recomputed in the component')
      .not.toMatch(/output_vat\s*[-+]\s*.*input_vat/);
    expect(PANEL).toMatch(/snap\.ours\.payable/);
    expect(PANEL).toMatch(/snap\.aade\.payable/);
    expect(PANEL).toMatch(/snap\.difference\.payable/);
  });

  it('and reads one RPC for the whole comparison', () => {
    expect(SERVICE).toMatch(/rpc\('get_vat_return_period'/);
    expect(PANEL, 'the panel talks to Supabase directly instead of the service')
      .not.toMatch(/supabase\./);
  });

  it('the period record is filled from the derivation, never typed', () => {
    expect(SERVICE).toMatch(/rpc\('open_vat_return_period'/);
    expect(PANEL).toMatch(/openVatReturn\(/);
    expect(PANEL, 'the panel offers an input for a myDATA figure again')
      .not.toMatch(/mydata_income|declared_income/);
  });
});

describe('the difference is explained, or explicitly not', () => {
  it('an absent comparison is unknown — never "fully accounted for"', () => {
    expect(residualVerdict(null).tone).toBe('unknown');
    expect(residualVerdict(0).tone).toBe('ok');
    expect(residualVerdict(RESIDUAL_EPSILON + 1).tone).toBe('warn');
    expect(residualVerdict(-(RESIDUAL_EPSILON + 1)).tone).toBe('warn');
  });

  it('and names which side holds the value in each direction', () => {
    expect(residualVerdict(100).text).toMatch(/your books hold value ΑΑΔΕ does not/);
    expect(residualVerdict(-100).text).toMatch(/ΑΑΔΕ holds value your books do not/);
  });

  it('an empty term is dropped rather than printed as "0 documents"', () => {
    expect(vatDifferenceLines(snapshot())).toEqual([]);
  });

  it('a hand-entered bill is LISTED, not subtracted — we cannot assert ΑΑΔΕ holds it', () => {
    const lines = vatDifferenceLines(snapshot({
      explained: {
        unbooked_expenses: { count: 2, net: 100, vat: 24 },
        untransmitted_invoices: { count: 1, net: 50, vat: 12 },
        bills_without_inbound: { count: 3, net: 70, vat: 16 },
        deviations: {
          declared_count: 0, declared_amount: 0, undeclared_count: 0, undeclared_amount: 0,
        },
      },
    }));
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l]));
    expect(byKey.unbooked_expenses.explains).toBe('expense');
    expect(byKey.untransmitted_invoices.explains).toBe('income');
    expect(byKey.bills_without_inbound.explains).toBeNull();
  });

  it('an untransmitted deviation is called what it is', () => {
    const [line] = vatDifferenceLines(snapshot({
      explained: {
        unbooked_expenses: { count: 0, net: 0, vat: 0 },
        untransmitted_invoices: { count: 0, net: 0, vat: 0 },
        bills_without_inbound: { count: 0, net: 0, vat: 0 },
        deviations: {
          declared_count: 1, declared_amount: 5000, undeclared_count: 2, undeclared_amount: 300,
        },
      },
    }));
    expect(line.detail).toMatch(/not been transmitted/);
    expect(line.count).toBe(3);
    expect(line.net).toBe(5300);
  });
});

describe('a figure built from both sides takes the worse verdict', () => {
  it('one side failing is never reported as complete', () => {
    expect(worseAadeStatus('ok', 'collector_failed')).toBe('collector_failed');
    expect(worseAadeStatus('collector_failed', 'ok')).toBe('collector_failed');
    expect(worseAadeStatus('ok', 'partial')).toBe('partial');
    expect(worseAadeStatus('ok', 'ok')).toBe('ok');
  });

  it('and the ΑΑΔΕ tile reads both sides, not just income', () => {
    expect(PANEL).toMatch(/worseAadeStatus\(snap\.aade\.income_status, snap\.aade\.expense_status\)/);
  });
});

describe('the period presets are whole months, because the book is', () => {
  it('every preset starts on the 1st and ends on a month end', () => {
    for (const p of vatPeriodPresets(new Date(2026, 4, 17))) {
      expect(p.from.slice(-2), p.key).toBe('01');
      const [y, m, d] = p.to.split('-').map(Number);
      expect(new Date(y, m, 0).getDate(), `${p.key} does not end on a month end`).toBe(d);
    }
  });

  it('a quarter is three months, and last quarter crosses the year cleanly', () => {
    const jan = vatPeriodPresets(new Date(2026, 0, 15));
    const last = jan.find((p) => p.key === 'last_quarter')!;
    expect(last.from).toBe('2025-10-01');
    expect(last.to).toBe('2025-12-31');
  });

  it('a February end is the real one, not a 30th', () => {
    const mar = vatPeriodPresets(new Date(2026, 2, 3));
    expect(mar.find((p) => p.key === 'last_month')!.to).toBe('2026-02-28');
  });
});

describe('money back is not a smaller bill', () => {
  it('a negative liability is labelled refundable', () => {
    expect(vatPayableLabel(120)).toMatch(/payable/i);
    expect(vatPayableLabel(-120)).toMatch(/refundable/i);
    expect(vatPayableLabel(0)).toMatch(/nothing due/i);
    expect(vatPayableLabel(null)).toBe('VAT return');
  });
});

describe('the filing gate matches the server', () => {
  it('filing asks for a workspace manager, which is what the RPC checks', () => {
    expect(PANEL).toMatch(/isWorkspaceManager/);
    expect(PANEL, 'the panel gates filing on the finance-operator persona')
      .not.toMatch(/canOperateFinance/);
  });

  it('and says so rather than hiding the section entirely', () => {
    expect(PANEL).toMatch(/workspace owner or admin action/);
  });

  it('marking a breached period as filed is confirmed, not blocked', () => {
    expect(PANEL).toMatch(/prefillBlocks\(verdict\)/);
    expect(PANEL).toMatch(/forfeits the deduction/);
  });
});

describe('one screen for the period', () => {
  it('the Settings copy is gone, not duplicated', async () => {
    const { existsSync } = await import('node:fs');
    expect(existsSync('src/modules/finance/components/VatPrefillCard.tsx'),
      'VatPrefillCard is back — the period is now editable in two places')
      .toBe(false);
    expect(strippedSource('src/modules/finance/tabs/SettingsTab.tsx'))
      .not.toMatch(/VatPrefillCard/);
  });
});
