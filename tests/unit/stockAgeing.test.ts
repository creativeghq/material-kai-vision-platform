/**
 * Ageing buckets tied to an obsolescence provision (#438).
 *
 * Nothing raises today because no row is wrong: a pallet nobody has bought since 2024 is a
 * perfectly valid row with a perfectly valid quantity. That is the silent-zero shape applied to
 * the balance sheet — and the distinction that carries it is "never sold" against "sold none".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  describeAge, provisionIsIncomplete, poolsNeedingAttention,
  type AgeingRow, type AgeingPosition,
} from '@/modules/stock/ageingRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/ageingService.ts');
const panel = read('src/modules/stock/components/StockAgeingPanel.tsx');
const page = read('src/modules/stock/pages/StockPage.tsx');

const row = (over: Partial<AgeingRow>): AgeingRow => ({
  pool_id: 'p', item: 'tile', lot: 'L1', tone: 'T1', calibre: 'C1', is_remainder: false,
  quantity: 100, value: 1200, days_since_last_sale: 30, never_sold: false,
  discontinued_on: null, provision_percent: 0, provision: 0, ...over,
});

const pos = (over: Partial<AgeingPosition>): AgeingPosition =>
  ({ status: 'complete', reason: '', ...over });

describe('"never sold" is not "sold none this month"', () => {
  it('the two read differently', () => {
    // A pool received last week and one nobody has wanted since 2024 both sold nothing this
    // month, and only one of them is a write-down waiting to happen.
    expect(describeAge(row({ never_sold: true, days_since_last_sale: 400 })))
      .toBe('never sold · 400 days on the shelf');
    expect(describeAge(row({ never_sold: false, days_since_last_sale: 400 })))
      .toBe('400 days since it last sold');
  });

  it('no history at all is stated, not counted as fresh', () => {
    expect(describeAge(row({ days_since_last_sale: null, never_sold: true })))
      .toBe('no history recorded');
  });
});

describe('no policy is not "nothing needs writing down"', () => {
  it('both incomplete states say so', () => {
    expect(provisionIsIncomplete(pos({ status: 'no_policy' }))).toBe(true);
    expect(provisionIsIncomplete(pos({ status: 'partial', unvalued_pools: 3 }))).toBe(true);
    expect(provisionIsIncomplete(pos({ status: 'complete' }))).toBe(false);
    expect(provisionIsIncomplete(pos({ status: 'no_stock' }))).toBe(false);
    expect(provisionIsIncomplete(null)).toBe(false);
  });

  it('the panel offers a starting policy rather than deciding one', () => {
    expect(panel).toMatch(/not a rule the platform decides for you/);
  });
});

describe('a discontinued range leads, because it is the earliest signal', () => {
  it('it sorts above a merely-aged pool', () => {
    const p = pos({
      rows: [
        row({ pool_id: 'aged', provision_percent: 75, provision: 900 }),
        row({ pool_id: 'dropped', discontinued_on: '2026-01-01', provision_percent: 0, provision: 0 }),
      ],
    });
    expect(poolsNeedingAttention(p).map((r) => r.pool_id)).toEqual(['dropped', 'aged']);
  });

  it('a healthy pool is not listed at all', () => {
    const p = pos({ rows: [row({ provision_percent: 0, provision: 0 })] });
    expect(poolsNeedingAttention(p)).toHaveLength(0);
    expect(poolsNeedingAttention(null)).toHaveLength(0);
  });
});

describe('the provision is derived once, in SQL', () => {
  it('the service reads the derivation and computes nothing', () => {
    expect(service).toContain('stock_ageing');
    expect(service).not.toMatch(/percent\s*\/\s*100|\*\s*value/);
    expect(panel).not.toMatch(/percent\s*\/\s*100/);
  });

  it('the policy is dated, not edited in place', () => {
    expect(service).toContain('effective_from');
    expect(service).toMatch(/discontinued_by_supplier_on/);
  });

  it('it is reachable where the stock value is read', () => {
    expect(page).toContain('StockAgeingPanel');
  });

  it('a failed read is unknown, not clear', () => {
    expect(panel).toMatch(/not a statement that nothing needs[\s\S]{0,20}writing down/);
  });
});
