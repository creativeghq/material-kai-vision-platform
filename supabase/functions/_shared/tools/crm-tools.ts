/**
 * CRM Tools for JARVIS — workspace-scoped queries over the CRM roster.
 *
 * search_crm_by_kad: "Which businesses do we have with ΚΑΔ X?" — filters crm_companies by the
 * normalized `kad_codes` array (populated by the ΑΑΔΕ + ΓΕΜΗ enrichment functions). Tenancy is
 * enforced by the server-derived `workspaceId` (never client-supplied), same trust model as the
 * other agent tools; the service-role query is explicitly `.eq('workspace_id', workspaceId)`.
 */
const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// deno-lint-ignore no-explicit-any
type AnyRow = Record<string, any>;

export const createCrmKadSearchTool = (workspaceId: string, onChunk?: (chunk: AnyRow) => void) => {
  return tool(
    async ({ kad, match }: { kad: string; match?: 'exact' | 'prefix' }) => {
      const code = String(kad || '').trim();
      if (!code) return JSON.stringify({ error: 'Provide a ΚΑΔ activity code, e.g. "46.73.10".' });
      const mode = match ?? (code.length <= 2 || code.endsWith('.') ? 'prefix' : 'exact');

      // Pull the workspace's companies that carry any ΚΑΔ, then match in-code. Exact uses the
      // GIN-indexed array contains; prefix scans the (bounded) result and matches by startsWith.
      let rows: AnyRow[] = [];
      if (mode === 'exact') {
        const { data, error } = await supabase
          .from('crm_companies')
          .select('id, name, vat_number, gemi_number, gemi_status, kad_all')
          .eq('workspace_id', workspaceId)
          .contains('kad_codes', [code])
          .limit(200);
        if (error) return JSON.stringify({ error: error.message });
        rows = data ?? [];
      } else {
        const prefix = code.replace(/\.$/, '');
        const { data, error } = await supabase
          .from('crm_companies')
          .select('id, name, vat_number, gemi_number, gemi_status, kad_codes, kad_all')
          .eq('workspace_id', workspaceId)
          .not('kad_codes', 'is', null)
          .limit(1000);
        if (error) return JSON.stringify({ error: error.message });
        rows = (data ?? []).filter((r) =>
          Array.isArray(r.kad_codes) && r.kad_codes.some((c: string) => String(c).startsWith(prefix)));
      }

      const results = rows.map((r) => {
        const matched = Array.isArray(r.kad_all)
          ? r.kad_all
              .filter((e: AnyRow) => (mode === 'exact' ? e.code === code : String(e.code).startsWith(code.replace(/\.$/, ''))))
              .map((e: AnyRow) => ({ code: e.code, description: e.description }))
          : [];
        return {
          company_id: r.id,
          name: r.name,
          vat_number: r.vat_number ?? null,
          gemi_number: r.gemi_number ?? null,
          status: r.gemi_status ?? null,
          matched_kad: matched,
        };
      });

      onChunk?.({ type: 'crm_kad_results', data: { kad: code, match: mode, count: results.length, companies: results } });
      return JSON.stringify({
        kad: code,
        match: mode,
        count: results.length,
        companies: results,
        note: results.length === 0
          ? 'No companies in this workspace carry that ΚΑΔ yet. ΚΑΔ is populated when a company is enriched from ΑΑΔΕ/ΓΕΜΗ.'
          : undefined,
      });
    },
    {
      name: 'search_crm_by_kad',
      description:
        'Find businesses/companies in the current workspace CRM that have a given Greek ΚΑΔ activity code. '
        + 'Use when the user asks things like "which businesses do we have with ΚΑΔ 46.73" or "companies in wholesale of wood". '
        + 'Pass a specific code; a 2-digit sector or a trailing dot is treated as a prefix match. '
        + 'Returns matching companies with their name, VAT, GEMI number, and the matched ΚΑΔ entries.',
      schema: z.object({
        kad: z.string().describe('The ΚΑΔ activity code to search for, e.g. "46.73.10" or sector "46".'),
        match: z.enum(['exact', 'prefix']).optional().describe('Force exact or prefix matching; inferred when omitted.'),
      }),
    },
  );
};
