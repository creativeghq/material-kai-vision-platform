/** Signals (#462): who is hiring, what they run, what they are in market for. Read as the caller. */

const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');

import { callerDbClient } from '../caller-client.ts';
import { moduleGate } from './module-gate.ts';

type Kind = 'hiring' | 'technology' | 'intent';
type Chunk = (chunk: Record<string, unknown>) => void;

const KIND_MODULE: Record<Kind, string> = {
  hiring: 'signals-hiring',
  technology: 'signals-technographics',
  intent: 'signals-intent',
};

function list(value: string | undefined): string[] {
  return (value ?? '').split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
}

async function anyKindGate(workspaceId: string | null): Promise<string | null> {
  let first: string | null = null;
  for (const slug of Object.values(KIND_MODULE)) {
    const denied = await moduleGate(workspaceId, slug);
    if (!denied) return null;
    first ??= denied;
  }
  return first;
}

function coverageNote(coverage: Record<string, unknown> | undefined): string {
  if (!coverage) return '';
  return `Read ${coverage.companies_checked ?? 0} of ${coverage.companies ?? 0} tracked companies; `
    + `${coverage.companies_with_board ?? 0} publish a job board we can read (${coverage.open_postings ?? 0} open postings).`;
}

/** Resolve names or slugs typed by a person against the dictionary the RPC will validate. */
async function resolveDictionary(db: any, kind: 'technology' | 'intent', typed: string[]): Promise<{ keys: string[]; unknown: string[] }> {
  const { data } = await db.rpc('signals_dictionary');
  const rows: Array<Record<string, string>> = kind === 'technology' ? (data?.technologies ?? []) : (data?.intents ?? []);
  const keys: string[] = [];
  const unknown: string[] = [];
  for (const t of typed) {
    const needle = t.toLowerCase();
    const hit = rows.find((r) => [r.slug, r.key, r.name, r.label].some((v) => v && v.toLowerCase() === needle))
      ?? rows.find((r) => [r.name, r.label].some((v) => v && v.toLowerCase().includes(needle)));
    const key = hit ? (kind === 'technology' ? hit.slug : hit.key) : null;
    if (key && !keys.includes(key)) keys.push(key);
    else if (!key) unknown.push(t);
  }
  return { keys, unknown };
}

async function runSearch(
  jwt: string | undefined, userId: string, workspaceId: string,
  kind: Kind, filter: Record<string, unknown>, days: number, limit: number,
): Promise<{ data?: any; error?: string }> {
  const { data, error } = await callerDbClient(jwt, userId, workspaceId).rpc('signals_search', {
    p_workspace_id: workspaceId, p_kind: kind, p_filter: filter, p_days: days, p_limit: limit,
  });
  return error ? { error: error.message } : { data };
}

