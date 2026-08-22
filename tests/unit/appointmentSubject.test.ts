/**
 * What an appointment is ABOUT (#378 C4).
 *
 * The tenancy hazard this guards is specific and easy to reintroduce: `appointments` has **no
 * workspace_id**. Its RLS is keyed on `professional_user_id`, so a professional writing
 * `project_id` straight onto their own appointment passes every row-level check there is — while
 * pointing it at a job in a workspace they have nothing to do with. RLS cannot see the SUBJECT's
 * workspace; only `set_appointment_subject` checks both.
 *
 * So the rule is not "use an RPC because RPCs are nice". It is: **a direct column write here is a
 * cross-tenant link**, and the moment someone replaces the RPC call with
 * `supabase.from('appointments').update({ project_id })` — which will look like a simplification —
 * the check is gone and nothing fails.
 *
 * The single-subject rule lives in the DB (`appointments_single_subject_ck`) and is probed there;
 * an appointment about two things is about neither.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const PAGE = 'src/pages/AppointmentsPage.tsx';
const src = stripComments(readFileSync(join(ROOT, PAGE), 'utf8'));

const SUBJECT_COLUMNS = ['project_id', 'deal_id', 'property_id', 'order_id'] as const;

describe('the appointment subject is written through the guarded RPC', () => {
  it('calls set_appointment_subject', () => {
    expect(src, 'the subject write must go through the RPC that checks the SUBJECT\'s workspace')
      .toContain('set_appointment_subject');
  });

  it('never writes a subject column directly onto appointments', () => {
    // Every `.update({...})` in this file, judged individually: notes and status are legitimate
    // direct writes, a subject column is not.
    const offenders: string[] = [];
    for (const m of src.matchAll(/\.from\('appointments'\)\s*\.update\(\{([\s\S]{0,200}?)\}\)/g)) {
      const payload = m[1];
      for (const col of SUBJECT_COLUMNS) {
        if (new RegExp(`\\b${col}\\b`).test(payload)) {
          offenders.push(`${col} written directly: ${payload.trim().slice(0, 60)}`);
        }
      }
    }
    expect(
      offenders,
      offenders.join('\n') + '\nappointments has no workspace_id — a direct write cannot check '
        + 'the subject\'s workspace, so this is a cross-tenant link. Use set_appointment_subject.',
    ).toEqual([]);
  });

  it('can clear the subject, so a wrong one is fixable rather than permanent', () => {
    expect(src).toMatch(/'none'/);
  });

  it('offers only the subjects it actually renders a picker for', () => {
    // A Select option with no picker behind it is a row that silently does nothing — the same
    // shape as an unhandled OrderLinkPicker kind.
    const offered = [...src.matchAll(/<SelectItem value="(project|property|deal|order)"/g)].map((m) => m[1]);
    for (const kind of offered) {
      const field = kind === 'project' ? '<ProjectLinkField' : kind === 'property' ? '<PropertyLinkField' : null;
      expect(field, `the page offers "${kind}" but this test knows no picker for it`).not.toBeNull();
      expect(src, `"${kind}" is offered with no picker behind it`).toContain(field as string);
    }
    expect(offered.length, 'at least one subject should be offered').toBeGreaterThan(0);
  });
});
