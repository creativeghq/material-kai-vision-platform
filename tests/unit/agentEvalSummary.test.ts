/**
 * Guard: a batch of golden-case runs is read the way a comparison stays honest.
 *
 * Each rule below came from a wrong number somebody published: a pipeline that raised its own
 * average by crashing on the hard cases, eight rate-limited documents that read as an unstable
 * model, a "perfectly stable" branch that was stable because it produced nothing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { summarizeBatch, summarizeCase, toolSetSignature } from '../../supabase/functions/_shared/agent-eval-summary.ts';
import {
  AGENT_EVAL_FAILURE_CLASSES,
  AGENT_EVAL_FAILURE_CLASS_LABELS,
  AGENT_EVAL_HARNESS_CLASSES,
  AGENT_EVAL_MIN_REPEATS,
} from '../../src/config/agentEvalVocabulary';

const ROOT = join(__dirname, '..', '..');
const EVAL_FN = stripComments(readFileSync(join(ROOT, 'supabase/functions/agent-eval/index.ts'), 'utf8'));

const run = (over: Partial<Parameters<typeof summarizeCase>[1][number]> = {}) => ({
  case_key: 'seo.own_rankings',
  passed: true,
  failure_class: null,
  failure_classes: [],
  tools_called: ['seo_my_rankings'],
  credits: 10,
  latency_ms: 20_000,
  model: 'claude-sonnet-5',
  routed_agent: 'edith',
  reply: 'Your brand ranks #1 for materialshub.',
  ...over,
});
const CASE = { key: 'seo.own_rankings', title: 'Own rankings' };

describe('agent eval summary — the denominator is fixed', () => {
  it('a case with no run in the batch is LISTED with zero attempts, not dropped', () => {
    const s = summarizeBatch('b', [CASE, { key: 'finance.pnl', title: 'P&L' }], [run()]);
    expect(s.cases_active).toBe(2);
    expect(s.cases_run).toBe(1);
    expect(s.cases_missing).toEqual(['finance.pnl']);
    const missing = s.cases.find((c) => c.case_key === 'finance.pnl')!;
    expect(missing.attempts).toBe(0);
    expect(missing.pass_rate).toBeNull(); // unknown, never 0 and never omitted
  });

  it('runs for a case that is no longer active still count — they happened', () => {
    const s = summarizeBatch('b', [], [run({ case_key: 'retired.case' })]);
    expect(s.attempts_total).toBe(1);
    expect(s.cases[0].case_key).toBe('retired.case');
  });

  it('fewer repeats than the minimum is flagged, so a difference between batches is not read as a result', () => {
    const few = summarizeCase(CASE, [run(), run()], AGENT_EVAL_MIN_REPEATS);
    expect(few.enough_repeats).toBe(false);
    const enough = summarizeCase(CASE, Array.from({ length: AGENT_EVAL_MIN_REPEATS }, () => run()), AGENT_EVAL_MIN_REPEATS);
    expect(enough.enough_repeats).toBe(true);
  });
});

describe('agent eval summary — harness failures sit beside agent failures', () => {
  it('a transport failure is counted as a harness failure, not an agent failure', () => {
    const runs = [
      run({ passed: false, failure_class: 'transport', failure_classes: ['transport', 'empty_reply'], reply: '' }),
      run({ passed: false, failure_class: 'hedged', failure_classes: ['hedged'] }),
      run(),
    ];
    const c = summarizeCase(CASE, runs, 1);
    expect(c.harness_failures).toBe(1);
    expect(c.agent_failures).toBe(1);
    expect(c.failure_classes).toEqual({ transport: 1, empty_reply: 1, hedged: 1 });
    const b = summarizeBatch('b', [CASE], runs);
    expect(b.harness_failures_total).toBe(1);
    expect(b.agent_failures_total).toBe(1);
  });

  it('the harness classes are exactly the ones that say nothing about the agent', () => {
    expect([...AGENT_EVAL_HARNESS_CLASSES].sort()).toEqual(['invalid_case', 'transport']);
  });

  it('a run with only a primary class (older rows) is still counted under it', () => {
    const c = summarizeCase(CASE, [run({ passed: false, failure_class: 'too_slow', failure_classes: null })], 1);
    expect(c.failure_classes).toEqual({ too_slow: 1 });
  });
});

describe('agent eval summary — stability without ground truth, read beside completeness', () => {
  it('tool-set agreement is the share of repeats that called the modal SET, order-blind', () => {
    const runs = [
      run({ tools_called: ['a', 'b'] }),
      run({ tools_called: ['b', 'a', 'a'] }),
      run({ tools_called: ['a'] }),
    ];
    const c = summarizeCase(CASE, runs, 1);
    expect(c.tools_agreement).toBeCloseTo(2 / 3, 3);
    expect(c.modal_tools).toEqual(['a', 'b']);
    expect(toolSetSignature(['b', 'a', 'a'])).toBe(toolSetSignature(['a', 'b']));
  });

  it('agreement is unknown with one run — one run has no spread', () => {
    expect(summarizeCase(CASE, [run()], 1).tools_agreement).toBeNull();
  });

  it('a branch that is "stable" because it never answers is exposed by reply completeness', () => {
    const silent = [run({ passed: false, reply: '', tools_called: [], failure_class: 'empty_reply', failure_classes: ['empty_reply'] }),
      run({ passed: false, reply: '', tools_called: [], failure_class: 'empty_reply', failure_classes: ['empty_reply'] })];
    const c = summarizeCase(CASE, silent, 1);
    expect(c.tools_agreement).toBe(1); // perfectly repeatable: empty is always the same empty
    expect(c.reply_completeness).toBe(0); // and this is why agreement is never read alone
  });
});

describe('agent eval — the scorer emits only vocabulary classes, in precedence order', () => {
  it('every class the edge scorer emits is in the vocabulary', () => {
    const emitted = [...EVAL_FN.matchAll(/fail\('([a-z_]+)'/g)].map((m) => m[1]);
    expect(emitted.length).toBeGreaterThan(8);
    for (const cls of emitted) expect(AGENT_EVAL_FAILURE_CLASSES).toContain(cls);
  });

  it('every vocabulary class is emitted somewhere, or by the transport branch, or labelled as deliberately unused', () => {
    const emitted = new Set([...EVAL_FN.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
    for (const cls of AGENT_EVAL_FAILURE_CLASSES) expect(emitted.has(cls)).toBe(true);
  });

  it('the run row carries the primary class AND every class, and the repeat index', () => {
    expect(EVAL_FN).toContain('failure_class: failureClass');
    expect(EVAL_FN).toContain('failure_classes: failureClasses');
    expect(EVAL_FN).toContain('repeat_index: repeatIndex');
  });

  it('a transport failure is classified as transport, never as the agent erroring', () => {
    expect(EVAL_FN).toContain("fail(turn.transport ? 'transport' : 'turn_error'");
    // All three infrastructure exits set the flag.
    expect((EVAL_FN.match(/out\.transport = true/g) ?? []).length).toBe(3);
  });

  it('every class has a label for the future evals page', () => {
    for (const cls of AGENT_EVAL_FAILURE_CLASSES) expect(AGENT_EVAL_FAILURE_CLASS_LABELS[cls]).toBeTruthy();
  });
});
