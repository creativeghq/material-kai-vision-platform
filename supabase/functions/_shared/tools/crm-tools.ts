import { describeUpstreamError } from '../tool-result-shape.ts';
import { moduleGate } from './module-gate.ts';
import { attachPartyNames } from './record-labels.ts';
// Generated from src/utils/iban.ts by `npm run vocab:mirror` — the SAME mod-97 the form runs and
// the same one `public.iban_is_valid` enforces. Never hand-roll a second one here.
import { isValidIban, normalizeIban } from '../iban.generated.ts';
import { resolveBank } from '../bankVocabulary.generated.ts';
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

/**
 * Resolve ONE company in this workspace from an id or a fuzzy name.
 *
 * This existed twice and the copies had drifted: one searched `name_fold`/`name_xscript` as well
 * as `name` and the other only `name`, so a Greek counterparty was reachable by its Latin trade
 * name from one tool and not the other. Half the names in this CRM are Greek and the operator
 * types Latin. Scoping to `workspaceId` IS the ownership check (invariant 1), not a convenience:
 * the caller is service-role and `assert_workspace_member` deliberately lets that through.
 */
async function resolveCompanyInWorkspace(
  workspaceId: string,
  company_id: string | undefined,
  company_query: string | undefined,
  columns = 'id, name',
): Promise<{ company?: AnyRow; error?: string; candidates?: AnyRow[] }> {
  let q = supabase.from('crm_companies').select(columns).eq('workspace_id', workspaceId);
  if (company_id) q = q.eq('id', company_id);
  else if (company_query) {
    const term = String(company_query).trim().replace(/[,()]/g, ' ');
    q = q.or(`name.ilike.%${term}%,name_fold.ilike.%${term}%,name_xscript.ilike.%${term}%`);
  } else return { error: 'Provide company_id or company_query.' };

  const { data: matches, error } = await q.limit(8);
  if (error) return { error: error.message };

  // A name whose only difference is SPACING matched nothing: the company is stored as
  // "… NEW PLAN …" and prints "NEWPLAN" on its own letterhead, so `%NEWPLAN%` found the company
  // that was in front of us. `name_fold` lowercases and `name_xscript` transliterates; neither
  // collapses whitespace, and no index can, so this second pass compares de-spaced forms in
  // memory. Only on zero — the ilike above stays the fast path.
  const found = matches && matches.length > 0
    ? (matches as AnyRow[])
    : await resolveByShape(workspaceId, company_query, columns);

  if (!found) {
    return {
      error: `No company matches "${company_query}" here, and there are too many to compare `
        + 'spelling-insensitively. Give the company id, or a longer part of the name.',
    };
  }
  if (found.length === 0) return { error: 'No matching company in this workspace.' };
  if (found.length > 1) {
    return {
      error: `Multiple companies match "${company_query}". Ask which one.`,
      candidates: found.map((c) => ({ id: c.id, name: c.name, vat: c.vat_number })),
    };
  }
  return { company: found[0] };
}

/** Letters and digits only — the comparison that makes NEWPLAN and "NEW PLAN" the same name. */
const nameShape = (v: unknown) =>
  String(v ?? '').toLowerCase().replace(/[^a-z0-9\u0370-\u03ff]/g, '');

/**
 * Second pass over the workspace's companies, comparing de-spaced names.
 *
 * @returns matching rows, or `null` when the workspace holds more companies than SHAPE_SCAN_CAP —
 * in which case the caller must NOT report "no such company", because this looked at part of the
 * list. A partial scan reported as an absence is the confident-wrong-answer shape.
 */
