import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  PAGE_WATCH_STATUSES, JUDGE_CONFIDENCES, isPageWatchStatus, isJudgeConfidence,
} from '@/services/pageWatch/pageWatchVocabulary';
import { SNAG_SEVERITIES, isSnagSeverity } from '@/modules/projects/snagVocabulary';
import { EXPENSE_CARD_TYPES, isExpenseCardType } from '@/modules/finance/tripExpenseVocabulary';
import { KYC_CHECK_TYPES, isKycCheckType } from '@/modules/real-estate/realEstateVocabulary';
import { AGENT_TRIGGER_TYPES, isAgentTriggerType } from '@/services/agents/agentVocabulary';

/**
 * The remaining #391 vocabularies, pinned to their CHECK constraints.
 *
 * Same contract as the other files in this set: the expected values are constraint text
 * quoted verbatim from `pg_constraint`, not a tidy array. #391 names the reason — the
 * previous guard for this shape carried its own copy of the list and was hand-edited
 * alongside the three it was pinning, so it could only ever catch inconsistency.
 */

const ROOT = join(__dirname, '..', '..');

/** `pg_get_constraintdef` output, 2026-08-27. Verbatim. */
const DB = {
  pageWatchStatus:
    "CHECK ((status = ANY (ARRAY['same'::text, 'new'::text, 'changed'::text, 'removed'::text, 'error'::text])))",
  judgeConfidence:
    "CHECK (((judge_confidence IS NULL) OR (judge_confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text]))))",
  snagSeverity:
    "CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])))",
  cardType:
    "CHECK ((card_type = ANY (ARRAY['trip'::text, 'monthly'::text, 'other'::text])))",
  kycCheckType:
    "CHECK ((check_type = ANY (ARRAY['identity'::text, 'source_of_funds'::text, 'pep_sanctions'::text])))",
  agentTrigger:
    "CHECK ((trigger_type = ANY (ARRAY['cron'::text, 'event'::text, 'manual'::text, 'chain'::text])))",
};

const literals = (s: string) => [...s.matchAll(/'([^':]+)'/g)].map((m) => m[1]);

describe('#391 — the remaining vocabularies match their constraints', () => {
  const cases: Array<[string, readonly string[], string]> = [
    ['page-watch status', PAGE_WATCH_STATUSES, DB.pageWatchStatus],
    ['judge confidence', JUDGE_CONFIDENCES, DB.judgeConfidence],
    ['snag severity', SNAG_SEVERITIES, DB.snagSeverity],
    ['expense card type', EXPENSE_CARD_TYPES, DB.cardType],
    ['KYC check type', KYC_CHECK_TYPES, DB.kycCheckType],
    ['agent trigger type', AGENT_TRIGGER_TYPES, DB.agentTrigger],
  ];

  for (const [label, values, constraint] of cases) {
    it(label, () => {
      expect([...values].sort()).toEqual(literals(constraint).sort());
    });
  }

  it('the literal extractor reads something', () => {
    expect(literals(DB.snagSeverity)).toHaveLength(4);
    expect(literals('CHECK ((x = ANY (ARRAY[])))')).toEqual([]);
  });

  it('every guard narrows', () => {
    for (const v of PAGE_WATCH_STATUSES) expect(isPageWatchStatus(v)).toBe(true);
    for (const v of JUDGE_CONFIDENCES) expect(isJudgeConfidence(v)).toBe(true);
    for (const v of SNAG_SEVERITIES) expect(isSnagSeverity(v)).toBe(true);
    for (const v of EXPENSE_CARD_TYPES) expect(isExpenseCardType(v)).toBe(true);
    for (const v of KYC_CHECK_TYPES) expect(isKycCheckType(v)).toBe(true);
    for (const v of AGENT_TRIGGER_TYPES) expect(isAgentTriggerType(v)).toBe(true);
    expect(isPageWatchStatus('unchanged')).toBe(false);
    expect(isSnagSeverity('urgent')).toBe(false);
    expect(isKycCheckType('kyc')).toBe(false);
  });

  it('a nullable column does not put NULL in the set', () => {
    // `judge_confidence` reads `IS NULL OR ...`, so "no judgement" is legitimate and is
    // NOT a member. Putting it in the set would make the source disagree with the
    // constraint, which is the drift these files exist to prevent.
    expect(JUDGE_CONFIDENCES).toHaveLength(3);
    expect(isJudgeConfidence(null)).toBe(false);
  });
});

describe('#391 — the agent trigger type is not the FLOWS trigger type', () => {
  it('they stay separate vocabularies', () => {
    // Same column name, two orders of magnitude apart: `background_agents.trigger_type`
    // is four values (cron/event/manual/chain); `services/flows/types.ts` TriggerType is
    // ~130 event names an automation can fire on. Unifying by name would be the
    // signature-matching mistake #391 warns about, and this case is here so nobody does.
    const flows = stripComments(readFileSync(join(ROOT, 'src/services/flows/types.ts'), 'utf8'));
    expect(
      flows.includes('agentVocabulary'),
      'flows/types.ts now imports the AGENT trigger vocabulary — different facts that ' +
        'share a column name',
    ).toBe(false);
    expect(AGENT_TRIGGER_TYPES).toHaveLength(4);
  });
});
