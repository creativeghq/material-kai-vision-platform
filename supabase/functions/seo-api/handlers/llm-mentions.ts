import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, isCronAuthorized, userCanAccessWorkspace } from '../../_shared/auth.ts';
import { assertEntitled, isWorkspaceEntitled } from '../../_shared/entitlement.ts';
import { callDataForSEO } from '../../_shared/tools/dataforseo-dispatch.ts';
import { SEO_MODULE } from './entitlement.ts';

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const host = (url: string): string => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

type Status = 'ok' | 'no_data' | 'collector_failed' | 'not_collected';
// deno-lint-ignore no-explicit-any
type Loose = any;

interface Site { id: string; workspace_id: string; user_id: string | null; url: string | null; display_name: string | null }
interface Market { country_code: string | null; language_code: string | null; source: string | null; note: string | null }
interface Coverage { platform: string; label: string; covered: boolean; note: string | null }
interface Leader { label: string; mentions: number | null; ai_search_volume: number | null }
interface CallOut { ok: boolean; error?: string; items: Loose[]; raw: Loose }

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function mentionsOf(x: Loose): number | null {
  return num(x?.mentions) ?? num(x?.total?.mentions) ?? num(x?.aggregated_metrics?.total?.mentions)
    ?? num(x?.metrics?.mentions);
}

function volumeOf(x: Loose): number | null {
  return num(x?.ai_search_volume) ?? num(x?.total?.ai_search_volume)
    ?? num(x?.aggregated_metrics?.total?.ai_search_volume);
}

function firstResult(raw: Loose): Loose {
  return raw?.tasks?.[0]?.result?.[0] ?? null;
}

function groups(list: Loose): Leader[] {
  return (Array.isArray(list) ? list : []).map((g: Loose) => ({
    label: String(g?.key ?? g?.domain ?? g?.title ?? '—'),
    mentions: num(g?.mentions),
    ai_search_volume: num(g?.ai_search_volume),
  }));
}

/** Target Metrics answers in `result[0].aggregated_metrics` with `items: []`, not in items. */
export function parseTargetMetrics(r: CallOut): Record<string, unknown> | null {
  const res = firstResult(r.raw);
  const agg = res?.aggregated_metrics ?? res?.total ?? r.items?.[0]?.aggregated_metrics ?? null;
  if (!agg || typeof agg !== 'object') return null;
  const byPlatform = groups(agg.platform);
  const total = agg.total ?? {};
  const mentions = num(total.mentions) ?? (byPlatform.length
    ? byPlatform.reduce((s, p) => s + (p.mentions ?? 0), 0) : null);
  return {
    mentions,
    ai_search_volume: num(total.ai_search_volume),
    by_platform: byPlatform,
    sources_domain: groups(agg.sources_domain).slice(0, 10),
    search_results_domain: groups(agg.search_results_domain).slice(0, 10),
    brand_entities: groups(agg.brand_entities_title).slice(0, 10),
    brand_categories: groups(agg.brand_entities_category).slice(0, 10),
  };
}

export function parseSeries(items: Loose[]): { date: string; value: number | null; ai_search_volume: number | null }[] {
  return items.map((it: Loose) => {
    const y = it?.year; const m = it?.month;
    const date = typeof it?.date === 'string' ? it.date
      : (y && m ? `${y}-${String(m).padStart(2, '0')}` : '');
    return { date, value: mentionsOf(it), ai_search_volume: volumeOf(it) };
  }).filter((p) => p.date).sort((a, b) => a.date.localeCompare(b.date));
}

export function parseLeaders(items: Loose[], kind: 'domain' | 'brand' | 'page'): Leader[] {
  return items.map((it: Loose) => ({
    label: String(
      kind === 'domain' ? (it?.domain ?? it?.key ?? it?.target ?? '—')
        : kind === 'brand' ? (it?.brand ?? it?.title ?? it?.name ?? it?.key ?? '—')
          : (it?.url ?? it?.page ?? it?.key ?? '—'),
    ),
    mentions: mentionsOf(it),
    ai_search_volume: volumeOf(it),
  }));
}

function unparsed(r: CallOut): boolean {
  return r.ok && r.items.length > 0;
}

interface Snapshot { status: Status; note: string | null; metrics: Record<string, unknown>; top_domains: Leader[]; top_brands: Leader[]; top_pages: Leader[]; series: unknown[] }

const blank = (): Snapshot => ({ status: 'ok', note: null, metrics: {}, top_domains: [], top_brands: [], top_pages: [], series: [] });

