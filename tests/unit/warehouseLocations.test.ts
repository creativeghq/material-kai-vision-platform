/**
 * Bins, directed putaway and the stocktake freeze (#428).
 *
 * `warehouses` was a flat list of buildings and `warehouse_items.location` a free-text column, so
 * there were no bins, no location barcodes, no putaway and no pick sequence. Two ideas carry the
 * rest: a suggestion with no stated rule is a dropdown with extra steps, and a count with no
 * freeze blames the counter for the sales made while they were counting.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  putawayDirects, putawayIsScannable, countNeedsFreezing, countHasDrifted,
  LOCATION_KIND_LABEL,
  type PutawaySuggestion, type CountDrift, type LocationKind,
} from '@/modules/stock/locationRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/locationService.ts');
const panel = read('src/modules/stock/components/LocationsPanel.tsx');
const counts = read('src/modules/stock/components/StockCountsSection.tsx');
const page = read('src/modules/stock/pages/StockPage.tsx');

const s = (over: Partial<PutawaySuggestion>): PutawaySuggestion =>
  ({ status: 'suggested', reason: '', ...over });

const d = (over: Partial<CountDrift>): CountDrift =>
  ({ status: 'clean', reason: '', ...over });

describe('a suggestion with no rule is not putaway', () => {
  it('only `suggested` directs anything', () => {
    expect(putawayDirects(s({ status: 'suggested', location_code: 'A-01' }))).toBe(true);
    // "No rule" and "the rule points at a bin that is gone" are both gaps, and neither is a
    // direction — the next receipt will land somewhere else and nobody will know why.
    expect(putawayDirects(s({ status: 'no_rule' }))).toBe(false);
    expect(putawayDirects(s({ status: 'rule_points_nowhere' }))).toBe(false);
    expect(putawayDirects(null)).toBe(false);
  });

  it('scan-verification needs a LOCATION barcode', () => {
    // Distinct from the item barcode on purpose: scanning a bin and scanning a product are
    // different questions, and a putaway confirmed by neither is a putaway on trust.
    expect(putawayIsScannable(s({ status: 'suggested', barcode: 'LOC-A0102' }))).toBe(true);
    expect(putawayIsScannable(s({ status: 'suggested', barcode: null }))).toBe(false);
    expect(putawayIsScannable(s({ status: 'no_rule', barcode: 'LOC-A0102' }))).toBe(false);
  });

  it('the panel says which locations cannot be scanned or walked', () => {
    expect(panel).toMatch(/cannot be scan-verified/);
    expect(panel).toMatch(/no walking path/);
  });
});

describe('a count is frozen before anybody counts', () => {
  it('not_frozen asks for the freeze; moved asks for reconciliation', () => {
    expect(countNeedsFreezing(d({ status: 'not_frozen' }))).toBe(true);
    expect(countNeedsFreezing(d({ status: 'clean' }))).toBe(false);
    expect(countHasDrifted(d({ status: 'moved', movements_since_freeze: 4 }))).toBe(true);
    expect(countHasDrifted(d({ status: 'clean' }))).toBe(false);
    expect(countNeedsFreezing(null)).toBe(false);
    expect(countHasDrifted(null)).toBe(false);
  });

  it('the freeze is offered on the count sheet, before the post', () => {
    expect(counts).toContain('countNeedsFreezing');
    expect(counts).toContain('locationService.freezeCount');
    expect(counts).toContain('drift.reason');
  });
});

describe('a van is a location, not a note', () => {
  it('every kind has a label and `van` is one of them', () => {
    const kinds: LocationKind[] = ['bin', 'bulk', 'pick_face', 'staging', 'quarantine', 'van'];
    for (const k of kinds) expect(LOCATION_KIND_LABEL[k]).toBeTruthy();
    expect(LOCATION_KIND_LABEL.van).toBe('Van');
  });

  it('the panel says why that matters', () => {
    // An installation that writes "3 bags of adhesive" as free text has broken the ledger in the
    // direction of OVERSTATING stock, silently.
    expect(panel).toMatch(/overstates the shelves/);
  });
});

describe('both answers are derived in SQL and reachable', () => {
  it('the service reads the derivations', () => {
    expect(service).toContain('suggest_putaway');
    expect(service).toContain('freeze_stock_count');
    expect(service).toContain('stock_count_drift');
  });

  it('nothing picks a bin in the client', () => {
    expect(panel).not.toMatch(/sort\([^)]*capacity|find\([^)]*capacity/);
  });

  it('it is reachable from the warehouse', () => {
    expect(page).toContain('LocationsPanel');
    expect(page).toContain("'locations'");
  });

  it('a failed read is unknown, not empty', () => {
    expect(panel).toMatch(/not a statement that there are none/);
  });
});
