/**
 * Variations and the CVR — the money rules that are silent when broken.
 *
 * A wrong number here is a valid number. Nothing typechecks it, no integrity probe can see it, and
 * the operator finds out at the end of the job. So the guards are about the three decisions that
 * decide whether the reconciliation is true: which variations count, which side each one falls on,
 * and whether any figure is derived twice.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  VARIATION_DIRECTIONS, VARIATION_STATUSES, VARIATION_ORIGINS,
  VARIATION_COUNTS_AS_MONEY, VARIATION_CLOSED_STATUSES,
  DIRECTION_SIDE, DIRECTION_PREFIX, isVariationMoney,
} from '@/modules/projects/variationVocabulary';

const ROOT = process.cwd();
const SERVICE = readFileSync(
  resolve(ROOT, 'src/modules/projects/services/variationsService.ts'), 'utf8',
);
const CVR = readFileSync(resolve(ROOT, 'src/modules/projects/components/CvrCard.tsx'), 'utf8');
const REGISTER = readFileSync(
  resolve(ROOT, 'src/modules/projects/components/VariationsCard.tsx'), 'utf8',
);

describe('variation vocabulary', () => {
  it('mirrors the three CHECK constraints exactly', () => {
    expect(VARIATION_DIRECTIONS).toEqual(['client', 'supplier']);
    expect(VARIATION_STATUSES).toEqual(['draft', 'submitted', 'approved', 'rejected', 'withdrawn']);
    expect(VARIATION_ORIGINS).toEqual([
      'client_instruction', 'design_change', 'site_condition',
      'error_or_omission', 'statutory', 'other',
    ]);
  });

  /**
   * The single most expensive thing to get wrong. Counting a draft or submitted variation tells an
   * operator they are in profit on work the client has not agreed to pay for, and
   * `get_project_cvr` filters on exactly `status = 'approved'`.
   */
  it('counts ONLY approved variations as money', () => {
    expect(VARIATION_COUNTS_AS_MONEY).toEqual(['approved']);
    expect(isVariationMoney('approved')).toBe(true);
    for (const s of ['draft', 'submitted', 'rejected', 'withdrawn'] as const) {
      expect(isVariationMoney(s)).toBe(false);
    }
  });

  it('does not confuse "closed" with "counts as money"', () => {
    // A rejected variation is finished with and worth nothing. Conflating the two lists is how a
    // rejected claim ends up in the forecast.
    expect(VARIATION_CLOSED_STATUSES).toContain('rejected');
    expect(VARIATION_COUNTS_AS_MONEY).not.toContain('rejected');
  });

  it('puts each direction on its own side of the trade', () => {
    // Anti-regression rule 1: a client variation is money IN, a supplier variation money OUT.
    // Netting them is the defect that reported a fully-paid order as owing money.
    expect(DIRECTION_SIDE.client).toBe('value');
    expect(DIRECTION_SIDE.supplier).toBe('cost');
    expect(DIRECTION_SIDE.client).not.toBe(DIRECTION_SIDE.supplier);
  });

  it('gives each direction its own reference sequence', () => {
    // VO-004 and SVO-004 are different documents to different counterparties. One shared counter
    // would make the client's register skip numbers, which is the first thing a QS notices.
    expect(DIRECTION_PREFIX.client).toBe('VO');
    expect(DIRECTION_PREFIX.supplier).toBe('SVO');
    expect(new Set(Object.values(DIRECTION_PREFIX)).size).toBe(VARIATION_DIRECTIONS.length);
  });
});

describe('the variations service', () => {
  it('never sends a reference — the database numbers it in the same INSERT', () => {
    const create = SERVICE.slice(SERVICE.indexOf('async create('));
    const payload = create.slice(create.indexOf('.insert({'), create.indexOf('.select('));
    expect(payload).toContain('direction: input.direction');
    expect(payload).not.toMatch(/^\s*reference:/m);
  });

  it('sends the value as typed, including a negative', () => {
    // An omission is a negative number everywhere it is read, or it becomes a second thing to get
    // right at every site that reads it.
    expect(SERVICE).not.toMatch(/Math\.abs\(/);
    expect(SERVICE).toContain('value: input.value');
  });

  it('does no arithmetic of its own', () => {
    // Every figure the register's totals show comes from get_project_cvr. A service that summed
    // variations itself would be a second derivation of the job's value.
    expect(SERVICE).not.toMatch(/reduce\(/);
    expect(SERVICE).toContain("supabase.rpc('get_project_cvr'");
  });
});

describe('the CVR card', () => {
  it('formats the SQL figures and never rebuilds a row', () => {
    expect(CVR).not.toMatch(/contracted_value\s*\)?\s*\+\s*.*variation_value/);
    expect(CVR).not.toMatch(/actual_cost\s*\)?\s*\+\s*.*committed_cost/);
    // The footer sums the SQL's own per-row totals, which is a different thing from rebuilding one.
    expect(CVR).toContain('n(r.total_value)');
    expect(CVR).toContain('n(r.total_cost)');
  });

  it('does not recompute the margin percentage', () => {
    // A null margin_pct means "no value to take a percentage of", which is a different fact from
    // 0% — and 0% reads as break-even to somebody deciding whether to carry on.
    expect(CVR).toContain('r.margin_pct !== null');
    expect(CVR).not.toMatch(/margin\s*\/\s*.*total_value/);
  });

  it('shows the uncoded bucket rather than hiding it', () => {
    expect(CVR).toContain("r.cost_code_id === null");
    expect(CVR).toContain('Not coded');
  });
});

describe('the variation register', () => {
  it('states the two directions separately and never as one total', () => {
    expect(REGISTER).toContain('clientApproved');
    expect(REGISTER).toContain('supplierApproved');
    // A single combined figure would be the netting defect wearing a label.
    expect(REGISTER).not.toMatch(/clientApproved\s*[+-]\s*.*supplierApproved/);
  });

  it('counts only what the CVR counts', () => {
    // If the register's totals admitted more statuses than the CVR does, the screen and the
    // report would disagree about the job's value.
    expect(REGISTER).toContain('isVariationMoney(v.status)');
  });

  it('says how many are still undecided', () => {
    // An operator reading "approved to client 12,000" needs to know four more are pending, or the
    // figure reads as the final account.
    expect(REGISTER).toContain('not yet decided');
  });
});
