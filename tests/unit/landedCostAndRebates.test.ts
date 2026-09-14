/**
 * The two things that move cost after the fact (#422, #425).
 *
 * Freight and duty never reached cost per m², and the retrospective supplier claim was not modelled
 * at all. Both make reported margin wrong in a PREDICTABLE direction on imported and rebated lines
 * — and a wrong margin is a valid number, so the sales team prices off it and nothing raises.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  allocationIsForecast, allocationRefused, onCostVariance, BASIS_LABEL,
  type FolderAllocation, type AllocationBasis,
} from '@/modules/stock/landedCostRules';
import {
  rebateIsBanked, crossingIsWorth, rebateNeedsAttention, CLAIM_LABEL,
  type RebatePosition, type ClaimStatus,
} from '@/modules/stock/rebateRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const landedService = read('src/modules/stock/services/landedCostService.ts');
const rebateService = read('src/modules/stock/services/rebateService.ts');
const foldersPanel = read('src/modules/stock/components/ImportFoldersPanel.tsx');
const rebatesPanel = read('src/modules/stock/components/RebatesPanel.tsx');
const page = read('src/modules/stock/pages/StockPage.tsx');

const alloc = (over: Partial<FolderAllocation>): FolderAllocation =>
  ({ status: 'forecast', reason: '', ...over });

const pos = (over: Partial<RebatePosition>): RebatePosition =>
  ({ status: 'accruing', reason: '', ...over });

describe('weight is the default basis, and it is not a preference', () => {
  it('the label says why', () => {
    // Allocating freight by value dumps it onto light, expensive decor and under-costs heavy floor
    // tile — wrong in the one direction that flatters the cheap lines.
    const bases: AllocationBasis[] = ['weight', 'volume', 'value', 'quantity', 'equal'];
    for (const b of bases) expect(BASIS_LABEL[b]).toBeTruthy();
    expect(BASIS_LABEL.weight).toMatch(/default for tile/i);
  });

  it('an unmeasurable basis is refused, not swapped', () => {
    // A weight basis where half the lines have no weight is not "allocated by weight", and the
    // number that comes out looks exactly like one that was.
    expect(allocationRefused(alloc({ status: 'unmeasurable', unmeasured_lines: 2 }))).toBe(true);
    expect(allocationRefused(alloc({ status: 'forecast' }))).toBe(false);
    expect(allocationRefused(null)).toBe(false);
  });
});

describe('a forecast is an accrual and says so', () => {
  it('forecast and actual are different states', () => {
    expect(allocationIsForecast(alloc({ status: 'forecast' }))).toBe(true);
    expect(allocationIsForecast(alloc({ status: 'actual' }))).toBe(false);
    expect(allocationIsForecast(null)).toBe(false);
  });

  it('the variance needs both halves to exist', () => {
    // Zero variance and "the invoices have not arrived" are different facts, and only one of them
    // means the estimate was right.
    expect(onCostVariance(alloc({ forecast_total: 2200, actual_total: 2500 }))).toBe(300);
    expect(onCostVariance(alloc({ forecast_total: 2200, actual_total: 0 }))).toBeNull();
    expect(onCostVariance(alloc({ forecast_total: 0, actual_total: 2500 }))).toBeNull();
    expect(onCostVariance(null)).toBeNull();
  });

  it('the panel reports the derivation`s own sentence', () => {
    expect(foldersPanel).toContain('allocation.reason');
  });
});

describe('a rebate accrual is not money', () => {
  it('only a settled claim is banked', () => {
    const states: ClaimStatus[] = ['expected', 'claimed', 'settled', 'written_off'];
    for (const s of states) expect(CLAIM_LABEL[s]).toBeTruthy();
    expect(rebateIsBanked('settled')).toBe(true);
    expect(rebateIsBanked('expected')).toBe(false);
    expect(rebateIsBanked('claimed')).toBe(false);
    expect(rebateIsBanked('written_off')).toBe(false);
  });

  it('the expected label says it is an accrual', () => {
    expect(CLAIM_LABEL.expected).toMatch(/not banked/i);
  });

  it('an untotallable base is unknown, not nil', () => {
    expect(rebateNeedsAttention(pos({ status: 'unmeasurable', accrual: null }))).toBe(true);
    expect(rebateNeedsAttention(pos({ status: 'accruing', accrual: 1600 }))).toBe(false);
    expect(rebateNeedsAttention(pos({ status: 'below_first_band', accrual: 0 }))).toBe(false);
    expect(rebateNeedsAttention(null)).toBe(false);
  });
});

describe('crossing a band re-rates the whole period', () => {
  it('the uplift is on everything since the period started', () => {
    // 120,000 to date at 2%, next band 3%: crossing is worth 1% of the WHOLE base, not 1% of
    // what follows. That is the difference between a rebate and a tiered discount.
    expect(crossingIsWorth(
      pos({ period_to_date: 80000, to_go: 20000, percent: 2, retrospective: true }), 3,
    )).toBe(1000);
  });

  it('a non-retrospective agreement earns no uplift on the past', () => {
    expect(crossingIsWorth(
      pos({ period_to_date: 80000, to_go: 20000, percent: 2, retrospective: false }), 3,
    )).toBeNull();
  });

  it('nothing to cross is null rather than zero', () => {
    expect(crossingIsWorth(pos({ period_to_date: 80000, to_go: null, percent: 2 }), 3)).toBeNull();
    expect(crossingIsWorth(null, 3)).toBeNull();
  });
});

describe('both are derived in SQL and reachable', () => {
  it('the services read the derivations', () => {
    expect(landedService).toContain('import_folder_allocation');
    expect(rebateService).toContain('supplier_rebate_position');
  });

  it('nothing apportions or re-rates in the client', () => {
    expect(landedService).not.toMatch(/measure\s*\/|\*\s*share/);
    expect(rebateService).not.toMatch(/percent\s*\/\s*100/);
    expect(foldersPanel).not.toMatch(/percent\s*\/\s*100|measure\s*\//);
  });

  it('both panels are mounted where cost is read', () => {
    expect(page).toContain('ImportFoldersPanel');
    expect(page).toContain('RebatesPanel');
  });

  it('a failed read is unknown, not empty', () => {
    expect(foldersPanel).toMatch(/not a statement that there are[\s\S]{0,20}none/);
    expect(rebatesPanel).toMatch(/not a statement that there are[\s\S]{0,20}none/);
  });
});
