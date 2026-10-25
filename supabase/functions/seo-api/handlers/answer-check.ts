/** A published article checked against what answer engines say for its keyword: are we cited, what is missing. */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { runInBackground } from '../../_shared/background.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { secretMatches } from '../../_shared/timing-safe.ts';
import { resolveSecret } from '../../_shared/secrets.ts';
import { DataForSEOClient } from '../../_shared/dataforseo-client.ts';
import { DATAFORSEO_SERVICE } from '../../_shared/tools/dataforseo-spend-gate.ts';
import { logDataForSeoDirectSpend } from '../../_shared/tools/dataforseo-spend-log.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { loadOwnedArticle } from './article-access.ts';
import { checkCoverage, type CoverageReport } from './coverage.ts';
import { extractLessons } from './lessons.ts';
import { countryForLocation, marketForCountry } from './market.ts';
import { hostOf, trimSlash } from './site-assets.ts';
import { reserveStage, serviceCredits, settleStage, type StageWallet } from './stage-billing.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

export const ANSWER_CHECK_INTERVAL_DAYS = 7;
const ARTICLES_PER_CRON_RUN = 3;
const COVERAGE_ANSWER_CHARS = 3400;

export type AnswerEngine = 'google_ai_mode' | 'chatgpt' | 'perplexity';
export type EngineAnswer = { text: string; references: { url: string; domain: string; title: string }[] } | null;
interface Query { keyword: string; locationCode: number; languageCode: string; country: string | null }

interface EngineSpec {
  engine: AnswerEngine;
  label: string;
  ceilingUnits: number;
  fallbackCredits: number;
  ask(client: DataForSEOClient, q: Query): Promise<EngineAnswer>;
}

interface EngineRun { engine: AnswerEngine; label: string; answer: EngineAnswer; error: string | null; credits: number }

interface CheckableArticle {
  id: string; user_id: string; workspace_id: string | null; website_id: string | null;
  slug: string | null; published_url: string | null; target_keyword: string | null; markdown_content: string | null;
  stages_data: { extra?: Record<string, unknown> } | null;
}

