/**
 * seo-domain-tracker — weekly Rankings + Backlinks snapshots per connected website.
 *
 * Pulls DataForSEO domain rank overview (ranking keywords, traffic, position buckets,
 * movement), backlinks summary (backlinks, referring domains, spam), and the top
 * ranked keywords — for the site's MARKET (resolved from its GSC top country, else
 * its TLD, else US) — into seo_domain_snapshots + seo_domain_keywords.
 *
 * Actions (user JWT): run — snapshot one website now.
 * Action (x-cron-secret): cron-run — weekly snapshot of every active website.
 * verify_jwt disabled at the gateway (config.toml); run self-authenticates (invariant #1).
 */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_GATEWAY_URL = () => Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';
const KEYWORD_LIMIT = 100;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// GSC returns ISO alpha-3 (lowercase); DataForSEO wants alpha-2 + we pick a language.
const A3_TO_A2: Record<string, string> = {
  usa: 'US', gbr: 'GB', grc: 'GR', deu: 'DE', fra: 'FR', ita: 'IT', esp: 'ES', nld: 'NL', bel: 'BE',
  aut: 'AT', che: 'CH', prt: 'PT', irl: 'IE', can: 'CA', aus: 'AU', pol: 'PL', swe: 'SE', dnk: 'DK',
  nor: 'NO', fin: 'FI', tur: 'TR', bgr: 'BG', rou: 'RO', cyp: 'CY', cze: 'CZ', hun: 'HU', hrv: 'HR',
  svk: 'SK', svn: 'SI', ltu: 'LT', lva: 'LV', est: 'EE', ukr: 'UA', rus: 'RU', bra: 'BR', mex: 'MX',
  ind: 'IN', jpn: 'JP', chn: 'CN', kor: 'KR', are: 'AE', sau: 'SA', zaf: 'ZA', nzl: 'NZ',
};
const TLD_TO_A2: Record<string, string> = {
  gr: 'GR', uk: 'GB', de: 'DE', fr: 'FR', it: 'IT', es: 'ES', nl: 'NL', be: 'BE', at: 'AT', ch: 'CH',
  pt: 'PT', ie: 'IE', ca: 'CA', au: 'AU', pl: 'PL', se: 'SE', dk: 'DK', no: 'NO', fi: 'FI', tr: 'TR',
  bg: 'BG', ro: 'RO', cy: 'CY', cz: 'CZ', hu: 'HU', hr: 'HR', sk: 'SK', si: 'SI', jp: 'JP', br: 'BR',
};
const A2_TO_LANG: Record<string, string> = {
  US: 'en', GB: 'en', IE: 'en', CA: 'en', AU: 'en', NZ: 'en', ZA: 'en', IN: 'en',
  GR: 'el', DE: 'de', AT: 'de', CH: 'de', FR: 'fr', BE: 'fr', IT: 'it', ES: 'es', MX: 'es',
  NL: 'nl', PT: 'pt', BR: 'pt', PL: 'pl', SE: 'sv', DK: 'da', NO: 'no', FI: 'fi', TR: 'tr',
  BG: 'bg', RO: 'ro', CY: 'el', CZ: 'cs', HU: 'hu', HR: 'hr', SK: 'sk', SI: 'sl', RU: 'ru',
  UA: 'uk', JP: 'ja', CN: 'zh', KR: 'ko', AE: 'en', SA: 'ar',
};

function domainOf(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./i, ''); }
  catch { return String(url || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || ''; }
}

/** Resolve the market (country+language) for a website: GSC top country → TLD → US. */
async function resolveMarket(supabase: any, websiteId: string, domain: string): Promise<{ country: string; language: string }> {
  let country = '';
  const { data } = await supabase.from('gsc_breakdown')
    .select('value, impressions').eq('website_id', websiteId).eq('dimension', 'country')
    .order('impressions', { ascending: false }).limit(1);
  const a3 = (data?.[0]?.value || '').toLowerCase();
  if (a3 && A3_TO_A2[a3]) country = A3_TO_A2[a3];
  if (!country) {
    const tld = domain.split('.').pop()?.toLowerCase() || '';
    if (TLD_TO_A2[tld]) country = TLD_TO_A2[tld];
  }
  if (!country) country = 'US';
  return { country, language: A2_TO_LANG[country] || 'en' };
}

