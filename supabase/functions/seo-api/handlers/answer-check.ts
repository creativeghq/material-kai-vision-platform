/** A published article checked against what an answer engine says for its keyword: are we cited, what is missing. */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { resolveSecret } from '../../_shared/secrets.ts';
import { DataForSEOClient } from '../../_shared/dataforseo-client.ts';
import { DATAFORSEO_SERVICE } from '../../_shared/tools/dataforseo-spend-gate.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { loadOwnedArticle } from './article-access.ts';
import { checkCoverage } from './coverage.ts';
import { extractLessons } from './lessons.ts';
import { hostOf, trimSlash } from './site-assets.ts';
import { reserveStage, serviceCredits, settleStage, type StageWallet } from './stage-billing.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

export const ANSWER_CHECK_INTERVAL_DAYS = 7;
const ARTICLES_PER_CRON_RUN = 10;
/** One AI Mode call is ~$0.004 (measured 2026-10-11); the ceiling allows a retry. */
const AI_MODE_CEILING_UNITS = 10;

interface CheckableArticle {
  id: string; user_id: string; workspace_id: string | null; website_id: string | null;
  slug: string | null; target_keyword: string | null; keyword_research_id: string | null; markdown_content: string | null;
  stages_data: { extra?: Record<string, unknown> } | null;
}

/** The live page an article was published as: a crawled page of its site whose last path segment is the slug. */
async function publishedPage(supabase: DbClient, a: CheckableArticle) {
  if (!a.website_id || !a.slug) return null;
  const { data } = await supabase
    .from('user_website_pages')
    .select('url, content_text, fetched_at')
    .eq('website_id', a.website_id)
    .eq('is_active', true)
    .or(`url.like.%/${a.slug},url.like.%/${a.slug}/`)
    .not('content_text', 'is', null)
    .order('fetched_at', { ascending: false })
    .limit(1);
  return (data?.[0] as { url: string; content_text: string; fetched_at: string | null } | undefined) ?? null;
}

/** A check that cannot be stored is a failed check: the caller sees it, never a silent success. */
async function recordCheck(supabase: DbClient, row: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('seo_article_answer_checks').insert(row);
  if (error) throw new Error(`answer check not stored: ${error.message}`);
}

