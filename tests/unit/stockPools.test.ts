/**
 * Tile stock is a cube, and "available" is the largest homogeneous pool (#420).
 *
 * A box carries a lot, a calibre and a tone, and mixing them shows — especially after grouting.
 * 200 m² split across three tones cannot fill a 200 m² order, so a platform that sums the SKU
 * produces an optimistic number on every quote. A wrong number is a valid number: nothing raises.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  wouldMixPools, describePool, promisableQuantity,
  type HomogeneousAvailability,
} from '@/modules/stock/stockPoolRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/stockPoolService.ts');
const notice = read('src/modules/stock/components/HomogeneousStockNotice.tsx');
const quoteList = read('src/modules/quotes/components/QuoteItemsList.tsx');
const panel = read('src/modules/stock/components/StockPoolsPanel.tsx');

const a = (over: Partial<HomogeneousAvailability>): HomogeneousAvailability =>
  ({ status: 'ok', reason: '', ...over });

describe('a line that would mix lots says so', () => {
  it('split and opened-packs both mix; a fitting pool does not', () => {
    expect(wouldMixPools(a({ status: 'split_across_pools' }))).toBe(true);
    expect(wouldMixPools(a({ status: 'only_opened_packs' }))).toBe(true);
    expect(wouldMixPools(a({ status: 'ok' }))).toBe(false);
    // "Nothing free" is a shortage, not a mixing problem — a different conversation with the
    // customer, and conflating them hides one of the two.
    expect(wouldMixPools(a({ status: 'no_pools' }))).toBe(false);
    expect(wouldMixPools(null)).toBe(false);
  });

  it('what may be promised is the largest POOL, never the total', () => {
    // This is the whole ticket in one assertion.
    expect(promisableQuantity(a({
      status: 'split_across_pools', largest_pool_free: 90, total_free: 200,
    }))).toBe(90);
    expect(promisableQuantity(a({ status: 'no_pools', total_free: 0 }))).toBe(0);
    // Not found is UNKNOWN, not zero: a product nobody stocks here is not a product we have none
    // of, it is one this warehouse cannot answer for.
    expect(promisableQuantity(a({ status: 'not_found' }))).toBeNull();
    expect(promisableQuantity(null)).toBeNull();
  });
});

describe('the cube axes read as the trade names them', () => {
  it('every recorded axis is named, and blanks are dropped', () => {
    expect(describePool(a({ lot: 'L1', tone: 'T2', calibre: 'C1', grade: '1a' })))
      .toBe('lot L1 · tone T2 · calibre C1 · grade 1a');
    // An unlabelled box is not "lot -". It is a box nobody recorded a lot for, and padding it out
    // invents a distinction that is not there.
    expect(describePool(a({ lot: 'L1', tone: '', calibre: '', grade: '' }))).toBe('lot L1');
    expect(describePool(a({}))).toBe('');
    expect(describePool(null)).toBe('');
  });
});

describe('the answer is derived in SQL and nothing sums pools in the client', () => {
  it('the service reads the derivation', () => {
    expect(service).toContain('available_homogeneous_for_product');
  });

  it('nothing adds pools together', () => {
    for (const [name, src] of [['service', service], ['notice', notice], ['panel', panel]] as const) {
      expect(src, `${name} sums pools`).not.toMatch(/reduce\([^)]*qty_on_hand|sum\(/i);
    }
  });

  it('a failed read is unknown, not homogeneous', () => {
    expect(notice).toMatch(/not a statement that this comes from one/);
    expect(panel).toMatch(/not a statement that everything is one lot/);
  });
});

describe('it is on the quote, which is where the promise is made', () => {
  it('the quote line carries the notice beside the free figure', () => {
    expect(quoteList).toContain('HomogeneousStockNotice');
    // The SUM is still shown — it is a true fact about the warehouse — but it is no longer the
    // only thing the operator sees.
    expect(quoteList).toMatch(/free\{short/);
  });

  it('stock with no lot recorded is reported as outside the cube', () => {
    expect(panel).toMatch(/outside the cube/);
  });
});
