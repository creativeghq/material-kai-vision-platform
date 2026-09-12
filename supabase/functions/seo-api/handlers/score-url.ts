/**
 * Score a LIVE URL with the analyzer we already have (#401 G4).
 *
 * `analyzeContent` takes an ArticlePlan and a live page has none, so plan-dependent checks are
 * SKIPPED and named in `checks_skipped` rather than counted as failures — marking a page down
 * for not matching a plan nobody wrote is a wrong number dressed as a finding.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { scrapeMarkdown } from '../../_shared/scrape-markdown.ts';
import { chargeCronWorkspace, chargeCronUser, refundCronWorkspace, refundCronUser } from '../../_shared/cron-billing.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { analyzeContent } from './analyze.ts';
import type { ArticlePlan } from '../../_shared/seo-types.ts';

const supabaseUrl = () => Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CRON_KEY = 'seo-score-url';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Checks inside `analyzeContent` that compare the text against a PLAN. A live page has no plan,
 * so each is reported as skipped rather than silently counted as a pass or a fail.
 */
const PLAN_DEPENDENT_CHECKS = [
  'planned sections covered',
  'target word count',
  'planned FAQ questions',
  'recommended schema types',
  'featured-snippet target',
  'secondary and LSI keyword coverage',
];

/**
 * A plan synthesised from the PAGE, not invented. Everything here is either observed on the page
 * or supplied by the caller; the list fields stay empty so their checks contribute nothing rather
 * than failing against targets nobody set.
 */
function planFromPage(primaryKeyword: string, title: string | null, description: string | null, url: string): ArticlePlan {
  let slug = '';
  try { slug = new URL(url).pathname.split('/').filter(Boolean).pop() || ''; } catch { /* keep '' */ }
  return {
    title: title || '',
    metaTitle: title || '',
    metaDescription: description || '',
    slug,
    primaryKeyword,
    secondaryKeywords: [],
    lsiKeywords: [],
    sections: [],
    targetWordCount: 0,
    searchIntent: 'informational',
    recommendedSchema: [],
    featuredSnippetTarget: null,
    faqQuestions: [],
    entityMentions: [],
    citationSources: [],
    statisticalClaims: [],
  };
}

/** The query that actually sent this page traffic, so the score is against what it ranks for. */
async function topQueryForPage(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  url: string,
): Promise<{ keyword: string | null; source: string }> {
  const { data, error } = await supabase
    .from('gsc_performance')
    .select('query, impressions')
    .eq('page', url)
    .order('impressions', { ascending: false })
    .limit(1);
  if (error) return { keyword: null, source: 'gsc_unavailable' };
  const top = (data || [])[0] as { query?: string } | undefined;
  return top?.query
    ? { keyword: top.query, source: 'gsc_top_query' }
    // Search Console withholds low-volume queries entirely, so "no row" here is common and is
    // NOT evidence the page has no traffic. Say which it was rather than implying the second.
    : { keyword: null, source: 'gsc_no_query_for_this_page' };
}

export async function handleScoreUrl(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl(), supabaseServiceKey());

  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  // Only a secret-level caller (agent-chat) may name a user; a JWT caller is pinned to its own id.
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return jsonResponse({ success: false, error: 'user_id is required' }, 400);

  const url = String(body.url || '').trim();
  if (!url) return jsonResponse({ success: false, error: 'url is required' }, 400);

  const { workspaceId, response: notEntitled } = await resolveAndAssertSeoEntitled(supabase, userId);
  if (notEntitled) return notEntitled;

  // Invariant 10: debit BEFORE the upstream call. The Firecrawl scrape is money whether or not
  // the page turns out to be scoreable.
  const gate = workspaceId
    ? await chargeCronWorkspace(supabase, workspaceId, CRON_KEY, { description: `Score ${url}` })
    : await chargeCronUser(supabase, userId, CRON_KEY, { description: `Score ${url}` });
  if (!gate.allowed) {
    return jsonResponse({ success: false, code: 'insufficient_credits', error: 'Not enough credits to score a page.' }, 402);
  }
  const refund = async (why: string) => {
    if (gate.charged <= 0) return;
    await (workspaceId
      ? refundCronWorkspace(supabase, workspaceId, CRON_KEY, gate.charged, why)
      : refundCronUser(supabase, userId, CRON_KEY, gate.charged, why));
  };

  try {
    const page = await scrapeMarkdown(url);
    if (page.error || !page.markdown) {
      // We could not read the page, so we have no verdict on it. Refund and say which — a score
      // of zero here would read as "this page is terrible" instead of "we never saw it".
      await refund('Page could not be fetched');
      return jsonResponse({
        success: false,
        status: page.rate_limited ? 'collector_failed' : 'fetch_failed',
        url,
        error: page.error || 'The page returned no readable content.',
        retry_after_ms: page.retry_after_ms ?? null,
      }, 502);
    }

    const supplied = typeof body.keyword === 'string' && body.keyword.trim() ? body.keyword.trim() : null;
    const fromGsc = supplied ? { keyword: null, source: 'caller_supplied' } : await topQueryForPage(supabase, url);
    const keyword = supplied ?? fromGsc.keyword;
    if (!keyword) {
      // Every keyword-dependent check would be scoring against the empty string, which produces a
      // confident number about nothing. Refuse and name what is missing.
      await refund('No keyword to score against');
      return jsonResponse({
        success: false,
        status: 'no_keyword',
        url,
        error: 'No keyword to score against. Search Console has no recorded query for this page '
          + '(it withholds low-volume queries), so pass `keyword` explicitly.',
        keyword_source: fromGsc.source,
      }, 400);
    }

    const plan = planFromPage(keyword, page.title, page.description, url);
    const analysis = analyzeContent(page.markdown, plan);

    return jsonResponse({
      success: true,
      url,
      fetched: {
        title: page.title,
        description: page.description,
        http_status: page.http_status,
        word_count: page.markdown.split(/\s+/).filter(Boolean).length,
      },
      keyword,
      keyword_source: supplied ? 'caller_supplied' : fromGsc.source,
      analysis,
      // Named, not hidden. A reader comparing this score to a generated article's must be able to
      // see that these categories were not part of it.
      checks_skipped: PLAN_DEPENDENT_CHECKS,
      credits_charged: gate.charged,
    });
  } catch (e) {
    await refund('Scoring failed');
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[seo-api/score-url]', msg);
    return jsonResponse({ success: false, error: msg }, 500);
  }
}
