/**
 * Five smaller vertical gaps (#442).
 *
 * Each is a fact a general ERP holds as an integer and a merchant needs as a record: the quantity
 * still owed under a container commitment, who a hold is for and when it lapses, what a cut cost
 * and what came back, whether a supplier has been measured at all, and a price file that cannot
 * carry a product change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  BLANKET_LABEL, HOLD_VERDICT_LABEL, PROCESSING_LABEL, STANDING_LABEL,
  releaseIsOverCommitment, blanketNeedsAttention, holdNeedsAttention, holdIsLapsed,
  jobYieldsOffcut, supplierIsUnscored, scorecardIsReadable, weightsAreComplete, priceRowIsClean,
  PRICE_UPDATE_FIELDS, EXPIRY_IS_MANDATORY, NOTHING_AUTO_RELEASES, OUTWORKER_IS_A_PLACE,
  PRICE_ONLY_DISCIPLINE, ETIM_NOTE,
  type BlanketLine, type BlanketPosition, type HoldRow, type HoldPosition,
  type Scorecard, type ScorecardRow, type BlanketStatus, type HoldVerdict,
  type ProcessingStatus, type SupplierStanding,
} from '@/modules/stock/verticalGapRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/verticalGapService.ts');
const panel = read('src/modules/stock/components/VerticalGapsPanel.tsx');
const stockPage = read('src/modules/stock/pages/StockPage.tsx');

const line = (over: Partial<BlanketLine>): BlanketLine => ({
  line_id: 'l', description: 'Porcelain 60x60', committed: 1000, unit: 'm2', unit_price: 9.5,
  released: 400, delivered: 0, remaining: 600, ceiling: 1050, over_released: false, ...over,
});

const hold = (over: Partial<HoldRow>): HoldRow => ({
  hold_id: 'h', held_for: 'Mrs Papadopoulou', quantity: 40, unit: 'm2',
  created_on: '2026-09-01', expires_on: '2026-09-20', days_left: 6,
  lot: 'L1', tone: 'T3', calibre: null, verdict: 'expiring', ...over,
});

describe('a forward contract knows what is still owed', () => {
  it('trade tolerates a little over, and the allowance is where "a little" stops', () => {
    expect(releaseIsOverCommitment(line({}))).toBe(false);
    expect(releaseIsOverCommitment(line({ released: 1100, over_released: true }))).toBe(true);
    const statuses: BlanketStatus[] =
      ['open', 'fully_drawn', 'over_released', 'expired_undrawn', 'cancelled', 'no_lines', 'not_found'];
    for (const s of statuses) expect(BLANKET_LABEL[s]).toBeTruthy();
  });

  it('a window that closed with quantity undrawn is a finding, not a quiet end', () => {
    const p = (over: Partial<BlanketPosition>): BlanketPosition => ({
      blanket_order_id: 'b', reference: 'FC-1', status: 'open', reason: '',
      allowance_percent: 5, committed_value: 9500, remaining_value: 5700, rows: [], ...over,
    });
    expect(blanketNeedsAttention(p({ status: 'expired_undrawn' }))).toBe(true);
    expect(blanketNeedsAttention(p({ status: 'over_released' }))).toBe(true);
    expect(blanketNeedsAttention(p({ status: 'open' }))).toBe(false);
    expect(blanketNeedsAttention(p({ status: 'fully_drawn' }))).toBe(false);
  });

  it('released quantity is derived from the lines that draw on it, never stored', () => {
    expect(service).toContain('blanket_order_position');
    expect(service).not.toMatch(/released_quantity|drawn_quantity/);
  });
});

describe('a hold is a record with an owner and a date', () => {
  it('expiring and lapsed are different states, and both need somebody', () => {
    expect(holdIsLapsed(hold({ verdict: 'lapsed' }))).toBe(true);
    expect(holdIsLapsed(hold({}))).toBe(false);
    const verdicts: HoldVerdict[] =
      ['active', 'expiring', 'lapsed', 'released', 'converted', 'expired'];
    for (const v of verdicts) expect(HOLD_VERDICT_LABEL[v]).toBeTruthy();
  });

  it('the position raises on both, and clean is clean', () => {
    const p = (over: Partial<HoldPosition>): HoldPosition =>
      ({ status: 'clean', reason: '', active: 0, expiring: 0, lapsed: 0, rows: [], ...over });
    expect(holdNeedsAttention(p({ status: 'lapsed' }))).toBe(true);
    expect(holdNeedsAttention(p({ status: 'expiring' }))).toBe(true);
    expect(holdNeedsAttention(p({ status: 'clean' }))).toBe(false);
    expect(holdNeedsAttention(p({ status: 'none' }))).toBe(false);
  });

  it('nothing releases a hold on its own', () => {
    // A lapsed hold is a conversation with a customer. Freeing it unattended sells goods somebody
    // is still expecting.
    expect(NOTHING_AUTO_RELEASES).toMatch(/still expecting/);
    expect(EXPIRY_IS_MANDATORY).toMatch(/Stone Profits|VISCO/);
    expect(panel).toContain('NOTHING_AUTO_RELEASES');
    expect(service).toMatch(/releaseHold[\s\S]{0,300}\.eq\('status', 'active'\)/);
  });
});

describe('an offcut is stock again, and an outworker is a place', () => {
  it('a job yields an offcut only when there is a pool AND a quantity', () => {
    expect(jobYieldsOffcut({ offcut_quantity: 12, offcut_pool_id: 'p' })).toBe(true);
    expect(jobYieldsOffcut({ offcut_quantity: 12, offcut_pool_id: null })).toBe(false);
    expect(jobYieldsOffcut({ offcut_quantity: 0, offcut_pool_id: 'p' })).toBe(false);
    expect(jobYieldsOffcut({ offcut_quantity: null, offcut_pool_id: 'p' })).toBe(false);
    const statuses: ProcessingStatus[] = ['planned', 'sent', 'in_progress', 'returned', 'cancelled'];
    for (const s of statuses) expect(PROCESSING_LABEL[s]).toBeTruthy();
  });

  it('conto lavoro esterno is named as the third place stock sits', () => {
    expect(OUTWORKER_IS_A_PLACE).toMatch(/conto lavoro/);
    expect(OUTWORKER_IS_A_PLACE).toMatch(/van/);
    expect(panel).toContain('OUTWORKER_IS_A_PLACE');
  });
});

describe('unscored is not a bad score', () => {
  it('a supplier nobody measured says so', () => {
    const r = (over: Partial<ScorecardRow>): ScorecardRow => ({
      supplier_company_id: 's', name: 'Tile Factory', lines: 0, datable_lines: 0,
      on_time_percent: null, received: 0, rejected: 0, quality_percent: null,
      standing: 'unscored', unmeasured_reason: 'nothing to score', ...over,
    });
    expect(supplierIsUnscored(r({}))).toBe(true);
    expect(supplierIsUnscored(r({ standing: 'poor' }))).toBe(false);
    const standings: SupplierStanding[] = ['good', 'watch', 'poor', 'unscored'];
    for (const s of standings) expect(STANDING_LABEL[s]).toBeTruthy();
  });

  it('weights that do not sum to 100 make the score unreadable, and it says so', () => {
    const s = (over: Partial<Scorecard>): Scorecard => ({
      from: '2025-09-14', to: '2026-09-14', weights_total: 100, status: 'ok',
      reason: '', rows: [], ...over,
    });
    expect(weightsAreComplete(s({}))).toBe(true);
    expect(weightsAreComplete(s({ weights_total: 60 }))).toBe(false);
    expect(scorecardIsReadable(s({}))).toBe(true);
    expect(scorecardIsReadable(s({ status: 'weights_incomplete' }))).toBe(false);
    expect(scorecardIsReadable(s({ status: 'nothing_to_score' }))).toBe(false);
  });
});

describe('a price update cannot carry a product change', () => {
  it('only the four price fields are admissible', () => {
    expect([...PRICE_UPDATE_FIELDS].sort()).toEqual(['cost', 'currency', 'supplier_sku', 'valid_until']);
    expect(priceRowIsClean({ supplier_sku: 'A', cost: 10 })).toBe(true);
    expect(priceRowIsClean({ supplier_sku: 'A', cost: 10, description: 'renamed' })).toBe(false);
    expect(priceRowIsClean({ supplier_sku: 'A', pack_size: 12 })).toBe(false);
  });

  it('the discipline is stated where somebody would otherwise widen it', () => {
    // BMEcat: "it is not possible to transmit any other changes". A file that can quietly rename
    // an article is how a catalogue drifts without anybody deciding to.
    expect(PRICE_ONLY_DISCIPLINE).toMatch(/may not carry a product change/);
    expect(service).toContain('apply_supplier_price_update');
    expect(panel).toContain('PRICE_ONLY_DISCIPLINE');
  });

  it('what was established by search is written down, because it changes what is worth building', () => {
    expect(ETIM_NOTE).toMatch(/Greece has no ETIM/);
    expect(ETIM_NOTE).toMatch(/Italy, Spain and Portugal/);
  });
});

describe('the panel is reachable and honest', () => {
  it('it sits on the stock resupply tab', () => {
    expect(stockPage).toContain('VerticalGapsPanel');
  });

  it('a failed read is unknown, not "nothing is committed"', () => {
    expect(panel).toMatch(/not a statement that nothing is committed or[\s\S]{0,20}held/);
  });
});
