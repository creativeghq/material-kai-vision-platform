/**
 * Guard: the knowledge search skips corpora that are empty — and only ever for that reason.
 *
 * THE MEASUREMENT
 * ---------------
 * MIVAA's knowledge-base endpoint runs one vector-search branch per requested `search_type`,
 * whether or not the table behind it holds a row. Live, 2026-08-23, identical query returning the
 * identical 6 results:
 *
 *   search_types=["kb_docs"]                      →  4.1s
 *   search_types=["kb_docs","chunks","products"]  → 17.2s
 *
 * `document_chunks` and `products` are both at 0 rows on this platform, so thirteen of those
 * fifteen seconds bought nothing. Every knowledge lookup — and since automatic grounding, that is
 * every substantive turn — paid it.
 *
 * Worth recording how it was found: the re-ranker was the obvious suspect and was innocent. It is
 * a single Haiku reorder that never drops a result. An earlier comment in knowledge-grounding.ts
 * confidently pointed at it, which is exactly the wrong optimisation, and the only thing that
 * corrected it was measuring the two calls side by side.
 *
 * THE RISK THIS PINS
 * ------------------
 * A "skip the empty ones" optimisation has one dangerous failure mode: a probe that errors and is
 * read as "empty". That converts a transient database hiccup into "this workspace has no
 * documents" — silently, with a latency improvement as cover. So the probe must FAIL OPEN
 * (assume non-empty), and the skip must be driven by nothing except emptiness.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'supabase/functions/_shared/tools/search-tools.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

const probe = SRC.slice(SRC.indexOf('async function nonEmptyCorpora'), SRC.indexOf('async function rerankMivaaPayload'));

describe('empty-corpus skip', () => {
  it('the search sends the LIVE corpora, not whatever was requested', () => {
    expect(SRC).toMatch(/search_types:\s*liveTypes/);
    expect(SRC).not.toMatch(/search_types:\s*searchTypes/);
  });

  it('asks "is there anything" with limit(1), not an exact count', () => {
    // An exact count over a large catalogue is the expensive way to ask a yes/no question — and
    // this runs on the hot path of every turn.
    expect(probe).toMatch(/\.limit\(1\)/);
    expect(probe).not.toMatch(/count:\s*'exact'/);
  });

  it('fails OPEN — a probe error counts as non-empty', () => {
    // The whole safety property. If this inverts, a database blip becomes "you have no
    // documents", delivered faster than before and with nothing raised.
    expect(probe).toMatch(/if\s*\(error\s*\|\|/);
    expect(probe).toMatch(/catch\s*\{\s*nonEmpty\.add\(type\);\s*\}/);
  });

  it('never runs a query when every requested corpus is empty', () => {
    // Not merely faster: there is no question to ask. It reuses describeEmptyResult so the agent
    // gets the same account of an empty workspace however it got there.
    expect(SRC).toMatch(/liveTypes\.length === 0/);
    const branch = SRC.slice(SRC.indexOf('liveTypes.length === 0'), SRC.indexOf('const body: Record'));
    expect(branch).toContain('describeEmptyResult');
  });

  it('caches the answer briefly, so first ingestion is visible in a minute not a session', () => {
    // A long TTL would pin "empty" for the isolate's whole life — a user ingests their first
    // document and search keeps telling them they have none.
    const ttl = probe.match(/CORPUS_TTL_MS/) ? SRC.match(/const CORPUS_TTL_MS = ([\d_]+)/) : null;
    expect(ttl, 'no CORPUS_TTL_MS found').toBeTruthy();
    expect(Number(ttl![1].replace(/_/g, ''))).toBeLessThanOrEqual(300_000);
  });

  it('skips on emptiness alone — never on the query, the agent or the caller', () => {
    // The skip must be a fact about the DATA. Anything else is a heuristic deciding what not to
    // search, which is how a search silently stops covering things.
    expect(probe).not.toMatch(/\bquery\b/);
    expect(probe).not.toMatch(/\bagentId\b|\bcaller\b|isAdmin/);
  });
});
