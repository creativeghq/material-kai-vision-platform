/**
 * Selections against a frozen allowance (#431).
 *
 * "The customer picks from the range we stock, against a per-room budget, and the difference
 * becomes money." Two things decide whether that works: the allowance cannot move after the
 * estimate, and an overage becomes a change order rather than absorbed work.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  SELECTION_STATUS_LABEL, POSITION_LABEL, allowanceIsFrozen, isOverage, isUnderage,
  overageNeedsBilling, positionNeedsAttention, totalIsAFloor,
  FROZEN_IS_THE_POINT, UNDERAGE_IS_NOT_A_CHANGE_ORDER, FULFILMENT_LABEL, FULFILMENT_TONE,
  type AllowanceRow, type SelectionFulfilment, type SelectionPosition, type SelectionStatus, type SelectionPositionStatus,
} from '@/modules/projects/selectionRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/projects/services/selectionsService.ts');
const panel = read('src/modules/projects/components/tabs/SelectionsTab.tsx');
const projects = read('src/modules/projects/services/projectsService.ts');
const cvr = read('src/modules/projects/components/CostCodesCard.tsx');
const variations = read('src/modules/projects/services/variationsService.ts');

const row = (over: Partial<AllowanceRow>): AllowanceRow => ({
  allowance_id: 'a', label: 'Bathroom tiles', room_id: 'r', room_name: 'Bathroom',
  category_key: null, amount: 2000, currency: 'EUR', frozen_at: '2026-09-01',
  selected: 2700, variance: 700, selections: 1, unpriced: 0, client_approved: 0,
  billed_as_variation: 0, ...over,
});

const position = (over: Partial<SelectionPosition>): SelectionPosition => ({
  project_id: 'p', status: 'ok', reason: '', allowance_total: 2000, selected_total: 2700,
  overage_total: 700, underage_total: 0, rows: [], ...over,
});

describe('an allowance you can edit is not a budget', () => {
  it('frozen is the state that makes a variance mean anything', () => {
    expect(allowanceIsFrozen(row({}))).toBe(true);
    expect(allowanceIsFrozen(row({ frozen_at: null }))).toBe(false);
    expect(FROZEN_IS_THE_POINT).toMatch(/cannot move/);
  });

  it('an unfrozen allowance is a finding of its own', () => {
    expect(positionNeedsAttention(position({ status: 'unfrozen' }))).toBe(true);
    expect(positionNeedsAttention(position({ status: 'ok' }))).toBe(false);
    const statuses: SelectionPositionStatus[] =
      ['ok', 'overage_unbilled', 'unpriced_selections', 'unfrozen', 'no_allowances', 'no_project'];
    for (const s of statuses) expect(POSITION_LABEL[s]).toBeTruthy();
    for (const s of ['proposed', 'client_approved', 'declined'] as SelectionStatus[]) {
      expect(SELECTION_STATUS_LABEL[s]).toBeTruthy();
    }
  });

  it('freezing is one-way and the server holds it, not the screen', () => {
    expect(service).toMatch(/\.is\('frozen_at', null\)/);
    expect(panel).not.toMatch(/frozen_at:\s*null/);
  });
});

describe('an overage is billed and an underage is not', () => {
  it('the two directions are different consequences of one subtraction', () => {
    expect(isOverage(row({ variance: 700 }))).toBe(true);
    expect(isOverage(row({ variance: -350 }))).toBe(false);
    expect(isUnderage(row({ variance: -350 }))).toBe(true);
    expect(isUnderage(row({ variance: 0 }))).toBe(false);
  });

  it('only an unbilled overage needs a change order', () => {
    expect(overageNeedsBilling(row({}))).toBe(true);
    expect(overageNeedsBilling(row({ billed_as_variation: 1 }))).toBe(false);
    expect(overageNeedsBilling(row({ variance: -350 }))).toBe(false);
    expect(UNDERAGE_IS_NOT_A_CHANGE_ORDER).toMatch(/customer/);
  });

  it('the change order goes through ONE writer, and a second press replays', () => {
    expect(service).toContain('raise_variation_for_selection');
    expect(service).not.toMatch(/from\('project_variations'\)[\s\S]{0,120}\.insert/);
  });

  it('the variance is derived in SQL, not totalled in the panel', () => {
    expect(service).toContain('project_selection_position');
    expect(panel).not.toMatch(/selected\s*-\s*amount|amount\s*-\s*selected/);
  });
});

describe('an unpriced selection makes the total a floor', () => {
  it('and the panel says so rather than showing it as the figure', () => {
    expect(totalIsAFloor(position({ rows: [row({ unpriced: 2 })] }))).toBe(true);
    expect(totalIsAFloor(position({ rows: [row({})] }))).toBe(false);
    expect(panel).toMatch(/totals are a floor/);
  });
});


describe('what the client picked is recorded once', () => {
  it('there is no second product list on a project', () => {
    expect(existsSync(join(ROOT, 'src/modules/projects/components/tabs/ProductsTab.tsx'))).toBe(false);
    expect(existsSync(join(ROOT, 'src/modules/projects/components/SelectionsPanel.tsx'))).toBe(false);
    expect(projects).not.toContain('project_products');
  });

  it('order progress is derived from the order line, never typed', () => {
    expect(Object.keys(SELECTION_STATUS_LABEL)).not.toContain('ordered');
    expect(service).toContain('project_selection_lines');
    expect(service).not.toMatch(/fulfilment\s*:/);
    expect(panel).not.toMatch(/FULFILMENT_LABEL\)\.map|Object\.keys\(FULFILMENT_LABEL/);
    const all: SelectionFulfilment[] = ['not_ordered', 'specified', 'approved', 'ordered', 'acknowledged',
      'shipped', 'received', 'delivered', 'installed', 'damaged', 'cancelled'];
    for (const f of all) { expect(FULFILMENT_LABEL[f]).toBeTruthy(); expect(FULFILMENT_TONE[f]).toBeTruthy(); }
  });

  it('budget figures sit behind the finance gate', () => {
    expect(panel).toMatch(/canFinance \? selectionsService\.position/);
    expect(panel).toMatch(/\{canFinance && position && \(/);
  });

  it('an empty board offers the add action', () => {
    expect(panel).toMatch(/<HubEmptyState[\s\S]{0,400}action=\{addButton\}/);
  });

  it('a failed read is unknown, not "within budget"', () => {
    expect(panel).toMatch(/not a statement that every pick is[\s\S]{0,30}inside its budget/);
  });
});

describe('pending is not committed', () => {
  it('an unapproved purchase order is shown apart from cost', () => {
    expect(variations).toContain('pending_cost');
    expect(cvr).toContain('pending_cost');
  });
});
