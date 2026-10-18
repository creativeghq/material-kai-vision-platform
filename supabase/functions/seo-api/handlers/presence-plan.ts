/** Presence plan (#487 C3): where the brand shows up on YouTube, Reddit, Pinterest and Trustpilot, and what to do about it. */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, userHasWorkspaceCapability } from '../../_shared/auth.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { pickBrandProfile } from '../../_shared/brand-context.ts';
import { callDataForSEO } from '../../_shared/tools/dataforseo-dispatch.ts';
import { ceilingCreditsFor } from '../../_shared/tools/dataforseo-spend-gate.ts';
import { resolveSeoMarket } from '../../_shared/seo-market.ts';
import { domainFromUrl } from '../../_shared/seo-website.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { judgePlatform, PLATFORM_SITE, type Identity, type PlatformCall, type PresencePlatform } from './presence-rules.ts';
import { SEO_MODULE } from './entitlement.ts';

const KEYWORDS = 3;
const SERP_DEPTH = 10;

interface PlannedCall { kind: 'serp_youtube_organic' | 'serp_google_organic'; platform: PresencePlatform; keyword: string; query: string }

/** Every lookup one plan makes, so the price shown before running is the price of the run. */
export function plannedCalls(keywords: string[], brand: string): PlannedCall[] {
  return [
    ...keywords.flatMap((k): PlannedCall[] => [
      { kind: 'serp_youtube_organic', platform: 'youtube', keyword: k, query: k },
      { kind: 'serp_google_organic', platform: 'reddit', keyword: k, query: `${k} site:${PLATFORM_SITE.reddit}` },
      { kind: 'serp_google_organic', platform: 'pinterest', keyword: k, query: `${k} site:${PLATFORM_SITE.pinterest}` },
    ]),
    { kind: 'serp_google_organic', platform: 'trustpilot', keyword: brand, query: `${brand} site:${PLATFORM_SITE.trustpilot}` },
  ];
}

export async function handlePresencePlan(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '') as DbClient;

  const websiteId = typeof body.website_id === 'string' ? body.website_id : null;
  if (!websiteId) return jsonResponse({ success: false, error: 'website_id is required' }, 400);
  const { data: website } = await supabase.from('user_websites').select('id, url, display_name, workspace_id').eq('id', websiteId).maybeSingle();
  if (!website || !(await userHasWorkspaceCapability(supabase, userId, website.workspace_id, 'marketing.seo'))) {
    return jsonResponse({ success: false, error: 'Website not found' }, 404);
  }
  const ent = await assertEntitled(supabase, website.workspace_id, SEO_MODULE);
  if (!ent.ok) return ent.response;

  const domain = domainFromUrl(website.url);
  const { data: profiles } = await supabase.from('workspace_brand_profile')
    .select('website_id, publisher_name').eq('workspace_id', website.workspace_id);
  const profile = pickBrandProfile((profiles ?? []) as { website_id: string | null; publisher_name: string | null }[], websiteId);
  const brand = profile?.publisher_name?.trim() || website.display_name?.trim() || domain;
  const who: Identity = { domain, brand: brand === domain ? null : brand };

  const { data: kwRows, error: kwErr } = await supabase.rpc('presence_plan_keywords', {
    p_website_id: websiteId, p_brand_terms: [domain, ...(who.brand ? [who.brand] : [])], p_limit: KEYWORDS,
  });
  if (kwErr) throw new Error(`Could not read the site's queries: ${kwErr.message}`);
  const keywords = ((kwRows ?? []) as { keyword: string }[]).map((r) => r.keyword);
  const calls = plannedCalls(keywords, brand);

  if (body.estimate === true) {
    return jsonResponse({ success: true, data: { keywords, brand, calls: calls.length, max_credits: await ceilingCreditsFor(supabase, calls) } });
  }
  if (!keywords.length) {
    return jsonResponse({
      success: false, status: 'no_keywords',
      error: 'No non-branded Search Console query or tracked keyword yet, so there is nothing to search the platforms for. Connect Search Console or track a keyword first.',
    }, 409);
  }
  const market = await resolveSeoMarket(supabase, { websiteId, workspaceId: website.workspace_id });
  if (!market.ok) return jsonResponse({ success: false, status: 'no_market', error: market.reason }, 409);
  const m = market.market;
  const attribution = { user_id: userId, workspace_id: website.workspace_id };

  const results: PlatformCall[] = await Promise.all(calls.map(async (c) => {
    const params = c.kind === 'serp_google_organic'
      ? { keyword: c.query, country_code: m.country_code, language_code: m.language_code, depth: SERP_DEPTH }
      : { keyword: c.query, country_code: m.country_code, language_code: m.language_code };
    const r = await callDataForSEO(c.kind, params, attribution);
    return r.ok ? { keyword: c.keyword, ok: true, items: r.data?.items ?? [] } : { keyword: c.keyword, ok: false, error: r.error, items: [] };
  }));
  const platforms = (['youtube', 'reddit', 'pinterest', 'trustpilot'] as const)
    .map((p) => judgePlatform(p, results.filter((_, i) => calls[i].platform === p), who));

  const { data: saved, error: saveErr } = await supabase.from('seo_presence_plans').insert({
    website_id: websiteId, workspace_id: website.workspace_id, brand, keywords,
    market: { country_code: m.country_code, language_code: m.language_code, source: m.source },
    platforms, created_by: userId,
  }).select('id, created_at').single();
  if (saveErr) throw new Error(`Could not save the plan: ${saveErr.message}`);

  return jsonResponse({ success: true, data: { plan_id: saved.id, created_at: saved.created_at, website_id: websiteId, brand, keywords, market: m, platforms } });
}