function failures(calls: CallOut[], names: string[], snap: Snapshot): boolean {
  const failed = calls.map((c, i) => ({ c, n: names[i] })).filter((x) => !x.c.ok);
  if (failed.length === calls.length) {
    snap.status = 'collector_failed';
    snap.note = `Every corpus call failed, so nothing here is measured. ${failed[0].c.error ?? ''}`.trim().slice(0, 500);
    return true;
  }
  if (failed.length > 0) {
    snap.note = `${failed.map((f) => f.n).join(', ')} failed: ${failed.map((f) => f.c.error).filter(Boolean).join('; ')}`.slice(0, 500);
  }
  return false;
}

async function collect(
  db: Loose, site: Site, market: Market, coverage: Coverage[], keyword: string, payer: string | null,
): Promise<{ rows: Record<string, unknown>[]; summary: Record<string, unknown>[] }> {
  const domain = host(site.url ?? '');
  const now = new Date().toISOString();
  const attribution = { user_id: payer ?? undefined, workspace_id: site.workspace_id };
  const base = { language_code: market.language_code, country_code: market.country_code };
  const shared = {
    website_id: site.id, workspace_id: site.workspace_id,
    language_code: market.language_code, country_code: market.country_code,
    market_source: market.source, location_code: null, captured_at: now,
  };
  const rows: Record<string, unknown>[] = [];
  const summary: Record<string, unknown>[] = [];

  const call = async (kind: string, params: Record<string, unknown>): Promise<CallOut> => {
    const r = await callDataForSEO(kind, params, attribution);
    return { ok: r.ok, error: r.error, items: r.data?.items ?? [], raw: r.data?.raw ?? null };
  };

  for (const cov of coverage) {
    if (!cov.covered) {
      for (const kind of ['domain', 'keyword'] as const) {
        rows.push({
          ...shared, platform: cov.platform, target_kind: kind, target: kind === 'domain' ? domain : keyword,
          status: 'not_collected', note: cov.note, metrics: {}, top_domains: [], top_pages: [], top_brands: [], series: [],
        });
      }
      summary.push({ platform: cov.platform, status: 'not_collected', note: cov.note });
      continue;
    }
    const p = { ...base, platform: cov.platform };
    const [metrics, series, domains, brands, pages] = await Promise.all([
      call('ai_llm_mentions_aggregated_metrics', { domain, ...p }),
      call('ai_llm_mentions_historical', { domain, ...p }),
      call('ai_llm_mentions_top_domains', { keyword, ...p, limit: 20 }),
      call('ai_llm_mentions_top_brands', { keyword, ...p, limit: 20 }),
      call('ai_llm_mentions_top_pages', { keyword, ...p, limit: 20 }),
    ]);

    const ours = blank();
    if (!failures([metrics, series], ['target metrics', 'history'], ours)) {
      const m = metrics.ok ? parseTargetMetrics(metrics) : null;
      ours.metrics = m ?? {};
      ours.series = series.ok ? parseSeries(series.items) : [];
      if (metrics.ok && !m) {
        ours.status = 'collector_failed';
        ours.note = 'The corpus answered, but in a shape this build does not read, so the figure is unknown.';
      } else if (series.ok && ours.series.length === 0 && unparsed(series)) {
        ours.note = [ours.note, 'History came back in a shape this build does not read.'].filter(Boolean).join(' ');
      }
      if (ours.status === 'ok' && (m?.mentions ?? 0) === 0 && ours.series.length === 0) {
        ours.status = 'no_data';
        ours.note = ours.note ?? `The ${cov.label} corpus for ${market.country_code} / ${market.language_code} holds no answer mentioning ${domain}.`;
      }
    }
    rows.push({
      ...shared, platform: cov.platform, target_kind: 'domain', target: domain,
      status: ours.status, note: ours.note, metrics: ours.metrics,
      top_domains: [], top_pages: [], top_brands: [], series: ours.series,
    });

    const mk = blank();
    if (!failures([domains, brands, pages], ['top domains', 'top brands', 'top pages'], mk)) {
      mk.top_domains = domains.ok ? parseLeaders(domains.items, 'domain') : [];
      mk.top_brands = brands.ok ? parseLeaders(brands.items, 'brand') : [];
      mk.top_pages = pages.ok ? parseLeaders(pages.items, 'page') : [];
      if (mk.top_domains.length + mk.top_brands.length + mk.top_pages.length === 0) {
        mk.status = 'no_data';
        mk.note = mk.note ?? `The ${cov.label} corpus for ${market.country_code} / ${market.language_code} holds no answer matching "${keyword}".`;
      }
    }
    rows.push({
      ...shared, platform: cov.platform, target_kind: 'keyword', target: keyword,
      status: mk.status, note: mk.note, metrics: {},
      top_domains: mk.top_domains, top_pages: mk.top_pages, top_brands: mk.top_brands, series: [],
    });
    summary.push({ platform: cov.platform, our_status: ours.status, market_status: mk.status, note: ours.note ?? mk.note });
  }

  const { error } = await db.from('website_llm_mentions').insert(rows.filter((r) => !!r.target));
  if (error) throw new Error(error.message);
  return { rows, summary };
}

