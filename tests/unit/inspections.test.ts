/**
 * Inspections — a checklist you walk the site with, and the record that a stage was checked
 * before it was covered up.
 *
 * Four rules, and every one of them fails silently:
 *
 *  1. **The verdict is derived, never stored.** A stored "passed" goes stale the moment an item is
 *     re-answered, and a perfectly valid string then disagrees with the list underneath it.
 *  2. **An unanswered item is not a pass.** `null` is a fourth state, and coalescing it is how a
 *     walk nobody finished reads as a walk that found nothing.
 *  3. **An empty checklist is not a pass either.** A header with no items is a stage nobody
 *     checked wearing the badge of one that was — so `empty` is its own outcome, and creating one
 *     is refused rather than defaulted.
 *  4. **A failure becomes a snag exactly once.** Create-then-stamp is one call, the stamp is the
 *     claim, and a second press replays the stored id instead of raising a second defect.
 *
 * The template half carries its own rule: a template holds the QUESTIONS, never the ANSWERS. A
 * checklist that arrives pre-ticked is a record claiming a stage was inspected when nobody walked
 * it — and unlike a wrong figure, it is the kind of claim somebody builds over.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  INSPECTION_STATUSES, INSPECTION_RESULTS, INSPECTION_OUTCOMES, INSPECTION_OUTCOME_LABELS,
  isInspectionResult, isInspectionOutcome,
} from '@/modules/projects/inspectionVocabulary';
import { TEMPLATE_SCHEMAS, LIVE_TEMPLATE_TYPES } from '@/services/templates/schema';
import { FORBIDDEN_CAPTURE_FIELDS } from '@/services/templates/types';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const SERVICE = stripComments(read('src/modules/projects/services/inspectionsService.ts'));
const PANEL = stripComments(read('src/modules/projects/components/InspectionsPanel.tsx'));
const ADAPTERS = stripComments(read('src/services/templates/adapters.ts'));

describe('the vocabulary matches the CHECK constraints', () => {
  it('status is what a PERSON did, and never the verdict', () => {
    expect(INSPECTION_STATUSES).toEqual(['draft', 'in_progress', 'signed_off']);
    // "passed"/"failed" are arithmetic over the items. A status value for either would be a second
    // place the same question is answered, and the two would drift the first time an item moved.
    expect(INSPECTION_STATUSES as readonly string[]).not.toContain('passed');
    expect(INSPECTION_STATUSES as readonly string[]).not.toContain('failed');
  });

  it('an item answer is one of exactly three, with null as the fourth state', () => {
    expect(INSPECTION_RESULTS).toEqual(['pass', 'fail', 'na']);
    expect(isInspectionResult('pass')).toBe(true);
    expect(isInspectionResult('unanswered')).toBe(false);
    expect(isInspectionResult(null)).toBe(false);
  });

  it('every derived outcome has a label, including the two that are not verdicts', () => {
    expect(INSPECTION_OUTCOMES).toEqual(['empty', 'not_started', 'in_progress', 'failed', 'passed']);
    for (const o of INSPECTION_OUTCOMES) {
      expect(INSPECTION_OUTCOME_LABELS[o], `no label for ${o}`).toBeTruthy();
    }
    // `empty` must never read as a pass anywhere a person can see it.
    expect(INSPECTION_OUTCOME_LABELS.empty.toLowerCase()).not.toContain('pass');
    expect(isInspectionOutcome('passed')).toBe(true);
    expect(isInspectionOutcome('complete')).toBe(false);
  });
});

describe('the verdict is derived in SQL', () => {
  it('the list comes from the derivation, not from a table read', () => {
    expect(SERVICE).toContain("rpc('get_project_inspections'");
    // A `.from('project_inspections').select(...)` list would return the header WITHOUT the counts,
    // and the panel would have to work the verdict out itself — a second opinion by construction.
    expect(SERVICE).not.toMatch(/from\('project_inspections'\)\s*\.\s*select/);
  });

  it('nothing on the client decides whether an inspection passed', () => {
    // The panel may DRESS the outcome (a badge colour) but must never compute one. These are the
    // shapes that would mean it had: counting failures, or comparing answered against total.
    expect(PANEL).not.toMatch(/items_failed\s*===?\s*0/);
    expect(PANEL).not.toMatch(/items_answered\s*===\s*\w*\.?items_total/);
    // ASSIGNING an outcome, not comparing against one — the lookbehind is what lets the badge
    // keep saying `o === 'passed'` while a computed `outcome = 'passed'` still fails.
    expect(PANEL).not.toMatch(/(?<![=!<>])=\s*['"]passed['"]/);
  });

  it('the panel reports what is UNANSWERED, not only what passed', () => {
    expect(PANEL).toContain('items_answered');
    expect(PANEL).toContain('still to check');
  });

  it('a failure nobody actioned is surfaced rather than folded away', () => {
    // The silent-zero shape: a recorded defect with no snag against it is indistinguishable, on a
    // list of finished inspections, from a stage that was checked and found clean.
    expect(SERVICE).toContain('open_failures');
    expect(PANEL).toContain('open_failures');
    expect(PANEL).toContain('with no snag raised');
  });

  it('an unanswered item says so instead of rendering blank', () => {
    expect(PANEL).toContain("it.result === null");
    expect(PANEL).toContain('Not answered');
  });
});

describe('creating an inspection', () => {
  it('is ONE call — header and items cannot be two writes', () => {
    expect(SERVICE).toContain("rpc('create_inspection_from_template'");
    // Two inserts would leave a header with no items on a dropped connection, and a header with no
    // items derives as `empty` — which on a list reads as a stage that was checked and found clean.
    expect(SERVICE).not.toMatch(/from\('project_inspections'\)\s*\.\s*insert/);
    expect(SERVICE).not.toMatch(/from\('project_inspection_items'\)\s*\.\s*insert/);
  });

  it('refuses an empty checklist rather than creating one', () => {
    expect(PANEL).toContain('filled.length === 0');
    expect(PANEL).toContain('Add at least one thing to check');
  });
});

describe('a failure becomes a snag exactly once', () => {
  it('goes through the RPC that creates and stamps in one call', () => {
    expect(SERVICE).toContain("rpc('raise_snag_from_inspection_item'");
    // A client-side insert into project_snags followed by an update of the item is the exact
    // create-then-stamp pair that bills the same work twice when the second half fails.
    expect(SERVICE).not.toMatch(/from\('project_snags'\)/);
    // Writing the stamp from here, rather than declaring the column on the row type.
    expect(SERVICE).not.toMatch(/update\(\s*\{[^}]*snag_id/);
  });

  it('the button is offered only on a failed item, and once', () => {
    expect(PANEL).toContain("it.result === 'fail'");
    expect(PANEL).toContain('it.snag_id ?');
    expect(PANEL).toContain('Raise snag');
  });
});

describe('the inspection template carries questions, never answers', () => {
  it('is a live template type rather than a table of its own', () => {
    expect(LIVE_TEMPLATE_TYPES as readonly string[]).toContain('inspection');
    expect(TEMPLATE_SCHEMAS.inspection.sourceTable).toBe('project_inspections');
  });

  it('captures none of the answers', () => {
    const child = TEMPLATE_SCHEMAS.inspection.captureChildren?.[0];
    expect(child?.table).toBe('project_inspection_items');
    const captured = [...TEMPLATE_SCHEMAS.inspection.captureFields, ...(child?.fields ?? [])];
    // Every one of these is a fact about a WALK, not about the checklist. A template holding any
    // of them produces a record asserting a stage was inspected when nobody was there.
    for (const answer of [
      'result', 'note', 'photo_paths', 'snag_id', 'answered_at', 'answered_by',
      'status', 'signed_off_at', 'signed_off_by', 'signed_off_name',
    ]) {
      expect(captured, `template must not capture "${answer}"`).not.toContain(answer);
    }
  });

  it('captures nothing the shared forbidden list bans either', () => {
    const child = TEMPLATE_SCHEMAS.inspection.captureChildren?.[0];
    const captured = [...TEMPLATE_SCHEMAS.inspection.captureFields, ...(child?.fields ?? [])];
    for (const field of captured) {
      for (const banned of FORBIDDEN_CAPTURE_FIELDS) {
        expect(field === banned, `"${field}" is forbidden`).toBe(false);
      }
    }
  });

  it('the adapter builds an explicit item list rather than spreading the payload', () => {
    const start = ADAPTERS.indexOf('export const inspectionAdapter');
    expect(start).toBeGreaterThan(-1);
    const body = ADAPTERS.slice(start);
    // A stored payload is untrusted input (security invariant 8): the mapped literal is what stops
    // a hand-edited template writing `result` or `snag_id` into a brand-new checklist.
    expect(body).not.toMatch(/\.\.\.\(?payload/);
    expect(body).not.toMatch(/\.\.\.r\b/);
    expect(body).toContain('title: str(r.title)');
  });

  it('sends the person to pick a project rather than inventing a home for the inspection', () => {
    const start = ADAPTERS.indexOf('export const inspectionAdapter');
    const body = ADAPTERS.slice(start);
    expect(body).toContain('if (!ctx.projectId)');
    expect(body).toContain("kind: 'prefill'");
  });
});
