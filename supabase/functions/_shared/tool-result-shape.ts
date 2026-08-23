/**
 * One derivation of "what did this tool call actually produce".
 *
 * Two consumers need the same answer and had two different ones:
 *   - `agent_tool_call_logs` (agent-chat) records `result_count` / `zero_result` / `success`;
 *   - the memory promotion gate needs "did this turn DO anything" to decide whether a turn is
 *     worth distilling at all.
 *
 * The second one was `(finalResult.toolResults?.length ?? 0) > 0` — the COUNT OF CALLS. In
 * conversation 96da9fc8 the agent ran three knowledge_base_search calls that each returned
 * nothing and one no-op `load_toolkit`, replied with a clarifying question, and that expression
 * said `true`. The guard in agent-memory.ts that exists precisely to refuse a clarifying turn
 * stood down, and the distiller promoted the assistant's own invented geography as a durable
 * fact about the user. CLAUDE.md's rule for this shape is "check the world, not the exit code";
 * counting calls is checking the exit code.
 *
 * So: one module, one answer, both callers.
 */

/**
 * Tools whose result is never evidence that the turn accomplished anything for the user.
 * They change what the agent can do next, not what it has done.
 *
 * `request_input` is listed ahead of its implementation (issue #370, Class D) on purpose: it is
 * the one tool whose whole job is to ask a question, so a turn that calls it and nothing else is
 * by definition a turn that produced nothing.
 */
export const META_TOOL_NAMES = new Set(['load_toolkit', 'load_skill', 'request_input']);

export interface ToolResultShape {
  /** False when the payload itself reports failure (`success: false`). */
  ok: boolean;
  /** Rows/items returned, when the payload uses a shape we recognise. `null` = not countable. */
  resultCount: number | null;
  /** Countable AND zero. A `null` count is NOT zero — unknown is not empty. */
  zeroResult: boolean;
  errorMessage: string | null;
  summary: {
    result_count: number | null;
    has_results: boolean;
    top_score: number | null;
    processing_time: number | null;
  };
}

/**
 * Normalise one tool's payload. Accepts the raw string a tool returns or an already-parsed
 * object; unparseable input is reported as "not countable", never as empty.
 */
export function shapeToolResult(raw: unknown): ToolResultShape {
  const shape: ToolResultShape = {
    ok: true,
    resultCount: null,
    zeroResult: false,
    errorMessage: null,
    summary: { result_count: null, has_results: false, top_score: null, processing_time: null },
  };

  let parsed: any;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    // Non-JSON tool result — plenty of tools return prose. Unknown, not empty.
    return shape;
  }

  if (parsed && typeof parsed === 'object' && parsed.success === false) {
    shape.ok = false;
    shape.errorMessage = typeof parsed.error === 'string' ? parsed.error : 'tool reported success:false';
  }

  // Countable shapes. SUMMED, not first-match — and that is the whole point of this block.
  //
  // This used to be an `else if` ladder with `products` ahead of `articles`. Every tool with a
  // single result array was fine; `knowledge_base_search` was not, because it returns FOUR
  // arrays at once (`articles`, `products`, `entities`, plus `totalResults`) and always
  // initialises `products: []` whether or not any product matched. So the `products` branch
  // matched first, on an empty array, on every call — and the `articles` branch below it was
  // unreachable code. A KB search returning five document sections logged `result_count: 0,
  // zero_result: true`.
  //
  // Both consumers were wrong in the same direction, and the second one costs more than the
  // reporting does: `turnProducedWork()` shares this derivation, so the memory promotion gate
  // concluded a successful KB-grounded turn had produced nothing and declined to distil it. The
  // agents could not form long-term memory from the one retrieval path that works.
  //
  // Proved against production: system_logs recorded "Knowledge base search complete: 5 results
  // in 22.27s" for a query agent_tool_call_logs stored as 0 (2026-08-18, workspace ffafc28b).
  //
  // Summing is safe because no tool aliases the same list under two of these keys — verified
  // across supabase/functions/_shared/tools/*.ts, where only the KB search returns more than
  // one of them. `entities` is counted for the first time here: certificate/logo/spec hits from
  // a PDF were never countable at all under the ladder.
  const COUNTABLE_KEYS = ['results', 'data', 'products', 'matches', 'articles', 'entities'] as const;
  let total: number | null = null;
  for (const key of COUNTABLE_KEYS) {
    const arr = (parsed as Record<string, unknown> | null | undefined)?.[key];
    if (Array.isArray(arr)) total = (total ?? 0) + arr.length;
  }
  shape.resultCount = total;

  shape.zeroResult = shape.resultCount === 0;
  shape.summary = {
    result_count: shape.resultCount,
    has_results: shape.resultCount !== null && shape.resultCount > 0,
    top_score: parsed?.results?.[0]?.score ?? null,
    processing_time: parsed?.processing_time ?? null,
  };
  return shape;
}

/**
 * Did this turn actually accomplish something for the user?
 *
 * True when at least one NON-META tool call succeeded and did not come back empty. A tool that
 * returns something uncountable (prose, a generated image, a created record) counts as work —
 * unknown is not empty, and treating it as empty would suppress memory for most successful turns.
 */
export function turnProducedWork(
  toolResults: Array<{ tool?: string; result?: unknown }> | undefined | null,
): boolean {
  if (!toolResults?.length) return false;
  return toolResults.some((tr) => {
    if (!tr || (tr.tool && META_TOOL_NAMES.has(tr.tool))) return false;
    const shape = shapeToolResult(tr.result);
    return shape.ok && !shape.zeroResult;
  });
}
