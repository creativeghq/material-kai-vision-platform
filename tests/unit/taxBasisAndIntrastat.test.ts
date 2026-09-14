/**
 * The second depreciation basis, and whether INTRASTAT is owed at all (#451).
 *
 * Both are the same shape: the platform modelled the BOOK view of a number and Greek practice needs
 * the TAX view beside it. In each case the failure is a figure that looks settled — a book value
 * with no tax twin, an empty declaration nobody was obliged to file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  TAX_STATUS_LABEL, TAX_RATE_STATUS_LABEL, taxBasisIsUnknown, rateIsConfirmed,
  rateNeedsAttention, differenceIsReportable, ADJUSTMENT_DOCUMENT, LEGAL_BASIS,
  type TaxDepreciationStatus, type TaxRateRow, type BasisDifference,
} from '@/modules/finance/taxDepreciationRules';
import {
  INTRASTAT_STATUS_LABEL, FLOW_LABEL, obligationIsUnknown, intrastatNeedsAttention, isObliged,
  SUGGESTED_THRESHOLD, THRESHOLD_SOURCE_NOTE, RELATED_OBLIGATIONS,
  type IntrastatFlowVerdict, type IntrastatStatus,
} from '@/modules/finance/intrastatRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const taxService = read('src/modules/finance/services/taxDepreciationService.ts');
const intrService = read('src/modules/finance/services/intrastatObligationService.ts');
const taxCard = read('src/components/business/assets/TaxDepreciationCard.tsx');
const intrCard = read('src/modules/finance/components/IntrastatObligationCard.tsx');
const assetsPanel = read('src/components/business/assets/CompanyAssetsPanel.tsx');
const reports = read('src/modules/finance/tabs/ReportsTab.tsx');

const rate = (over: Partial<TaxRateRow>): TaxRateRow => ({
  code: 'machinery', label_el: 'Μηχανήματα', label_en: 'Machinery', sort_order: 50, notes: null,
  rate_percent: 10, effective_from: '2024-01-01', effective_to: null,
  confirmed_on: '2026-09-13', source_note: null, status: 'in_force', asset_count: 3, ...over,
});

const verdict = (over: Partial<IntrastatFlowVerdict>): IntrastatFlowVerdict => ({
  flow: 'dispatch', year: 2026, total: 10000, threshold: 90000, percent_of_threshold: 11.1,
  obliged_from: null, status: 'not_obliged', reason: '', ...over,
});

describe('a missing tax basis is a missing number, not a zero', () => {
  it('every status except ok is unknown', () => {
    // A book value with no tax twin looks complete on screen, and the E3 figure does not exist.
    const statuses: TaxDepreciationStatus[] =
      ['no_tax_category', 'no_cost', 'no_service_date', 'not_started', 'rate_not_configured'];
    for (const s of statuses) expect(taxBasisIsUnknown(s)).toBe(true);
    expect(taxBasisIsUnknown('ok')).toBe(false);
    for (const s of statuses) expect(TAX_STATUS_LABEL[s]).toBeTruthy();
  });

  it('the SQL refuses to accumulate over months it has no rate for', () => {
    expect(taxService).toContain('get_asset_tax_depreciation');
    expect(taxService).not.toMatch(/rate_percent\s*\/\s*100|months\s*\*\s*/);
  });

  it('the card names the assets it left out of the totals', () => {
    expect(taxCard).toMatch(/taxBasisIsUnknown\(a\.tax_status\)/);
    expect(taxCard).toMatch(/unknown_assets/);
  });
});

