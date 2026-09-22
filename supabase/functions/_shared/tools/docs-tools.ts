/** Docs module agent tools: search_workspace_docs, manage_docs, document_templates. */

import { emitFlowEvent, emitFlowEventToWorkspaceRoles } from '../flow-events.ts';

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
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
          /** The doc has to be in THIS workspace (#395). */
          const { data: target } = await supabase.from('workspace_docs')
            .select('id').eq('id', String(doc_id)).eq('workspace_id', workspaceId).maybeSingle();
          if (!target) return JSON.stringify({ success: false, error: 'That doc was not found in this workspace.' });
          const { error } = await supabase.from('workspace_doc_suggestions').insert({
            workspace_id: workspaceId, doc_id: String(doc_id), proposer_user_id: userId,
            proposed_content_markdown: String(proposed_content), rationale: reason ? String(reason) : null,
          });
          if (error) return JSON.stringify({ success: false, error: error.message });
          // Notify the doc owner (skip if they are the proposer) — the seeded doc_suggestion flow delivers it.
          try {
            const { data: d } = await supabase.from('workspace_docs')
              .select('title, created_by').eq('id', doc_id).eq('workspace_id', workspaceId).maybeSingle();
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

export const TEMPLATE_CATEGORY_SLUG = 'audits-templates';
const TEMPLATE_BODY_LIMIT = 40000;

const placeholdersIn = (body: string): string[] => {
  const seen = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([^}\n]+?)\s*\}\}/g)) if (m[1]) seen.add(m[1]);
  return [...seen];
};

type TemplateCategory =
  | { ok: true; id: string; name: string }
  | { ok: false; payload: Record<string, unknown> };

const resolveTemplateCategory = async (workspaceId: string): Promise<TemplateCategory> => {
  const bySlug = await supabase.from('kb_categories')
    .select('id, name').eq('workspace_id', workspaceId).eq('slug', TEMPLATE_CATEGORY_SLUG).maybeSingle();
  if (bySlug.error) return { ok: false, payload: { found: false, status: 'lookup_failed', error: bySlug.error.message } };
  if (bySlug.data) return { ok: true, id: bySlug.data.id, name: bySlug.data.name };

  const byName = await supabase.from('kb_categories')
    .select('id, name').eq('workspace_id', workspaceId).ilike('name', 'audits%templates%').limit(1).maybeSingle();
  if (byName.data) return { ok: true, id: byName.data.id, name: byName.data.name };

  return {
    ok: false,
    payload: {
      found: false,
      status: 'category_missing',
      message: 'This workspace has no "Audits & Templates" knowledge-base category, so it keeps no document templates. '
        + 'An admin creates it at /admin → Knowledge Base → Categories. Tell the user that; do not invent a template.',
    },
  };
};

export const createDocumentTemplatesTool = (workspaceId: string, onChunk?: (c: any) => void) => {
  return tool(
    async ({ action = 'list', template_id }: { action?: 'list' | 'read'; template_id?: string }) => {
      try {
        const cat = await resolveTemplateCategory(workspaceId);
        if (!cat.ok) {
          onChunk?.({ type: 'document_templates_list', templates: [], note: cat.payload.message, timestamp: Date.now() });
          return JSON.stringify(cat.payload);
        }

        if (action === 'read') {
          if (!template_id) {
            return JSON.stringify({ found: false, status: 'bad_request', error: 'read needs template_id — call list first.' });
          }
          const { data, error } = await supabase.from('kb_docs')
            .select('id, title, summary, content_markdown, content, updated_at')
            .eq('id', String(template_id)).eq('workspace_id', workspaceId).eq('category_id', cat.id)
            .maybeSingle();
          if (error) return JSON.stringify({ found: false, status: 'lookup_failed', error: error.message });
          if (!data) {
            return JSON.stringify({
              found: false, status: 'not_a_template',
              error: `No template with that id in ${cat.name}. Call action="list" to see what is filed there.`,
            });
          }
          const full = String(data.content_markdown || data.content || '');
          const fields = placeholdersIn(full);
          return JSON.stringify({
            found: true,
            status: 'ok',
            template: { id: data.id, title: data.title, summary: data.summary || null, body: full.slice(0, TEMPLATE_BODY_LIMIT) },
            truncated: full.length > TEMPLATE_BODY_LIMIT
              ? `Body cut at ${TEMPLATE_BODY_LIMIT} of ${full.length} characters — say so rather than filling in the missing part.`
              : null,
            fields_to_fill: fields,
            how_to_use: (fields.length
              ? 'Fill EVERY name in fields_to_fill and leave no {{placeholder}} in the finished text. '
              : 'This template carries no {{placeholders}} — follow its own headings and instructions. ')
              + 'Look each value up with the tools you have; ask the user only for what nothing can answer, and never invent a figure or a date. '
              + 'Then save the finished document with manage_docs action="create" — this tool does not write anything itself.',
          });
        }

        const { data, error } = await supabase.from('kb_docs')
          .select('id, title, summary, updated_at')
          .eq('workspace_id', workspaceId).eq('category_id', cat.id).eq('status', 'published')
          .order('title', { ascending: true });
        if (error) {
          onChunk?.({ type: 'document_templates_list', templates: [], note: `Could not read ${cat.name}: ${error.message}`, timestamp: Date.now() });
          return JSON.stringify({ found: false, status: 'lookup_failed', error: error.message });
        }

        const rows = data ?? [];
        const templates = rows.map((r) => ({ template_id: r.id, title: r.title, summary: r.summary || null, updated_at: r.updated_at }));
        if (rows.length === 0) {
          const message = `"${cat.name}" exists but holds no published template yet, so there is nothing to generate from. `
            + 'Templates are filed there at Admin → Knowledge Base. Say that; do not write one from memory and call it ours.';
          onChunk?.({ type: 'document_templates_list', category: cat.name, templates, note: message, timestamp: Date.now() });
          return JSON.stringify({ found: false, status: 'no_templates', category: cat.name, message });
        }
        onChunk?.({ type: 'document_templates_list', category: cat.name, templates, timestamp: Date.now() });
        return JSON.stringify({
          found: true, status: 'ok', category: cat.name, templates,
          next: 'Call action="read" with the template_id to get the full body and the list of fields to fill.',
        });
      } catch (e) {
        return JSON.stringify({ found: false, status: 'failed', error: e instanceof Error ? e.message : 'document_templates failed' });
      }
    },
    {
      name: 'document_templates',
      description:
        'The blank document templates and audit checklists this workspace keeps, in the "Audits & Templates" knowledge-base category. '
        + 'Use this whenever the user asks for a document we have a template for — an audit, a checklist, a report, a standard form — '
        + 'instead of writing one from memory. list → what templates exist. read → ONE template whole, plus the fields it asks you to fill '
        + '(knowledge_base_search returns ranked excerpts, which is the wrong shape for a form you have to complete end to end). '
        + 'Fill it in, then save the result with manage_docs action="create". If the category is missing or empty, say so — never pass off an invented template as ours.',
      schema: z.object({
        action: z.enum(['list', 'read']).default('list').describe('list: what templates exist. read: fetch one whole to fill in.'),
        template_id: z.string().optional().describe('read: the template_id from a list result.'),
      }),
    },
  );
};