async function checkArticle(supabase: DbClient, a: CheckableArticle) {
  const page = await publishedPage(supabase, a);
  if (!page || !a.workspace_id || !a.target_keyword) return { article_id: a.id, skipped: page ? 'no workspace or keyword' : 'not published' };

  // The first check after publishing also reads what the editor changed, once per article.
  if (!a.stages_data?.extra?.lessons) await extractLessons(supabase, a, page);
  const extra = a.stages_data?.extra ?? {};
  const languageCode = String(extra.language_code ?? 'en');
  const locationCode = Number(extra.location_code ?? 2840);
  const siteHost = hostOf(page.url);
  const wallet: StageWallet = { userId: a.user_id, workspaceId: a.workspace_id, opType: 'seo_answer_check' };

  const ceiling = (await serviceCredits(supabase, DATAFORSEO_SERVICE, AI_MODE_CEILING_UNITS)) ?? 2;
  const hold = await reserveStage(supabase, wallet, ceiling, `Answer-engine check: "${a.target_keyword}"`);
  const base = { article_id: a.id, workspace_id: a.workspace_id, page_url: page.url, page_fetched_at: page.fetched_at, keyword: a.target_keyword };
  if (!hold.ok) {
    await recordCheck(supabase, { ...base, status: 'failed', error: `not checked: ${hold.error}` });
    return { article_id: a.id, status: 'failed' };
  }

  const [login, password] = await Promise.all([resolveSecret(supabase, 'DATAFORSEO_LOGIN'), resolveSecret(supabase, 'DATAFORSEO_PASSWORD')]);
  const client = new DataForSEOClient(login.value ?? '', password.value ?? '');
  let answer: Awaited<ReturnType<DataForSEOClient['aiModeAnswer']>> = null;
  let error: string | null = null;
  try {
    answer = await client.aiModeAnswer(a.target_keyword, locationCode, languageCode);
  } catch (e) {
    error = (e as Error).message.slice(0, 300);
  }
  const spent = client.unpricedCalls > 0 ? null : await serviceCredits(supabase, DATAFORSEO_SERVICE, client.spentUsd * 1000);
  let credits = await settleStage(supabase, wallet, ceiling, spent, { article_id: a.id, answered: !!answer });

  if (error || !answer) {
    const status = error ? 'failed' : 'no_answer';
    await recordCheck(supabase, { ...base, status, error, credits });
    return { article_id: a.id, status };
  }

  const { data: research } = a.keyword_research_id
    ? await supabase.from('seo_keyword_research').select('research_data').eq('id', a.keyword_research_id).maybeSingle()
    : { data: null };
  const coverage = await checkCoverage(supabase, {
    text: page.content_text,
    mustCover: {
      aiAnswer: answer.text,
      questions: ((research?.research_data as { readerQuestions?: string[] } | null)?.readerQuestions) ?? [],
      guideSections: [],
      paa: [],
    },
    languageCode, userId: a.user_id, workspaceId: a.workspace_id,
  });
  credits += coverage.credits;
  const cited = answer.references.some((r) => hostOf(r.url) === siteHost || trimSlash(r.domain).replace(/^www\./, '') === siteHost);
  await recordCheck(supabase, {
    ...base,
    status: coverage.failed ? 'failed' : 'ok',
    error: coverage.failed ?? null,
    answer_text: answer.text,
    answer_references: answer.references,
    our_domain_cited: cited,
    missing: coverage.missing,
    credits,
  });
  return { article_id: a.id, status: coverage.failed ? 'failed' : 'ok', cited, missing: coverage.missing.length };
}

const ARTICLE_COLUMNS = 'id, user_id, workspace_id, website_id, slug, target_keyword, keyword_research_id, markdown_content, stages_data';

export async function handleAnswerCheck(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const cronHeader = req.headers.get('x-cron-secret');
  const isCron = !!cronHeader && cronHeader === CRON_SECRET();

  if (!isCron) {
    const auth = await authenticate(req);
    if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    if (typeof body.article_id !== 'string') return jsonResponse({ success: false, error: 'article_id is required' }, 400);
    const owned = await loadOwnedArticle(supabase, auth.userId, body.article_id);
    if ('response' in owned) return owned.response;
    const { data } = await supabase.from('seo_articles').select(ARTICLE_COLUMNS).eq('id', body.article_id).single();
    return jsonResponse({ success: true, data: await checkArticle(supabase, data as CheckableArticle) });
  }

  // Due: completed articles of a connected site whose latest check is older than the interval (or none).
  const since = new Date(Date.now() - ANSWER_CHECK_INTERVAL_DAYS * 86_400_000).toISOString();
  const { data: recent } = await supabase.from('seo_article_answer_checks').select('article_id').gte('checked_at', since);
  const fresh = new Set((recent ?? []).map((r: { article_id: string }) => r.article_id));
  const { data: candidates, error } = await supabase
    .from('seo_articles')
    .select(ARTICLE_COLUMNS)
    .eq('status', 'completed')
    .not('website_id', 'is', null)
    .not('slug', 'is', null)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return jsonResponse({ success: false, error: error.message }, 500);
  const results = [];
  for (const a of (candidates ?? []) as CheckableArticle[]) {
    if (results.filter((r) => !('skipped' in r)).length >= ARTICLES_PER_CRON_RUN) break;
    if (fresh.has(a.id)) continue;
    results.push(await checkArticle(supabase, a).catch((e: Error) => ({ article_id: a.id, status: 'failed', error: e.message })));
  }
  return jsonResponse({ success: true, data: { checked: results.filter((r) => !('skipped' in r)).length, results } });
}
