import { describeUpstreamError } from '../tool-result-shape.ts';
import { moduleGate } from './module-gate.ts';
import { attachPartyNames } from './record-labels.ts';
/**
 * CRM Tools for JARVIS — workspace-scoped queries over the CRM roster.
 *
 * search_crm_by_kad: "Which businesses do we have with ΚΑΔ X?" — filters crm_companies by the
 * normalized `kad_codes` array (populated by the ΑΑΔΕ + ΓΕΜΗ enrichment functions). Tenancy is
 * enforced by the server-derived `workspaceId` (never client-supplied), same trust model as the
 * other agent tools; the service-role query is explicitly `.eq('workspace_id', workspaceId)`.
 */
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
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
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
    return { ok: resp.ok, status: resp.status, data: parsed, error: resp.ok ? undefined : describeUpstreamError(resp.status, parsed) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : 'network error' };
  }
}

export const createCrmKadSearchTool = (workspaceId: string, onChunk?: (chunk: AnyRow) => void) => {
  return tool(
    async ({ kad, match }: { kad: string; match?: 'exact' | 'prefix' }) => {
      const denied = await moduleGate(workspaceId, 'crm');
      if (denied) return denied;
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
      const denied = await moduleGate(workspaceId, 'crm');
      if (denied) return denied;
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

/**
 * manage_crm — agent parity for the core CRM spine: create a contact and log an
 * activity/note from chat, the things the page does but the agent previously could not. create_contact
 * routes through crm-api (validation + dedupe + the crm_contact_created event); log_activity writes
 * crm_activities with the caller as actor. workspaceId is SERVER-DERIVED; userId is the caller.
 */
export const createManageCrmTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: AnyRow) => void,
) => {
  return tool(
    async ({ action, name, email, phone, company_name, contact_id, contact_query, kind, title, note }: AnyRow) => {
      const denied = await moduleGate(workspaceId, 'crm');
      if (denied) return denied;
      if (action === 'create_contact') {
        if (!name) return JSON.stringify({ success: false, error: 'create_contact needs a name.' });
        const created = await callEdge('crm-api/contacts', {
          workspace_id: workspaceId, name, email: email || undefined, phone: phone || undefined,
          company_name: company_name || undefined,
        }, jwt);
        if (!created.ok) return JSON.stringify({ success: false, error: created.error || `crm-api ${created.status}` });
        const row = Array.isArray(created.data) ? created.data[0] : (created.data?.data ?? created.data);
        onChunk?.({ type: 'crm_contact_created', data: { company: null, contact: row, source: 'agent' }, timestamp: Date.now() });
        return JSON.stringify({ success: true, contact: row, message: `Created contact "${name}".` });
      }

      if (action === 'log_activity') {
        // Resolve the target contact (by id or fuzzy name), workspace-scoped.
        let target: AnyRow | null = null;
        if (contact_id) {
          const { data } = await supabase.from('crm_contacts').select('id, name').eq('workspace_id', workspaceId).eq('id', contact_id).maybeSingle();
          target = data;
        } else if (contact_query) {
          const { data } = await supabase.from('crm_contacts').select('id, name').eq('workspace_id', workspaceId).ilike('name', `%${contact_query}%`).limit(5);
          if (data && data.length > 1) return JSON.stringify({ success: false, error: `Multiple contacts match "${contact_query}". Ask which one.`, candidates: data });
          target = data?.[0] ?? null;
        }
        if (!target) return JSON.stringify({ success: false, error: 'No matching contact — give contact_id or a more specific contact_query.' });
        const activityType = ['note', 'call', 'email', 'meeting'].includes(String(kind)) ? `${kind}_logged` : 'note_added';
        const { error } = await supabase.from('crm_activities').insert({
          workspace_id: workspaceId, target_kind: 'contact', target_id: target.id,
          activity_type: activityType, title: String(title || `${kind || 'Note'} on ${target.name}`),
          description: note ? String(note) : null, actor_user_id: userId,
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'crm_activity_logged', data: { contact: target.name, kind: activityType }, timestamp: Date.now() });
        return JSON.stringify({ success: true, message: `Logged ${activityType.replace('_', ' ')} on ${target.name}.` });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_crm',
      description:
        'Core CRM actions from chat: create_contact (add a person to the CRM — name required, optional '
        + 'email/phone/company_name) and log_activity (record a note/call/email/meeting against a contact — '
        + 'give contact_id or contact_query + kind + optional title/note). Use for "add John Smith as a '
        + 'contact" / "log that I called Maria about the quote". For adding a COMPANY from a VAT number use '
        + 'create_company_from_vat instead.',
      schema: z.object({
        action: z.enum(['create_contact', 'log_activity']),
        name: z.string().optional().describe('create_contact: the person\'s full name (required).'),
        email: z.string().optional().describe('create_contact: email.'),
        phone: z.string().optional().describe('create_contact: phone.'),
        company_name: z.string().optional().describe('create_contact: their company (optional).'),
        contact_id: z.string().optional().describe('log_activity: the contact UUID.'),
        contact_query: z.string().optional().describe('log_activity: fuzzy contact name to resolve.'),
        kind: z.enum(['note', 'call', 'email', 'meeting']).optional().describe('log_activity: activity kind (default note).'),
        title: z.string().optional().describe('log_activity: short title.'),
        note: z.string().optional().describe('log_activity: the detail/body.'),
      }),
    },
  );
};


/**
 * The deal pipeline for the agent, for EVERY deal type (#311).
 *
 * `manage_real_estate`'s manage_deal action only ever spoke about property deals and hardcoded the
 * real_estate type, so a construction or project deal was invisible to the agent layer entirely.
 * This one resolves the type by name, reads the stage set from the DATA, and refuses a stage the
 * chosen type does not define — the composite FK on (deal_type_id, stage) would reject it anyway,
 * and a named error beats a constraint violation.
 *
 * Uses the caller's JWT so RLS on crm_deals applies: the agent sees exactly the deals the person
 * asking would see on the board, including the property agent-scoping.
 */
export const createManageDealTool = (
  userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: AnyRow) => void,
) => {
  const sb = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt ?? ''}` } },
    auth: { persistSession: false },
  });

  return tool(
    async ({ action, deal_type, deal_id, title, contact_query, value, stage, lost_reason }: AnyRow) => {
      const denied = await moduleGate(workspaceId, 'deals');
      if (denied) return denied;
      const db = sb();

      /** Resolve a deal type by fuzzy label/key, or the workspace default when unspecified. */
      const resolveType = async () => {
        const { data } = await db.from('crm_deal_types')
          .select('id, key, label, subject_kind')
          .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
          .eq('is_active', true).order('sort');
        const all = (data ?? []) as AnyRow[];
        if (!deal_type) return { list: all, hit: all.find((t) => t.key === 'general') ?? all[0] ?? null };
        const q = String(deal_type).toLowerCase();
        return { list: all, hit: all.find((t) => String(t.key).toLowerCase() === q || String(t.label).toLowerCase() === q)
          ?? all.find((t) => String(t.label).toLowerCase().includes(q)) ?? null };
      };

      if (action === 'list') {
        const { data, error } = await db.from('crm_deals')
          .select('id, title, stage, status, value, currency, expected_close_date, company_id, contact_id, project_id, type:crm_deal_types ( label ), contact:crm_contacts!crm_deals_contact_id_fkey ( name )')
          .eq('workspace_id', workspaceId).neq('status', 'lost').order('updated_at', { ascending: false }).limit(50);
        if (error) return JSON.stringify({ success: false, error: error.message });
        // Flattened, because a nested `{type: {label}}` is not a table column: the card's row
        // builder skips non-scalars, so the deal type and the contact were in the payload and on
        // screen nowhere. The ids ride along so each row opens its deal, company and contact.
        const deals = ((data ?? []) as AnyRow[]).map((d) => {
          const { type, contact, ...rest } = d as AnyRow;
          return {
            ...rest,
            deal_type: (type as AnyRow)?.label ?? null,
            contact_name: (contact as AnyRow)?.name ?? null,
          };
        });
        const withNames = await attachPartyNames(db, deals, [
          { idField: 'company_id', nameField: 'company_name' },
        ]);
        onChunk?.({ type: 'crm_deals_list', count: withNames.length, deals: withNames, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: withNames.length, deals: withNames });
      }

      if (action === 'forecast') {
        // Weighted pipeline is DERIVED in SQL; this never multiplies value by probability.
        const { data, error } = await db.rpc('get_deal_forecast', { p_workspace_id: workspaceId, p_deal_type_id: null });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'crm_deal_forecast', rows: data ?? [], timestamp: Date.now() });
        return JSON.stringify({ success: true, forecast: data ?? [] });
      }

      if (action === 'create') {
        if (!contact_query) return JSON.stringify({ success: false, error: 'create needs contact_query — every deal is attached to a party.' });
        const { list, hit: type } = await resolveType();
        if (!type) return JSON.stringify({ success: false, error: `unknown deal type. Available: ${list.map((t: AnyRow) => t.label).join(', ')}` });
        if (type.subject_kind !== 'none') {
          return JSON.stringify({ success: false, error: `"${type.label}" deals must be attached to a ${type.subject_kind} — create it on the pipeline board instead.` });
        }
        const { data: contacts } = await db.from('crm_contacts').select('id, name')
          .eq('workspace_id', workspaceId).ilike('name', `%${contact_query}%`).limit(5);
        if (!contacts?.length) return JSON.stringify({ success: false, error: `no contact matches "${contact_query}"` });
        if (contacts.length > 1) return JSON.stringify({ success: false, error: `Multiple contacts match "${contact_query}". Ask which one.`, candidates: contacts });

        const { data: stages } = await db.from('crm_deal_stages').select('key, label, sort').eq('deal_type_id', type.id).order('sort');
        const first = (stages ?? [])[0];
        if (!first) return JSON.stringify({ success: false, error: `${type.label} has no stages configured.` });

        const { data, error } = await db.from('crm_deals').insert({
          workspace_id: workspaceId, deal_type_id: type.id, contact_id: contacts[0].id,
          stage: first.key, status: 'open', title: title ? String(title).trim() : null,
          value: value != null ? Number(value) : null, currency: 'EUR',
          owner_user_id: userId, created_by: userId,
        }).select('id, title, stage, status, value, currency').single();
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'crm_deal_saved', deal: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, deal: data, message: `Created a ${type.label} deal at "${first.label}".` });
      }

      if (action === 'move' || action === 'lose') {
        if (!deal_id) return JSON.stringify({ success: false, error: `${action} needs a deal_id (call list first).` });
        const { data: existing } = await db.from('crm_deals')
          .select('id, deal_type_id, title').eq('id', deal_id).eq('workspace_id', workspaceId).maybeSingle();
        if (!existing) return JSON.stringify({ success: false, error: 'deal not found' });

        if (action === 'lose') {
          const { data, error } = await db.from('crm_deals')
            .update({ status: 'lost', lost_reason: lost_reason ? String(lost_reason) : null })
            .eq('id', deal_id).select('id, title, status, lost_reason').single();
          if (error) return JSON.stringify({ success: false, error: error.message });
          onChunk?.({ type: 'crm_deal_saved', deal: data, timestamp: Date.now() });
          return JSON.stringify({ success: true, deal: data });
        }

        const { data: stages } = await db.from('crm_deal_stages')
          .select('key, label, is_won, is_lost').eq('deal_type_id', existing.deal_type_id).order('sort');
        const target = (stages ?? []).find((x: AnyRow) => String(x.key).toLowerCase() === String(stage ?? '').toLowerCase()
          || String(x.label).toLowerCase() === String(stage ?? '').toLowerCase());
        if (!target) {
          return JSON.stringify({ success: false, error: `unknown stage "${stage}". This deal's pipeline uses: ${(stages ?? []).map((x: AnyRow) => x.label).join(' → ')}` });
        }
        const { data, error } = await db.from('crm_deals').update({
          stage: target.key,
          ...(target.is_won ? { status: 'won' } : {}),
          ...(target.is_lost ? { status: 'lost' } : {}),
        }).eq('id', deal_id).select('id, title, stage, status').single();
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({ type: 'crm_deal_saved', deal: data, timestamp: Date.now() });
        return JSON.stringify({ success: true, deal: data, message: `Moved to ${target.label}.` });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_deal',
      description:
        'The deal pipeline, for every kind of deal (real estate, project, construction, or a type this '
        + 'workspace defined). list — open deals. forecast — weighted pipeline, already derived. '
        + 'create — a new deal for a contact (needs contact_query; deal_type defaults to General). '
        + 'move — advance a deal to a stage BY NAME (stages differ per deal type; the error lists the '
        + 'valid ones). lose — mark it lost with a reason. Property and project deals are created on '
        + 'the board, because they must be attached to a listing or project.',
      schema: z.object({
        action: z.enum(['list', 'forecast', 'create', 'move', 'lose']).default('list'),
        deal_type: z.string().optional().describe('create: the deal type by name, e.g. "Construction". Defaults to General.'),
        deal_id: z.string().optional().describe('move/lose: the deal UUID from list.'),
        title: z.string().optional().describe('create: what the deal is called.'),
        contact_query: z.string().optional().describe('create: the contact name to attach (required).'),
        value: z.number().optional().describe('create: deal value.'),
        stage: z.string().optional().describe('move: the target stage name. Stages are per deal type.'),
        lost_reason: z.string().optional().describe('lose: why it was lost.'),
      }),
    },
  );
};

