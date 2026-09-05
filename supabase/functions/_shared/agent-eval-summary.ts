/**
 * A batch of golden-case runs, read the way a comparison stays honest.
 *
 * Pure: no I/O, no Deno APIs, so tests/unit/agentEvalSummary.test.ts can run it on fixtures.
 *
 * The rules it encodes (see docs/agent-evaluation.md, "Reading a batch"):
 *
 *   - The denominator is FIXED: every attempt in the batch counts, and a case that never ran is
 *     listed with zero attempts rather than dropped. A pipeline must not raise its own average
 *     by crashing on the hard cases.
 *   - Harness failures (`transport`, `invalid_case`) are reported BESIDE agent failures, never
 *     folded into them. Eight rate-limited turns out of a hundred read, in aggregate, as a
 *     flaky agent; read apart they are a quota problem.
 *   - Stability is measured without ground truth: `tools_agreement` is the share of a case's
 *     runs that called the modal SET of tools. It says "the same thing happened each time" and
 *     nothing about whether that thing was right — so it is printed next to the pass rate and
 *     the completeness of the reply, never alone. Stability alone rewards silence.
 *   - Fewer than `minRepeats` attempts is flagged: without spread there is no noise floor, and a
 *     difference between two batches is not a result.
 */

import {
  AGENT_EVAL_FAILURE_CLASSES,
  AGENT_EVAL_HARNESS_CLASSES,
  AGENT_EVAL_MIN_REPEATS,
  type AgentEvalFailureClass,
} from './agentEvalVocabulary.generated.ts';

export interface EvalRunRow {
  case_key: string;
  passed: boolean;
  failure_class: string | null;
  failure_classes: string[] | null;
  tools_called: string[] | null;
  credits: number | string | null;
  latency_ms: number | null;
  model: string | null;
  routed_agent: string | null;
  reply?: string | null;
}

export interface EvalCaseRow {
  key: string;
  title: string;
  agent_id?: string;
}

export interface CaseSummary {
  case_key: string;
  title: string;
  attempts: number;
  passed: number;
  /** passed / attempts; null when there were no attempts (unknown, never 0). */
  pass_rate: number | null;
  enough_repeats: boolean;
  /** Runs whose PRIMARY class is a harness class — not the agent's doing. */
  harness_failures: number;
  agent_failures: number;
  /** Every class hit, counted across runs. */
  failure_classes: Partial<Record<AgentEvalFailureClass, number>>;
  /** Share of runs that called the modal tool set. null with fewer than two runs. */
  tools_agreement: number | null;
  modal_tools: string[];
  /** Share of runs whose reply was non-empty. Read beside tools_agreement. */
  reply_completeness: number | null;
  latency_ms_median: number | null;
  credits_mean: number | null;
  models: string[];
  routed_agents: string[];
}

