import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const EDGE = stripComments(readFileSync(join(ROOT, 'supabase/functions/revolut-api/index.ts'), 'utf8'));
const TAB = stripComments(readFileSync(join(ROOT, 'src/modules/finance/tabs/BankFeedTab.tsx'), 'utf8'));

const PLAN_CASE = EDGE.slice(
  EDGE.indexOf("case 'confirm-plan-match'"),
  EDGE.indexOf("case 'ignore-transaction'"),
);
const BILL_CASE = EDGE.slice(
  EDGE.indexOf("case 'confirm-bill-match'"),
  EDGE.indexOf("case 'plan-candidates'"),
);

describe('closing a plan from the bank feed', () => {
  it('settles through settle_planned_payment, never a status write of its own', () => {
    expect(PLAN_CASE).toMatch(/rpc\('settle_planned_payment'/);
    expect(PLAN_CASE, 'the plan row is written directly, so the claim is bypassed')
      .not.toMatch(/from\('planned_payments'\)[\s\S]{0,80}\.update\(/);
  });

  it('hands the payment it just wrote to the RPC rather than letting it write a second one', () => {
    expect(PLAN_CASE).toMatch(/p_existing_payment_id: payId/);
  });

  it('refuses a transfer whose amount is not the plan amount, BEFORE booking anything', () => {
    const amountGate = PLAN_CASE.indexOf('different amounts');
    const paymentWrite = PLAN_CASE.indexOf('paymentFromFeedRow');
    expect(amountGate, 'no amount gate at all').toBeGreaterThan(-1);
    expect(paymentWrite).toBeGreaterThan(-1);
    expect(amountGate, 'the payment is written before the amounts are compared')
      .toBeLessThan(paymentWrite);
  });

  it('refuses a plan that is no longer open, and a currency that differs', () => {
    expect(PLAN_CASE).toMatch(/status !== 'planned' && plan\.status !== 'overdue'/);
    expect(PLAN_CASE).toMatch(/currency mismatch/);
  });

  it('refuses an INCOMING plan — money we sent cannot settle money owed to us', () => {
    expect(PLAN_CASE).toMatch(/plan\.direction !== 'out'/);
    expect(PLAN_CASE).toMatch(/\.select\('[^']*\bdirection\b/);
  });

  it('listing candidates proves the row is ours before asking', () => {
    const listCase = EDGE.slice(EDGE.indexOf("case 'plan-candidates'"), EDGE.indexOf("case 'confirm-plan-match'"));
    const gate = listCase.indexOf('loadOutgoingFeedRow');
    const call = listCase.indexOf("rpc('bank_tx_plan_candidates'");
    expect(gate, 'the row is never proved to belong to this workspace').toBeGreaterThan(-1);
    expect(gate, 'the candidates are read before the row is proved ours').toBeLessThan(call);
  });

  it('is scoped to the caller workspace on both sides', () => {
    expect(PLAN_CASE).toMatch(/\.eq\('workspace_id', workspaceId\)/);
    expect(EDGE).toMatch(/\.eq\('workspace_id', workspaceId\)[\s\S]{0,200}maybeSingle/);
  });
});

describe('the two ways to settle an outgoing line are one implementation', () => {
  it('both load the row through the shared preflight', () => {
    expect(BILL_CASE).toMatch(/loadOutgoingFeedRow\(service, workspaceId, rowId\)/);
    expect(PLAN_CASE).toMatch(/loadOutgoingFeedRow\(service, workspaceId, rowId\)/);
  });

  it('which is what keeps the internal-leg guard on both', () => {
    const loader = EDGE.slice(EDGE.indexOf('async function loadOutgoingFeedRow'));
    expect(loader.slice(0, 900)).toMatch(/await assertNotInternalLeg\(service, workspaceId, tx\)/);
    expect(loader.slice(0, 900)).toMatch(/tx\.direction !== 'out'/);
    expect(loader.slice(0, 900)).toMatch(/match_status === 'matched'/);
  });

  it('and both write the payment through one helper, not two inserts', () => {
    expect(BILL_CASE).toMatch(/paymentFromFeedRow\(/);
    expect(PLAN_CASE).toMatch(/paymentFromFeedRow\(/);
    const inserts = EDGE.match(/from\('payments'\)\s*\.insert\(/g) ?? [];
    expect(inserts.length, 'a second hand-rolled payment insert reappeared in revolut-api')
      .toBeLessThanOrEqual(1);
  });

  it('the helper stays idempotent on the provider reference', () => {
    const helper = EDGE.slice(EDGE.indexOf('async function paymentFromFeedRow'));
    expect(helper.slice(0, 1600)).toMatch(/provider_ref: tx\.provider_ref/);
    expect(helper.slice(0, 1600)).toMatch(/duplicate\|unique/);
    expect(helper.slice(0, 1600)).toMatch(/\.eq\('provider_ref', tx\.provider_ref\)/);
  });

  it('and both stamp the feed row through one helper', () => {
    expect(BILL_CASE).toMatch(/markFeedRowMatched\(service, rowId, payId\)/);
    expect(PLAN_CASE).toMatch(/markFeedRowMatched\(service, rowId, payId\)/);
  });
});

describe('what the feed offers', () => {
  it('candidates are derived in SQL — the tab never decides what matches', () => {
    expect(TAB).toMatch(/rpc\('bank_tx_plan_candidates_bulk'/);
    expect(TAB).toMatch(/rpc\('bank_tx_plan_candidates'/);
    expect(TAB, 'the tab filters plans by amount itself, so it can disagree with the server')
      .not.toMatch(/from\('planned_payments'\)/);
  });

  it('several candidates open the picker instead of guessing one', () => {
    expect(TAB).toMatch(/candidates > 1/);
  });

  it('a hint read that FAILED says so rather than showing no hints', () => {
    expect(TAB).toMatch(/hintsFailed/);
    expect(TAB).toMatch(/not a statement that none of them match/);
  });

  it('an empty picker states WHY, rather than reading as "you have no plans"', () => {
    const empty = TAB.slice(TAB.indexOf('No open planned payment is for'));
    expect(empty.slice(0, 400)).toMatch(/45 days/);
    expect(TAB).toMatch(/pickPlans === null/);
  });

  it('a settle replies with what actually happened, including a replay', () => {
    expect(TAB).toMatch(/already_paid/);
  });
});
