/**
 * Approving a queued supplier line answers two questions, not one (#406).
 *
 * 96% of the queue is older than thirty days — nearly two years of purchase invoices whose goods
 * are long since sold, installed or consumed. Posting their quantities invents inventory, and a
 * wrong `qty_on_hand` is a valid number that nothing downstream can detect.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  STOCK_MODE_LABEL, ADDITION_MODE_LABEL, ARCHIVE_AFTER_DAYS, autoStockMode, stockOverrideFor,
  bulkConfirmText, additionCanBeUndone, matchVerdictIsStale, UNDO_KEEPS_THE_PRODUCT,
  type StockMode, type IntakeAddition,
} from '@/modules/stock/intakeApprovalRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const card = read('src/modules/finance/components/PendingProductsCard.tsx');
const panel = read('src/modules/stock/components/IntakeAdditionsPanel.tsx');
const warehouse = read('src/modules/finance/components/WarehousePanel.tsx');
const service = read('src/services/warehouseService.ts');

const addition = (over: Partial<IntakeAddition>): IntakeAddition => ({
  pending_item_id: 'l', approved_at: '2026-09-13', name: 'Tile', quantity: 10, unit: 'm2',
  unit_cost: 12, added_to_stock: false, product_id: 'p', product_name: 'Tile',
  warehouse_item_id: 'w', qty_on_hand: 0, movement_id: null, movement_qty: null,
  document_issue_date: '2024-11-29', mode: 'catalog_only', ...over,
});

describe('an old invoice is an archive, not a delivery', () => {
  it('a document older than the window catalogues without posting stock', () => {
    expect(autoStockMode('2024-11-29', '2026-09-13')).toBe('catalog_only');
    expect(autoStockMode('2026-09-01', '2026-09-13')).toBe('catalog_and_stock');
    expect(ARCHIVE_AFTER_DAYS).toBe(30);
  });

  it('the boundary is inclusive on the receiving side', () => {
    expect(autoStockMode('2026-08-14', '2026-09-13')).toBe('catalog_and_stock');
    expect(autoStockMode('2026-08-13', '2026-09-13')).toBe('catalog_only');
  });

  it('a line with no document falls to receiving, and the operator can still say otherwise', () => {
    // Absent a date there is nothing to judge age by, and refusing to post a real delivery is the
    // worse failure of the two — the operator overrides it explicitly.
    expect(autoStockMode(null, '2026-09-13')).toBe('catalog_and_stock');
  });

  it('undecided sends nothing and lets each line decide from its own date', () => {
    expect(stockOverrideFor('auto')).toBeUndefined();
    expect(stockOverrideFor('catalog_only')).toBe(false);
    expect(stockOverrideFor('catalog_and_stock')).toBe(true);
    const modes: StockMode[] = ['auto', 'catalog_only', 'catalog_and_stock'];
    for (const m of modes) expect(STOCK_MODE_LABEL[m]).toBeTruthy();
    for (const m of ['catalog_only', 'catalog_and_stock'] as const) {
      expect(ADDITION_MODE_LABEL[m]).toBeTruthy();
    }
  });
});

describe('the confirmation names the mode', () => {
  it('three modes, three different sentences', () => {
    // "Add all 431 queued lines" reads identically whether or not it is about to invent a year of
    // inventory. That is the failure this text exists to prevent.
    const a = bulkConfirmText(431, 'Main', 'catalog_only');
    const b = bulkConfirmText(431, 'Main', 'catalog_and_stock');
    const c = bulkConfirmText(431, 'Main', 'auto');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).toMatch(/NO stock movement/);
    expect(b).toMatch(/EVERY line/);
    expect(c).toMatch(/own document date/);
  });

  it('the card uses it for both bulk paths', () => {
    expect(card).toContain('bulkConfirmText');
    expect(card).toContain('stockOverrideFor');
    expect(card).not.toMatch(/Add all \$\{g\.line_count\} queued line/);
  });
});

describe('an approval can be taken back, and the product survives it', () => {
  it('undo reverses the stock and keeps the product', () => {
    expect(UNDO_KEEPS_THE_PRODUCT).toMatch(/compensating movement/);
    expect(UNDO_KEEPS_THE_PRODUCT).toMatch(/product\s+stays/);
    expect(additionCanBeUndone(addition({}))).toBe(true);
  });

  it('the trail from line to product to movement is rendered', () => {
    expect(panel).toContain('movement_qty');
    expect(panel).toContain('qty_on_hand');
    expect(panel).toContain('undoIntakeApproval');
    expect(warehouse).toContain('IntakeAdditionsPanel');
  });

  it('the reads go through the derivations, not a client-side join', () => {
    expect(service).toContain('intake_recent_additions');
    expect(service).toContain('undo_intake_approval');
  });

  it('a failed read is unknown, not "nothing was added"', () => {
    expect(panel).toMatch(/not a statement that nothing was added/);
  });
});

describe('a match verdict ages', () => {
  it('an unstamped verdict has never been re-checked', () => {
    // After a catalogue import the row can still read "will create a new product" while approval
    // is about to link to an ingested one.
    expect(matchVerdictIsStale(null)).toBe(true);
    expect(matchVerdictIsStale(undefined)).toBe(true);
  });

  it('a week-old verdict is stale and a fresh one is not', () => {
    const now = new Date('2026-09-13T12:00:00Z');
    expect(matchVerdictIsStale('2026-09-01T12:00:00Z', now)).toBe(true);
    expect(matchVerdictIsStale('2026-09-12T12:00:00Z', now)).toBe(false);
  });

  it('the scored-at stamp is carried on the row', () => {
    expect(service).toContain('match_scored_at');
  });
});