export interface BatchSummary {
  batch_id: string;
  min_repeats: number;
  cases_active: number;
  cases_run: number;
  /** Active cases with no run in this batch. Listed, not dropped. */
  cases_missing: string[];
  attempts_total: number;
  passed_total: number;
  pass_rate: number | null;
  harness_failures_total: number;
  agent_failures_total: number;
  failure_classes: Partial<Record<AgentEvalFailureClass, number>>;
  credits_total: number;
  cases: CaseSummary[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(v: number | null, places = 3): number | null {
  if (v === null) return null;
  const f = 10 ** places;
  return Math.round(v * f) / f;
}

const CLASS_SET = new Set<string>(AGENT_EVAL_FAILURE_CLASSES);
const HARNESS_SET = new Set<string>(AGENT_EVAL_HARNESS_CLASSES);

function isClass(v: string | null | undefined): v is AgentEvalFailureClass {
  return typeof v === 'string' && CLASS_SET.has(v);
}

/** The signature of a tool set: sorted, deduplicated, joined. Order of calls is not identity. */
export function toolSetSignature(tools: string[] | null | undefined): string {
  return [...new Set((tools ?? []).filter((t) => typeof t === 'string' && t))].sort().join('|');
}

export function summarizeCase(c: EvalCaseRow, runs: EvalRunRow[], minRepeats: number): CaseSummary {
  const attempts = runs.length;
  const passed = runs.filter((r) => r.passed).length;
  const classes: Partial<Record<AgentEvalFailureClass, number>> = {};
  let harness = 0;
  for (const r of runs) {
    if (r.passed) continue;
    const primary = r.failure_class;
    if (isClass(primary) && HARNESS_SET.has(primary)) harness += 1;
    const all = Array.isArray(r.failure_classes) && r.failure_classes.length
      ? r.failure_classes
      : (isClass(primary) ? [primary] : []);
    for (const k of all) if (isClass(k)) classes[k] = (classes[k] ?? 0) + 1;
  }

  const signatures = runs.map((r) => toolSetSignature(r.tools_called));
  const counts = new Map<string, number>();
  for (const s of signatures) counts.set(s, (counts.get(s) ?? 0) + 1);
  let modal = '';
  let modalCount = 0;
  for (const [s, n] of counts) if (n > modalCount) { modal = s; modalCount = n; }

  const latencies = runs.map((r) => r.latency_ms).filter((v): v is number => typeof v === 'number');
  const credits = runs.map((r) => (r.credits === null || r.credits === undefined ? null : Number(r.credits)))
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const nonEmpty = runs.filter((r) => typeof r.reply === 'string' && r.reply.trim().length > 0).length;

  return {
    case_key: c.key,
    title: c.title,
    attempts,
    passed,
    pass_rate: attempts ? round(passed / attempts) : null,
    enough_repeats: attempts >= minRepeats,
    harness_failures: harness,
    agent_failures: attempts - passed - harness,
    failure_classes: classes,
    tools_agreement: attempts >= 2 ? round(modalCount / attempts) : null,
    modal_tools: modal ? modal.split('|') : [],
    reply_completeness: attempts && runs.some((r) => 'reply' in r) ? round(nonEmpty / attempts) : null,
    latency_ms_median: median(latencies),
    credits_mean: round(mean(credits), 2),
    models: [...new Set(runs.map((r) => r.model).filter((m): m is string => !!m))],
    routed_agents: [...new Set(runs.map((r) => r.routed_agent).filter((m): m is string => !!m))],
  };
}

export function summarizeBatch(
  batchId: string,
  cases: EvalCaseRow[],
  runs: EvalRunRow[],
  minRepeats: number = AGENT_EVAL_MIN_REPEATS,
): BatchSummary {
  const byCase = new Map<string, EvalRunRow[]>();
  for (const r of runs) {
    const list = byCase.get(r.case_key) ?? [];
    list.push(r);
    byCase.set(r.case_key, list);
  }
  // Runs for a case that is no longer active still count — they happened.
  const known = new Map(cases.map((c) => [c.key, c]));
  for (const key of byCase.keys()) if (!known.has(key)) known.set(key, { key, title: key });

  const summaries = [...known.values()]
    .map((c) => summarizeCase(c, byCase.get(c.key) ?? [], minRepeats))
    .sort((a, b) => a.case_key.localeCompare(b.case_key));

  const totals: Partial<Record<AgentEvalFailureClass, number>> = {};
  for (const s of summaries) {
    for (const [k, n] of Object.entries(s.failure_classes)) {
      totals[k as AgentEvalFailureClass] = (totals[k as AgentEvalFailureClass] ?? 0) + (n ?? 0);
    }
  }
  const attemptsTotal = summaries.reduce((a, s) => a + s.attempts, 0);
  const passedTotal = summaries.reduce((a, s) => a + s.passed, 0);
  const harnessTotal = summaries.reduce((a, s) => a + s.harness_failures, 0);

  return {
    batch_id: batchId,
    min_repeats: minRepeats,
    cases_active: cases.length,
    cases_run: summaries.filter((s) => s.attempts > 0).length,
    cases_missing: cases.filter((c) => !(byCase.get(c.key)?.length)).map((c) => c.key),
    attempts_total: attemptsTotal,
    passed_total: passedTotal,
    pass_rate: attemptsTotal ? round(passedTotal / attemptsTotal) : null,
    harness_failures_total: harnessTotal,
    agent_failures_total: attemptsTotal - passedTotal - harnessTotal,
    failure_classes: totals,
    credits_total: round(runs.reduce((a, r) => a + (Number(r.credits) || 0), 0), 2) ?? 0,
    cases: summaries,
  };
}
