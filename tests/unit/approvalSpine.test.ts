/**
 * Credit holds, margin floors and till variances are ONE approval spine (#426, #435).
 *
 * All three are the same three questions — is this allowed, who may wave it through, and who
 * signed — and all three failed the same way: the verdict was computed in the dialog, so PostgREST
 * and the agent tools reached the write with no gate at all. Application-side checking is a filter,
 * not a boundary.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  verdictStops, verdictIsApprovable, SUBJECT_LABEL,
  type ApprovalSubject,
} from '@/modules/finance/approvalRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/finance/services/approvalService.ts');
const notice = read('src/modules/finance/components/CreditControlNotice.tsx');
const card = read('src/modules/finance/components/ApprovalsCard.tsx');
const dialog = read('src/modules/finance/components/NewInvoiceDialog.tsx');
const posPage = read('src/modules/finance/pages/PosPage.tsx');
const posService = read('src/modules/finance/services/posSessionService.ts');
const settingsTab = read('src/modules/finance/tabs/SettingsTab.tsx');

describe('there is ONE spine, not three', () => {
  it('all three subjects share the same policy and request tables', () => {
    const subjects: ApprovalSubject[] = ['credit_hold', 'margin_floor', 'pos_variance'];
    for (const s of subjects) expect(SUBJECT_LABEL[s]).toBeTruthy();
    expect(service).toContain('approval_policies');
    expect(service).toContain('approval_requests');
    // A second table per subject is exactly what this ticket exists to avoid.
    expect(service).not.toMatch(/credit_hold_requests|margin_requests|variance_requests/);
  });

  it('the card governs all three in one place', () => {
    for (const s of ['credit_hold', 'margin_floor', 'pos_variance']) {
      expect(card, `the card does not offer ${s}`).toContain(s);
    }
    expect(settingsTab).toContain('ApprovalsCard');
  });
});

describe('a verdict stops the write or it does not, and only one kind can be signed away', () => {
  it('block and approve stop; warn and allow do not', () => {
    expect(verdictStops('block')).toBe(true);
    expect(verdictStops('approve')).toBe(true);
    expect(verdictStops('warn')).toBe(false);
    expect(verdictStops('allow')).toBe(false);
    expect(verdictStops(null)).toBe(false);
  });

  it('only `approve` can be released by a signature', () => {
    // `block` means nobody can wave it through. Letting a signature release it would make the
    // two settings the same setting.
    expect(verdictIsApprovable('approve')).toBe(true);
    expect(verdictIsApprovable('block')).toBe(false);
    expect(verdictIsApprovable('warn')).toBe(false);
  });
});

describe('the verdict is derived in SQL, not in the dialog', () => {
  it('the service calls the derivations', () => {
    expect(service).toContain('credit_control_verdict');
    expect(service).toContain('margin_floor_verdict');
  });

  it('nothing re-derives exposure or margin in TypeScript', () => {
    // Deriving it here would be a second answer to a money question, which is anti-regression
    // rule 1's exact shape.
    expect(notice).not.toMatch(/exposure\s*\+|balance\s*\+\s*total/i);
    expect(notice).not.toMatch(/unit_price\s*-\s*unit_cost|\/\s*unit_price/);
    expect(service).not.toMatch(/unit_price\s*-\s*unit_cost/);
  });

  it('the invoice dialog blocks on the SERVER verdict', () => {
    expect(dialog).toContain('CreditControlNotice');
    expect(dialog).toContain('creditBlocked');
    expect(dialog).toMatch(/disabled=\{busy \|\| buyerRisk\.hardBlocked \|\| vatDestinationBlocked \|\| creditBlocked/);
  });

  it('a failed read does not silently unblock — the write is still gated', () => {
    expect(notice).toMatch(/still gated server-side/);
  });
});

describe('an override is signed or it is not an override', () => {
  it('the decision records who and when', () => {
    expect(service).toContain('decided_by');
    expect(service).toContain('decided_at');
    expect(service).toContain('decision_reason');
  });

  it('the card refuses to record a decision with no reason', () => {
    expect(card).toMatch(/An override nobody explained is worse than no control/);
    expect(card).toMatch(/if \(!why\)/);
  });
});

describe('a till that is out carries a signature', () => {
  it('the close takes a reason and an approval', () => {
    expect(posService).toContain('p_variance_reason');
    expect(posService).toContain('p_variance_approved');
  });

  it('the page asks for the reason only when the drawer is actually out', () => {
    // An exact match reconciles with no ceremony; a mismatch is the case that needs a name
    // against it.
    expect(posPage).toMatch(/outBy !== 0/);
    expect(posPage).toMatch(/recorded against your name/);
  });

  it('cancelling the reason prompt cancels the close', () => {
    // Closing anyway with no reason is precisely the state the trigger refuses, and it would
    // read to the operator as "it worked".
    expect(posPage).toMatch(/if \(why === null\) return;/);
  });
});
