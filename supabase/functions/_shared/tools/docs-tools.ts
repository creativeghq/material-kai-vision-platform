/**
 * Docs module (#254) agent tool: search_workspace_docs.
 *
 * Reads the workspace's internal documentation via Postgres full-text search
 * (search_workspace_docs_fts RPC) — NO embeddings, no vector store, no MIVAA.
 *
 * TENANCY: the sole barrier is that `workspaceId` is SERVER-DERIVED by agent-chat
 * (from workspace_members / the partner key — never from the model or request body),
 * so the agent can only ever be handed its own workspace's id. The RPC's
 * `assert_workspace_member` check is a no-op on this path because a service-role call
 * has no `auth.uid()` — do NOT rely on it here; never pass a caller-influenced
 * workspaceId into this tool.
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const createDocsSearchTool = (workspaceId: string) => {
  return tool(
    async ({ query, topK = 5 }: { query: string; topK?: number }) => {
      try {
        const { data, error } = await supabase.rpc('search_workspace_docs_fts', {
          p_query: query,
          p_workspace_id: workspaceId,
          p_limit: topK,
        });
        if (error) {
          console.error('[docs] search_workspace_docs_fts error:', error.message);
          return JSON.stringify({ found: false, error: 'Docs search failed' });
        }
        const rows = (data ?? []) as Array<{ id: string; title: string; snippet: string; rank: number }>;
        if (rows.length === 0) {
          return JSON.stringify({ found: false, docs: [] });
        }
        return JSON.stringify({
          found: true,
          docs: rows.map((r) => ({ id: r.id, title: r.title, excerpt: r.snippet })),
          note: 'These are internal workspace documents. Answer from them and cite the document title.',
        });
      } catch (err) {
        console.error('[docs] search tool error:', err);
        return JSON.stringify({ found: false, error: err instanceof Error ? err.message : 'Docs search failed' });
      }
    },
    {
      name: 'search_workspace_docs',
      description:
        "Search this workspace's INTERNAL documentation (team-authored docs, policies, how-tos). Use this when the user asks about internal processes, company/workspace-specific information, or anything that would be written down internally rather than general knowledge. Returns matching document titles + excerpts; answer from them and cite the document title.",
      schema: z.object({
        query: z.string().describe('What to look for in the internal docs'),
        topK: z.number().default(5).describe('Max documents to return'),
      }),
    },
  );
};
