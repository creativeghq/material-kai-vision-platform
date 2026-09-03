/**
 * The priced schedule — the generated line total, and the precedence rule that stops a job having
 * two contract sums.
 *
 * A BoQ introduces a SECOND possible source of contracted value beside accepted quotes. If both
 * counted, the contract sum would be double what it is and the margin would look extraordinary on
 * a job that is merely counted twice — a wrong number that is a perfectly valid number, which is
 * this platform's canonical failure shape.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { SCHEDULE_STATUSES, isScheduleLive } from '@/modules/projects/scheduleVocabulary';
import { UNITS } from '@/lib/units';

const ROOT = process.cwd();
const SERVICE = readFileSync(
  resolve(ROOT, 'src/modules/projects/services/schedulesService.ts'), 'utf8',
);
const CARD = readFileSync(
  resolve(ROOT, 'src/modules/projects/components/PricedScheduleCard.tsx'), 'utf8',
);

describe('schedule statuses', () => {
  it('mirrors project_schedules_status_check', () => {
    expect(SCHEDULE_STATUSES).toEqual(['draft', 'issued', 'accepted', 'superseded']);
  });

  /**
   * Only `accepted` makes a contract schedule the contract sum. A draft BoQ being priced is not
   * what the job is worth, and one that took over the CVR mid-typing would restate the contract
   * sum on every keystroke. `get_project_cvr` filters on exactly this.
   */
  it('goes live only when accepted', () => {
    expect(isScheduleLive('accepted')).toBe(true);
    for (const s of ['draft', 'issued', 'superseded'] as const) {
      expect(isScheduleLive(s)).toBe(false);
    }
  });
});

describe('the schedule service', () => {
  it('never sends the generated amount', () => {
    // `amount` is GENERATED. Postgres refuses a non-DEFAULT write to it, so sending the field
    // would be a runtime 428C9 on every insert.
    const code = stripComments(SERVICE);
    const addItem = code.slice(code.indexOf('async addItem('));
    const payload = addItem.slice(addItem.indexOf('.insert({'), addItem.indexOf('.select('));
    expect(payload).toContain('description');
    expect(payload).not.toMatch(/\bamount\b/);
  });

  it('never multiplies quantity by rate', () => {
    // That product is a money quantity with exactly one implementation, in the database.
    const code = stripComments(SERVICE);
    expect(code).not.toMatch(/quantity\s*\*\s*rate/);
    expect(code).not.toMatch(/rate\s*\*\s*quantity/);
  });

  it('explains the two errors an operator can actually cause', () => {
    // A raw 23505 or 428C9 tells somebody nothing about what to do next.
    expect(SERVICE).toContain("'23505'");
    expect(SERVICE).toContain("'428C9'");
    expect(SERVICE).toMatch(/already has a contract schedule/i);
  });
});

describe('the schedule card', () => {
  it('displays the database amount and never recomputes it', () => {
    const code = stripComments(CARD);
    expect(code).not.toMatch(/quantity\s*\*\s*rate/);
    expect(code).not.toMatch(/rate\s*\*\s*quantity/);
    // The total is the sum of what came back, which is a different thing from rebuilding a line.
    expect(code).toContain('n(i.amount)');
  });

  it('offers the canonical units, not a second list', () => {
    // Six independent unit lists once existed and agreed on nothing — one said sqm, another m2,
    // a third m². `src/lib/units.ts` is the one tied to AADE codes.
    expect(CARD).toContain("from '@/lib/units'");
    expect(CARD).toContain('UNITS.map');
    expect(UNITS.some((u) => u.key === 'm2')).toBe(true);
    // No hand-written unit strings offered as options beside it.
    expect(CARD).not.toMatch(/value="(m2|sqm|m²|lm)"/);
  });

  it('says which schedule is the contract sum and what that means', () => {
    // "Which number is this job worth" having two possible sources is exactly what the precedence
    // rule removes, so the screen states it rather than leaving it implicit.
    expect(CARD).toContain('is_contract');
    expect(CARD).toMatch(/accepted quotes are ignored/i);
  });

  it('flags provisional sums separately in the total', () => {
    // A provisional sum is in the contract but spending it is not the same as earning it.
    expect(CARD).toContain('is_provisional');
    expect(CARD).toContain('provisional');
  });

  it('shows when a line carries no cost code', () => {
    // An uncoded schedule line lands in the CVR's uncoded bucket, which is the row that says the
    // report is incomplete.
    expect(CARD).toContain('i.cost_code_id');
  });
});
