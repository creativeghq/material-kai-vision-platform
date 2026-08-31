/**
 * A calendar entry can say what it is ABOUT, on both calendars, for every subject it declares.
 *
 * THE TWO DEFECTS THIS EXISTS FOR (#378 C4, N10)
 * ----------------------------------------------
 * 1. `appointments` gained four subject columns and the UI wrote TWO of them. `deal_id` and
 *    `order_id` were declared in the row type, constrained by `appointments_single_subject_ck`,
 *    handled by `set_appointment_subject` — and reachable from nothing. The comment above the
 *    control even claimed they were "set from those records"; nothing set them. A column with no
 *    writer is the dead-schema shape wearing a feature's clothes, and no runtime probe can see it
 *    because zero rows written zero times is not activity.
 *
 * 2. `crm_meetings` had no subject at all, and the issue recorded N10 as CLOSED because
 *    `appointments` got one. That is the calendar with the invites, the reminders, the reminder
 *    cron and `property_viewings.meeting_id` pointing into it — so the internal calendar could say
 *    WHO a meeting was with and never WHAT it was for.
 *
 * Both are now served by ONE control, so the two surfaces cannot drift into supporting different
 * subjects — which is how they got here.
 *
 * WHY SOURCE TEXT
 * ---------------
 * The claim is "every declared subject is reachable from a UI". That is a statement about wiring,
 * not about behaviour: a render test proves one path works and says nothing about the three that
 * are missing, which is exactly the gap that shipped.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

/** The four kinds both tables model. Adding a fifth means adding it here and to the control. */
const SUBJECT_KINDS = ['project', 'deal', 'property', 'order'] as const;

const CONTROL = 'src/components/business/crm/SubjectLinkField.tsx';
const APPOINTMENTS = 'src/pages/AppointmentsPage.tsx';
const MEETINGS = 'src/components/core/Profile/ProfileMeetingsTab.tsx';
const MEETINGS_SERVICE = 'src/services/crmMeetingsService.ts';

describe('the subject control offers every kind the schema models', () => {
  const control = read(CONTROL);

  it('declares all four kinds', () => {
    for (const kind of SUBJECT_KINDS) {
      expect(control, `${kind} missing from SubjectKind`).toMatch(new RegExp(`'${kind}'`));
    }
  });

  it('can SEARCH each kind — a kind with no search is a group that never appears', () => {
    /**
     * The gap C4 shipped was not a missing type, it was a missing way to pick one.
     *
     * Each kind names its OWN source, because two of them are not free table reads:
     * `crm_deals` is read through `dealsService` and nowhere else (dealPipelineDerivation), and a
     * building is named by `propertyLabel` and nowhere else (orderLinkTargets). Asserting a raw
     * `from('crm_deals')` here would have demanded the exact duplication those two guards refuse —
     * which is what this check originally did, and both fired.
     */
    const SEARCH_SOURCE: Record<(typeof SUBJECT_KINDS)[number], RegExp> = {
      project: /from\('projects'\)/,
      deal: /dealsService\.searchDeals\(/,
      property: /from\('properties'\)/,
      order: /from\('orders'\)/,
    };
    for (const kind of SUBJECT_KINDS) {
      expect(control, `${kind} has no way to pick one`).toMatch(SEARCH_SOURCE[kind]);
    }
    // And the building is named by the shared helper, not a fourth copy of the fallback chain.
    expect(control, 'a property must be named by propertyLabel()').toMatch(/propertyLabel\(/);
  });

  it('can be CLEARED', () => {
    // A meeting filed against the wrong job is worse than one filed against none: the wrong job's
    // timeline is then confidently wrong.
    expect(control).toMatch(/__clear__/);
  });
});

describe('both calendars mount it, and write through the RPC', () => {
  it('the appointments screen uses the shared control, not a partial set of adapters', () => {
    const src = read(APPOINTMENTS);
    expect(src, 'AppointmentsPage must mount SubjectLinkField').toMatch(/<SubjectLinkField/);
    expect(src, 'the subject write must go through the RPC').toMatch(/set_appointment_subject/);
    // The shape that shipped: two of four kinds wired through per-kind adapters.
    expect(src, 'ProjectLinkField/PropertyLinkField only covered 2 of the 4 declared subjects')
      .not.toMatch(/<(ProjectLinkField|PropertyLinkField)/);
  });

  it('the CRM calendar uses it too, and writes through its own RPC', () => {
    expect(read(MEETINGS), 'ProfileMeetingsTab must mount SubjectLinkField').toMatch(/<SubjectLinkField/);
    expect(read(MEETINGS_SERVICE), 'the meeting subject write must go through the RPC')
      .toMatch(/set_meeting_subject/);
  });

  it('neither surface writes a subject column directly', () => {
    /**
     * RLS on either table sees the ROW's tenancy, never the SUBJECT's. `appointments` has no
     * workspace_id at all, and `crm_meetings` has one the subject must MATCH — a caller who
     * belongs to two tenants could otherwise file tenant A's meeting against tenant B's project,
     * and every reader of that project would see it. Only the RPCs check that.
     */
    for (const file of [APPOINTMENTS, MEETINGS, MEETINGS_SERVICE]) {
      const src = read(file);
      for (const kind of SUBJECT_KINDS) {
        expect(
          src,
          `${file} writes ${kind}_id directly. Use the RPC — RLS cannot see the subject's workspace.`,
        ).not.toMatch(new RegExp(`update\\([^)]*${kind}_id`));
      }
    }
  });
});

describe('the meeting row type carries what the picker reads back', () => {
  it('all four columns are on CrmMeeting, so a stored subject can be shown', () => {
    // Without these the list read returns the ids and the type hides them, so the control renders
    // "Not linked" over a subject that IS set — and the operator sets it a second time.
    const svc = read(MEETINGS_SERVICE);
    for (const kind of SUBJECT_KINDS) {
      expect(svc, `CrmMeeting is missing ${kind}_id`).toMatch(new RegExp(`${kind}_id: string \\| null`));
    }
    expect(svc, 'labels must be resolved for the picker').toMatch(/resolveSubjects/);
  });

  it('WHO it is with stays a separate question from WHAT it is about', () => {
    // `target_kind`/`target_id` answer "who". Folding the subject into that pair is how one
    // control ends up writing two different facts — the mistake the order header already made.
    const svc = read(MEETINGS_SERVICE);
    expect(svc).toMatch(/target_kind/);
    expect(svc).toMatch(/target_id/);
  });
});