const SHAPE_SCAN_CAP = 1000;
async function resolveByShape(
  workspaceId: string,
  company_query: string | undefined,
  columns: string,
): Promise<AnyRow[] | null> {
  const wanted = nameShape(company_query);
  if (wanted.length < 4) return [];
  const { data, error } = await supabase
    .from('crm_companies')
    .select(`${columns}, name_fold, name_xscript`)
    .eq('workspace_id', workspaceId)
    .limit(SHAPE_SCAN_CAP + 1);
  if (error || !data) return [];
  if (data.length > SHAPE_SCAN_CAP) return null;
  return (data as AnyRow[]).filter((c) =>
    [c.name, c.name_fold, c.name_xscript].some((n) => nameShape(n).includes(wanted)));
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


/** The deal pipeline for the agent, for EVERY deal type (#311). */
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
      const resolved = await resolveCompanyInWorkspace(
        workspaceId, company_id, company_query, 'id, name, vat_number, country_code',
      );
      if (!resolved.company) {
        return JSON.stringify({ success: false, error: resolved.error, candidates: resolved.candidates });
      }
      const company = resolved.company;
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

/** Worst first: a customer report that leads with what is fine buries the reason it was opened. */
const HEALTH_SEVERITY: Record<string, number> = { attention: 0, watch: 1, good: 2, none: 3 };

export const createCustomerHealthTool = (
  _userId: string,
  workspaceId: string,
  onChunk?: (chunk: AnyRow) => void,
) => {
  return tool(
    async ({ company_id, company_query, days }: { company_id?: string; company_query?: string; days?: number }) => {
      const denied = await moduleGate(workspaceId, 'crm');
      if (denied) return denied;

      const resolved = await resolveCompanyInWorkspace(workspaceId, company_id, company_query);
      if (!resolved.company) {
        return JSON.stringify({ success: false, error: resolved.error, candidates: resolved.candidates });
      }
      const company = resolved.company;

      const { data, error } = await supabase.rpc('get_customer_health', {
        p_company_id: company.id, p_days: days ?? 90,
      });
      if (error) return JSON.stringify({ success: false, error: error.message });

      const signals = ((data as AnyRow[]) || []).slice().sort(
        (a, b) => (HEALTH_SEVERITY[a.severity] ?? 9) - (HEALTH_SEVERITY[b.severity] ?? 9),
      );
      const needsAttention = signals.filter((s) => s.severity === 'attention');

      onChunk?.({
        type: 'crm_customer_health',
        company: company.name,
        company_id: company.id,
        window_days: days ?? 90,
        attention: needsAttention.length,
        signals,
        timestamp: Date.now(),
      });

      return JSON.stringify({
        success: true,
        company: company.name,
        company_id: company.id,
        window_days: days ?? 90,
        // Every signal carries its own status, so "nothing billed yet" reads as an absence and
        // never as a customer who owes nothing. The model reports these; it does not score them.
        signals: signals.map((s) => ({
          signal: s.signal, label: s.label, status: s.status, severity: s.severity,
          value: s.value, previous: s.previous, detail: s.detail,
        })),
      });
    },
    {
      name: 'customer_health',
      description:
        'What is actually happening with one customer: order value against the previous window, whether '
        + 'they are waiting on a reply from us, money outstanding and overdue, and what we have open with '
        + 'them (quotes, orders, projects). One row per signal, each with its own verdict — good, watch, '
        + 'attention, or none — and its own status, so "nothing billed yet" is never reported as "owes '
        + 'nothing". Use for "how is <customer> doing", "should I call them", "are we at risk of losing X".',
      schema: z.object({
        company_id: z.string().optional().describe('The crm company UUID.'),
        company_query: z.string().optional().describe('Fuzzy company name to resolve (if you don\'t have the id).'),
        days: z.number().optional().describe('Comparison window in days (default 90, min 7, max 730).'),
      }),
    },
  );
};

/**
 * manage_counterparty_bank_account — where we pay a supplier, and where a customer pays us from.
 *
 * The app has had this since #366; the agent had NOTHING, so "add those bank accounts to
 * <company>" resolved the company and then had no verb — and a missing tool reads as the model
 * declining, not as a capability nobody built (conversation de92b987, 2026-09-15).
 *
 * @remarks Deliberately narrower than the form. No `update`/`remove`: changing an EXISTING
 * payment destination behind the operator is how money reaches the wrong account. `add` never
 * sets is_primary, and both writes are gated (invariant 9) — the source is usually a photographed
 * statement, so the approver is the only party who has seen both it and the digits we read out.
 * @remarks The mod-97 is the mirrored `isValidIban`, the same test `public.iban_is_valid` applies
 * as a CHECK here; it runs in-tool so the operator gets a sentence instead of a 23514.
 */
export const createManageCounterpartyBankAccountTool = (
  _userId: string,
  workspaceId: string,
  jwt: string | undefined,
  onChunk?: (chunk: AnyRow) => void,
) => {
  // RLS is the boundary here, not an `.eq()` somebody remembered: every policy on
  // crm_bank_accounts is `is_workspace_member(workspace_id)`, so the caller's own token is what
  // scopes these. The service-role client this file uses elsewhere satisfies all four
  // unconditionally, which is exactly wrong for a payment destination.
  const sb = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt ?? ''}` } },
    auth: { persistSession: false },
  });

  return tool(
    async (
      { action, company_id, company_query, contact_id, bank_name, account_holder, iban, account_ref,
        currency, notes, account_id, confirm }: AnyRow,
    ) => {
      const denied = await moduleGate(workspaceId, 'crm');
      if (denied) return denied;
      if (!jwt) {
        return JSON.stringify({
          success: false,
          error: 'Counterparty bank accounts need a signed-in user session and this request has none.',
        });
      }

      // set_primary addresses a ROW, not a counterparty — there is nothing to resolve.
      if (action === 'set_primary') {
        if (!account_id) return JSON.stringify({ success: false, error: 'set_primary needs the account_id.' });
        // `.eq('workspace_id', workspaceId)` as well as RLS, because they answer DIFFERENT
        // questions: RLS asks whether the caller is a member of the row's workspace, and a
        // multi-workspace user is a member of several. The agent is running in ONE of them, and
        // that is the one whose records it may touch (invariant 1).
        const { data: row, error: rowErr } = await sb()
          .from('crm_bank_accounts').select('id, bank_name, iban')
          .eq('id', account_id).eq('workspace_id', workspaceId).maybeSingle();
        // A dropped error reads as "not found", which blames the user's data for a query fault.
        if (rowErr) return JSON.stringify({ success: false, error: rowErr.message });
        if (!row) return JSON.stringify({ success: false, error: 'No such bank account in this workspace.' });

        if (confirm !== true) {
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_counterparty_bank_account',
            input: { action: 'set_primary', account_id },
            title: 'Make this the default payment account?',
            summary: `${row.bank_name}${row.iban ? ` · ${row.iban}` : ''} becomes the account we pay to by `
              + 'default, and whichever is primary now stops being it.',
            danger: true,
            toolkit_id: 'crm',
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true, awaiting_confirmation: true,
            message: 'Awaiting the user\'s approval. Do not retry — the user will approve or decline.',
          });
        }
        // ONE transaction in SQL: the clear-others/set-this pair cannot half-apply and leave the
        // counterparty with no primary at all (#366 BU-4, pipeline convention 3).
        const { error } = await sb().rpc('crm_set_primary_bank_account', { p_account_id: account_id });
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({
          type: 'crm_bank_account_saved',
          data: { action: 'set_primary', account: { ...row, is_primary: true } },
          timestamp: Date.now(),
        });
        return JSON.stringify({ success: true, account_id, message: `${row.bank_name} is now the default account.` });
      }

      // `list` with NO counterparty answers "what is our house format" — the question the user
      // actually asks ("following the format we do for all the other"). Without it the model can
      // only sample a counterparty at a time, and a live replay had it check three, find none,
      // and tell the user NOBODY had accounts on file while fifteen existed. A generalisation
      // from a sample of three, stated as fact.
      if (action === 'list' && !contact_id && !company_id && !company_query) {
        const { data, error } = await sb().from('crm_bank_accounts')
          .select('id, bank_name, account_holder, iban, account_ref, currency, is_primary, notes, company_id')
          .order('created_at', { ascending: false })
          .limit(25);
        if (error) return JSON.stringify({ success: false, error: error.message });
        const rows = (data ?? []) as AnyRow[];
        const withNames = await attachPartyNames(sb(), rows, [
          { idField: 'company_id', nameField: 'counterparty' },
        ]);
        onChunk?.({
          type: 'crm_bank_accounts_listed',
          data: { counterparty: null, scope: 'workspace', count: withNames.length, accounts: withNames },
          timestamp: Date.now(),
        });
        return JSON.stringify(rows.length === 0
          ? {
            success: true, found: false, scope: 'workspace', accounts: [],
            note: 'No counterparty in this workspace has a bank account on file yet, so there is '
              + 'no established format to copy.',
          }
          : {
            success: true, found: true, scope: 'workspace', count: withNames.length,
            accounts: withNames,
            note: 'The most recent accounts on file across the workspace — read the house format '
              + 'off these. This is a sample of up to 25, not the complete list.',
          });
      }

      // Otherwise list and add both hang off a counterparty.
      let parent: { company_id?: string; contact_id?: string; label: string };
      if (contact_id) {
        // Same as set_primary above: scoped to the workspace the agent is RUNNING in, not to
        // every workspace the caller happens to belong to. Without it a multi-workspace user
        // could hang another tenant's contact IBAN off this one — the insert below stamps
        // `workspace_id: workspaceId` regardless of where the contact actually lives.
        const { data: c, error: cErr } = await sb().from('crm_contacts')
          .select('id, name').eq('id', contact_id).eq('workspace_id', workspaceId).maybeSingle();
        if (cErr) return JSON.stringify({ success: false, error: cErr.message });
        if (!c) return JSON.stringify({ success: false, error: 'No such contact in this workspace.' });
        parent = { contact_id: c.id, label: c.name };
      } else {
        const resolved = await resolveCompanyInWorkspace(workspaceId, company_id, company_query);
        if (!resolved.company) {
          return JSON.stringify({ success: false, error: resolved.error, candidates: resolved.candidates });
        }
        parent = { company_id: resolved.company.id, label: resolved.company.name };
      }

      if (action === 'list') {
        let q = sb().from('crm_bank_accounts')
          .select('id, bank_name, account_holder, iban, account_ref, currency, is_primary, notes');
        q = parent.company_id ? q.eq('company_id', parent.company_id) : q.eq('contact_id', parent.contact_id!);
        const { data, error } = await q
          .order('is_primary', { ascending: false }).order('created_at', { ascending: true });
        if (error) return JSON.stringify({ success: false, error: error.message });
        const accounts = (data ?? []) as AnyRow[];
        onChunk?.({
          type: 'crm_bank_accounts_listed',
          data: { counterparty: parent.label, count: accounts.length, accounts },
          timestamp: Date.now(),
        });
        // "None on file" is an ANSWER, not an empty list the reader has to interpret (rule 3).
        return JSON.stringify(accounts.length === 0
          ? {
            success: true, found: false, counterparty: parent.label, accounts: [],
            note: `No bank account is on file for "${parent.label}" yet.`,
          }
          : { success: true, found: true, counterparty: parent.label, accounts });
      }

      if (action === 'add') {
        if (!bank_name || !String(bank_name).trim()) {
          return JSON.stringify({ success: false, error: 'add needs the bank_name.' });
        }
        const normalizedIban = normalizeIban(iban);
        if (!normalizedIban) {
          return JSON.stringify({
            success: false,
            error: 'add needs the iban — an account with no number is not a payment destination.',
          });
        }
        if (!isValidIban(normalizedIban)) {
          return JSON.stringify({
            success: false,
            error: `"${normalizedIban}" fails its IBAN checksum. Read it off the document again — one `
              + 'wrong character fails this test, which is what the test is for. Nothing was saved.',
          });
        }
        // The same IBAN twice on one counterparty is a re-transcription, not a second account.
        // `.limit(1)`, never `.maybeSingle()`: there is no unique index on (company_id, iban), so
        // maybeSingle ERRORS on an already-duplicated row — and an ignored error reads as "no
        // match", which is precisely when a third copy gets written.
        let dupQ = sb().from('crm_bank_accounts').select('id, bank_name').eq('iban', normalizedIban);
        dupQ = parent.company_id ? dupQ.eq('company_id', parent.company_id) : dupQ.eq('contact_id', parent.contact_id!);
        const { data: dupRows, error: dupErr } = await dupQ.limit(1);
        if (dupErr) return JSON.stringify({ success: false, error: dupErr.message });
        const dup = dupRows?.[0];
        if (dup) {
          return JSON.stringify({
            success: true, already_present: true, account_id: dup.id,
            message: `"${parent.label}" already has ${normalizedIban} on file. Nothing added.`,
          });
        }

        if (confirm !== true) {
          onChunk?.({
            type: 'action_confirmation',
            tool: 'manage_counterparty_bank_account',
            input: {
              action: 'add', company_id: parent.company_id, contact_id: parent.contact_id,
              bank_name, account_holder, iban: normalizedIban, account_ref, currency, notes,
            },
            title: `Add this bank account to ${parent.label}?`,
            summary: `${String(bank_name).trim()} · ${normalizedIban}`
              + `${account_holder ? ` · held by ${account_holder}` : ''}`
              + `${currency && String(currency).toUpperCase() !== 'EUR' ? ` · ${String(currency).toUpperCase()}` : ''}`
              + '. Check the IBAN against the document before approving — this is where money gets sent.',
            danger: true,
            toolkit_id: 'crm',
            timestamp: Date.now(),
          });
          return JSON.stringify({
            success: true, awaiting_confirmation: true,
            message: 'Awaiting the user\'s approval. Do not retry — the user will approve or decline.',
          });
        }

        // An allowlisted literal, never a spread of the model's own arguments (invariant 8).
        // workspace_id is server-derived; is_primary is not settable here — see the header.
        const payload = {
          workspace_id: workspaceId,
          company_id: parent.company_id ?? null,
          contact_id: parent.contact_id ?? null,
          bank_name: resolveBank(bank_name, normalizedIban),
          account_holder: account_holder ? String(account_holder).trim() : null,
          iban: normalizedIban,
          account_ref: account_ref ? String(account_ref).trim() : null,
          currency: currency ? String(currency).toUpperCase().slice(0, 3) : 'EUR',
          is_primary: false,
          notes: notes ? String(notes).trim() : null,
        };
        const { data, error } = await sb().from('crm_bank_accounts').insert(payload).select('*').single();
        if (error) return JSON.stringify({ success: false, error: error.message });
        onChunk?.({
          type: 'crm_bank_account_saved',
          data: { action: 'add', counterparty: parent.label, account: data },
          timestamp: Date.now(),
        });
        return JSON.stringify({
          success: true, account_id: data.id,
          message: `Added ${payload.bank_name} (${normalizedIban}) to "${parent.label}".`,
        });
      }

      return JSON.stringify({ success: false, error: `Unknown action "${action}".` });
    },
    {
      name: 'manage_counterparty_bank_account',
      description:
        'The bank accounts of a CRM company or contact — where we pay a supplier, and where a customer '
        + 'pays us from. list (what is on file), add (a new account: bank_name + iban required, and the '
        + 'IBAN is checksum-tested before it is stored), set_primary (make one the default we pay to, by '
        + 'account_id). Call list with NO company or contact to see the accounts already on file '
        + 'across the workspace — that is how you find the house format before adding one. '
        + 'Use for "add this IBAN to <company>", "add the bank accounts off this statement", '
        + '"which account do we pay <supplier> into". add and set_primary both ask the user to approve '
        + 'first — show them what you read and let them check it. To CHANGE or REMOVE an existing account, '
        + 'send the user to the company\'s Bank accounts panel in CRM; this tool deliberately cannot.',
      schema: z.object({
        action: z.enum(['list', 'add', 'set_primary']),
        company_id: z.string().optional().describe('The crm company UUID.'),
        company_query: z.string().optional().describe('Fuzzy company name to resolve (Greek or Latin spelling both work; spacing is ignored).'),
        contact_id: z.string().optional().describe('A crm contact UUID, if the account belongs to a person rather than a company.'),
        bank_name: z.string().optional().describe('add: the bank, e.g. "Piraeus" (required).'),
        account_holder: z.string().optional().describe('add: the name on the account, if it differs from the counterparty.'),
        iban: z.string().optional().describe('add: the IBAN (required). Spaces are fine; it is checksum-tested.'),
        account_ref: z.string().optional().describe('add: a local account number, if the document shows one beside the IBAN.'),
        currency: z.string().optional().describe('add: ISO currency code, default EUR.'),
        notes: z.string().optional().describe('add: anything worth recording about this account.'),
        account_id: z.string().optional().describe('set_primary: the bank account UUID to make the default.'),
        // Declared because the Approve card re-invokes the tool with confirm:true — that is how
        // the gate is released. The model cannot set it: `confirm` is in MODEL_FORBIDDEN_ARG_KEYS
        // and stripped from model-authored arguments, and it is on NEVER_ASK so no quick-start
        // form can pre-answer it either.
        confirm: z.boolean().optional().describe('Do NOT set this — the Approve/Decline card sets confirm:true when the user approves.'),
      }),
    },
  );
};
