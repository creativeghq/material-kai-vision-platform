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

/** Call an edge function (or a crm-api REST sub-path) as the USER, so its own auth/scope applies. */
async function callEdge(path: string, body: AnyRow, jwt: string | undefined): Promise<{ ok: boolean; status: number; data?: any; error?: string }> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt || SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : String(parsed)?.slice(0, 200) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

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

/**
 * create_company_from_vat — "add a CRM company from this VAT number". Looks the VAT up on the
 * official registry (ΑΑΔΕ for Greek ΑΦΜ, VIES for other EU) to pull the legal name + address,
 * then creates the company through the validated `crm-api` (workspace-scoped, dedupes, emits
 * crm_company_created) — NOT a raw table write. Runs as the user (JWT) so crm-api's auth applies.
 */
export const createCompanyFromVatTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: AnyRow) => void,
) => {
  return tool(
    async ({ vat_number, country_code }: { vat_number: string; country_code?: string }) => {
      const digits = String(vat_number || '').replace(/[^0-9]/g, '');
      if (!digits) return JSON.stringify({ success: false, error: 'Provide a VAT / ΑΦΜ number.' });
      const cc = (country_code || '').toUpperCase();
      const isGreek = cc === 'EL' || cc === 'GR' || (!cc && digits.length === 9);

      onChunk?.({ type: 'tool_progress', status: `Looking up ${isGreek ? 'ΑΑΔΕ' : 'VIES'} for VAT ${digits}…`, timestamp: Date.now() });

      // Build a company payload from the official registry record.
      const company: AnyRow = { workspace_id: workspaceId, vat_number: digits };
      if (isGreek) {
        const r = await callEdge('myaade-rgwspublic2', { afm: digits, workspace_id: workspaceId }, jwt);
        if (!r.ok || r.data?.ok === false) return JSON.stringify({ success: false, error: r.data?.message || r.error || 'ΑΑΔΕ lookup failed' });
        const b = r.data?.basic_rec || {};
        Object.assign(company, {
          name: b.onomasia || `ΑΦΜ ${digits}`,
          commercial_title: b.commer_title || null,
          street: b.postal_address || null,
          street_number: b.postal_address_no || null,
          postal_code: b.postal_zip_code || null,
          city: b.postal_area_description || null,
          tax_office: b.doy_descr || null,
          country: 'Greece', country_code: 'EL',
        });
      } else {
        if (!cc) return JSON.stringify({ success: false, error: 'For a non-Greek VAT, pass the 2-letter country_code (e.g. DE, IT).' });
        const r = await callEdge('vies-validate', { country_code: cc, vat_number: digits }, jwt);
        if (!r.ok) return JSON.stringify({ success: false, error: r.error || 'VIES lookup failed' });
        const v = r.data || {};
        if (v.valid === false) return JSON.stringify({ success: false, error: `VIES reports VAT ${cc}${digits} is not valid.` });
        Object.assign(company, {
          name: v.legal_name || v.name || `VAT ${cc}${digits}`,
          street: v.address_parsed?.street || null,
          street_number: v.address_parsed?.street_number || null,
          postal_code: v.address_parsed?.postal_code || null,
          city: v.address_parsed?.city || null,
          country_code: cc,
        });
      }

      // Create through crm-api (validation + dedupe + crm_company_created event) as the user.
      const created = await callEdge('crm-api/companies', company, jwt);
      if (!created.ok) return JSON.stringify({ success: false, error: created.error || `crm-api ${created.status}` });
      const row = created.data?.data ?? created.data;

      onChunk?.({ type: 'crm_company_created', data: { company: row, source: isGreek ? 'aade' : 'vies' }, timestamp: Date.now() });
      return JSON.stringify({ success: true, company: row, source: isGreek ? 'aade' : 'vies' });
    },
    {
      name: 'create_company_from_vat',
      description:
        'Add a company to the CRM from a VAT / ΑΦΜ number. Looks it up on the official registry '
        + '(ΑΑΔΕ for Greek ΑΦΜ, VIES for other EU — pass country_code for non-Greek) to pull the legal '
        + 'name + address, then creates the company. Use for "add <VAT> to CRM" / "create a company from ΑΦΜ …".',
      schema: z.object({
        vat_number: z.string().describe('The VAT / ΑΦΜ number (digits; for EU pass country_code separately).'),
        country_code: z.string().optional().describe('2-letter country code for non-Greek EU VAT (DE, IT, FR…). Omit for Greek ΑΦΜ.'),
      }),
    },
  );
};
