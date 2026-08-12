/**
 * ai-rerank — reorder search results by relevance to a query.
 *
 * THIS SLUG MUST KEEP ITS SOURCE IN THE REPO
 * ------------------------------------------
 * It was once deployed with no source here — unreadable, unreviewable, service-role capable and
 * reachable unauthenticated — and the body could not be recovered afterwards, because
 * `get_edge_function` only ever returns the CURRENT version. This implementation exists in the
 * repo, is covered by `npm run typecheck:edge`, and requires a JWT. Keep it that way.
 *
 * The ranking itself lives in `_shared/rerank.ts`, which is what the three in-agent search paths
 * (material_search, visual_search, knowledge_base_search) call directly — they already hold the
 * candidates, so making them round-trip through HTTP to reorder their own list would add a
 * network hop and a second failure mode to something that must never break search. This function
 * is the entry point for callers that are NOT inside the agent runtime.
 */
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { rerankResults, RERANK_MODEL, type RerankCandidate } from '../_shared/rerank.ts';

interface SearchResult {
  id: string;
  name: string;
  description?: string;
  category?: string;
  relevanceScore?: number;
  semanticScore?: number;
  understandingScore?: number;
}

interface ReRankRequest {
  query: string;
  results: SearchResult[];
  maxResults?: number;
  includeExplanations?: boolean;
  model?: string;
  /**
   * Optional, and VERIFIED before it is used — see the call below. Declared here so the check is
   * a membership test rather than a cast: the value decides whose cost line this call lands on.
   */
  workspace_id?: string;
}

Deno.serve(withApiLogging('ai-rerank', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

  // Reranking spends model tokens, so it is never anonymous. The original ran with
  // verify_jwt=false, which is half of why it had to be retired.
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) {
    throw new HttpError(401, auth.error || 'Authentication required');
  }

  let body: ReRankRequest;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON body');
  }

  const query = typeof body?.query === 'string' ? body.query : '';
  const results = Array.isArray(body?.results) ? body.results : null;
  if (!query.trim()) throw new HttpError(400, '`query` is required');
  if (!results) throw new HttpError(400, '`results` must be an array');
  // 200 is far above the 40 the ranker actually considers; this is a request-size guard, not a
  // ranking parameter.
  if (results.length > 200) throw new HttpError(400, '`results` is limited to 200 items');

  const claimedWorkspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : null;
  const billedWorkspaceId = await userCanAccessWorkspace(auth.supabase, auth.userId, claimedWorkspaceId)
    ? claimedWorkspaceId ?? undefined
    : undefined;

  const outcome = await rerankResults<SearchResult>(
    query,
    results,
    (r): RerankCandidate => ({
      id: String(r.id),
      name: String(r.name ?? ''),
      description: r.description,
      category: r.category,
      relevanceScore: r.relevanceScore,
      semanticScore: r.semanticScore,
      understandingScore: r.understandingScore,
    }),
    {
      // The prompt lives in `prompts` so it stays editable at /admin/ai-configs.
      supabase: auth.supabase,
      maxResults: body.maxResults,
      includeExplanations: body.includeExplanations === true,
      model: body.model || RERANK_MODEL,
      task: 'ai_rerank_endpoint',
      // 473 rerank rows reached `ai_usage_logs` owned by nobody. The user is known here and always
      // was; the workspace is optional because a rerank is a search, and a search does not require
      // one — so it is taken from the body only after VERIFYING membership, never on the caller's
      // word (CLAUDE.md invariant 1). Unverified, it stays null: no attribution beats wrong
      // attribution, which is a cost line pointing at a tenant that did not spend it.
      userId: auth.userId,
      workspaceId: billedWorkspaceId,
    },
  );

  // `reranked` is reported rather than implied. A caller that silently accepts the source order
  // as "ranked" is exactly the ambiguous-zero shape this platform keeps tripping over.
  return new Response(
    JSON.stringify({
      results: outcome.items,
      reranked: outcome.reranked,
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      ...(outcome.explanations ? { explanations: outcome.explanations } : {}),
      model: body.model || RERANK_MODEL,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
