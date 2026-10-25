/** seo-api `page_ideas` — keyword ideas for ONE of the site's own pages. */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, userHasWorkspaceCapability } from '../../_shared/auth.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { resolveSecret } from '../../_shared/secrets.ts';
import { openSpendGate } from '../../_shared/tools/dataforseo-spend-gate.ts';
import { logDataForSeoDirectSpend } from '../../_shared/tools/dataforseo-spend-log.ts';
import { DataForSEOClient } from '../../_shared/dataforseo-client.ts';
import { resolveSeoMarket } from '../../_shared/seo-market.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** "Πλακάκια Θεσσαλονίκη | MaterialsHub" → "Πλακάκια Θεσσαλονίκη"; a bare slug as the last resort. */
function seedFrom(title: string | null, url: string): string {
  const fromTitle = (title || '').split(/\s+[|–—-]\s+/)[0].replace(/\s+/g, ' ').trim();
  if (fromTitle.length >= 3) return fromTitle;
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
  } catch {
    return '';
  }
}

export async function handlePageIdeas(req: Request, body: any): Promise<Response> {
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ success: false, error: auth.error || 'Unauthorized' }, 401);

  const websiteId = String(body?.website_id || '');
  const page = String(body?.page || '').trim();
  if (!websiteId || !page) return json({ success: false, error: 'website_id and page are required' }, 400);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: website } = await supabase
    .from('user_websites').select('id, workspace_id, url').eq('id', websiteId).maybeSingle();
  if (!website) return json({ success: false, error: 'Website not found' }, 404);
  // Invariant 1: the service-role client bypasses RLS, so membership is checked here; 404 on
  // mismatch so ids cannot be enumerated.
  if (!(await userHasWorkspaceCapability(supabase, auth.userId, website.workspace_id, 'marketing.seo'))) {
    return json({ success: false, error: 'Website not found' }, 404);
  }
  const ent = await assertEntitled(supabase, website.workspace_id, 'seo-toolkit');
  if (!ent.ok) return ent.response;

  // The page must be one of the site's own indexed pages — the seed comes from what WE
  // stored about it, never from a URL the caller typed.
  const { data: pageRow } = await supabase
    .from('user_website_pages')
    .select('url, title')
    .eq('website_id', website.id)
    .in('url', [page, page.replace(/\/+$/, ''), `${page.replace(/\/+$/, '')}/`])
    .limit(1)
    .maybeSingle();
  if (!pageRow) return json({ success: false, error: 'That page is not in this site\'s index yet. Recrawl first.' }, 404);
  const seed = seedFrom(pageRow.title, pageRow.url);
  if (!seed) return json({ success: false, error: 'The page has no title to seed keyword ideas from.' }, 422);

  const resolved = await resolveSeoMarket(supabase, { websiteId: website.id, workspaceId: website.workspace_id });
  if (!resolved.ok) return json({ success: false, error: `No search market for this site: ${resolved.reason}` }, 422);
  const { location_code: locationCode, language_code: languageCode } = resolved.market;
  if (!locationCode) {
    return json({ success: false, error: `No search location is mapped for ${resolved.market.country_code}, so keyword ideas cannot be read for it.` }, 422);
  }

  const [login, password] = await Promise.all([
    resolveSecret(supabase, 'DATAFORSEO_LOGIN'),
    resolveSecret(supabase, 'DATAFORSEO_PASSWORD'),
  ]);
  if (!login.value || !password.value) {
    return json({
      success: false,
      error: 'DataForSEO credentials are not configured for the edge runtime (Admin → Platform Secrets: DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD).',
    }, 500);
  }

  // Reserve BEFORE the call; refuse without spending when the account cannot pay.
  const gate = await openSpendGate('labs_keyword_ideas_page', auth.userId, { seed }, website.workspace_id);
  if (!gate.ok) return json({ success: false, error: gate.message ?? 'Insufficient credits' }, 402);

  let result: { items: any[]; costUsd: number | null };
  try {
    result = await new DataForSEOClient(login.value, password.value).keywordIdeas(seed, locationCode, languageCode, 60);
  } catch (e) {
    await gate.settle(0);
    return json({ success: false, error: `Keyword ideas failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
  }
  await gate.settle(result.costUsd ?? undefined);
  await logDataForSeoDirectSpend(supabase, {
    userId: auth.userId, workspaceId: website.workspace_id, operation: 'seo_page_ideas',
    costUsd: result.costUsd ?? 0, ok: true, note: result.costUsd == null ? 'response carried no cost' : undefined,
  });

  return json({
    success: true,
    data: {
      seed,
      page: pageRow.url,
      location_code: locationCode,
      language_code: languageCode,
      market_source: resolved.market.source,
      ideas: result.items.map((k) => ({
        term: k.term,
        search_volume: Number.isFinite(k.searchVolume) ? k.searchVolume : null,
        cpc: Number.isFinite(k.cpc) ? k.cpc : null,
        competition: Number.isFinite(k.competition) ? k.competition : null,
      })),
      cost_usd: result.costUsd,
    },
  });
}
