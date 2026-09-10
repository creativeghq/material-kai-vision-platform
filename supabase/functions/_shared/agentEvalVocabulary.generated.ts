// GENERATED MIRROR of src/config/agentEvalVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** How a golden-case run FAILED — one closed list, written once. */

export const AGENT_EVAL_FAILURE_CLASSES = [
  /** agent-chat unreachable, a non-2xx, or the stream ended early — infrastructure, not the agent. */
  'transport',
  /** The turn itself reported an error (an `error` chunk or an errored final result). */
  'turn_error',
  /** The reply was empty. */
  'empty_reply',
  /** None of the tools the case names as the source was called. */
  'expected_tool_not_called',
  /** An expected tool was called and failed. */
  'expected_tool_failed',
  /** An expected tool was called and returned nothing. */
  'expected_tool_empty',
  /** A tool the case forbids was called. */
  'forbidden_tool_called',
  /** A fact the reply must contain (`expect_reply_regex`) is missing. */
  'reply_missing_fact',
  /** Text the reply must not contain (`forbid_reply_regex`) is present. */
  'reply_forbidden_text',
  /** The reply hedged (the shared `agent_reply_hedge_pattern`). */
  'hedged',
  /** A factual question was answered wearing the MODE / Confidence framework. */
  'framework_on_factual',
  /** Over the case's `max_seconds`. */
  'too_slow',
  /** Over the case's `max_credits`. */
  'over_budget',
  /** The case itself is malformed (an invalid regex). */
  'invalid_case',
] as const;

export type AgentEvalFailureClass = (typeof AGENT_EVAL_FAILURE_CLASSES)[number];

export const AGENT_EVAL_FAILURE_CLASS_LABELS: Record<AgentEvalFailureClass, string> = {
  transport: 'Could not reach the agent',
  turn_error: 'The turn errored',
  empty_reply: 'Empty reply',
  expected_tool_not_called: 'Expected tool not called',
  expected_tool_failed: 'Expected tool failed',
  expected_tool_empty: 'Expected tool returned nothing',
  forbidden_tool_called: 'Forbidden tool called',
  reply_missing_fact: 'Reply missing a required fact',
  reply_forbidden_text: 'Reply contains forbidden text',
  hedged: 'Reply hedged',
  framework_on_factual: 'Framework on a factual question',
  too_slow: 'Too slow',
  over_budget: 'Over budget',
  invalid_case: 'Case is malformed',
};

/**
 * The classes that say nothing about the agent: they are the harness, the network or the case.
 * A batch summary reports them SEPARATELY from agent failures, so a quota spike is not read as a
 * regression.
 */
export const AGENT_EVAL_HARNESS_CLASSES: readonly AgentEvalFailureClass[] = ['transport', 'invalid_case'];

/** Fewer repeats than this and a difference between two batches has no noise floor under it. */
export const AGENT_EVAL_MIN_REPEATS = 5;
