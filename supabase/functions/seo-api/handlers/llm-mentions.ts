import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../../_shared/auth.ts';
import { callDataForSEO } from '../../_shared/tools/dataforseo-dispatch.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const host = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

interface Snapshot {
  status: 'ok' | 'no_data' | 'collector_failed';
  note: string | null;
  metrics: Record<string, unknown>;
  top_domains: unknown[];
  top_pages: unknown[];
  top_brands: unknown[];
  series: unknown[];
}

/** Refused upstream is `collector_failed`; an empty US-only corpus is `no_data`. */
function fold(
  results: { key: keyof Snapshot | 'metrics'; ok: boolean; error?: string; items?: unknown[]; raw?: unknown }[],
): Snapshot {
  const failures = results.filter((r) => !r.ok);
  const snap: Snapshot = {
    status: 'ok', note: null, metrics: {},
    top_domains: [], top_pages: [], top_brands: [], series: [],
  };
  for (const r of results) {
    if (!r.ok) continue;
    const items = r.items ?? [];
    if (r.key === 'metrics') snap.metrics = (items[0] as Record<string, unknown>) ?? {};
    else if (r.key === 'top_domains') snap.top_domains = items;
    else if (r.key === 'top_pages') snap.top_pages = items;
    else if (r.key === 'top_brands') snap.top_brands = items;
    else if (r.key === 'series') snap.series = items;
  }
  if (failures.length === results.length) {
    snap.status = 'collector_failed';
    snap.note = `Every mentions call failed, so nothing here is measured. ${failures[0].error ?? ''}`.trim();
  } else if (failures.length > 0) {
    snap.note = `${failures.length} of ${results.length} mentions calls failed: ${failures.map((f) => f.error).filter(Boolean).join('; ')}`.slice(0, 500);
  } else if (Object.keys(snap.metrics).length === 0 && snap.top_domains.length === 0
    && snap.top_brands.length === 0 && snap.top_pages.length === 0) {
    snap.status = 'no_data';
    snap.note = 'The corpus answered and holds nothing for this target. ChatGPT mention coverage is United States only, so a non-US market legitimately reads empty here.';
  }
  return snap;
}

export async function handleLlmMentions(req: Request, body: any): Promise<Response> {
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ success: false, error: 'Unauthorized' }, 401);

  const websiteId: string | undefined = body?.website_id;
  if (!websiteId) return json({ success: false, error: 'website_id is required' }, 400);

  const db = createClient(supabaseUrl(), supabaseServiceKey());
  const { data: site } = await db
    .from('user_websites')
    .select('id, workspace_id, website_url, display_name')
    .eq('id', websiteId)
    .maybeSingle();
  if (!site || !(await userCanAccessWorkspace(db, auth.userId, site.workspace_id))) {
    return json({ success: false, error: 'Not found' }, 404);
  }
  const ent = await resolveAndAssertSeoEntitled(db, auth.userId);
  if (ent.response) return ent.response;

  const domain = host(site.website_url ?? '');
  const keyword: string = (body?.keyword || site.display_name || domain.split('.')[0] || '').trim();
  const language = (body?.language_code || 'en').toLowerCase();
  const country = (body?.country_code || 'US').toUpperCase();
  const attribution = { user_id: auth.userId, workspace_id: site.workspace_id };

  const call = async (kind: string, params: Record<string, unknown>, key: string) => {
    const r = await callDataForSEO(kind, params, attribution);
    return { key: key as any, ok: r.ok, error: r.error, items: r.data?.items ?? [] };
  };

  const base = { language_code: language, country_code: country };
  const [metrics, series, domains, brands, pages] = await Promise.all([
    call('ai_llm_mentions_aggregated_metrics', { domain, ...base }, 'metrics'),
    call('ai_llm_mentions_historical', { domain, ...base }, 'series'),
    call('ai_llm_mentions_top_domains', { keyword, ...base, limit: 20 }, 'top_domains'),
    call('ai_llm_mentions_top_brands', { keyword, ...base, limit: 20 }, 'top_brands'),
    call('ai_llm_mentions_top_pages', { keyword, ...base, limit: 20 }, 'top_pages'),
  ]);

  const ourSnapshot = fold([metrics, series]);
  const marketSnapshot = fold([domains, brands, pages]);

  const rows = [
    {
      website_id: websiteId, workspace_id: site.workspace_id,
      target: domain, target_kind: 'domain', platform: null,
      language_code: language, location_code: null,
      status: ourSnapshot.status, note: ourSnapshot.note,
      metrics: ourSnapshot.metrics, top_domains: [], top_pages: [], top_brands: [],
      series: ourSnapshot.series, captured_at: new Date().toISOString(),
    },
    {
      website_id: websiteId, workspace_id: site.workspace_id,
      target: keyword, target_kind: 'keyword', platform: null,
      language_code: language, location_code: null,
      status: marketSnapshot.status, note: marketSnapshot.note,
      metrics: {}, top_domains: marketSnapshot.top_domains,
      top_pages: marketSnapshot.top_pages, top_brands: marketSnapshot.top_brands,
      series: [], captured_at: new Date().toISOString(),
    },
  ].filter((r) => !!r.target);

  const { error: saveErr } = await db.from('website_llm_mentions').insert(rows);
  if (saveErr) return json({ success: false, error: saveErr.message }, 500);

  return json({
    success: true,
    domain, keyword,
    our_status: ourSnapshot.status,
    market_status: marketSnapshot.status,
    note: ourSnapshot.note ?? marketSnapshot.note,
  });
}
