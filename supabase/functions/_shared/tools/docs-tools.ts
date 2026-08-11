/**
 * Docs module agent tool: search_workspace_docs.
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

import { emitFlowEvent, emitFlowEventToWorkspaceRoles } from '../flow-events.ts';

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
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

/**
 * Docs authoring (capability-fabric parity): create a workspace doc or propose an edit
 * from chat — the page-only authoring surface, now reachable by the agent. workspaceId is
 * SERVER-DERIVED (never model/body), userId is the authenticated caller, stamped as author/proposer.
 */
export const createManageDocsTool = (userId: string, workspaceId: string, onChunk?: (c: any) => void) => {
  return tool(
    async ({ action, title, content, category, tags, status, doc_id, proposed_content, reason }: any) => {
      try {
        if (action === 'create') {
          if (!title || !content) return JSON.stringify({ success: false, error: 'create needs title and content.' });
          const st = status === 'draft' ? 'draft' : 'published';
          const { data, error } = await supabase.from('workspace_docs').insert({
            workspace_id: workspaceId,
            title: String(title),
            content_markdown: String(content),
            category: category ? String(category) : null,
            tags: Array.isArray(tags) ? tags.map(String) : [],
            status: st,
            created_by: userId,
            updated_by: userId,
          }).select('id, title, status').single();
          if (error) return JSON.stringify({ success: false, error: error.message });
          // Mirror the page path: a freshly-published doc notifies owners/admins via the seeded flow.
          if (st === 'published') {
            try {
              await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'document_published', (uid: string) => ({
                type: 'document_published', workspace_id: workspaceId, user_id: uid,
                doc_id: data.id, doc_title: data.title,
                title: `Document published: ${data.title}`,
                body: `"${data.title}" was published in your workspace docs.`,
                action_url: `/docs?doc=${data.id}`,
              }));
            } catch { /* best-effort */ }
          }
          onChunk?.({ type: 'doc_saved', doc_id: data.id, title: data.title, status: data.status, timestamp: Date.now() });
          return JSON.stringify({ success: true, doc: data, message: `Doc "${data.title}" ${st === 'published' ? 'published' : 'saved as draft'}.` });
        }

        if (action === 'suggest_edit') {
          if (!doc_id || !proposed_content) return JSON.stringify({ success: false, error: 'suggest_edit needs doc_id and proposed_content.' });
          const { error } = await supabase.from('workspace_doc_suggestions').insert({
            workspace_id: workspaceId, doc_id: String(doc_id), proposer_user_id: userId,
            proposed_content_markdown: String(proposed_content), rationale: reason ? String(reason) : null,
          });
          if (error) return JSON.stringify({ success: false, error: error.message });
          // Notify the doc owner (skip if they are the proposer) — the seeded doc_suggestion flow delivers it.
          try {
            const { data: d } = await supabase.from('workspace_docs').select('title, created_by').eq('id', doc_id).maybeSingle();
            const ownerId = (d as any)?.created_by ?? null;
            if (ownerId && ownerId !== userId) {
              await emitFlowEvent('doc_suggestion_submitted', {
                user_id: ownerId, type: 'doc_suggestion_submitted', workspace_id: workspaceId,
                doc_id: String(doc_id), doc_title: (d as any)?.title ?? null, proposer_user_id: userId,
                rationale: reason ?? null,
                title: `Edit proposed${(d as any)?.title ? `: ${(d as any).title}` : ''}`,
                body: 'A member proposed an edit via the assistant.',
                action_url: `/docs?doc=${doc_id}`,
              });
            }
          } catch { /* best-effort */ }
          onChunk?.({ type: 'doc_suggestion_submitted', doc_id, timestamp: Date.now() });
          return JSON.stringify({ success: true, message: 'Edit suggestion submitted for the doc owner to review.' });
        }

        return JSON.stringify({ success: false, error: `unknown action: ${action}` });
      } catch (e) {
        return JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'manage_docs failed' });
      }
    },
    {
      name: 'manage_docs',
      description:
        "Author this workspace's internal documentation. create → write a new doc (published by default; "
        + 'set status="draft" to keep it private). suggest_edit → propose a revision to an existing doc '
        + '(doc_id + proposed_content) for the owner to accept/reject. Use search_workspace_docs first to '
        + 'find the doc_id. These write to the same docs the team edits on the Docs page.',
      schema: z.object({
        action: z.enum(['create', 'suggest_edit']),
        title: z.string().optional().describe('create: the document title.'),
        content: z.string().optional().describe('create: the markdown body.'),
        category: z.string().optional().describe('create: optional category.'),
        tags: z.array(z.string()).optional().describe('create: optional tags.'),
        status: z.enum(['published', 'draft']).optional().describe('create: default published.'),
        doc_id: z.string().optional().describe('suggest_edit: the doc UUID to revise.'),
        proposed_content: z.string().optional().describe('suggest_edit: the full proposed markdown.'),
        reason: z.string().optional().describe('suggest_edit: why (optional).'),
      }),
    },
  );
};
