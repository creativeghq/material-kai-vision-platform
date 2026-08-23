/**
 * Guard: "did this tool call produce anything" is answered by COUNTING EVERY RESULT ARRAY,
 * not by the first key that happens to be an array.
 *
 * WHAT WENT WRONG
 * ---------------
 * `shapeToolResult` checked candidate keys as an `else if` ladder with `products` ahead of
 * `articles`. `knowledge_base_search` returns four arrays at once and always initialises
 * `products: []` whether or not a product matched — so the ladder stopped on an empty array
 * every time and the `articles` branch beneath it was unreachable code. A KB search that
 * returned five document sections was recorded as `result_count: 0, zero_result: true`.
 *
 * Proved against production before the fix: `system_logs` recorded
 *   "✅ Knowledge base search complete: 5 results in 22.27s"
 * for a query `agent_tool_call_logs` stored as 0 (2026-08-18, workspace ffafc28b).
 *
 * WHY IT MATTERED MORE THAN THE DASHBOARD
 * ---------------------------------------
 * `turnProducedWork()` shares this one derivation — deliberately, that is the module's whole
 * reason to exist. So the memory promotion gate saw a successful, KB-grounded turn as having
 * produced nothing and declined to distil it. The agents could not form long-term memory from
 * the one retrieval path that actually works against this platform's data.
 *
 * A wrong count is a valid number: nothing threw, nothing typechecked wrong, and the telemetry
 * table read as a permanently broken knowledge base. Only a query against MIVAA's own log line
 * disagreed with it. Hence this file.
 */
import { describe, it, expect } from 'vitest';
import {
  shapeToolResult,
  turnProducedWork,
  META_TOOL_NAMES,
} from '../../supabase/functions/_shared/tool-result-shape.ts';

/** The real payload `knowledge_base_search` returns — note `products` is ALWAYS an array. */
function kbSearchPayload(articles: number, products = 0, entities = 0) {
  return JSON.stringify({
    found: articles + products + entities > 0,
    totalResults: articles + products + entities,
    articles: Array.from({ length: articles }, (_, i) => ({ docId: `d${i}`, content: `section ${i}` })),
    products: Array.from({ length: products }, (_, i) => ({ name: `p${i}` })),
    entities: Array.from({ length: entities }, (_, i) => ({ name: `e${i}` })),
  });
}

describe('shapeToolResult: knowledge-base hits are counted', () => {
  it('counts articles even though an empty products array precedes them', () => {
    const shape = shapeToolResult(kbSearchPayload(5));
    expect(shape.resultCount).toBe(5);
    expect(shape.zeroResult).toBe(false);
    expect(shape.summary.has_results).toBe(true);
  });

  it('sums every corpus the KB search returns, including entities', () => {
    // articles + products + entities. Entities were not in the old ladder at all, so a
    // certificate or spec-sheet hit from a PDF was never countable.
    expect(shapeToolResult(kbSearchPayload(3, 2, 4)).resultCount).toBe(9);
  });

  it('still reports a genuinely empty KB search as zero', () => {
    const shape = shapeToolResult(kbSearchPayload(0));
    expect(shape.resultCount).toBe(0);
    expect(shape.zeroResult).toBe(true);
  });

  it('lets a KB-grounded turn count as work, so memory promotion can run', () => {
    // The regression that cost the most: this returned false for every successful KB turn.
    expect(turnProducedWork([{ tool: 'knowledge_base_search', result: kbSearchPayload(5) }])).toBe(true);
    expect(turnProducedWork([{ tool: 'knowledge_base_search', result: kbSearchPayload(0) }])).toBe(false);
  });
});

describe('shapeToolResult: the other tool shapes are unchanged', () => {
  it('counts single-array payloads exactly as before', () => {
    expect(shapeToolResult(JSON.stringify({ results: [1, 2, 3] })).resultCount).toBe(3);
    expect(shapeToolResult(JSON.stringify({ data: [1, 2] })).resultCount).toBe(2);
    expect(shapeToolResult(JSON.stringify({ products: [1] })).resultCount).toBe(1);
    expect(shapeToolResult(JSON.stringify({ matches: [] })).resultCount).toBe(0);
  });

  it('treats an uncountable payload as unknown, never as empty', () => {
    // "Unknown is not empty" — a created record or a generated image is real work.
    const prose = shapeToolResult('the quote PDF is ready');
    expect(prose.resultCount).toBeNull();
    expect(prose.zeroResult).toBe(false);
    const createdPayload = JSON.stringify({ success: true, quote_id: 'q1' });
    const created = shapeToolResult(createdPayload);
    expect(created.resultCount).toBeNull();
    expect(created.zeroResult).toBe(false);
    expect(turnProducedWork([{ tool: 'create_quote', result: createdPayload }])).toBe(true);
  });

  it('honours a payload that reports its own failure', () => {
    const failedPayload = JSON.stringify({ success: false, error: 'Apollo API error: 403' });
    const failed = shapeToolResult(failedPayload);
    expect(failed.ok).toBe(false);
    expect(failed.errorMessage).toBe('Apollo API error: 403');
    expect(turnProducedWork([{ tool: 'company_enrichment', result: failedPayload }])).toBe(false);
  });

  it('never lets a meta-tool alone count as work', () => {
    for (const tool of META_TOOL_NAMES) {
      expect(turnProducedWork([{ tool, result: JSON.stringify({ results: [1, 2] }) }])).toBe(false);
    }
  });
});

describe('shapeToolResult: the ladder cannot come back', () => {
  it('no key shadows another — a later key still contributes when an earlier one is empty', () => {
    // This is the exact defect, stated as an invariant: an empty array earlier in the key
    // list must not stop a populated array later in it from being counted.
    const KEYS = ['results', 'data', 'products', 'matches', 'articles', 'entities'];
    for (let i = 0; i < KEYS.length; i++) {
      const payload: Record<string, unknown[]> = {};
      for (const k of KEYS) payload[k] = [];
      payload[KEYS[i]] = [1, 2];
      expect(
        shapeToolResult(JSON.stringify(payload)).resultCount,
        `${KEYS[i]} was shadowed by an empty array before it`,
      ).toBe(2);
    }
  });
});
