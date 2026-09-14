/**
 * Warranty and callbacks: three money outcomes booked identically as "a job" (#437).
 *
 * Our fitter cracked it, the tap failed, or the customer changed their mind. The expensive default
 * is the quiet one — treating an undecided cause as our own cost writes off every supplier
 * recovery in the pile without anyone deciding to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  CAUSE_LABEL, OUTCOME_LABEL, WINDOW_LABEL, URGENCY_LABEL, CLAIM_STATUS_LABEL,
  CERTIFICATION_STATE_LABEL, causeIsDecided, outcomeIsUnknown, claimNeedsWork,
  supplierPackIsComplete, isInsideWindow, reworkRateIsTrustworthy, taskGateBlocks,
  certificationState, SERVICE_CALLBACK_DAYS, INSTALLATION_CALLBACK_DAYS,
  REASON_IS_AN_ANSWER, RETROSPECTIVE_ATTACH,
  type ClaimPosition, type ReworkRate, type TaskGate, type ClaimCause,
  type CallbackWindow, type MoneyOutcome, type CertificationState,
} from '@/modules/crm/warrantyClaimRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/crm/services/warrantyClaimService.ts');
const card = read('src/modules/crm/components/WarrantyClaimsCard.tsx');
const quality = read('src/modules/hr/components/InstallerQualityCard.tsx');
const company = read('src/modules/crm/pages/CompanyDetailPage.tsx');
const hr = read('src/modules/hr/pages/HRPage.tsx');
const tasks = read('src/modules/projects/components/tabs/TasksTab.tsx');

const position = (over: Partial<ClaimPosition>): ClaimPosition => ({
  claim_id: 'c', status: 'reported', cause: 'product_failure', money_outcome: 'supplier_claim',
  callback_window: 'installation_callback', photos: { failure: 1, installation: 0, receipt: 1 },
  missing: [], ready: true, reason: '', legal_basis: '', ...over,
});

describe('an undecided cause is not our cost', () => {
  it('unclassified and undetermined are both unknown, and neither is internal rework', () => {
    expect(causeIsDecided(null)).toBe(false);
    expect(causeIsDecided('undetermined')).toBe(true);
    expect(outcomeIsUnknown(position({ money_outcome: 'unclassified' }))).toBe(true);
    expect(outcomeIsUnknown(position({ money_outcome: 'undetermined' }))).toBe(true);
    expect(outcomeIsUnknown(position({ money_outcome: 'internal_rework' }))).toBe(false);
    const causes: ClaimCause[] = ['workmanship', 'product_failure', 'customer_change', 'undetermined'];
    for (const c of causes) expect(CAUSE_LABEL[c]).toBeTruthy();
    const outcomes: MoneyOutcome[] =
      ['internal_rework', 'supplier_claim', 'chargeable', 'undetermined', 'unclassified'];
    for (const o of outcomes) expect(OUTCOME_LABEL[o]).toBeTruthy();
  });

  it('the card says so rather than letting the blank read as ours', () => {
    expect(card).toMatch(/Not ours by default/);
  });

  it('the cause is a recorded decision, with who and when', () => {
    expect(service).toMatch(/cause_decided_by[\s\S]{0,120}cause_decided_at/);
  });
});

describe('a supplier claim is an anecdote without the pack', () => {
  it('the order line, the batch and the photographs are what make it worth anything', () => {
    expect(supplierPackIsComplete(position({}))).toBe(true);
    expect(supplierPackIsComplete(position({ missing: ['the batch'] }))).toBe(false);
    expect(supplierPackIsComplete(position({ money_outcome: 'internal_rework' }))).toBe(false);
    expect(claimNeedsWork(position({ ready: false }))).toBe(true);
    expect(claimNeedsWork(position({}))).toBe(false);
  });

  it('the missing pieces are named, not counted', () => {
    expect(card).toMatch(/Still needs:/);
  });
});

describe('the callback window is two windows, not one', () => {
  it('30 days from a service call, a year from an installation', () => {
    expect(SERVICE_CALLBACK_DAYS).toBe(30);
    expect(INSTALLATION_CALLBACK_DAYS).toBe(365);
    expect(isInsideWindow('service_callback')).toBe(true);
    expect(isInsideWindow('installation_callback')).toBe(true);
    expect(isInsideWindow('outside_window')).toBe(false);
    expect(isInsideWindow('undatable')).toBe(false);
    const windows: CallbackWindow[] =
      ['service_callback', 'installation_callback', 'outside_window', 'undatable'];
    for (const w of windows) expect(WINDOW_LABEL[w]).toBeTruthy();
  });

  it('a claim attaches retrospectively, which is what keeps the rate true', () => {
    expect(RETROSPECTIVE_ATTACH).toMatch(/six months later/);
    expect(service).toMatch(/installed_on: input\.installedOn/);
  });
});

describe('a rework rate over unattributed claims is lower than the real one', () => {
  it('and never zero', () => {
    const r = (over: Partial<ReworkRate>): ReworkRate => ({
      from: '2025-09-14', to: '2026-09-14', status: 'ok',
      unattributed_workmanship_claims: 0, reason: '', rows: [], ...over,
    });
    expect(reworkRateIsTrustworthy(r({}))).toBe(true);
    expect(reworkRateIsTrustworthy(r({ status: 'partly_unattributed' }))).toBe(false);
    expect(reworkRateIsTrustworthy(r({ status: 'not_measurable' }))).toBe(false);
    expect(reworkRateIsTrustworthy(null)).toBe(false);
  });

  it('the numbers come from SQL, not from the card', () => {
    expect(service).toContain('installer_rework_rate');
    expect(quality).not.toMatch(/\.filter\(\(c\) => c\.cause === 'workmanship'\)\.length/);
  });

  it('a failed read is unknown, not "nothing went back"', () => {
    expect(quality).toMatch(/not a statement that nothing went back/);
    expect(card).toMatch(/not a statement that none are open/);
  });
});

describe('a certificate with no expiry is not valid forever', () => {
  it('the four states are distinguishable', () => {
    const c = (expires: string | null, remind = 30) => ({ expires_on: expires, remind_days_before: remind });
    expect(certificationState(c(null), '2026-09-14')).toBe('no_expiry');
    expect(certificationState(c('2026-09-13'), '2026-09-14')).toBe('expired');
    expect(certificationState(c('2026-09-20'), '2026-09-14')).toBe('expiring');
    expect(certificationState(c('2027-09-20'), '2026-09-14')).toBe('valid');
    const states: CertificationState[] = ['valid', 'expiring', 'expired', 'no_expiry'];
    for (const s of states) expect(CERTIFICATION_STATE_LABEL[s]).toBeTruthy();
  });

  it('the reminder window is per document, not one global number', () => {
    expect(certificationState({ expires_on: '2026-12-01', remind_days_before: 120 }, '2026-09-14')).toBe('expiring');
    expect(certificationState({ expires_on: '2026-12-01', remind_days_before: 7 }, '2026-09-14')).toBe('valid');
  });
});

describe('a job completes when every mandatory step is done OR explained', () => {
  it('silence is not an answer, and a reason is', () => {
    const g = (over: Partial<TaskGate>): TaskGate => ({
      allowed: false, code: 'mandatory_open', mandatory_tasks: 2,
      open_without_reason: 1, skipped_with_reason: 0, reason: '', ...over,
    });
    expect(taskGateBlocks(g({}))).toBe(true);
    expect(taskGateBlocks(g({ allowed: true, code: 'ok', open_without_reason: 0 }))).toBe(false);
    expect(taskGateBlocks(null)).toBe(false);
    expect(REASON_IS_AN_ANSWER).toMatch(/SAYING WHY/);
  });

  it('the tasks tab asks before completing, and the server refuses anyway', () => {
    expect(tasks).toContain('taskGate');
    expect(tasks).toMatch(/taskGateBlocks\(gate\)/);
  });
});

describe('every surface is reachable', () => {
  it('claims on the customer, rework and certificates in HR', () => {
    expect(company).toContain('WarrantyClaimsCard');
    expect(hr).toContain('InstallerQualityCard');
    for (const u of ['low', 'normal', 'high', 'emergency'] as const) {
      expect(URGENCY_LABEL[u]).toBeTruthy();
    }
    for (const s of ['reported', 'assigned', 'scheduled', 'resolved', 'rejected'] as const) {
      expect(CLAIM_STATUS_LABEL[s]).toBeTruthy();
    }
  });
});