export const createFindHiringCompaniesTool = (
  userId: string, workspaceId: string | null, jwt: string | undefined, onChunk?: Chunk,
) => {
  return tool(
    async ({ keywords, days = 30, location, crm_only = false, limit = 25 }) => {
      const denied = await moduleGate(workspaceId, KIND_MODULE.hiring);
      if (denied) return denied;
      const words = list(keywords);
      if (!words.length) return JSON.stringify({ success: false, error: 'Give at least one role, skill or keyword.' });
      const res = await runSearch(jwt, userId, workspaceId!, 'hiring',
        { keywords: words, location_contains: location || undefined, crm_only }, days, limit);
      if (res.error) return JSON.stringify({ success: false, error: res.error });
      const rows = (res.data?.results ?? []).map((r: any) => ({
        company: r.company_name || r.company_domain, role: r.payload?.title, location: r.payload?.location ?? '—',
        department: r.payload?.department ?? '—', first_seen: r.observed_at?.slice(0, 10), url: r.payload?.url,
      }));
      const note = coverageNote(res.data?.coverage);
      onChunk?.({ type: 'signals_hiring_results', postings: rows, keywords: words.join(', '), days, status: res.data?.status, coverage: note, timestamp: Date.now() });
      return JSON.stringify({ success: true, status: res.data?.status, count: rows.length, postings: rows, coverage: note });
    },
    {
      name: 'find_hiring_companies',
      description: 'Companies that opened job postings matching a role, skill or keyword, read from their own public job boards. '
        + 'Use for "who is hiring a <role>" / "who started hiring for <skill>". Returns status no_data with coverage when nothing matched — say how many companies were read, never "nobody is hiring". 0 credits.',
      schema: z.object({
        keywords: z.string().describe('Comma-separated roles, skills or words to find in the posting title or body, e.g. "export manager, showroom"'),
        days: z.number().int().min(1).max(365).default(30).describe('Only postings first seen in this many days'),
        location: z.string().optional().describe('Only postings whose location contains this text, e.g. "Athens"'),
        crm_only: z.boolean().default(false).describe('Only companies already in this workspace\'s CRM'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
  );
};

export const createFindCompaniesUsingTechnologyTool = (
  userId: string, workspaceId: string | null, jwt: string | undefined, onChunk?: Chunk,
) => {
  return tool(
    async ({ technologies, evidence = 'any', days = 365, crm_only = false, limit = 25 }) => {
      const denied = await moduleGate(workspaceId, KIND_MODULE.technology);
      if (denied) return denied;
      const db = callerDbClient(jwt, userId, workspaceId);
      const { keys, unknown } = await resolveDictionary(db, 'technology', list(technologies));
      if (!keys.length) {
        return JSON.stringify({ success: false, error: `None of these are in the technology dictionary: ${unknown.join(', ')}. Search the job-ad text for them with find_hiring_companies instead, and tell the user it is a text search, not a detection.` });
      }
      const res = await runSearch(jwt, userId, workspaceId!, 'technology',
        { technology_slugs: keys, evidence: evidence === 'any' ? undefined : evidence, crm_only }, days, limit);
      if (res.error) return JSON.stringify({ success: false, error: res.error });
      const rows = (res.data?.results ?? []).map((r: any) => ({
        company: r.company_name || r.company_domain, technology: r.payload?.technology_name,
        evidence: r.payload?.evidence === 'website_html' ? 'Website' : 'Job ad', first_seen: r.observed_at?.slice(0, 10),
        source: r.payload?.evidence_url,
      }));
      const note = coverageNote(res.data?.coverage);
      onChunk?.({ type: 'signals_technology_results', companies: rows, technologies: keys.join(', '), status: res.data?.status, coverage: note, timestamp: Date.now() });
      return JSON.stringify({ success: true, status: res.data?.status, count: rows.length, companies: rows, unrecognised: unknown, coverage: note });
    },
    {
      name: 'find_companies_using_technology',
      description: 'Companies that use a technology (an ERP, e-commerce platform, CAD/BIM tool, CRM, analytics…), detected from their job ads or their homepage. '
        + 'Use for "who runs SoftOne / Shopify / Revit". Narrow days to find recent adopters. 0 credits.',
      schema: z.object({
        technologies: z.string().describe('Comma-separated technology names or slugs, e.g. "SoftOne, Entersoft"'),
        evidence: z.enum(['any', 'job_posting', 'website_html']).default('any').describe('Where the technology was seen'),
        days: z.number().int().min(1).max(365).default(365).describe('Only detections first seen in this many days'),
        crm_only: z.boolean().default(false).describe('Only companies already in this workspace\'s CRM'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
  );
};

export const createFindCompaniesInMarketTool = (
  userId: string, workspaceId: string | null, jwt: string | undefined, onChunk?: Chunk,
) => {
  return tool(
    async ({ intents, days = 90, crm_only = false, limit = 25 }) => {
      const denied = await moduleGate(workspaceId, KIND_MODULE.intent);
      if (denied) return denied;
      const db = callerDbClient(jwt, userId, workspaceId);
      const { keys, unknown } = await resolveDictionary(db, 'intent', list(intents));
      if (!keys.length) {
        const { data } = await db.rpc('signals_dictionary');
        const offered = (data?.intents ?? []).map((i: any) => i.label).join('; ');
        return JSON.stringify({ success: false, error: `Not a defined use case. Defined: ${offered}. For anything else, search the job-ad text with find_hiring_companies (or save a hiring signal with those words), and say it is a text search.` });
      }
      const res = await runSearch(jwt, userId, workspaceId!, 'intent', { intent_keys: keys, crm_only }, days, limit);
      if (res.error) return JSON.stringify({ success: false, error: res.error });
      const rows = (res.data?.results ?? []).map((r: any) => ({
        company: r.company_name || r.company_domain, use_case: r.payload?.intent_label,
        evidence: r.payload?.matched_text, from_posting: r.payload?.posting_title, postings: r.payload?.postings,
        first_seen: r.observed_at?.slice(0, 10), source: r.payload?.evidence_url,
      }));
      const note = coverageNote(res.data?.coverage);
      onChunk?.({ type: 'signals_intent_results', companies: rows, use_cases: keys.join(', '), status: res.data?.status, coverage: note, timestamp: Date.now() });
      return JSON.stringify({ success: true, status: res.data?.status, count: rows.length, companies: rows, unrecognised: unknown, coverage: note });
    },
    {
      name: 'find_companies_in_market',
      description: 'Companies whose own hiring says they are in market for a use case: changing ERP, myDATA / e-invoicing, a PIM, e-commerce, new showrooms, export, BIM, warehouse systems, CRM. '
        + 'Quote the evidence line; it is what the posting said. 0 credits.',
      schema: z.object({
        intents: z.string().describe('Comma-separated use cases by name or key, e.g. "ERP, e-commerce"'),
        days: z.number().int().min(1).max(365).default(90),
        crm_only: z.boolean().default(false).describe('Only companies already in this workspace\'s CRM'),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    },
  );
};

export const createCompanySignalsTool = (
  userId: string, workspaceId: string | null, jwt: string | undefined, onChunk?: Chunk,
) => {
  return tool(
    async ({ domain }) => {
      const denied = await anyKindGate(workspaceId);
      if (denied) return denied;
      const { data, error } = await callerDbClient(jwt, userId, workspaceId).rpc('signals_company_overview', {
        p_workspace_id: workspaceId, p_domain: domain,
      });
      if (error) return JSON.stringify({ success: false, error: error.message });
      const facts = [
        ...(data?.hiring?.open_roles ?? []).map((r: any) => ({
          signal: 'Open role', detail: r.title, where: r.location ?? '—', since: r.first_seen_at?.slice(0, 10), source: r.url })),
        ...(data?.technologies?.items ?? []).map((t: any) => ({
          signal: 'Technology', detail: t.name, where: t.evidence === 'website_html' ? 'Website' : 'Job ad', since: t.first_seen_at?.slice(0, 10), source: t.evidence_url })),
        ...(data?.intents?.items ?? []).map((i: any) => ({
          signal: 'Intent', detail: i.label, where: i.matched_text ?? '—', since: i.observed_at?.slice(0, 10), source: i.evidence_url })),
      ];
      const profile = data?.profile ?? {};
      onChunk?.({
        type: 'company_signals', signals: facts, domain: data?.domain, status: data?.status,
        careers_page: profile.careers_url ?? '—', discovery: profile.ats_check_status ?? 'not_collected',
        open_roles: data?.hiring?.open_count ?? 0, timestamp: Date.now(),
      });
      return JSON.stringify({ success: true, ...data });
    },
    {
      name: 'company_signals',
      description: 'Everything the signals corpus knows about ONE company by its website domain: open roles, detected technologies, intent signals, its careers page and whether we could read it. '
        + 'status not_collected / pending means we have not read the site yet — say so, do not report "no signals". 0 credits.',
      schema: z.object({
        domain: z.string().describe('The company website or domain, e.g. "refin.it"'),
      }),
    },
  );
};

export const createManageSignalTool = (
  userId: string, workspaceId: string | null, jwt: string | undefined, onChunk?: Chunk,
) => {
  return tool(
    async ({ action, signal_id, kind, name, values, crm_only = false, location, confirm = false }) => {
      const db = callerDbClient(jwt, userId, workspaceId);
      if (['create', 'update'].includes(action)) {
        if (!kind) return JSON.stringify({ success: false, error: 'kind is required: hiring, technology or intent.' });
        const denied = await moduleGate(workspaceId, KIND_MODULE[kind as Kind]);
        if (denied) return denied;
        let entries = list(values);
        let unknown: string[] = [];
        if (kind !== 'hiring') ({ keys: entries, unknown } = await resolveDictionary(db, kind as 'technology' | 'intent', entries));
        const filterKey = kind === 'hiring' ? 'keywords' : kind === 'technology' ? 'technology_slugs' : 'intent_keys';
        const { data: id, error } = await db.rpc('signals_save', {
          p_workspace_id: workspaceId, p_signal_id: action !== 'create' ? signal_id ?? null : null,
          p_kind: kind, p_name: name || `${kind}: ${entries.join(', ')}`,
          p_filter: { [filterKey]: entries, crm_only, location_contains: location || undefined },
        });
        if (error) return JSON.stringify({ success: false, error: error.message, unrecognised: unknown });
        onChunk?.({ type: 'signal_saved', signal_id: id, kind, name: name || entries.join(', '), watching: entries.join(', '), timestamp: Date.now() });
        return JSON.stringify({ success: true, signal_id: id, unrecognised: unknown, note: 'Checked hourly; new matches appear under Signals.' });
      }

      const denied = await anyKindGate(workspaceId);
      if (denied) return denied;

      if (action === 'pause' || action === 'resume') {
        const { data: row, error: readErr } = await db.from('signals').select('kind, name, filter')
          .eq('id', signal_id ?? '').eq('workspace_id', workspaceId).maybeSingle();
        if (readErr || !row) return JSON.stringify({ success: false, error: 'Signal not found.' });
        const { error } = await db.rpc('signals_save', {
          p_workspace_id: workspaceId, p_signal_id: signal_id, p_kind: row.kind, p_name: row.name,
          p_filter: row.filter, p_is_active: action === 'resume',
        });
        if (error) return JSON.stringify({ success: false, error: error.message });
        return JSON.stringify({ success: true, signal_id, active: action === 'resume' });
      }

      if (action === 'delete') {
        if (!confirm) {
          return JSON.stringify({ success: false, needs_confirmation: true, error: 'Deleting a signal removes its matches. Ask the user, then call again with confirm=true.' });
        }
        const { error } = await db.rpc('signals_delete', { p_workspace_id: workspaceId, p_signal_id: signal_id });
        if (error) return JSON.stringify({ success: false, error: error.message });
        return JSON.stringify({ success: true, deleted: signal_id });
      }

      if (action === 'matches') {
        let q = db.from('signal_matches').select('id, signal_id, company_domain, payload, matched_at, dismissed_at')
          .eq('workspace_id', workspaceId).is('dismissed_at', null).order('matched_at', { ascending: false }).limit(50);
        if (signal_id) q = q.eq('signal_id', signal_id);
        const { data, error } = await q;
        if (error) return JSON.stringify({ success: false, error: error.message });
        const rows = (data ?? []).map((m: any) => ({
          company: m.payload?.company_name || m.company_domain,
          what: m.payload?.title || m.payload?.technology_name || m.payload?.intent_label || '—',
          matched: m.matched_at?.slice(0, 10), source: m.payload?.url || m.payload?.evidence_url,
        }));
        onChunk?.({ type: 'signal_matches_list', matches: rows, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: rows.length, matches: rows });
      }

      const { data, error } = await db.from('signals')
        .select('id, name, kind, filter, is_active, last_evaluated_at, last_match_count, created_at')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
      if (error) return JSON.stringify({ success: false, error: error.message });
      const rows = (data ?? []).map((s: any) => ({
        name: s.name, kind: s.kind, active: s.is_active ? 'Yes' : 'Paused',
        watching: (s.filter?.keywords ?? s.filter?.technology_slugs ?? s.filter?.intent_keys ?? []).join(', '),
        last_checked: s.last_evaluated_at?.slice(0, 16)?.replace('T', ' ') ?? 'Not yet', id: s.id,
      }));
      onChunk?.({ type: 'signals_list', signals: rows, timestamp: Date.now() });
      return JSON.stringify({ success: true, count: rows.length, signals: rows });
    },
    {
      name: 'manage_signal',
      description: 'Save, list, pause, resume or delete a standing signal, or list its new matches. A saved signal is checked hourly against the corpus and notifies on new matches. '
        + 'values: keywords for hiring, technology names for technology, use cases for intent. Delete needs confirm=true after the user agrees. 0 credits.',
      schema: z.object({
        action: z.enum(['list', 'matches', 'create', 'update', 'pause', 'resume', 'delete']),
        signal_id: z.string().optional().describe('Required for update / pause / resume / delete; optional for matches'),
        kind: z.enum(['hiring', 'technology', 'intent']).optional().describe('Required for create / update'),
        name: z.string().optional(),
        values: z.string().optional().describe('Comma-separated keywords, technologies or use cases'),
        crm_only: z.boolean().default(false),
        location: z.string().optional().describe('Hiring only: location must contain this text'),
        confirm: z.boolean().default(false).describe('Delete only — true after the user explicitly agreed'),
      }),
    },
  );
};