/** DataForSEO dispatcher via MIVAA's seo-agent route → returns the items array. */
async function dfs(kind: string, params: Record<string, unknown>): Promise<any[]> {
  const resp = await fetch(`${MIVAA_GATEWAY_URL()}/api/v1/seo-agent/dataforseo/${kind}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
    body: JSON.stringify({ params, attribution: {} }),
  });
  const text = await resp.text();
  let parsed: any = null; try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (!resp.ok) throw new Error(`${kind} ${resp.status}: ${String(parsed).slice(0, 160)}`);
  return parsed?.data?.items || [];
}

const n = (v: any): number | null => (typeof v === 'number' ? v : null);
const sum = (...v: any[]) => v.reduce((s, x) => s + (typeof x === 'number' ? x : 0), 0);

async function trackWebsite(supabase: any, website: { id: string; workspace_id: string; url: string }): Promise<{ ok: boolean; error?: string }> {
  const domain = domainOf(website.url);
  const { country, language } = await resolveMarket(supabase, website.id, domain);
  try {
    const [overview, backlinks, ranked] = await Promise.all([
      dfs('labs_domain_rank_overview', { target: domain, country_code: country, language_code: language }).catch(() => []),
      dfs('backlinks_summary', { target: domain }).catch(() => []),
      dfs('labs_ranked_keywords', { target: domain, country_code: country, language_code: language, limit: KEYWORD_LIMIT }).catch(() => []),
    ]);

    const org = overview?.[0]?.metrics?.organic || {};
    const bl = backlinks?.[0] || {};
    const snapshot = {
      website_id: website.id, workspace_id: website.workspace_id,
      captured_at: new Date().toISOString().slice(0, 10), country_code: country, language_code: language,
      ranking_keywords: n(org.count), organic_traffic: n(org.etv), organic_traffic_value: n(org.estimated_paid_traffic_cost),
      kw_up: n(org.is_up), kw_down: n(org.is_down), kw_new: n(org.is_new), kw_lost: n(org.is_lost),
      pos_1: n(org.pos_1), pos_2_3: n(org.pos_2_3), pos_4_10: n(org.pos_4_10), pos_11_20: n(org.pos_11_20),
      pos_21_50: sum(org.pos_21_30, org.pos_31_40, org.pos_41_50),
      pos_51_100: sum(org.pos_51_60, org.pos_61_70, org.pos_71_80, org.pos_81_90, org.pos_91_100),
      backlinks: n(bl.backlinks), referring_domains: n(bl.referring_domains), referring_main_domains: n(bl.referring_main_domains),
      domain_rank: n(bl.rank), spam_score: n(bl.backlinks_spam_score), broken_backlinks: n(bl.broken_backlinks),
      error: null,
    };
    const { error: sErr } = await supabase.from('seo_domain_snapshots').upsert(snapshot, { onConflict: 'website_id,captured_at' });
    if (sErr) throw new Error(sErr.message);

    // Replace the current top-keywords set.
    const kws = (ranked || []).map((it: any) => {
      const si = it?.ranked_serp_element?.serp_item || {};
      return {
        website_id: website.id, workspace_id: website.workspace_id,
        keyword: it?.keyword_data?.keyword ?? '', position: n(si.rank_absolute),
        search_volume: n(it?.keyword_data?.keyword_info?.search_volume), etv: n(si.etv),
        url: si.relative_url ?? null, captured_at: snapshot.captured_at,
      };
    }).filter((k: any) => k.keyword);
    await supabase.from('seo_domain_keywords').delete().eq('website_id', website.id);
    if (kws.length) await supabase.from('seo_domain_keywords').insert(kws);

    return { ok: true };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e).slice(0, 500);
    await supabase.from('seo_domain_snapshots').upsert({
      website_id: website.id, workspace_id: website.workspace_id,
      captured_at: new Date().toISOString().slice(0, 10), country_code: country, language_code: language, error: msg,
    }, { onConflict: 'website_id,captured_at' });
    return { ok: false, error: msg };
  }
}

Deno.serve(withApiLogging('seo-domain-tracker', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  await bootstrapForFunction();
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  const action = String(body?.action || '');

  if (action === 'cron-run') {
    if (!isCronAuthorized(req)) return json({ error: 'Unauthorized' }, 401);
    const { data: sites } = await supabase.from('user_websites').select('id, workspace_id, url').eq('is_active', true);
    let ok = 0, failed = 0;
    for (const s of sites || []) { const r = await trackWebsite(supabase, s); if (r.ok) ok++; else failed++; }
    return json({ ok: true, tracked: ok, failed });
  }

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const websiteId = String(body?.website_id || '');
  if (!websiteId) return json({ error: 'website_id required' }, 400);
  const { data: website } = await supabase.from('user_websites').select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ error: 'Website not found' }, 404);
  if (!(await userCanAccessWorkspace(supabase, auth.userId, website.workspace_id))) return json({ error: 'Website not found' }, 404);
  const r = await trackWebsite(supabase, website);
  return json(r, r.ok ? 200 : 400);
}));
