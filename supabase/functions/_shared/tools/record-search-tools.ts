/**
 * find_records — the agent's cross-entity record lookup.
 *
 * The agent had 171 tools and not one of them answered "find the record called X". Every lookup
 * it owned was either content/material (`material_search`, `visual_search`,
 * `knowledge_base_search`), external (`seo_*`, `web_search`, `company_registry_lookup`), a
 * per-entity lister (`list_my_projects`), or `search_crm_by_kad` — CRM by ACTIVITY CODE, not by
 * name. So "find tsatsos" had nothing to fire.
 *
 * This wraps `public.global_search`, the SAME derivation the ⌘K palette uses (issue: one
 * question, one answer). Adding a searchable record type means adding a CTE there and an entry in
 * `GLOBAL_SEARCH_KINDS` — never a second lookup here.
 *
 * TENANCY — read before changing the client:
 * `global_search` is SECURITY INVOKER **on purpose**: each table's own RLS (`user_can_read_invoice`,
 * `_user_is_active_project_collaborator`, per-creator quote reads, own-rows-only agent chats) is
 * what scopes the answer. Calling it with the SERVICE-ROLE client would bypass every one of those
 * and hand the model rows the human it is acting for cannot see — the exact "service-role client +
 * trust" shape the security invariants exist to prevent. It would ALSO silently return no people
 * at all, because `search_workspace_people` self-guards on `auth.uid()`, which a service-role call
 * does not have.
 *
 * So this tool calls it as the USER, with their JWT, and **fails closed** when there is no JWT
 * (partner `kai_` keys, cron): it returns an explicit error rather than falling back to a client
 * that would answer too much.
 */

// `tool` is typed non-generically ON PURPOSE — see the note in docs-tools.ts. Inferring it pulls
// @langchain/core's generic graph into every module that defines a tool, which is what makes
// agent-chat exceed the edge typecheck memory ceiling.
const { tool } = await import('npm:@langchain/core@1.1.15/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

/**
 * The kinds `global_search` can return. Kept in step with `GLOBAL_SEARCH_KINDS`
 * (src/services/globalSearchService.ts) and the CTE roster in the RPC.
 */
const KINDS = [
  'person', 'company', 'contact', 'deal', 'product', 'project', 'moodboard', 'quote',
  'order', 'invoice', 'property', 'catalog', 'blueprint', 'template', 'email_template',
  'conversation', 'inbox_thread',
] as const;

/** Where each kind opens in the app, so the agent can hand the user a working link. */
const PATHS: Record<string, (id: string) => string> = {
  person: (id) => `/u/${id}`,
  company: (id) => `/crm/companies/${id}`,
  contact: (id) => `/crm/contacts/${id}`,
  deal: (id) => `/crm/deals/${id}`,
  product: (id) => `/discover?product=${id}`,
  project: (id) => `/projects/${id}`,
  moodboard: (id) => `/moodboard/${id}`,
  quote: (id) => `/quotes/${id}`,
  order: (id) => `/finance/orders/${id}`,
  invoice: (id) => `/finance/invoices/${id}`,
  property: (id) => `/properties/${id}`,
  catalog: (id) => `/catalogs/${id}`,
  blueprint: (id) => `/blueprints/${id}`,
  template: (id) => `/templates/${id}`,
  email_template: (id) => `/emails/templates/${id}/edit`,
  conversation: (id) => `/agent-hub?conversation=${id}`,
  inbox_thread: (id) => `/inbox?thread=${id}`,
};

export const createFindRecordsTool = (
  workspaceId: string,
  userJwt?: string,
  onChunk?: (c: any) => void,
) => {
  return tool(
    async ({ query, kinds, limit = 5 }: { query: string; kinds?: string[]; limit?: number }) => {
      try {
        const q = (query ?? '').trim();
        if (q.length < 2) {
          return JSON.stringify({ found: false, error: 'Give me at least two characters to search for.' });
        }
        if (!userJwt) {
          // Fail closed. See the tenancy note at the top of this file.
          return JSON.stringify({
            found: false,
            error: 'Record search needs a signed-in user session and this request has none.',
          });
        }
        if (!workspaceId) {
          return JSON.stringify({ found: false, error: 'No active workspace for the current user.' });
        }

        const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${userJwt}` } },
        });

        const wanted = Array.isArray(kinds) && kinds.length
          ? kinds.filter((k) => (KINDS as readonly string[]).includes(k))
          : null;

        const { data, error } = await sb.rpc('global_search', {
          p_workspace_id: workspaceId,
          p_query: q,
          p_kinds: wanted,
          p_per_kind: Math.min(Math.max(limit, 1), 20),
        });
        if (error) {
          console.error('[find_records] global_search error:', error.message);
          return JSON.stringify({ found: false, error: 'Record search failed.' });
        }

        const rows = ((data ?? []) as any[]).map((r) => ({
          kind: r.kind,
          id: r.id,
          title: r.title,
          subtitle: r.subtitle ?? null,
          badge: r.badge ?? null,
          path: PATHS[r.kind]?.(r.id) ?? null,
        }));

        onChunk?.({ type: 'record_search_results', data: { query: q, count: rows.length, records: rows } });

        if (rows.length === 0) {
          return JSON.stringify({
            found: false,
            records: [],
            note: `Nothing in this workspace matches "${q}". This searches record NAMES and numbers — for material/product content use material_search, and for how-to articles use knowledge_base_search.`,
          });
        }
        return JSON.stringify({
          found: true,
          count: rows.length,
          records: rows,
          note: 'These are records in the user\'s own workspace, already filtered to what they are allowed to see. Each carries a `path` — link to it so the user can open the record.',
        });
      } catch (err) {
        console.error('[find_records] tool error:', err);
        return JSON.stringify({
          found: false,
          error: err instanceof Error ? err.message : 'Record search failed.',
        });
      }
    },
    {
      name: 'find_records',
      description:
        'Find a RECORD in this workspace by its name, title or number — a person or teammate, a CRM company or contact, a deal, product, project, moodboard, quote, order, invoice, property, catalog, blueprint, template, email template, past agent chat or inbox thread. Use this whenever the user names something and wants to find or open it ("find Tsatsos", "open the Botguard company", "where is the kitchen renovation project", "pull up invoice 2024-0113"). Returns each match with a `path` you should link to. This matches NAMES and NUMBERS, not content: use material_search for product/material content, knowledge_base_search for how-to articles, and search_workspace_docs for internal documentation.',
      schema: z.object({
        query: z.string().describe('The name, title or number to look for'),
        kinds: z.array(z.enum(KINDS)).optional()
          .describe('Restrict to these record types. Omit to search everything the user can see.'),
        limit: z.number().default(5).describe('Max results per record type (1-20)'),
      }),
    },
  );
};
