/** What each scheduled collector costs per run for one website, from the prices the gates charge (#475 Phase 5). */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, userHasWorkspaceCapability } from '../../_shared/auth.ts';
import { ceilingCreditsFor } from '../../_shared/tools/dataforseo-spend-gate.ts';
import { COLLECTOR_CADENCES, RANK_SERP_CALLS_PER_KEYWORD_MAX } from '../../_shared/seo/collectorSchedules.generated.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { RANK_SERP_DEPTH } from '../../_shared/seo/serp-price.ts';

/** Pages one scheduled crawl reads at most; mirrors MAX_BACKFILL_PER_RUN in crawl-user-website. */
export const CRAWL_PAGES_PER_RUN = 50;

const unknown = (why: string) => ({ per_run_max_credits: null, backlog_max_credits: null, basis: why });

export async function handleCollectorEstimates(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = await authenticate(req);
  if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '') as DbClient;
  const websiteId = typeof body.website_id === 'string' ? body.website_id : null;
  if (!websiteId) return jsonResponse({ success: false, error: 'website_id is required' }, 400);
  const { data: site } = await supabase.from('user_websites').select('id, workspace_id').eq('id', websiteId).maybeSingle();
  if (!site || !(await userHasWorkspaceCapability(supabase, auth.userId, site.workspace_id, 'marketing.seo'))) {
    return jsonResponse({ success: false, error: 'Website not found' }, 404);
  }

  const [kwRes, compRes, priceRes, unreadRes] = await Promise.all([
    supabase.from('seo_tracked_keywords').select('id', { count: 'exact', head: true }).eq('website_id', websiteId).eq('is_active', true),
    supabase.from('seo_competitors').select('id', { count: 'exact', head: true }).eq('website_id', websiteId).eq('is_active', true),
    supabase.from('cron_billing_registry').select('credit_cost, metered').eq('cron_key', 'seo-website-crawl').maybeSingle(),
    supabase.from('user_website_pages').select('id', { count: 'exact', head: true }).eq('website_id', websiteId).eq('is_active', true).is('content_text', null),
  ]);
  const many = (kind: string, n: number, params?: Record<string, unknown>) => Array.from({ length: n }, () => ({ kind, params }));

  const rank = kwRes.error
    ? unknown(`The tracked keywords could not be counted: ${kwRes.error.message}`)
    : await (async () => {
      const kw = kwRes.count ?? 0;
      const credits = await ceilingCreditsFor(supabase, many('serp_google_organic', kw * RANK_SERP_CALLS_PER_KEYWORD_MAX, { depth: RANK_SERP_DEPTH }));
      return credits == null ? unknown('DataForSEO has no price row, so a run cannot be priced.') : {
        per_run_max_credits: credits, backlog_max_credits: null,
        basis: `${kw} tracked keyword${kw === 1 ? '' : 's'}; one results page each, up to ${RANK_SERP_CALLS_PER_KEYWORD_MAX} when Google has to be asked again`,
      };
    })();

  const domain = compRes.error
    ? unknown(`The competitors could not be counted: ${compRes.error.message}`)
    : await (async () => {
      const comp = Math.min(compRes.count ?? 0, 25);
      const credits = await ceilingCreditsFor(supabase, [
        ...['labs_domain_rank_overview', 'backlinks_summary', 'labs_ranked_keywords', 'backlinks_backlinks'].map((kind) => ({ kind })),
        ...many('labs_domain_rank_overview', comp), ...many('labs_ranked_keywords', comp),
      ]);
      return credits == null ? unknown('DataForSEO has no price row, so a run cannot be priced.') : {
        per_run_max_credits: credits, backlog_max_credits: null,
        basis: `rank, keywords and backlinks of the domain, plus ${comp} competitor${comp === 1 ? '' : 's'}`,
      };
    })();

  const auditCredits = await ceilingCreditsFor(supabase, [{ kind: 'composite_onpage/quick-page' }]);
  const audit = auditCredits == null ? unknown('DataForSEO has no price row, so a run cannot be priced.')
    : { per_run_max_credits: auditCredits, backlog_max_credits: null, basis: 'one on-page audit of the homepage' };

  const perPage = priceRes.data?.metered ? Number(priceRes.data.credit_cost) : null;
  const crawl = priceRes.error || perPage == null || !Number.isFinite(perPage)
    ? unknown('The per-page crawl price could not be read, so a run cannot be priced.')
    : {
      per_run_max_credits: perPage * CRAWL_PAGES_PER_RUN,
      backlog_max_credits: unreadRes.error ? null : perPage * (unreadRes.count ?? 0),
      basis: `up to ${CRAWL_PAGES_PER_RUN} pages a run, ${perPage} credit each; while unread pages are queued it also reads them hourly, and pages not reached are refunded`,
    };

  return jsonResponse({
    success: true,
    data: {
      collectors: [
        { collector: 'rank_tracking', cadences: COLLECTOR_CADENCES.rank_tracking, ...rank },
        { collector: 'domain_tracking', cadences: COLLECTOR_CADENCES.domain_tracking, ...domain },
        { collector: 'site_audit', cadences: COLLECTOR_CADENCES.site_audit, ...audit },
        { collector: 'page_crawl', cadences: COLLECTOR_CADENCES.page_crawl, ...crawl },
      ],
    },
  });
}
