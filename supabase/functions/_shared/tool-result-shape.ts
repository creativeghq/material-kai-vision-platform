/** One derivation of "what did this tool call actually produce". */

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

/** Turn an upstream API's error body into something a reader can act on. */
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

/** A string cut to `n` chars with an ellipsis; anything else, or empty, is `undefined` (dropped from JSON). */
export const clipText = (v: unknown, n = 300): string | undefined =>
  typeof v === 'string' && v ? (v.length > n ? `${v.slice(0, n)}…` : v) : undefined;

/** The counts a list result carries so the model never reads its sample as the whole set. */
export const shownOf = (rows: readonly unknown[], total: number, noun: string, cap = 15) => {
  const shown = Math.min(rows.length, cap);
  return {
    count: total, shown, total,
    message: total > shown ? `Showing the ${shown} most recent of ${total} ${noun}s.` : `${total} ${noun}${total === 1 ? '' : 's'}.`,
  };
};

/**
 * The ONE shape every tool result takes on its way to the model, whichever of the 100+ toolkits
 * produced it. Cards travel separately, so this changes what the model reads and nothing on screen.
 * A tool that needs more than these limits summarises its own data; it does not raise them.
 */
export const MODEL_RESULT_LIMITS = { rows: 20, text: 1500, depth: 6, budget: 24_000 } as const;

const NEVER_SHAPED = new Set([
  'success', 'error', 'message', 'note', 'status', 'count', 'total', 'shown', 'next_step',
  'guidance', 'truncated', '_untrusted', 'reporting_instruction', 'how_to_read_this',
]);
const SECRET_KEY = /^token$|(^|_)(secret|password|api_key|sign_token|access_token|refresh_token|auth_token)$/i;
const BLOB = /^data:[\w.+-]+\/[\w.+-]+;base64,|^[A-Za-z0-9+/=\r\n]{2000,}$/;
const FENCE = /^([\s\S]*?===== BEGIN UNTRUSTED [^\n]*=====\n)([\s\S]*?)(\n===== END UNTRUSTED [^\n]*=====)$/;

/** Shorten text; an untrusted block is cut INSIDE its markers so it stays fenced (invariant 9). */
function clipForModel(s: string, n: number): string {
  if (s.length <= n) return s;
  const fenced = FENCE.exec(s);
  if (fenced) {
    const room = Math.max(n - fenced[1].length - fenced[3].length, 200);
    return `${fenced[1]}${fenced[2].slice(0, room)}\n[… cut at ${room} of ${fenced[2].length} characters …]${fenced[3]}`;
  }
  return `${s.slice(0, n)}… [cut: ${s.length} characters]`;
}

/** A list of short labels (toolkit ids, tags, names) is cheap and often a menu — it keeps far more than a list of records. */
const rowLimit = (arr: readonly unknown[], lim: { rows: number }) =>
  arr.every((x) => typeof x === 'string' && x.length <= 120) ? Math.max(lim.rows, 200) : lim.rows;

function shapeValue(v: unknown, lim: { rows: number; text: number; depth: number }, depth: number): unknown {
  if (typeof v === 'string') return BLOB.test(v) ? `[binary data, ${v.length} characters, omitted]` : clipForModel(v, lim.text);
  if (v === null || typeof v !== 'object') return v;
  if (depth >= lim.depth) return Array.isArray(v) ? `[list of ${v.length}, nested too deep]` : '[details nested too deep]';
  if (Array.isArray(v) && v.length > 64 && v.every((x) => typeof x === 'number')) return `[vector of ${v.length} numbers omitted]`;
  if (Array.isArray(v)) return v.slice(0, rowLimit(v, lim)).map((x) => shapeValue(x, lim, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (x === undefined || x === '') continue;
    if (SECRET_KEY.test(k)) continue;
    if (NEVER_SHAPED.has(k) && (typeof x !== 'object' || x === null)) { out[k] = x; continue; }
    if (Array.isArray(x) && x.length > rowLimit(x, lim) && !x.every((y) => typeof y === 'number')) out[`${k}_omitted`] = x.length - rowLimit(x, lim);
    out[k] = shapeValue(x, lim, depth + 1);
  }
  return out;
}

/**
 * Shape a raw tool result for the model: lists cut to N with the rest COUNTED, long text clipped,
 * binary/secret fields dropped, nesting bounded; tightened until it fits the budget.
 */
export function shapeForModel(raw: string): string {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return clipForModel(raw, MODEL_RESULT_LIMITS.budget); }
  if (Array.isArray(parsed)) parsed = { items: parsed };
  const passes = [
    { rows: MODEL_RESULT_LIMITS.rows, text: MODEL_RESULT_LIMITS.text, depth: MODEL_RESULT_LIMITS.depth },
    { rows: 10, text: 600, depth: 5 },
    { rows: 5, text: 250, depth: 4 },
  ];
  let text = '';
  for (const lim of passes) {
    text = JSON.stringify(shapeValue(parsed, lim, 0));
    if (text.length <= MODEL_RESULT_LIMITS.budget) return text;
  }
  return JSON.stringify({
    truncated: `This result was too large to read whole (${raw.length} characters). Narrow the request — a filter, fewer items, a shorter period.`,
    partial: text.slice(0, MODEL_RESULT_LIMITS.budget - 400),
  });
}
