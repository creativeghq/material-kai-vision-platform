/**
 * The order cost audit — the three ways an order's cost can be wrong while every figure on the
 * screen stays internally consistent. Each case here is a state the live data was actually in.
 */
import { describe, it, expect } from 'vitest';
import { auditOrderCosts, describeCostFinding, type CostAuditFinding } from '@/modules/finance/utils/orderCostAudit';

const names = new Map([
  ['keros', 'KEROS HELLAS'],
  ['izida', 'IZIDA 1894'],
  ['raben', 'RABEN LOGISTICS'],
  ['tagina', 'TAGINA S.P.A.'],
]);

const find = <K extends CostAuditFinding['kind']>(fs: CostAuditFinding[], kind: K) =>
  fs.filter((f) => f.kind === kind) as Extract<CostAuditFinding, { kind: K }>[];

describe('auditOrderCosts', () => {
  it('flags two live expenses of the same amount for one supplier', () => {
    // ORD-2026-0001 as it actually stood: the KEROS EUR 328 instalment booked twice, one paid and
    // one left owing, so Payables showed a debt that had already been settled through the twin.
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: 'keros', quantity: 1, unit_cost: 1578, vat_percent: 0, net_value: 1578 }],
      bills: [
        { id: 'a', supplier_company_id: 'keros', total: 328, amount_due: 328, status: 'received' },
        { id: 'b', supplier_company_id: 'keros', total: 328, amount_due: 0, status: 'paid' },
      ],
    });
    const dupes = find(findings, 'duplicate_expense');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].amount).toBe(328);
    expect(dupes[0].count).toBe(2);
    expect(dupes[0].supplier).toBe('KEROS HELLAS');
    expect(dupes[0].billIds.sort()).toEqual(['a', 'b']);
  });

  it('does not flag two different amounts, or a voided twin', () => {
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: 'keros', quantity: 1, unit_cost: 2000, vat_percent: 0, net_value: 2000 }],
      bills: [
        { id: 'a', supplier_company_id: 'keros', total: 328, amount_due: 0, status: 'paid' },
        { id: 'b', supplier_company_id: 'keros', total: 500, amount_due: 0, status: 'paid' },
        // Voided: no longer a payable and no longer a costing, so it cannot pair with anything.
        { id: 'c', supplier_company_id: 'keros', total: 328, amount_due: 0, status: 'void' },
      ],
    });
    expect(find(findings, 'duplicate_expense')).toHaveLength(0);
  });

  it('does not pair identical amounts from DIFFERENT suppliers', () => {
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [],
      bills: [
        { id: 'a', supplier_company_id: 'keros', total: 100, amount_due: 0, status: 'paid' },
        { id: 'b', supplier_company_id: 'izida', total: 100, amount_due: 0, status: 'paid' },
      ],
    });
    expect(find(findings, 'duplicate_expense')).toHaveLength(0);
  });

  it('an instalment inside the line cost is NOT cost outside the margin', () => {
    // KEROS billed EUR 328 against goods the lines already say cost EUR 1,578. The margin already
    // knows about that money; flagging it would train the operator to ignore the warning.
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: 'keros', quantity: 1, unit_cost: 1578, vat_percent: 0, net_value: 1578 }],
      bills: [{ id: 'a', supplier_company_id: 'keros', total: 328, amount_due: 0, status: 'paid' }],
    });
    expect(find(findings, 'cost_outside_margin')).toHaveLength(0);
  });

  it('flags a freight bill from a supplier with no lines — margin cannot see it', () => {
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: 'keros', quantity: 1, unit_cost: 1578, vat_percent: 0, net_value: 1578 }],
      bills: [{ id: 'f', supplier_company_id: 'raben', total: 224, amount_due: 224, status: 'received' }],
    });
    const outside = find(findings, 'cost_outside_margin');
    expect(outside).toHaveLength(1);
    expect(outside[0].amount).toBe(224);
    expect(outside[0].supplier).toBe('RABEN LOGISTICS');
  });

  it('flags only the EXCESS when a supplier is billed beyond their line cost', () => {
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: 'tagina', quantity: 70, unit_cost: 13.5, vat_percent: 0, net_value: 945 }],
      bills: [{ id: 'a', supplier_company_id: 'tagina', total: 1045, amount_due: 0, status: 'paid' }],
    });
    const outside = find(findings, 'cost_outside_margin');
    expect(outside).toHaveLength(1);
    expect(outside[0].amount).toBe(100);
  });

  it('compares a bill against the VAT-INCLUSIVE line cost, the way the supplier bills it', () => {
    // 100 x 7.00 at 24% = 868.00 gross. A supplier invoice for 868.00 is the same money, not extra.
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: 'izida', quantity: 100, unit_cost: 7, vat_percent: 24, net_value: 950 }],
      bills: [{ id: 'a', supplier_company_id: 'izida', total: 868, amount_due: 0, status: 'paid' }],
    });
    expect(find(findings, 'cost_outside_margin')).toHaveLength(0);
  });

  it('ignores a rounding cent between gross line cost and a bill', () => {
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: 'izida', quantity: 3, unit_cost: 10.005, vat_percent: 0, net_value: 40 }],
      bills: [{ id: 'a', supplier_company_id: 'izida', total: 30.02, amount_due: 0, status: 'paid' }],
    });
    expect(find(findings, 'cost_outside_margin')).toHaveLength(0);
  });

  it('flags revenue-bearing lines with no cost, and counts their revenue', () => {
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [
        { supplier_company_id: 'keros', quantity: 1, unit_cost: 100, vat_percent: 0, net_value: 150 },
        { supplier_company_id: 'keros', quantity: 2, unit_cost: null, vat_percent: 0, net_value: 400 },
        { supplier_company_id: null, quantity: 1, unit_cost: null, vat_percent: 0, line_total: 250 },
      ],
      bills: [],
    });
    const costless = find(findings, 'line_without_cost');
    expect(costless).toHaveLength(1);
    expect(costless[0].count).toBe(2);
    expect(costless[0].revenue).toBe(650);
  });

  it('a costless line carrying no revenue is not a finding', () => {
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [{ supplier_company_id: null, quantity: 1, unit_cost: null, vat_percent: 0, net_value: 0 }],
      bills: [],
    });
    expect(find(findings, 'line_without_cost')).toHaveLength(0);
  });

  it('a clean order produces nothing at all', () => {
    // ORD-2026-0001 after the duplicate was removed: every bill an instalment inside its line cost,
    // every line costed.
    const findings = auditOrderCosts({
      supplierNames: names,
      lines: [
        { supplier_company_id: 'keros', quantity: 1, unit_cost: 1578, vat_percent: 0, net_value: 1578 },
        { supplier_company_id: 'izida', quantity: 259.2, unit_cost: 7, vat_percent: 24, net_value: 2462.4 },
      ],
      bills: [
        { id: 'a', supplier_company_id: 'keros', total: 328, amount_due: 0, status: 'paid' },
        { id: 'b', supplier_company_id: 'izida', total: 49.86, amount_due: 0, status: 'paid' },
      ],
    });
    expect(findings).toHaveLength(0);
  });

  it('every finding kind has wording', () => {
    const all: CostAuditFinding[] = [
      { kind: 'duplicate_expense', supplier: 'X', amount: 1, billIds: ['a', 'b'], count: 2 },
      { kind: 'cost_outside_margin', supplier: 'X', amount: 1, billIds: ['a'] },
      { kind: 'line_without_cost', count: 1, revenue: 1 },
    ];
    for (const f of all) {
      const text = describeCostFinding(f);
      expect(text.length).toBeGreaterThan(20);
      expect(text).not.toContain('undefined');
    }
  });
});
