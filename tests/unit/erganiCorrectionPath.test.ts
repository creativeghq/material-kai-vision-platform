/**
 * A wrongly-filed Ergani record has a way out, and retention terms can be set (#409, #408).
 *
 * Both were the same shape: the server capability existed, was guarded, and nothing on screen
 * could reach it. For Ergani that made a mis-filing PERMANENT — the draft|submitted|failed CHECK
 * has no exit from `submitted` without the cancel — and for retention it made every valuation
 * deduct €0 while the card told the operator to set a date no control could set.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const hrService = read('src/modules/hr/services/hrService.ts');
const ergani = read('src/modules/hr/components/ErganiSection.tsx');
const overtime = read('src/modules/hr/components/OvertimeSection.tsx');
const separations = read('src/modules/hr/components/SeparationsSection.tsx');
const applications = read('src/modules/projects/components/ApplicationsCard.tsx');

describe('#409 — a filing can be withdrawn and the record re-filed', () => {
  it('the cancel is reachable from the submissions log', () => {
    expect(hrService, 'no client method reaches the ergani-cancel action')
      .toMatch(/erganiCancel\(/);
    expect(hrService).toMatch(/'ergani-cancel'/);
    expect(ergani, 'the submissions log has no cancel control').toMatch(/erganiCancel\(/);
  });

  it('it is offered only on a submitted filing that has a protocol', () => {
    // The edge action refuses anything else; offering it regardless would be a button whose only
    // outcome is an error.
    expect(ergani).toMatch(/s\.status === 'submitted' && s\.protocol/);
  });

  it('"cancelled at Ergani" does not read as "never filed"', () => {
    // A withdrawal is itself a filing that happened at the ministry.
    expect(ergani).toMatch(/Cancelled at Ergani/);
  });

  it('a partial cancellation is NAMED, never swallowed', () => {
    // The ministry accepted it and our row did not move: cancelling again would withdraw a
    // document that is already gone.
    expect(ergani).toMatch(/local_write_failed/);
  });

  it('an unfiled overtime entry and separation can be corrected', () => {
    expect(overtime, 'no edit control on overtime').toMatch(/EditOvertimeDialog/);
    expect(separations, 'no edit control on separations').toMatch(/EditSeparationDialog/);
    // Only while unfiled: editing underneath a filing would make our record disagree with the
    // document the ministry holds.
    const guarded = (src: string, v: string) => {
      const at = src.indexOf('setEditing(' + v + ')');
      return at > -1 && src.slice(Math.max(0, at - 220), at).includes(v + ".status !== 'submitted'");
    };
    expect(guarded(overtime, 'o'), 'overtime edit is offered on a filed entry').toBe(true);
    expect(guarded(separations, 's'), 'separation edit is offered on a filed record').toBe(true);
  });
});

describe('#408 — retention terms can actually be set', () => {
  it('the card can reach setRetentionTerms', () => {
    expect(applications, 'no retention-terms control').toMatch(/RetentionTermsDialog/);
    const dialog = read('src/modules/projects/components/RetentionTermsDialog.tsx');
    expect(dialog).toMatch(/setRetentionTerms\(/);
    // Practical completion is what opens the release schedule; without it `createStandardTranches`
    // throws on every project.
    expect(dialog).toMatch(/practical_completion_on/);
  });
});