describe('a rate nobody confirmed is a number somebody typed', () => {
  it('a rate needs BOTH a value and a confirmation', () => {
    expect(rateIsConfirmed(rate({}))).toBe(true);
    expect(rateIsConfirmed(rate({ confirmed_on: null }))).toBe(false);
    expect(rateIsConfirmed(rate({ rate_percent: null }))).toBe(false);
  });

  it('and it only raises attention where assets actually depend on it', () => {
    expect(rateNeedsAttention(rate({ confirmed_on: null }))).toBe(true);
    expect(rateNeedsAttention(rate({ confirmed_on: null, asset_count: 0 }))).toBe(false);
    expect(rateNeedsAttention(rate({}))).toBe(false);
    for (const s of ['in_force', 'unconfirmed', 'not_configured'] as const) {
      expect(TAX_RATE_STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it('a revision closes the previous row instead of editing it', () => {
    // Editing one rewrites every year that was already filed on the old rate.
    expect(taxService).toMatch(/\.update\(\{ effective_to[\s\S]{0,600}\.insert\(/);
    expect(taxService).toMatch(/is\('effective_to', null\)/);
  });
});

describe('the difference between the bases is an adjustment, not an error', () => {
  it('it is only reportable once something is actually comparable', () => {
    const d = (over: Partial<BasisDifference>): BasisDifference =>
      ({ as_of: '2026-09-13', status: 'ok', reason: '', comparable_assets: 2, assets: [], ...over });
    expect(differenceIsReportable(d({}))).toBe(true);
    expect(differenceIsReportable(d({ comparable_assets: 0 }))).toBe(false);
    expect(differenceIsReportable(d({ status: 'nothing_comparable' }))).toBe(false);
    expect(differenceIsReportable(null)).toBe(false);
  });

  it('it belongs to the income-tax return, never to a VAT period', () => {
    expect(ADJUSTMENT_DOCUMENT).toMatch(/income-tax return/);
    expect(ADJUSTMENT_DOCUMENT).not.toMatch(/VAT/i);
    expect(LEGAL_BASIS).toMatch(/4172/);
  });

  it('the panel reaches it from the asset register', () => {
    expect(assetsPanel).toContain('TaxDepreciationCard');
    expect(assetsPanel).toContain('tax_placed_in_service_on');
  });

  it('a failed read is unknown, not agreement', () => {
    expect(taxCard).toMatch(/not a statement that the two bases[\s\S]{0,20}agree/);
  });
});

describe('an empty INTRASTAT return is ambiguous until the obligation is answered', () => {
  it('threshold_unknown is a verdict, not an absence', () => {
    expect(obligationIsUnknown(verdict({ status: 'threshold_unknown' }))).toBe(true);
    expect(obligationIsUnknown(verdict({ status: 'not_obliged' }))).toBe(false);
    expect(obligationIsUnknown(null)).toBe(false);
    const statuses: IntrastatStatus[] =
      ['not_obliged', 'approaching', 'obliged_from', 'threshold_unknown'];
    for (const s of statuses) expect(INTRASTAT_STATUS_LABEL[s]).toBeTruthy();
    for (const f of ['arrival', 'dispatch'] as const) expect(FLOW_LABEL[f]).toBeTruthy();
  });

  it('the warning comes BEFORE the crossing, because the obligation starts that month', () => {
    expect(intrastatNeedsAttention(verdict({ status: 'approaching' }))).toBe(true);
    expect(intrastatNeedsAttention(verdict({ status: 'threshold_unknown' }))).toBe(true);
    expect(intrastatNeedsAttention(verdict({ status: 'obliged_from' }))).toBe(true);
    expect(intrastatNeedsAttention(verdict({ status: 'not_obliged' }))).toBe(false);
    expect(isObliged(verdict({ status: 'obliged_from' }))).toBe(true);
    expect(isObliged(verdict({ status: 'approaching' }))).toBe(false);
  });

  it('the thresholds are offered as a prefill and never written by a migration', () => {
    expect(SUGGESTED_THRESHOLD.arrival).toBeGreaterThan(SUGGESTED_THRESHOLD.dispatch);
    expect(THRESHOLD_SOURCE_NOTE).toMatch(/confirm/i);
    expect(intrCard).toContain('THRESHOLD_SOURCE_NOTE');
  });

  it('the related returns are named rather than conflated with this one', () => {
    expect(RELATED_OBLIGATIONS.join(' ')).toMatch(/VIES/);
    expect(RELATED_OBLIGATIONS.join(' ')).toMatch(/Φ5/);
  });

  it('the verdict and the lines read ONE scope', () => {
    expect(intrService).toContain('intrastat_obligation');
    expect(intrService).not.toMatch(/from\('invoice_items'\)|from\('order_items'\)/);
  });

  it('it sits above the declaration lines', () => {
    expect(reports).toContain('IntrastatObligationCard');
  });

  it('a failed read is unknown, not nothing owed', () => {
    expect(intrCard).toMatch(/not a statement that nothing is[\s\S]{0,20}owed/);
  });
});
