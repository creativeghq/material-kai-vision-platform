/** What an appointment is ABOUT (#378 C4). */
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

  it('offers every subject the table models, through one control', () => {
    /**
     * The rule is unchanged — an option with no picker behind it is a row that silently does
     * nothing — but the shape it guards is not.
     */
    expect(src, 'the page must mount the shared subject control').toContain('<SubjectLinkField');
    expect(
      src,
      'per-kind adapters covered only project and property — the shape that left two columns dead',
    ).not.toMatch(/<(ProjectLinkField|PropertyLinkField)/);
  });
});
