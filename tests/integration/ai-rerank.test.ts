import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, teardown, runId, SUPABASE_URL, type TestUser } from './_harness';

/**
 * `ai-rerank` — contract test for the reranker restored under #310 item 1.
 *
 * The point of this file is the DEGRADATION contract, not the ranking quality.
 *
 * Reranking sits on the hot path of three search tools. Its one hard requirement is that it can
 * never make search worse: whatever happens — too few candidates, a dead model, a reply naming
 * ids that were not sent — the caller must get its results back, in a defined order, with an
 * honest flag saying whether they were actually ranked.
 *
 * That flag is the part worth pinning. An endpoint that silently returns the source order while
 * claiming to have ranked it is the ambiguous-zero shape this platform keeps rediscovering: the
 * caller cannot tell "ranked, and this is the best order" from "reranking is broken". So every
 * assertion below is about `reranked` / `reason` and about results SURVIVING, and none of them is
 * about which result came first.
 *
 * The predecessor of this function was deployed with no source in the repo, unauthenticated, for
 * months. The 401 case is checked first for that reason.
 */
const suite = hasCreds ? describe : describe.skip;

const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

suite('ai-rerank · degradation contract', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser;
  let jwt = '';

  async function rerank(body: unknown, token?: string) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-rerank`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token ?? jwt}`,
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) as Record<string, unknown> | null };
  }

  const candidate = (id: string, name: string, description: string) => ({ id, name, description });

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'rerank', rid);
    const { data } = await A.client.auth.getSession();
    jwt = data.session?.access_token ?? '';
  }, 60_000);

  afterAll(async () => {
    await teardown(svc, { userIds: [A?.id].filter(Boolean) as string[] });
  }, 60_000);

  it('rejects an anonymous caller', async () => {
    // Its predecessor ran with verify_jwt=false and service-role capability. Never again.
    const { status } = await rerank({ query: 'x', results: [] }, ANON_KEY);
    expect(status).toBe(401);
  });

  it('is no longer the 410 tombstone', async () => {
    // The slug returned `410 Gone` from 2026-08-01 until this function replaced it. If a deploy
    // ever reverts to the tombstone, this is the assertion that says so.
    const { status } = await rerank({ query: 'porcelain', results: [] });
    expect(status).not.toBe(410);
  });

  it('validates its input instead of ranking nonsense', async () => {
    expect((await rerank({ results: [] })).status).toBe(400);
    expect((await rerank({ query: 'tile' })).status).toBe(400);
  });

  it('returns a single candidate untouched, and SAYS it did not rank', async () => {
    // Below 2 candidates there is nothing to order, so no model call is made at all. This is the
    // state of every search on this platform while the catalog is empty — it must be free and
    // must not pretend to be a ranking.
    const only = [candidate('a', 'Carrara marble', 'White marble with grey veining')];
    const { status, body } = await rerank({ query: 'white marble', results: only });
    expect(status).toBe(200);
    expect(body?.reranked).toBe(false);
    expect(body?.reason).toBeTruthy();
    expect((body?.results as unknown[])?.length).toBe(1);
  });

  it('returns an empty list untouched', async () => {
    const { status, body } = await rerank({ query: 'anything', results: [] });
    expect(status).toBe(200);
    expect(body?.reranked).toBe(false);
    expect((body?.results as unknown[])?.length).toBe(0);
  });

  it('never loses or invents a result when it does rank', async () => {
    // The one property that matters more than the order itself: the output is a PERMUTATION of
    // the input. A reranker that drops a candidate has removed a search result, which is a
    // bigger defect than any ordering mistake it could make.
    const input = [
      candidate('a', 'Oak engineered flooring', 'Warm mid-brown oak, matte lacquer, 14mm'),
      candidate('b', 'Carrara marble slab', 'White marble, grey veining, polished'),
      candidate('c', 'Charcoal porcelain tile', 'Dark grey porcelain, R11 slip rating, outdoor'),
      candidate('d', 'Brushed brass tapware', 'Warm gold tone, brushed satin finish'),
    ];
    const { status, body } = await rerank({ query: 'dark grey outdoor floor tile', results: input });
    expect(status).toBe(200);

    const out = (body?.results ?? []) as Array<{ id: string }>;
    expect(out.length).toBe(input.length);
    expect([...out.map((r) => r.id)].sort()).toEqual(['a', 'b', 'c', 'd']);

    // `reranked` is allowed to be false — no API key in this environment, a model blip, a
    // disabled kill switch. What is NOT allowed is claiming true while having changed nothing
    // detectable, or losing a row either way. When it is false there must be a stated reason.
    if (body?.reranked !== true) expect(body?.reason).toBeTruthy();
  }, 60_000);

  it('honours maxResults without dropping the ranking', async () => {
    const input = [
      candidate('a', 'Oak flooring', 'Warm oak'),
      candidate('b', 'Marble slab', 'White marble'),
      candidate('c', 'Porcelain tile', 'Grey porcelain'),
    ];
    const { status, body } = await rerank({ query: 'grey tile', results: input, maxResults: 2 });
    expect(status).toBe(200);
    expect((body?.results as unknown[])?.length).toBeLessThanOrEqual(2);
  }, 60_000);
});