/** The crawled page at the article's published URL, else the page of its site whose last path segment is the slug. */
async function publishedPage(supabase: DbClient, a: CheckableArticle) {
  const published = a.published_url ? trimSlash(a.published_url.trim()) : null;
  if (!a.website_id || (!published && !a.slug)) return null;
  const query = supabase
    .from('user_website_pages')
    .select('url, content_text, fetched_at')
    .eq('website_id', a.website_id)
    .eq('is_active', true);
  const { data } = await (published ? query.in('url', [published, `${published}/`]) : query.or(`url.like.%/${a.slug},url.like.%/${a.slug}/`))
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

async function askEngine(
  supabase: DbClient,
  spec: EngineSpec,
  wallet: StageWallet,
  q: Query,
  creds: [string, string],
): Promise<EngineRun> {
  const run: EngineRun = { engine: spec.engine, label: spec.label, answer: null, error: null, credits: 0 };
  try {
    const ceiling = (await serviceCredits(supabase, DATAFORSEO_SERVICE, spec.ceilingUnits)) ?? spec.fallbackCredits;
    const hold = await reserveStage(supabase, wallet, ceiling, `Answer-engine check (${spec.label}): "${q.keyword}"`);
    if (!hold.ok) return { ...run, error: `not checked: ${hold.error}` };
    const client = new DataForSEOClient(...creds);
    try {
      run.answer = await spec.ask(client, q);
    } catch (e) {
      run.error = (e as Error).message.slice(0, 300);
    }
    await logDataForSeoDirectSpend(supabase, {
      userId: wallet.userId, workspaceId: wallet.workspaceId, operation: `seo_answer_check.${spec.engine}`,
      costUsd: client.spentUsd, ok: !!run.answer, note: client.unpricedCalls > 0 ? 'a response carried no cost' : undefined,
    });
    const spent = client.unpricedCalls > 0 ? null : await serviceCredits(supabase, DATAFORSEO_SERVICE, client.spentUsd * 1000);
    run.credits = await settleStage(supabase, wallet, ceiling, spent, { engine: spec.engine, answered: !!run.answer });
  } catch (e) {
    run.error = run.error ?? (e as Error).message.slice(0, 300);
  }
  return run;
}

export const ENGINES: EngineSpec[] = [
  {
    engine: 'google_ai_mode', label: 'Google AI Mode', ceilingUnits: 10, fallbackCredits: 2,
    ask: (client, q) => client.aiModeAnswer(q.keyword, q.locationCode, q.languageCode),
  },
  {
    engine: 'chatgpt', label: 'ChatGPT', ceilingUnits: 80, fallbackCredits: 16,
    ask: (client, q) => client.chatGptAnswer(q.keyword, q.country),
  },
  {
    engine: 'perplexity', label: 'Perplexity', ceilingUnits: 20, fallbackCredits: 4,
    ask: (client, q) => client.perplexityAnswer(q.keyword, q.country),
  },
];

export function citesSite(answer: NonNullable<EngineAnswer>, siteHost: string | null): boolean {
  if (!siteHost) return false;
  return answer.references.some((r) => hostOf(r.url) === siteHost || trimSlash(r.domain).replace(/^www\./, '') === siteHost);
}

export function unionAnswer(answers: { label: string; text: string }[], budget = COVERAGE_ANSWER_CHARS): string | null {
  const withText = answers.filter((a) => a.text.trim());
  if (!withText.length) return null;
  if (withText.length === 1) return withText[0].text.trim().slice(0, budget);
  const share = Math.floor(budget / withText.length);
  return withText.map((a) => {
    const head = `[${a.label}]\n`;
    return head + a.text.trim().slice(0, Math.max(0, share - head.length - 2));
  }).join('\n\n');
}

/** Insert order: failures first, Google AI Mode last, so the newest row stays the one readers already expect. */
export function rowRank(row: { status: string; engine: string }): number {
  return (row.status === 'ok' ? 10 : 0) + (row.engine === 'google_ai_mode' ? 1 : 0);
}

export async function checkArticle(supabase: DbClient, a: CheckableArticle) {
  const page = await publishedPage(supabase, a);
  if (!page || !a.workspace_id || !a.target_keyword) return { article_id: a.id, skipped: page ? 'no workspace or keyword' : 'not published' };

  if (!a.stages_data?.extra?.lessons) await extractLessons(supabase, a, page);
  const extra = a.stages_data?.extra ?? {};
  const languageCode = String(extra.language_code ?? 'en');
  // An article from before the market was stored is checked in the business's own market, never a silent US.
  const { data: fin } = await supabase.from('finance_settings').select('business_country_code').eq('workspace_id', a.workspace_id).maybeSingle();
  const locationCode = Number(extra.location_code ?? marketForCountry(fin?.business_country_code)?.location_code ?? 2840);
  const siteHost = hostOf(page.url);
  const wallet: StageWallet = { userId: a.user_id, workspaceId: a.workspace_id, opType: 'seo_answer_check' };
  const base = { article_id: a.id, workspace_id: a.workspace_id, page_url: page.url, page_fetched_at: page.fetched_at, keyword: a.target_keyword };

  const [login, password] = await Promise.all([resolveSecret(supabase, 'DATAFORSEO_LOGIN'), resolveSecret(supabase, 'DATAFORSEO_PASSWORD')]);
  const q: Query = { keyword: a.target_keyword, locationCode, languageCode, country: countryForLocation(locationCode) };
  const creds: [string, string] = [login.value ?? '', password.value ?? ''];
  const runs = await Promise.all(ENGINES.map((spec) => askEngine(supabase, spec, wallet, q, creds)));
  const answered = runs.filter((r): r is EngineRun & { answer: NonNullable<EngineAnswer> } => !!r.answer && !r.error);

  let coverage: CoverageReport | null = null;
  if (answered.length) {
    const researchId = typeof extra.keyword_research_id === 'string' ? extra.keyword_research_id : undefined;
    const { data: research } = researchId
      ? await supabase.from('seo_keyword_research').select('research_data').eq('id', researchId).maybeSingle()
      : { data: null };
    coverage = await checkCoverage(supabase, {
      text: page.content_text,
      mustCover: {
        aiAnswer: unionAnswer(answered.map((r) => ({ label: r.label, text: r.answer.text }))),
        questions: ((research?.research_data as { readerQuestions?: string[] } | null)?.readerQuestions) ?? [],
        guideSections: [],
        paa: [],
      },
      languageCode, userId: a.user_id, workspaceId: a.workspace_id,
    });
  }

  const rows: (Record<string, unknown> & { engine: AnswerEngine; status: string })[] = runs.map((r) => {
    if (r.error || !r.answer || !coverage) {
      return { ...base, engine: r.engine, status: r.error ? 'failed' : 'no_answer', error: r.error, credits: r.credits };
    }
    return {
      ...base,
      engine: r.engine,
      status: coverage.failed ? 'failed' : 'ok',
      error: coverage.failed ?? null,
      answer_text: r.answer.text || null,
      answer_references: r.answer.references,
      our_domain_cited: citesSite(r.answer, siteHost),
      missing: coverage.missing,
      credits: r.credits + (r === answered[0] ? coverage.credits : 0),
    };
  }).sort((x, y) => rowRank(x) - rowRank(y));
  for (const row of rows) await recordCheck(supabase, row);

  const statuses = rows.map((r) => r.status);
  return {
    article_id: a.id,
    status: statuses.includes('ok') ? 'ok' : statuses.includes('failed') ? 'failed' : 'no_answer',
    engines: Object.fromEntries(rows.map((r) => [r.engine, { status: r.status, cited: r.our_domain_cited ?? null }])),
    missing: coverage?.missing.length ?? 0,
  };
}

export const ARTICLE_COLUMNS = 'id, user_id, workspace_id, website_id, slug, published_url, target_keyword, markdown_content, stages_data';

export async function handleAnswerCheck(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const isCron = secretMatches(req.headers.get('x-cron-secret'), CRON_SECRET());

  if (!isCron) {
    const auth = await authenticate(req);
    if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
    if (typeof body.article_id !== 'string') return jsonResponse({ success: false, error: 'article_id is required' }, 400);
    const owned = await loadOwnedArticle(supabase, auth.userId, body.article_id);
    if ('response' in owned) return owned.response;
    const { data } = await supabase.from('seo_articles').select(ARTICLE_COLUMNS).eq('id', body.article_id).single();
    return jsonResponse({ success: true, data: await checkArticle(supabase, data as CheckableArticle) });
  }

  const since = new Date(Date.now() - ANSWER_CHECK_INTERVAL_DAYS * 86_400_000).toISOString();
  const { data: recent } = await supabase.from('seo_article_answer_checks').select('article_id').gte('checked_at', since);
  const fresh = new Set((recent ?? []).map((r: { article_id: string }) => r.article_id));
  const { data: candidates, error } = await supabase
    .from('seo_articles')
    .select(ARTICLE_COLUMNS)
    .eq('status', 'completed')
    .not('website_id', 'is', null)
    .or('slug.not.is.null,published_url.not.is.null')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return jsonResponse({ success: false, error: error.message }, 500);
  const due = ((candidates ?? []) as CheckableArticle[]).filter((a) => !fresh.has(a.id));
  runInBackground((async () => {
    let checked = 0;
    for (const a of due) {
      if (checked >= ARTICLES_PER_CRON_RUN) break;
      const r = await checkArticle(supabase, a).catch((e: Error) => ({ article_id: a.id, status: 'failed', error: e.message }));
      if (!('skipped' in r)) checked += 1;
    }
  })(), 'seo-answer-check');
  return jsonResponse({ success: true, data: { due: due.length, checking_up_to: ARTICLES_PER_CRON_RUN } });
}
