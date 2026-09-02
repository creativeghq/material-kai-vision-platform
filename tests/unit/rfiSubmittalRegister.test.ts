/**
 * RFIs and submittals — the rules that separate them from the client-facing kinds they share a
 * table with.
 *
 * They live in `project_requests` on purpose: they are the same threaded, status-tracked question
 * the client kinds are, and a `project_rfis` table would duplicate the message threading, the
 * status machine, the resolved_at trigger and the two Flows events, then drift from all four.
 *
 * What must NOT be shared is the audience. A question is a conversation with the customer; an RFI
 * is a question about a problem in the architect's information. Defaulting one visible is a
 * one-word mistake that publishes the project's open problems to the person paying for it, and
 * nothing about it looks wrong in a diff.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  REQUEST_KINDS, REVIEW_DECISIONS, CLOSING_REVIEW_DECISIONS, TEAM_FACING_KINDS, isTeamFacing,
} from '@/modules/projects/requestVocabulary';

const ROOT = process.cwd();
const SERVICE = readFileSync(
  resolve(ROOT, 'src/modules/projects/services/projectRequestsService.ts'), 'utf8',
);
const TAB = readFileSync(
  resolve(ROOT, 'src/modules/projects/components/tabs/RequestsTab.tsx'), 'utf8',
);

describe('request kinds', () => {
  it('keeps the client kinds and adds the two team-facing ones', () => {
    expect(REQUEST_KINDS).toEqual([
      'question', 'change_request', 'approval_request', 'info_request', 'rfi', 'submittal',
    ]);
  });

  it('marks exactly the numbered kinds as team-facing', () => {
    expect(TEAM_FACING_KINDS).toEqual(['rfi', 'submittal']);
    expect(isTeamFacing('rfi')).toBe(true);
    expect(isTeamFacing('submittal')).toBe(true);
    expect(isTeamFacing('question')).toBe(false);
    expect(isTeamFacing('approval_request')).toBe(false);
  });
});

describe('submittal verdicts', () => {
  it('mirrors project_requests_review_check exactly', () => {
    expect(REVIEW_DECISIONS).toEqual([
      'approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected',
    ]);
  });

  /**
   * The one that carries the meaning. `revise_and_resubmit` is the state their competitor's whole
   * pitch is about — "nothing stays at Status B for months" — so treating it as closed would lose
   * exactly the submittals worth chasing.
   */
  it('does not treat revise-and-resubmit as closing', () => {
    expect(CLOSING_REVIEW_DECISIONS).not.toContain('revise_and_resubmit');
    expect([...CLOSING_REVIEW_DECISIONS].sort()).toEqual(['approved', 'approved_as_noted', 'rejected']);
    for (const d of CLOSING_REVIEW_DECISIONS) expect(REVIEW_DECISIONS).toContain(d);
  });
});

describe('the service', () => {
  it('defaults a team-facing request to internal, not client-visible', () => {
    // The pre-existing default was `client_visible ?? true`, which is right for a client question
    // and wrong for every RFI.
    expect(SERVICE).toContain("client_visible: input.client_visible ?? !isTeamFacing(input.kind ?? 'question')");
  });

  it('never sends a reference from the client', () => {
    // Numbering happens inside the INSERT that creates the row, so there is no create-then-number
    // pair a retry could run twice (anti-regression rule 4). Scoped to the insert payload: the
    // row TYPE naturally declares `reference`, and asserting over the whole file would fail on
    // that — a guard that fires on the wrong thing gets deleted rather than fixed.
    const create = SERVICE.slice(SERVICE.indexOf('async create('));
    const payload = create.slice(create.indexOf('.insert({'), create.indexOf('.select()'));
    expect(payload).toContain('kind: input.kind');
    expect(payload).not.toMatch(/^\s*reference:/m);
  });

  it('moves the verdict and the status in one write', () => {
    // `project_requests_submittal_resolved_needs_decision` refuses a resolved submittal with no
    // verdict, so two separate writes mean either a rejected first write or a window where the
    // register shows a closed submittal nobody decided.
    const fn = SERVICE.slice(SERVICE.indexOf('async setReviewDecision'));
    const body = fn.slice(0, fn.indexOf('\n  },'));
    expect(body).toContain('review_decision: decision');
    expect(body).toContain('status:');
    expect((body.match(/\.update\(/g) ?? []).length).toBe(1);
  });

  it('refuses a verdict on anything that is not a submittal', () => {
    expect(SERVICE).toContain("if (request.kind !== 'submittal')");
  });
});

describe('the register UI', () => {
  it('does not offer RFIs or submittals to a collaborator', () => {
    expect(TAB).toContain('!isTeamFacing(k)');
  });

  it('hides the client-visibility switch on a team-facing request', () => {
    // Offering it would invite somebody to publish an RFI to the customer by accident.
    expect(TAB).toContain('isOwner && !teamFacing');
    expect(TAB).toContain('client_visible: teamFacing ? false');
  });

  it('closes a submittal by recording the verdict, never by the status dropdown', () => {
    expect(TAB).toContain('REVIEW_DECISIONS.map');
    expect(TAB).toContain('setReviewDecision');
  });

  it('calls an unanswered request overdue only while it is still open', () => {
    // A resolved RFI that was late is history, not a task. The check is anchored on the closed
    // statuses so a closed one never renders in the destructive tone.
    expect(TAB).toMatch(/!REQUEST_CLOSED_STATUSES\.includes\(r\.status\) && r\.due_at < todayLocalISO\(\)/);
  });

  it('compares the due date against the operator local day, not UTC', () => {
    // Rule 1b: `new Date().toISOString().slice(0,10)` is yesterday for a Greek user between local
    // midnight and 02:00-03:00, which would show a request as overdue a day early.
    expect(TAB).toContain('todayLocalISO');
    expect(TAB).not.toMatch(/toISOString\(\)\.slice\(0,\s*10\)/);
  });
});
