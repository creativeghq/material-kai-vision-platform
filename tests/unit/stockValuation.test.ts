/**
 * Stock was a quantity and not a value (#421).
 *
 * With no cost layer, inventory value and COGS were not derivable at all, and gross margin read
 * `price − products.cost` — TODAY's cost. So a supplier price that moved between buying and selling
 * silently rewrote the margin on every past sale, and nothing anywhere could see it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  valuationIsPartial, formatValuation, methodChangeRewritesHistory, METHOD_LABEL,
  type InventoryValue, type CogsResult, type ValuationMethod,
} from '@/modules/stock/stockValuationRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/stockValuationService.ts');
const section = read('src/modules/stock/components/StockValuationSection.tsx');
const page = read('src/modules/stock/pages/StockPage.tsx');

const value = (over: Partial<InventoryValue>): InventoryValue => ({
  status: 'complete', value: 0, valued_items: 0, unvalued_items: 0,
  valued_quantity: 0, unvalued_quantity: 0, reason: '', ...over,
});

const cogs = (over: Partial<CogsResult>): CogsResult => ({
  status: 'complete', cogs: 0, valued_movements: 0, unvalued_movements: 0,
  unvalued_quantity: 0, reason: '', ...over,
});

describe('a figure that covers part of the warehouse says so', () => {
  it('`partial` is a state of its own, on both figures', () => {
    // An inventory value that silently omits the shelves it could not price is worse than no
    // figure at all, because it looks like one.
    expect(valuationIsPartial(value({ status: 'partial', unvalued_items: 3 }))).toBe(true);
    expect(valuationIsPartial(cogs({ status: 'partial', unvalued_movements: 2 }))).toBe(true);
    expect(valuationIsPartial(value({ status: 'complete' }))).toBe(false);
    expect(valuationIsPartial(value({ status: 'no_stock' }))).toBe(false);
    expect(valuationIsPartial(null)).toBe(false);
  });

  it('an absent figure is a dash, never 0', () => {
    // Zero stock and unreadable stock are different facts, and only one of them is good news.
    expect(formatValuation(null)).toBe('—');
    expect(formatValuation(undefined)).toBe('—');
    expect(formatValuation(Number.NaN)).toBe('—');
    expect(formatValuation(0)).toBe('0.00 EUR');
    expect(formatValuation(1800)).toBe('1800.00 EUR');
  });

  it('the card renders the derivation`s own reason on both figures', () => {
    expect(section).toContain('reason={value.reason}');
    expect(section).toContain('reason={cogs.reason}');
    expect(section).toMatch(/part of the warehouse/);
  });

  it('a failed read is unknown, not worthless', () => {
    expect(section).toMatch(/not a statement that the stock is[\s\S]{0,20}worth nothing/);
  });
});

describe('the method is a dated record, not a flag', () => {
  it('a change with movements behind it re-values history', () => {
    // ERPNext makes FIFO → Moving Average one-way once transactions exist for good reason: the
    // method decides what every past issue cost.
    expect(methodChangeRewritesHistory({
      current: 'fifo', next: 'weighted_average', movementsInPeriod: 4,
    })).toBe(true);
    expect(methodChangeRewritesHistory({
      current: 'fifo', next: 'weighted_average', movementsInPeriod: 0,
    })).toBe(false);
    expect(methodChangeRewritesHistory({
      current: 'fifo', next: 'fifo', movementsInPeriod: 99,
    })).toBe(false);
  });

  it('weighted average is named in the language the accountant uses', () => {
    const methods: ValuationMethod[] = ['weighted_average', 'fifo', 'standard'];
    for (const m of methods) expect(METHOD_LABEL[m]).toBeTruthy();
    expect(METHOD_LABEL.weighted_average).toMatch(/σταθμική/);
  });

  it('the change is recorded with a date', () => {
    expect(service).toContain('effective_from');
    expect(service).toContain('stock_valuation_settings');
  });
});

describe('both figures are derived ONCE, in SQL', () => {
  it('the service reads the derivations and computes nothing', () => {
    expect(service).toContain('stock_inventory_value');
    expect(service).toContain('stock_cogs');
    // Re-deriving a money quantity in TypeScript is anti-regression rule 1's exact shape, and
    // this one has five historical offenders already recorded against it.
    expect(service).not.toMatch(/qty_on_hand\s*\*|\*\s*unit_cost|reduce\(/);
    expect(section).not.toMatch(/qty_on_hand\s*\*|\*\s*unit_cost/);
  });

  it('it is reachable from the warehouse', () => {
    expect(page).toContain('StockValuationSection');
    expect(page).toContain("'valuation'");
  });
});
