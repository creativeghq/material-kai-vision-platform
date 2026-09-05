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
  // A tool that answers `{count: N, top: [...]}` has said exactly how many rows it found — every
  // SEO tool does, 18 of them — and was logged "not countable" regardless. In conversation
  // 9225f61f (2026-09-05) `seo_ranked_keywords` returned two rows and `agent_tool_call_logs`
  // stored `has_results:false, result_count:null`, so the zero-result probes and the memory gate
  // could not tell an empty index from a full one. Arrays still win when present; a declared
  // count fills in only where nothing else was countable.
  if (total === null) {
    const declared = (parsed as Record<string, unknown> | null | undefined)?.count;
    if (typeof declared === 'number' && Number.isFinite(declared) && declared >= 0) total = declared;
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

/**
 * Turn an upstream API's error body into something a reader can act on.
 *
 * Nine tool files each carried `String(parsed).slice(0, 200)`, where `parsed` is the JSON-PARSED
 * response body — so `String({error: 'Thread not found'})` produced the literal string
 * `[object Object]`. That was the entire error the agent received, and the entire error the user
 * saw: no status, no message, nothing to act on. The 2026-08-26 tool sweep found it live on
 * `manage_inbox`, `manage_contracts`, `manage_job_sites`, `list_my_job_searches`,
 * `get_price_summary`, `seo_domain_intersection` and `seo_onpage_issues` — seven tools whose
 * every failure was indistinguishable from every other failure.
 *
 * A wrong error message is worse than a missing one: it looks like the tool reported something.
 *
 * Prefers the fields upstreams actually use, falls back to compact JSON, and never returns the
 * default `Object.prototype.toString` rendering.
 */
export function describeUpstreamError(status: number, parsed: unknown, max = 300): string {
  const prefix = status ? `${status}: ` : '';
  if (parsed == null) return `${prefix}no response body`;
  if (typeof parsed === 'string') return `${prefix}${parsed.slice(0, max)}`;
  if (typeof parsed !== 'object') return `${prefix}${String(parsed).slice(0, max)}`;

  const o = parsed as Record<string, unknown>;
  // The shapes real upstreams send, in the order they are worth reading.
  for (const key of ['error', 'message', 'detail', 'error_description', 'msg', 'hint']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim()) return `${prefix}${v.slice(0, max)}`;
    // PostgREST nests: { error: { message } }
    if (v && typeof v === 'object') {
      const nested = (v as Record<string, unknown>).message;
      if (typeof nested === 'string' && nested.trim()) return `${prefix}${nested.slice(0, max)}`;
    }
  }
  try {
    return `${prefix}${JSON.stringify(o).slice(0, max)}`;
  } catch {
    return `${prefix}unreadable error body`;
  }
}