/**
 * Enrich an EXISTING CRM company from ΑΑΔΕ (the agent equivalent of the company page's
 * "Fetch from ΑΑΔΕ" button — parity). Resolves the company by id or fuzzy name, then calls
 * myaade-rgwspublic2 with the company_id so the edge does the authoritative write-back (structured
 * columns + 90-day cache). The edge enforces is_workspace_finance_manager on the caller's JWT.
 */
export const createEnrichCompanyFromAadeTool = (
  _userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: AnyRow) => void,
) => {
  return tool(
    async ({ company_id, company_query }: { company_id?: string; company_query?: string }) => {
      const denied = await moduleGate(workspaceId, 'crm');
      if (denied) return denied;
      // Resolve the company (service-role read, explicitly workspace-scoped).
      let q = supabase.from('crm_companies').select('id, name, vat_number, country_code').eq('workspace_id', workspaceId);
      if (company_id) q = q.eq('id', company_id);
      else if (company_query) q = q.ilike('name', `%${company_query}%`);
      else return JSON.stringify({ success: false, error: 'Provide company_id or company_query.' });
      const { data: matches, error } = await q.limit(8);
      if (error) return JSON.stringify({ success: false, error: error.message });
      if (!matches || matches.length === 0) return JSON.stringify({ success: false, error: 'No matching company in this workspace.' });
      if (matches.length > 1) {
        return JSON.stringify({ success: false, error: `Multiple companies match "${company_query}". Ask which one.`, candidates: matches.map((c: AnyRow) => ({ id: c.id, name: c.name, vat: c.vat_number })) });
      }
      const company = matches[0];
      const digits = String(company.vat_number || '').replace(/[^0-9]/g, '');
      const cc = String(company.country_code || '').toUpperCase();
      const isGreek = cc === 'EL' || cc === 'GR' || (!cc && digits.length === 9);
      if (!digits) return JSON.stringify({ success: false, error: `"${company.name}" has no VAT/ΑΦΜ on file to look up.` });
      if (!isGreek) return JSON.stringify({ success: false, error: 'ΑΑΔΕ enrichment is Greek-only. For EU companies use VIES via create/update flows.' });

      onChunk?.({ type: 'tool_progress', status: `Fetching ΑΑΔΕ details for ${company.name}…`, timestamp: Date.now() });
      const r = await callEdge('myaade-rgwspublic2', { afm: digits, workspace_id: workspaceId, company_id: company.id }, jwt);
      if (!r.ok || r.data?.ok === false) return JSON.stringify({ success: false, error: r.data?.message || r.error || 'ΑΑΔΕ lookup failed (are your workspace ΑΑΔΕ codes configured, and are you a finance manager?).' });
      const b = r.data?.basic_rec || {};
      onChunk?.({ type: 'crm_company_created', data: { company: { id: company.id, name: b.onomasia || company.name }, source: 'aade', enriched: true }, timestamp: Date.now() });
      return JSON.stringify({
        success: true, company_id: company.id, source: r.data?.source ?? 'aade',
        enriched: { name: b.onomasia, commercial_title: b.commer_title, tax_office: b.doy_descr, active: r.data?.valid_afm },
        message: `Enriched "${b.onomasia || company.name}" from ΑΑΔΕ${r.data?.source === 'cache' ? ' (cached)' : ''}.`,
      });
    },
    {
      name: 'enrich_company_from_aade',
      description:
        'Refresh an EXISTING CRM company\'s details from the Greek ΑΑΔΕ registry (legal/commercial name, '
        + 'address, tax office, activity, active status). Give company_id or company_query (fuzzy name). '
        + 'Greek ΑΦΜ only; the company must already have a VAT on file. Use for "update <company> from ΑΑΔΕ" '
        + '/ "refresh the tax details for …". Requires the workspace ΑΑΔΕ codes + finance-manager permission.',
      schema: z.object({
        company_id: z.string().optional().describe('The crm company UUID to enrich.'),
        company_query: z.string().optional().describe('Fuzzy company name to resolve (if you don\'t have the id).'),
      }),
    },
  );
};