async function resolveMarket(db: Loose, siteId: string, body: Loose): Promise<Market> {
  const cc = typeof body?.country_code === 'string' ? body.country_code.trim().toUpperCase() : '';
  const lc = typeof body?.language_code === 'string' ? body.language_code.trim().toLowerCase() : '';
  if (/^[A-Z]{2}$/.test(cc) && /^[a-z]{2}$/.test(lc)) {
    return { country_code: cc, language_code: lc, source: 'request', note: 'Chosen for this read.' };
  }
  const { data, error } = await db.rpc('website_ai_market', { p_website_id: siteId });
  if (error) throw new Error(`Could not resolve the site's market: ${error.message}`);
  return data as Market;
}

async function coverageFor(db: Loose, market: Market): Promise<Coverage[]> {
  const { data, error } = await db.rpc('llm_mentions_platform_coverage', {
    p_country: market.country_code, p_language: market.language_code,
  });
  if (error) throw new Error(`Could not read corpus coverage: ${error.message}`);
  return (data ?? []) as Coverage[];
}

async function runFor(db: Loose, site: Site, body: Loose, payer: string | null) {
  const market = await resolveMarket(db, site.id, body);
  const domain = host(site.url ?? '');
  const keyword: string = (body?.keyword || site.display_name || domain.split('.')[0] || '').trim();
  const coverage = await coverageFor(db, market);
  const { summary } = await collect(db, site, market, coverage, keyword, payer);
  return { domain, keyword, market, platforms: summary };
}

export async function handleLlmMentions(req: Request, body: Loose): Promise<Response> {
  if (body?.source === 'cron') return handleLlmMentionsCron(req);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ success: false, error: 'Unauthorized' }, 401);

  const websiteId: string | undefined = body?.website_id;
  if (!websiteId) return json({ success: false, error: 'website_id is required' }, 400);

  const db = createClient(supabaseUrl(), supabaseServiceKey());
  const { data: site } = await db
    .from('user_websites')
    .select('id, workspace_id, user_id, url, display_name')
    .eq('id', websiteId)
    .maybeSingle();
  if (!site || !(await userCanAccessWorkspace(db, auth.userId, site.workspace_id))) {
    return json({ success: false, error: 'Not found' }, 404);
  }
  const ent = await assertEntitled(db, site.workspace_id, SEO_MODULE);
  if (!ent.ok) return ent.response;

  try {
    const out = await runFor(db, site as Site, body, auth.userId);
    return json({ success: true, ...out });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : 'failed' }, 500);
  }
}

/** Weekly: every active website, billed to its owner through the same spend gate as the button. */
async function handleLlmMentionsCron(req: Request): Promise<Response> {
  if (!isCronAuthorized(req)) return json({ success: false, error: 'Unauthorized' }, 401);
  const db = createClient(supabaseUrl(), supabaseServiceKey());
  const { data: sites, error } = await db
    .from('user_websites')
    .select('id, workspace_id, user_id, url, display_name')
    .eq('is_active', true);
  if (error) return json({ success: false, error: error.message }, 500);

  const results: Record<string, unknown>[] = [];
  for (const site of (sites ?? []) as Site[]) {
    if (!site.user_id) {
      results.push({ website_id: site.id, skipped: 'no_owner_to_bill' });
      continue;
    }
    if (!(await isWorkspaceEntitled(db, site.workspace_id, SEO_MODULE))) {
      results.push({ website_id: site.id, skipped: 'not_entitled' });
      continue;
    }
    try {
      const out = await runFor(db, site, {}, site.user_id);
      results.push({ website_id: site.id, market: out.market, platforms: out.platforms });
    } catch (e) {
      results.push({ website_id: site.id, error: e instanceof Error ? e.message : 'failed' });
    }
  }
  const failed = results.filter((r) => r.error).length;
  return json({ success: failed === 0, sites: results.length, failed, results });
}
