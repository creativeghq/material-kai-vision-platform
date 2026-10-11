/** SEO Pipeline Edge Function (Async Orchestrator) */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { SEO_MODULE } from './entitlement.ts';
import { generateStandardEmbedding } from '../../_shared/embedding-utils.ts';
import { resolveWebsite } from '../../_shared/seo-website.ts';
import { runInBackground } from '../../_shared/background.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { handleResearch } from './research.ts';
import { handlePlan } from './plan.ts';
import { normalizeContentBrief, resolveBriefWithProfile, type NormalizedBrief } from './content-brief.ts';
import { enforceSiteAssets, findSitePages, type SitePage } from './site-pages.ts';
import { slugTerms } from './site-assets.ts';
import { latinTerms } from './foreign-words.ts';

import { marketForCountry } from './market.ts';
import { reviewArticle } from './review.ts';
import { reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';
import { PHOTOS_PER_PAGE } from './site-pages.ts';
import { PHOTO_VERIFY_MAX_INPUT_TOKENS, PHOTO_VERIFY_MAX_OUTPUT_TOKENS, PHOTO_VERIFY_MODEL, type PhotoUsage } from './photo-verify.ts';
import { WRITE_MAX_INPUT_TOKENS, WRITE_MAX_OUTPUT_TOKENS } from './write.ts';
import { DEFAULT_CLAUDE_MODEL } from '../../_shared/ai-client.ts';

/** What research + planning typically settle to before the write reservation is taken. */
const PRE_WRITE_TYPICAL_CREDITS = 40;
import { handleWrite } from './write.ts';
import { handleAnalyze } from './analyze.ts';
import { buildGapsGains } from './gaps.ts';
import type {
  SEOPipelineRequest,
  SEOPipelineResponse,
  ArticleStatus,
  PipelineStage,
  KeywordResearchResult,
  ArticlePlan,
  ContentBrief,
  ContentAnalysisResult,
  ArticleOutput,
  MissingTopic,
} from '../../_shared/seo-types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/** Our pages offered to the writer as link targets and photo sources. */
const SITE_LINK_TARGETS = 14;
/** Of those, how many the planner is told already exist on the site. */
const SITE_CONTEXT_PAGES = 6;


/** The four stages, called IN-PROCESS. */
const STAGE_HANDLERS: Record<string, (req: Request, body: any) => Promise<Response>> = {
  research: handleResearch,
  plan: handlePlan,
  write: handleWrite,
  analyze: handleAnalyze,
};

async function callStage(
  stage: 'research' | 'plan' | 'write' | 'analyze',
  req: Request,
  body: any,
  timeoutMs: number = 120_000,
): Promise<any> {
  // A hung stage would block the catch that marks the row failed; the race only guarantees we record it.
  let timer: number | undefined;
  const guard = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`The ${stage} stage did not finish within ${Math.round(timeoutMs / 1000)}s.`)),
      timeoutMs,
    ) as unknown as number;
  });

  try {
    const response = await Promise.race([STAGE_HANDLERS[stage](req, body), guard]);
    const result = await response.json().catch(() => null);
    if (!result?.success) {
      const detail = result?.error || `HTTP ${response.status}`;
      throw new Error(`The ${stage} stage failed: ${detail}`);
    }
    return result;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function handlePipeline(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await authenticate(req);
  if (!auth.success) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  // Secret/service callers (agent-chat) auth at 'secret' level (userId null) + pass user_id in body.
  // Only a secret-level caller may specify user_id in the body.
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) {
    return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  }
  if (typeof body.resume_article_id === 'string') {
    return resumePipeline(supabase, req, userId, body.resume_article_id);
  }
  const startTime = Date.now();
  let articleId: string | null = null;
  let totalCredits = 0;

  try {

    if (!body.topic || !body.target_keyword) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: topic, target_keyword' },
        400,
      );
    }

    const requestedWs = typeof body.workspace_id === 'string' ? body.workspace_id : null;
    let memberQuery = supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (requestedWs) memberQuery = memberQuery.eq('workspace_id', requestedWs);
    // NB: workspace_members has no `created_at` — the timestamp column is `joined_at`.
    const { data: memberRows, error: memberErr } = await memberQuery
      .order('joined_at', { ascending: false })
      .limit(1);
    if (memberErr) {
      return jsonResponse({ success: false, error: `Could not resolve workspace: ${memberErr.message}` }, 400);
    }
    const workspaceId = memberRows?.[0]?.workspace_id ?? null;
    if (requestedWs && !workspaceId) {
      // Asked for a workspace they are not a member of — 404, not 403 (no id enumeration).
      return jsonResponse({ success: false, error: 'Not found' }, 404);
    }

    // Paid module — refuse before creating the article or debiting any stage credits (#212).
    if (workspaceId) {
      const ent = await assertEntitled(supabase, workspaceId, SEO_MODULE);
      if (!ent.ok) return ent.response;
    }

    // Peak hold = write reservation + settled research/plan; refused up front, before research is paid for.
    const peakCredits = await tokenCeiling(supabase, DEFAULT_CLAUDE_MODEL, WRITE_MAX_INPUT_TOKENS, WRITE_MAX_OUTPUT_TOKENS, 150)
      + PRE_WRITE_TYPICAL_CREDITS;
    const { data: preflight } = await supabase.rpc('preflight_credits', {
      p_user_id: userId, p_amount: peakCredits, p_workspace_id: workspaceId,
    });
    const pf = Array.isArray(preflight) ? preflight[0] : preflight;
    if (pf && pf.sufficient === false) {
      return jsonResponse({
        success: false,
        error: `An article needs up to ${peakCredits} credits available while it is written `
          + `(you are charged only what it actually uses, typically about 90). Balance: ${Number(pf.balance ?? 0)}.`,
        credits_required: peakCredits,
      }, 402);
    }

    // ── Idempotency (#361 `EG-8`) ────────────────────────────────────────────────────────
    const idempotencyKey = typeof body.idempotency_key === 'string' && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 200)
      : null;

    if (idempotencyKey) {
      const { data: prior } = await supabase
        .from('seo_articles')
        .select('id, status, progress_percentage, current_stage')
        .eq('user_id', userId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (prior) {
        console.log(`[seo-pipeline] idempotency_key ${idempotencyKey} → existing article ${prior.id}`);
        return jsonResponse({
          success: true,
          deduplicated: true,
          data: {
            article_id: prior.id,
            status: prior.status,
            progress_percentage: prior.progress_percentage,
            current_stage: prior.current_stage,
          },
        });
      }
    }

    // In-flight guard, bounded by age: a dead run stays non-terminal forever and must not block the keyword.
    const IN_FLIGHT_WINDOW_MS = 30 * 60 * 1000;
    const { data: running, error: inFlightErr } = await supabase
      .from('seo_articles')
      .select('id, status, progress_percentage, current_stage, created_at')
      .eq('user_id', userId)
      .eq('target_keyword', body.target_keyword)
      .neq('status', 'completed')
      .neq('status', 'failed')
      .gte('created_at', new Date(Date.now() - IN_FLIGHT_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (inFlightErr) {
      console.error('[seo-pipeline] in-flight duplicate check failed:', inFlightErr.message);
    }
    const inFlight = running?.[0];
    if (inFlight) {
      console.log(`[seo-pipeline] "${body.target_keyword}" already running as ${inFlight.id} — not starting a second`);
      return jsonResponse({
        success: true,
        deduplicated: true,
        data: {
          article_id: inFlight.id,
          status: inFlight.status,
          progress_percentage: inFlight.progress_percentage,
          current_stage: inFlight.current_stage,
        },
      });
    }

    const brief = await resolveBriefWithProfile(supabase, workspaceId, body.content_brief);

    const website = await resolveWebsite(supabase, { workspaceId, explicitWebsiteId: body.website_id });
    const websiteId = website?.id ?? null;

    // A caller that names no market gets the business's own (GR → Greece, Greek), never a silent US.
    let marketSource = body.language_code && body.location_code ? 'caller' : 'default_us';
    if ((!body.language_code || !body.location_code) && workspaceId) {
      const { data: fin } = await supabase
        .from('finance_settings').select('business_country_code').eq('workspace_id', workspaceId).maybeSingle();
      const market = marketForCountry(fin?.business_country_code);
      if (market) {
        body.language_code ||= market.language_code;
        body.location_code ||= market.location_code;
        marketSource = 'workspace_country';
      }
    }

    // A second article on one keyword for one site competes for the same ranking: refused unless a deliberate rewrite.
    if (websiteId && body.allow_duplicate !== true) {
      // A row still "in progress" past the in-flight window is a dead run, not an article.
      const { data: siblings, error: siblingErr } = await supabase
        .from('seo_articles')
        .select('id, title, target_keyword, status')
        .eq('website_id', websiteId)
        .or(`status.eq.completed,created_at.gte.${new Date(Date.now() - 30 * 60 * 1000).toISOString()}`)
        .neq('status', 'failed');
      if (siblingErr) {
        return jsonResponse({ success: false, error: `Could not check for an existing article: ${siblingErr.message}` }, 500);
      }
      const wanted = normalizeKeyword(body.target_keyword);
      const twin = (siblings ?? []).find((a: { target_keyword: string | null }) => normalizeKeyword(a.target_keyword ?? '') === wanted);
      if (twin) {
        return jsonResponse({
          success: false,
          error: `This website already has an article on "${twin.target_keyword}" ("${twin.title ?? 'untitled'}"). `
            + 'Pick a different keyword or angle, or pass allow_duplicate to rewrite it on purpose.',
          data: { existing_article_id: twin.id },
        }, 409);
      }
    }

    // Create article record immediately (for frontend polling)
    const { data: articleRow, error: insertError } = await supabase
      .from('seo_articles')
      .insert({
        user_id: userId,
        workspace_id: workspaceId,
        website_id: websiteId,
        target_keyword: body.target_keyword,
        idempotency_key: idempotencyKey,
        content_type: brief?.contentType || 'guide',
        content_brief: brief,
        status: 'researching',
        progress_percentage: 0,
        current_stage: 'research',
        pipeline_log: [`[${new Date().toISOString()}] Pipeline started for "${body.target_keyword}"`],
        stages_data: { extra: {
          language_code: body.language_code || 'en',
          location_code: body.location_code || 2840,
          market_source: marketSource,
          site_url: website?.url ?? null,
        } },
      })
      .select('id')
      .single();

    if (insertError || !articleRow) {
      throw new Error(`Failed to create article record: ${insertError?.message}`);
    }

    articleId = articleRow.id;
    console.log(`[seo-pipeline] Article ${articleId} created. Starting pipeline for "${body.target_keyword}"`);

    // ── Return the article id NOW; the stages run past the response ──────────────────────
    const backgroundArticleId: string = articleRow.id;
    runInBackground(
      runPipelineStages({
        supabase, req, body, brief, userId, workspaceId, websiteId, website,
        articleId: backgroundArticleId, startTime,
      }).catch((stageError: unknown) => markFailed(supabase, backgroundArticleId, stageError)),
      'seo-pipeline',
    );

    return jsonResponse({
      success: true,
      data: {
        article_id: articleId,
        status: 'researching' as ArticleStatus,
        progress_percentage: 0,
        current_stage: 'research' as PipelineStage,
      },
    });
  } catch (error: any) {
    console.error('[seo-pipeline] Error before hand-off:', error);
    if (articleId) {
      const { error: failErr } = await supabase
        .from('seo_articles')
        .update({
          status: 'failed',
          error_message: String(error?.message ?? error).slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq('id', articleId);
      if (failErr) {
        console.error(`[seo-pipeline] could not mark article ${articleId} failed:`, failErr.message);
      }
    }
    return jsonResponse({
      success: false,
      error: error.message || 'Pipeline failed',
      data: articleId ? { article_id: articleId } : undefined,
    }, 500);
  }
}

/**
 * Stages 1-5, run AFTER the response has been sent.
 *
 * Nothing in here may return a Response — there is no longer a request to answer. The
 * `seo_articles` row IS the result: every stage updates `status` / `progress_percentage` /
 * `current_stage`, and the viewer polls until one of them is terminal.
 */
async function runPipelineStages(ctx: {
  supabase: DbClient;
  req: Request;
  // deno-lint-ignore no-explicit-any
  body: any;
  brief: NormalizedBrief | null;
  userId: string;
  workspaceId: string | null;
  websiteId: string | null;
  website: Awaited<ReturnType<typeof resolveWebsite>>;
  articleId: string;
  startTime: number;
}): Promise<void> {
  const {
    supabase, req, body, brief, userId, workspaceId, websiteId, website,
    articleId, startTime,
  } = ctx;
  let totalCredits = 0;
  const creditsByStage: Record<string, number> = {};

    // ────────────────────────────────────────────────────────────
    // STAGE 1: RESEARCH
    // ────────────────────────────────────────────────────────────
    await updateArticle(supabase, articleId, {
      status: 'researching',
      progress_percentage: 5,
      current_stage: 'research',
    }, 'Starting keyword research...');

    let research: KeywordResearchResult;

    if (body.skip_research && body.existing_research) {
      research = body.existing_research;
      await updateArticle(supabase, articleId, {
        progress_percentage: 25,
        stages_data: { research: { skipped: true, data: research } },
      }, 'Using existing research data');
    } else {
      const researchResult = await callStage('research', req, {
        topic: body.topic,
        target_keyword: body.target_keyword,
        language_code: body.language_code || 'en',
        location_code: body.location_code || 2840,
        user_id: userId,
        website_id: websiteId,
      }, 90_000);

      research = researchResult.data.research;
      totalCredits += Number(researchResult.data.credits_used ?? 0);
      creditsByStage.research = Number(researchResult.data.credits_used ?? 0);

      await updateArticle(supabase, articleId, {
        keyword_research_id: researchResult.data.research_id,
        progress_percentage: 25,
        stages_data: { research: { research_id: researchResult.data.research_id, keywords_found: research.clusters.reduce((s: number, c: any) => s + 1 + c.secondaryKeywords.length, 0), paa_count: research.paaQuestions.length, competitor_count: research.serpInsights.length } },
      }, `Research complete: ${research.paaQuestions.length} PAA questions, ${research.serpInsights.length} competitors`);
    }

    // ────────────────────────────────────────────────────────────
    // STAGE 2: PLAN
    // ────────────────────────────────────────────────────────────
    await updateArticle(supabase, articleId, {
      status: 'planning',
      progress_percentage: 30,
      current_stage: 'plan',
    }, 'Planning article structure...');

    const topicRead = await readTopicPages(websiteId, body.target_keyword);
    if (topicRead) await updateArticle(supabase, articleId, {}, topicRead);

    // Photo checks are paid vision calls: reserved at their ceiling, settled to the tokens used
    // (a photo checked before is cached and costs nothing).
    const photoWallet: StageWallet = { userId, workspaceId, opType: 'seo_photo_verify' };
    const photoCeiling = SITE_LINK_TARGETS * PHOTOS_PER_PAGE * await tokenCeiling(
      supabase, PHOTO_VERIFY_MODEL, PHOTO_VERIFY_MAX_INPUT_TOKENS, PHOTO_VERIFY_MAX_OUTPUT_TOKENS, 1);
    const photoHold = await reserveStage(supabase, photoWallet, photoCeiling, `SEO photo checks: "${body.target_keyword}"`);
    const photoUsage: PhotoUsage[] = [];
    const sitePages = await findSitePages(supabase, {
      userId, workspaceId, websiteId,
      queryText: [body.topic, body.target_keyword, ...research.recommendedSecondaries.slice(0, 8)].join('\n'),
      limit: SITE_LINK_TARGETS,
      languageCode: body.language_code ?? null,
      photoUsage: photoHold.ok ? photoUsage : undefined,
    });
    if (photoHold.ok) {
      const priced = await Promise.all(photoUsage.map((u) => tokenCredits(supabase, u.model, u)));
      const actual = priced.some((c) => c === null) ? null : priced.reduce<number>((s, c) => s + (c ?? 0), 0);
      const charged = await settleStage(supabase, photoWallet, photoCeiling, actual, { photos_checked: photoUsage.length });
      totalCredits += charged;
      creditsByStage.photo_checks = charged;
    }
    const planBrief = await withSiteClusterContext(supabase, brief, websiteId, articleId, sitePages);

    // Words from the slugs/titles of the pages this article links, and from its target searches:
    // never flagged as foreign by the analyzer.
    const protectedTerms = new Set(latinTerms([
      research.targetKeyword,
      ...sitePages.map((p) => `${p.url.replace(/^https?:\/\/[^/]+/, '').replace(/[/_-]+/g, ' ')} ${p.title ?? ''}`),
    ].join(' ')));
    await updateArticle(supabase, articleId, {
      site_link_targets: sitePages.map((p) => ({ url: p.url, title: p.title, photos: p.images.length })),
      protected_terms: [...protectedTerms],
    }, `Site context: ${sitePages.length} of our pages as link targets, ${sitePages.reduce((s, p) => s + p.images.length, 0)} photos, ${protectedTerms.size} protected terms`);

    const planResult = await callStage('plan', req, {
      topic: body.topic,
      target_keyword: body.target_keyword,
      keyword_research: research,
      content_brief: planBrief,
      additional_instructions: body.additional_instructions,
      language_code: body.language_code || undefined,
      user_id: userId,
    }, 180_000);

    const plan: ArticlePlan = planResult.data.plan;
    totalCredits += Number(planResult.data.credits_used ?? 0);
    creditsByStage.plan = Number(planResult.data.credits_used ?? 0);

    await updateArticle(supabase, articleId, {
      title: plan.title,
      slug: plan.slug,
      meta_title: plan.metaTitle,
      meta_description: plan.metaDescription,
      secondary_keywords: plan.secondaryKeywords,
      article_plan: plan,
      progress_percentage: 40,
      stages_data: { research: undefined, plan: { title: plan.title, sections_count: plan.sections.length, target_words: plan.targetWordCount } },
    }, `Plan complete: "${plan.title}" — ${plan.sections.length} sections`);

    // ────────────────────────────────────────────────────────────
    // STAGE 3: WRITE
    // ────────────────────────────────────────────────────────────
    await updateArticle(supabase, articleId, {
      status: 'writing',
      progress_percentage: 45,
      current_stage: 'write',
    }, 'Writing article with Claude Opus...');

    const writeResult = await callStage('write', req, {
      article_plan: plan,
      content_brief: brief,
      site_pages: sitePages,
      language_code: body.language_code || undefined,
      keyword_research_summary: {
        targetKeyword: research.targetKeyword,
        recommendedPrimary: research.recommendedPrimary,
        recommendedSecondaries: research.recommendedSecondaries.slice(0, 5),
        paaQuestions: research.paaQuestions,
        serpSignals: research.serpSignals,
      },
      user_id: userId,
    }, 300_000);

    const written = await enforceSiteAssets(supabase, websiteId, website?.url ?? null, writeResult.data.content_markdown, sitePages);
    const contentMarkdown = written.markdown;
    const wordCount = writeResult.data.word_count;
    totalCredits += Number(writeResult.data.credits_used ?? 0);
    creditsByStage.write = Number(writeResult.data.credits_used ?? 0);

    await updateArticle(supabase, articleId, {
      markdown_content: contentMarkdown,
      word_count: wordCount,
      progress_percentage: 70,
    }, `Article written: ${wordCount} words (${written.unlinked} unverified site links unwrapped, ${written.removedImages} photos not from our pages removed)`);

    // One isolate cannot run every stage inside the background wall clock, so review onward runs in a fresh one.
    const resume: ResumeState = {
      research, plan, site_pages: sitePages, protected_terms: [...protectedTerms],
      total_credits: totalCredits, credits_by_stage: creditsByStage, start_time: startTime,
      language_code: body.language_code ?? null,
    };
    await updateArticle(supabase, articleId, { resume }, 'Draft saved; review and analysis continue');
    const handOff = await fetch(`${supabaseUrl}/functions/v1/seo-api`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: req.headers.get('authorization') ?? '',
        ...(req.headers.get('apikey') ? { apikey: req.headers.get('apikey')! } : {}),
      },
      body: JSON.stringify({ action: 'pipeline', resume_article_id: articleId, user_id: userId }),
    });
    const handOffResult = await handOff.json().catch(() => null);
    if (!handOffResult?.success) {
      throw new Error(`Could not continue after writing: ${handOffResult?.error ?? `HTTP ${handOff.status}`}`);
    }
}

/** Reads the site's unread pages on this topic first (a new category, a product nobody searched for); billed per page by the crawler. */
async function readTopicPages(websiteId: string | null, keyword: string): Promise<string | null> {
  const focus = slugTerms(keyword);
  if (!websiteId || !focus.length) return null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/crawl-user-website`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseServiceKey}`,
        'x-cron-secret': Deno.env.get('CRON_SECRET') || '',
      },
      body: JSON.stringify({ website_id: websiteId, focus }),
      signal: AbortSignal.timeout(150_000),
    });
    const out = await res.json().catch(() => null);
    if (!out?.success) return `Topic pages (${focus.join(' + ')}) not read: ${out?.error ?? `HTTP ${res.status}`}`;
    return `Topic pages (${focus.join(' + ')}): ${out.data?.pages_fetched ?? 0} read of ${out.data?.pages_queued ?? 0} unread`;
  } catch (e) {
    return `Topic pages (${focus.join(' + ')}) not read: ${(e as Error).message}`;
  }
}

interface ResumeState {
  research: KeywordResearchResult;
  plan: ArticlePlan;
  site_pages: SitePage[];
  protected_terms: string[];
  total_credits: number;
  credits_by_stage: Record<string, number>;
  start_time: number;
  language_code: string | null;
}

async function markFailed(supabase: DbClient, articleId: string, error: unknown): Promise<void> {
  console.error('[seo-pipeline] stage failure:', error);
  const message = error instanceof Error ? error.message : String(error);
  // Written directly, not through updateArticle: the error path must not depend on its read-modify-write.
  const { error: failErr } = await supabase
    .from('seo_articles')
    .update({ status: 'failed', error_message: message.slice(0, 2000), updated_at: new Date().toISOString() })
    .eq('id', articleId);
  if (failErr) console.error(`[seo-pipeline] could not mark article ${articleId} failed:`, failErr.message);
}

/** The hand-off from runPipelineStages: claims the written draft once, then runs review → finalize. */
async function resumePipeline(supabase: DbClient, req: Request, userId: string, articleId: string): Promise<Response> {
  const { data: row, error } = await supabase
    .from('seo_articles')
    .update({ current_stage: 'analyze', updated_at: new Date().toISOString() })
    .eq('id', articleId)
    .eq('user_id', userId)
    .eq('status', 'writing')
    .eq('current_stage', 'write')
    .select('id, workspace_id, website_id, content_brief, markdown_content, stages_data')
    .maybeSingle();
  if (error) return jsonResponse({ success: false, error: error.message }, 500);
  if (!row) return jsonResponse({ success: false, error: 'Not found' }, 404);
  const resume = row.stages_data?.extra?.resume as ResumeState | undefined;
  if (!resume) {
    await markFailed(supabase, articleId, new Error('The written draft has no saved pipeline state to continue from.'));
    return jsonResponse({ success: false, error: 'No saved state' }, 409);
  }
  const workspaceId: string | null = row.workspace_id;
  const website = await resolveWebsite(supabase, { workspaceId, explicitWebsiteId: row.website_id ?? undefined });
  runInBackground(
    runLateStages({
      supabase, req, userId, workspaceId, websiteId: row.website_id, website, articleId,
      brief: row.content_brief as NormalizedBrief | null, contentMarkdown: row.markdown_content ?? '', resume,
    }).catch((e: unknown) => markFailed(supabase, articleId, e)),
    'seo-pipeline-resume',
  );
  return jsonResponse({ success: true, data: { article_id: articleId } });
}

async function runLateStages(ctx: {
  supabase: DbClient;
  req: Request;
  userId: string;
  workspaceId: string | null;
  websiteId: string | null;
  website: Awaited<ReturnType<typeof resolveWebsite>>;
  articleId: string;
  brief: NormalizedBrief | null;
  contentMarkdown: string;
  resume: ResumeState;
}): Promise<void> {
  const { supabase, req, userId, workspaceId, websiteId, website, articleId, brief, resume } = ctx;
  const { research, plan, site_pages: sitePages, protected_terms: protectedTerms, start_time: startTime } = resume;
  let totalCredits = resume.total_credits;
  const creditsByStage = { ...resume.credits_by_stage };

    // ────────────────────────────────────────────────────────────
    // STAGE 4: the editor's review, then an analysis that only reports — nothing rewrites after the editor
    // ────────────────────────────────────────────────────────────
    await updateArticle(supabase, articleId, {
      status: 'analyzing',
      progress_percentage: 75,
      current_stage: 'analyze',
    }, 'Editor review...');

    // Editor's review: claims against our page facts, sums, relationship claims, the language.
    const reviewed = await reviewArticle(supabase, {
      markdown: ctx.contentMarkdown, sitePages, brief, languageCode: resume.language_code, userId, workspaceId,
    });
    totalCredits += reviewed.report.credits;
    creditsByStage.review = reviewed.report.credits;
    const fixed = await enforceSiteAssets(supabase, websiteId, website?.url ?? null, reviewed.markdown, sitePages);
    const finalMarkdown = fixed.markdown;
    await updateArticle(supabase, articleId, {
      markdown_content: finalMarkdown,
      progress_percentage: 88,
      review: reviewed.report,
    }, reviewed.report.failed
      ? `Review did not run: ${reviewed.report.failed}`
      : `Reviewed: ${reviewed.report.applied.length} corrections applied, ${reviewed.report.skipped.length} could not be placed, ${reviewed.report.unresolved.length} flagged for the editor`);

    const scored = await callStage('analyze', req, {
      article_plan: plan,
      content_brief: brief,
      content_markdown: finalMarkdown,
      site_url: website?.url ?? null,
      protected_terms: [...protectedTerms],
      user_id: userId,
      serp_signals: research.serpSignals,
    }, 60_000);
    const analysis: ContentAnalysisResult = scored.data.analysis;
    const finalWordCount = scored.data.word_count;
    totalCredits += Number(scored.data.credits_used ?? 0);
    creditsByStage.analyze = Number(scored.data.credits_used ?? 0);

    await updateArticle(supabase, articleId, {
      progress_percentage: 90,
    }, `Analysis complete: score ${analysis.overallScore}/100${fixed.unlinked + fixed.removedImages ? ` (${fixed.unlinked} links unwrapped, ${fixed.removedImages} photos removed after review)` : ""}`);

    // ────────────────────────────────────────────────────────────
    // STAGE 5: FINALIZE — Build Frase-style report
    // ────────────────────────────────────────────────────────────
    await updateArticle(supabase, articleId, {
      current_stage: 'finalize',
      progress_percentage: 92,
    }, 'Building SEO report...');

    // Byline / disclosure go in before the final save; none is invented when provenance is absent.
    const publishedAt = new Date().toISOString();
    const publishedMarkdown = appendProvenanceBlock(finalMarkdown, brief, website);

    const schemaMarkup = buildSchemaMarkup(plan, publishedMarkdown, {
      brief: brief,
      website,
      publishedAt,
    });
    const faqSchema = buildFaqSchema(plan, publishedMarkdown);

    // Build gaps/gains
    // From the RESEARCH TAB shape, not the raw research result, so `reanalyze` can rebuild the
    // same answer for an article written before this existed — see handlers/gaps.ts.
    const gapsGains = buildGapsGains(finalMarkdown, {
      keyTerms: research.recommendedSecondaries,
      competitors: research.serpInsights,
      questions: research.paaQuestions.map((q) => ({ question: q, answered: false })),
    });

    // Build tab data — use real data from DataForSEO Content Analysis
    const competitorScores = research.serpInsights
      .map((c) => c.contentScore)
      .filter((s): s is number => s !== null && s > 0);

    const optimizeData = {
      contentScore: analysis.overallScore,
      avgCompetitorScore: competitorScores.length
        ? Math.round(competitorScores.reduce((s, v) => s + v, 0) / competitorScores.length)
        : 0,
      topCompetitorScore: competitorScores.length
        ? Math.max(...competitorScores)
        : 0,
      geoScore: analysis.geoScore,
      sectionScores: analysis.sectionScores,
    };

    const briefData = {
      generalInstructions: {
        targetImages: '5-7',
        targetWordCount: `${plan.targetWordCount}+`,
        targetHeadings: `${plan.sections.length + plan.sections.reduce((s, sec) => s + (sec.subsections?.length ?? 0), 0)}`,
      },
      outline: plan.sections,
      faqQuestions: plan.faqQuestions.map((q, i) => ({ id: `q${i + 1}`, question: q })),
      keyTerms: plan.secondaryKeywords,
    };

    const researchTabData = {
      keyTerms: research.recommendedSecondaries.slice(0, 30),
      competition: research.serpInsights,
      questions: research.paaQuestions.map((q) => ({
        question: q,
        source: 'paa' as const,
        volume: null,
        answered: finalMarkdown.toLowerCase().includes(q.toLowerCase().slice(0, 20)),
      })),
      statistics: {
        avgWordCount: research.contentLandscape.avgWordCount,
        avgContentScore: research.contentLandscape.avgContentScore,
        sentimentDistribution: research.contentLandscape.sentiments,
        publicationDateRange: research.contentLandscape.dateRange,
        contentTypeDistribution: research.contentLandscape.contentTypes,
      },
      serpFeatures: research.serpFeatures,
      detailedReport: {},
    };

    // Interlink candidates, scoped to the WORKSPACE as well as the author (#361 EG-7).
    let existingQuery = supabase
      .from('seo_articles')
      .select('id, title, slug, target_keyword')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .neq('id', articleId);
    if (workspaceId) existingQuery = existingQuery.eq('workspace_id', workspaceId);
    const { data: existingArticlesRaw } = await existingQuery
      .order('created_at', { ascending: false })
      .limit(20);

    const existingArticles = (existingArticlesRaw || []).map((a: any) => {
      // Calculate relevance by keyword overlap
      const articleKws = plan.secondaryKeywords.map((k) => k.toLowerCase());
      const targetLower = (a.target_keyword || '').toLowerCase();
      const overlapCount = articleKws.filter((kw) => targetLower.includes(kw) || kw.includes(targetLower)).length;
      return {
        id: a.id,
        title: a.title || 'Untitled',
        slug: a.slug || '',
        relevance: Math.min(1, overlapCount * 0.3 + 0.1),
      };
    }).filter((a: any) => a.relevance > 0.05)
      .sort((a: any, b: any) => b.relevance - a.relevance)
      .slice(0, 10);

    // Site-aware inter-linking: match this article's plan against the user's
    // indexed website pages (if they've connected one in profile settings).
    const siteArticles = await buildSiteMatches(supabase, userId, workspaceId ?? null, plan, finalMarkdown, websiteId);

    // ── Phase 5 — Google related searches: boost matching articles, else suggest a next article ──
    const relatedSearches = research.serpSignals?.relatedSearches || [];
    let suggestedLinks = extractInternalLinks(finalMarkdown);
    let existingArticlesFinal = existingArticles;
    if (relatedSearches.length > 0) {
      let relatedQuery = supabase
        .from('seo_articles')
        .select('id, title, slug, target_keyword')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .neq('id', articleId);
      // Same workspace scoping as the query above — this one feeds the same suggestion list.
      if (workspaceId) relatedQuery = relatedQuery.eq('workspace_id', workspaceId);
      const { data: relatedMatchesRaw } = await relatedQuery
        .order('seo_score', { ascending: false })
        .limit(40);
      const relatedMatches: typeof existingArticles = [];
      for (const term of relatedSearches.slice(0, 12)) {
        const tLower = term.toLowerCase().trim();
        if (!tLower) continue;
        const hit = (relatedMatchesRaw || []).find((a: any) => {
          const tk = (a.target_keyword || '').toLowerCase();
          const tt = (a.title || '').toLowerCase();
          return tk.includes(tLower) || tLower.includes(tk) || tt.includes(tLower);
        });
        if (hit) {
          // Avoid duplicating existingArticles
          if (!existingArticlesFinal.some((a) => a.id === hit.id)) {
            relatedMatches.push({
              id: hit.id,
              title: hit.title || 'Untitled',
              slug: hit.slug || '',
              relevance: 0.85, // strong — Google says these queries cluster
            });
          }
        } else {
          // No existing article — push as a "next-article" suggestion
          suggestedLinks.push({
            anchor: term,
            targetTopic: term,
            reason: 'Google clusters this with the primary keyword — strong write-this-next candidate',
          });
        }
      }
      if (relatedMatches.length > 0) {
        existingArticlesFinal = [
          ...relatedMatches,
          ...existingArticles,
        ]
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, 12);
        console.log(
          `[seo-pipeline] Phase 5 interlinking: matched ${relatedMatches.length} existing articles ` +
          `to Google's related-search cluster, surfaced ${suggestedLinks.length - extractInternalLinks(finalMarkdown).length} ` +
          `write-this-next suggestions`,
        );
      }
    }

    const interlinkingData = {
      suggestedLinks,
      existingArticles: existingArticlesFinal,
      competitorArticles: research.serpInsights.slice(0, 10),
      siteArticles,
    };

    // Calculate processing time and credits
    const processingTimeMs = Date.now() - startTime;

    // Final update. Routed through updateArticle so the column allowlist applies: the real
    // columns are written, and the 14 non-columns this used to name (reading_time_minutes,
    // content_analysis, overall_score, keyword_density, schema_markup,
    // faq_schema, optimize_data, brief_data, gaps_gains_data, research_tab_data,
    // fix_iterations, geo_score, credits_used, processing_time_ms) are preserved in
    // stages_data.extra instead of taking the whole statement down with them.
    await updateArticle(supabase, articleId, {
      markdown_content: publishedMarkdown,
      word_count: finalWordCount,
      reading_time_minutes: Math.ceil(finalWordCount / 200),
      content_analysis: analysis,
      overall_score: analysis.overallScore,
      seo_score: analysis.overallScore,
      readability_score: analysis.readabilityScore,
      keyword_density: analysis.keywordDensity,
      schema_markup: schemaMarkup,
      faq_schema: faqSchema,
      optimize_data: optimizeData,
      brief_data: briefData,
      gaps_gains_data: gapsGains,
      research_tab_data: researchTabData,
      interlinking_data: interlinkingData,
      geo_score: analysis.geoScore?.overall || null,
      credits_used: Math.round(totalCredits * 100) / 100,
      credits_by_stage: creditsByStage,
      processing_time_ms: processingTimeMs,
      resume: null,
      status: 'completed',
      progress_percentage: 100,
      current_stage: 'done',
      completed_at: new Date().toISOString(),
    }, `Pipeline complete: score ${analysis.overallScore}/100, ${finalWordCount} words`);

    console.log(`[seo-pipeline] Complete! Article ${articleId}: score ${analysis.overallScore}/100, ${finalWordCount} words, ${processingTimeMs}ms`);

    // Nothing is returned. The response went out before this function started, so the row is
    // the only result there is — the viewer polls it and stops on `completed` or `failed`.
}

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * The REAL columns on `seo_articles` (verified against information_schema).
 * `id`, `user_id`, `workspace_id`, `created_at` and `idempotency_key` are deliberately
 * excluded — identity is never rewritten by the pipeline. `idempotency_key` in particular is
 * set once at insert and must stay that way: a key that can be moved onto another row is not
 * a deduplication key, it is a way to hand a caller somebody else's article (#361 `EG-8`).
 */
const ARTICLE_COLUMNS = new Set([
  'target_keyword', 'content_type', 'content_brief', 'status', 'progress_percentage',
  'current_stage', 'pipeline_log', 'stages_data', 'markdown_content', 'title',
  'meta_description', 'slug', 'seo_score', 'readability_score', 'word_count',
  'interlinking_data', 'error_message', 'updated_at', 'completed_at', 'website_id',
]);

/**
 * Split a payload into real columns and everything else. The remainder is not discarded —
 * it is folded into `stages_data.extra`, which is jsonb and exists precisely for this.
 * Nothing the pipeline computes is lost; it just stops being written to columns that
 * were never created.
 */
function splitByColumn(updates: Record<string, any>): { cols: Record<string, any>; extra: Record<string, any> } {
  const cols: Record<string, any> = {};
  const extra: Record<string, any> = {};
  for (const [k, v] of Object.entries(updates)) {
    if (ARTICLE_COLUMNS.has(k)) cols[k] = v;
    else if (v !== undefined) extra[k] = v;
  }
  return { cols, extra };
}

async function updateArticle(
  supabase: any,
  // `string | null` because the caller's `articleId` is nullable until the row is created.
  // Accepting the nullable type here (and no-opping on null) is what lets all 12 call
  // sites typecheck without sprinkling non-null assertions through the pipeline.
  articleId: string | null,
  rawUpdates: Record<string, any>,
  logMessage: string,
) {
  if (!articleId) return;
  const { cols, extra } = splitByColumn(rawUpdates);
  const updates: Record<string, any> = cols;
  if (Object.keys(extra).length > 0) {
    updates.stages_data = { ...(updates.stages_data || {}), extra: { ...extra } };
  }

  // Merge stages_data instead of overwriting
  if (updates.stages_data) {
    const { data: current } = await supabase
      .from('seo_articles')
      .select('stages_data, pipeline_log')
      .eq('id', articleId)
      .single();

    updates.stages_data = {
      ...(current?.stages_data || {}),
      ...updates.stages_data,
      // `extra` accumulates across stages — a shallow spread would let each stage's
      // extras replace the previous stage's instead of adding to them.
      ...(updates.stages_data.extra || current?.stages_data?.extra
        ? { extra: { ...(current?.stages_data?.extra || {}), ...(updates.stages_data.extra || {}) } }
        : {}),
    };

    updates.pipeline_log = [
      ...(current?.pipeline_log || []),
      `[${new Date().toISOString()}] ${logMessage}`,
    ];
  } else {
    // Just append to pipeline_log
    const { data: current } = await supabase
      .from('seo_articles')
      .select('pipeline_log')
      .eq('id', articleId)
      .single();

    updates.pipeline_log = [
      ...(current?.pipeline_log || []),
      `[${new Date().toISOString()}] ${logMessage}`,
    ];
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('seo_articles')
    .update(updates)
    .eq('id', articleId);

  if (error) {
    // Was `console.warn` and carry on. That is how a pipeline could burn credits through
    // every stage, return {success:true}, and persist nothing — the only trace was a log
    // line nobody read. If the article cannot be written, the run is already worthless;
    // fail loudly so the catch block records `status='failed'` and the caller sees a 500.
    console.error(`[seo-pipeline] Failed to update article ${articleId}:`, error.message, 'keys:', Object.keys(updates).join(','));
    throw new Error(`Failed to persist article progress: ${error.message}`);
  }
}

/**
 * Human-readable label for the AI-disclosure setting. Google's helpful-content
 * guidance asks for automation to be disclosed rather than concealed; which of the
 * three it is, is the operator's call, so we render what they configured and never
 * pick one for them.
 */
const AI_DISCLOSURE_TEXT: Record<string, string> = {
  ai_generated: 'This article was generated with AI assistance and reviewed before publication.',
  ai_assisted: 'This article was written with AI assistance and edited by our team.',
  human_written: 'This article was written by our team.',
};

/**
 * Build JSON-LD schema markup.
 *
 * `author` / `publisher` / `datePublished` / `dateModified` come from the brief's
 * `provenance` block and the connected website. NOTHING here is invented: with no
 * configured author the `author` property is omitted entirely rather than filled with
 * the site name pretending to be a byline — a fabricated author is a worse signal
 * than a missing one, and the analyzer already raises a `provenance` fix for it.
 */
function buildSchemaMarkup(
  plan: ArticlePlan,
  markdown: string,
  ctx: {
    brief?: NormalizedBrief | null;
    website?: { url: string; domain: string; display_name: string | null } | null;
    publishedAt: string;
  },
): object {
  const schemas: object[] = [];
  const prov = ctx.brief?.provenance;

  const author = prov?.authorName
    ? {
      '@type': 'Person',
      name: prov.authorName,
      ...(prov.authorTitle ? { jobTitle: prov.authorTitle } : {}),
      ...(prov.authorBio ? { description: prov.authorBio } : {}),
      ...(prov.authorUrl ? { url: prov.authorUrl } : {}),
    }
    : null;

  const publisherName = prov?.publisherName || ctx.website?.display_name || ctx.website?.domain || null;
  const publisher = publisherName
    ? {
      '@type': 'Organization',
      name: publisherName,
      ...(ctx.website?.url ? { url: ctx.website.url } : {}),
    }
    : null;

  // Article schema (always)
  schemas.push({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: plan.title,
    description: plan.metaDescription,
    keywords: [plan.primaryKeyword, ...plan.secondaryKeywords.slice(0, 5)].join(', '),
    datePublished: ctx.publishedAt,
    dateModified: ctx.publishedAt,
    ...(author ? { author } : {}),
    ...(publisher ? { publisher } : {}),
    ...(prov?.reviewedBy ? { reviewedBy: { '@type': 'Person', name: prov.reviewedBy } } : {}),
  });

  // FAQPage schema (if FAQ questions exist)
  if (plan.faqQuestions.length > 0) {
    const faqEntities = plan.faqQuestions.map((q) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: extractFaqAnswer(markdown, q),
      },
    }));

    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqEntities,
    });
  }

  return schemas.length === 1 ? schemas[0] : schemas;
}

/** Append a visible byline + AI-disclosure block to the article markdown. */
function appendProvenanceBlock(
  markdown: string,
  brief: NormalizedBrief | null,
  website: { display_name: string | null; domain: string } | null,
): string {
  const prov = brief?.provenance;
  if (!prov) return markdown;

  const lines: string[] = [];

  if (prov.authorName) {
    const role = [prov.authorTitle, prov.publisherName || website?.display_name || website?.domain]
      .filter(Boolean)
      .join(', ');
    const byline = prov.authorUrl ? `[${prov.authorName}](${prov.authorUrl})` : prov.authorName;
    lines.push(`**Written by ${byline}**${role ? ` — ${role}` : ''}`);
    if (prov.authorBio) lines.push('', prov.authorBio);
  }

  if (prov.reviewedBy) {
    lines.push('', `**Reviewed by ${prov.reviewedBy}**`);
  }

  const disclosure = prov.aiDisclosure ? AI_DISCLOSURE_TEXT[prov.aiDisclosure] : null;
  if (disclosure) {
    lines.push('', `_${disclosure}_`);
  }

  // Methodology answers Google's "How" for any proprietary numbers cited in the body.
  const methodology = brief?.firsthandExperience?.methodology;
  if (methodology) {
    lines.push('', `_How we know: ${methodology}_`);
  }

  if (lines.length === 0) return markdown;

  return `${markdown.trimEnd()}\n\n---\n\n${lines.join('\n')}\n`;
}

/** Build FAQ schema array */
function buildFaqSchema(
  plan: ArticlePlan,
  markdown: string,
): { question: string; answer: string }[] {
  return plan.faqQuestions.map((q) => ({
    question: q,
    answer: extractFaqAnswer(markdown, q),
  }));
}

/** Extract FAQ answer from markdown (simple heuristic) */
function extractFaqAnswer(markdown: string, question: string): string {
  const lowerMd = markdown.toLowerCase();
  const lowerQ = question.toLowerCase();

  // Find the question in the markdown
  const qIndex = lowerMd.indexOf(lowerQ.slice(0, 30));
  if (qIndex === -1) return '';

  // Get the text after the question until the next heading or double newline
  const afterQ = markdown.substring(qIndex + question.length);
  const nextHeading = afterQ.search(/\n#{1,6}\s/);
  const nextParagraph = afterQ.indexOf('\n\n', 10);
  const endIndex = Math.min(
    nextHeading > 0 ? nextHeading : 500,
    nextParagraph > 0 ? nextParagraph : 500,
  );

  return afterQ.substring(0, endIndex).trim().slice(0, 500);
}

/** Extract [INTERNAL: anchor](topic) links from markdown */
function extractInternalLinks(
  markdown: string,
): { anchor: string; targetTopic: string; reason: string }[] {
  const matches = [...markdown.matchAll(/\[INTERNAL:\s*([^\]]+)\]\(([^)]+)\)/g)];
  return matches.map((m) => ({
    anchor: m[1].trim(),
    targetTopic: m[2].trim(),
    reason: 'Suggested by article content',
  }));
}

/** Match this article's plan against the user's indexed website pages. */
async function buildSiteMatches(
  supabase: any,
  userId: string,
  // Carried purely so the interlink embedding's cost lands on the tenant that asked for the
  // article, rather than on nobody.
  workspaceId: string | null,
  plan: ArticlePlan,
  finalMarkdown: string,
  preferredWebsiteId?: string | null,
): Promise<{
  url: string;
  title: string | null;
  description: string | null;
  relevance: number;
  anchorSuggestion: string;
  alreadyLinked: boolean;
}[]> {
  try {
    // Prefer the website the article was filed under (workspace-resolved upstream);
    // otherwise fall back to any active site owned by this user (legacy path).
    let websiteId = preferredWebsiteId || null;
    if (!websiteId) {
      const { data: sites } = await supabase
        .from('user_websites')
        .select('id, url')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('last_crawled_at', { ascending: false })
        .limit(1);
      if (!sites || sites.length === 0) return [];
      websiteId = sites[0].id as string;
    }

    // Build a compact summary of the planned article for embedding
    const sectionHeadings = collectHeadings(plan.sections).slice(0, 30).join(' | ');
    const summary = [
      plan.title,
      plan.metaDescription,
      `Primary: ${plan.primaryKeyword}`,
      `Secondary: ${plan.secondaryKeywords.slice(0, 15).join(', ')}`,
      `Sections: ${sectionHeadings}`,
    ].filter(Boolean).join('\n');

    let embedding: number[];
    try {
      embedding = await generateStandardEmbedding(summary, 'query', {
        operationType: 'seo_interlink_match', userId, workspaceId,
      });
    } catch (e) {
      console.warn('[seo-pipeline] interlink embedding failed:', (e as Error).message);
      return [];
    }

    const { data: matches, error } = await supabase.rpc('match_user_website_pages', {
      p_user_id: userId,
      p_query_embedding: embedding,
      p_match_threshold: 0.55,
      p_limit: 8,
      p_website_id: websiteId,
    });

    if (error || !matches) {
      if (error) console.warn('[seo-pipeline] match_user_website_pages error:', error.message);
      return [];
    }

    // Detect URLs already linked from the draft, so the UI can skip them
    const linkedUrls = new Set<string>(
      [...finalMarkdown.matchAll(/\]\(([^)\s]+)/g)].map((m) => m[1].trim()),
    );

    const result = (matches as any[]).map((row) => ({
      url: row.url as string,
      title: row.title as string | null,
      description: row.description as string | null,
      relevance: Number(row.similarity),
      anchorSuggestion: pickAnchor(plan, row.title, row.description),
      alreadyLinked: linkedUrls.has(row.url),
    }));

    return result;
  } catch (e) {
    console.warn('[seo-pipeline] buildSiteMatches failed:', (e as Error).message);
    return [];
  }
}

function collectHeadings(sections: any[]): string[] {
  const out: string[] = [];
  const walk = (arr: any[]) => {
    for (const s of arr || []) {
      if (s?.heading) out.push(String(s.heading));
      if (s?.subsections?.length) walk(s.subsections);
    }
  };
  walk(sections);
  return out;
}

/** Case-, accent- and spacing-insensitive form of a keyword; Greek final sigma folds to σ. */
export function normalizeKeyword(keyword: string): string {
  return keyword
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/ς/g, 'σ')
    .replace(/\s+/g, ' ').trim();
}

/**
 * The brief the PLANNER sees: the caller's, plus what this site already published — its other
 * articles and its closest existing pages — so the outline differentiates instead of repeating
 * them. The caller's own cluster context is kept and extended, never replaced.
 */
async function withSiteClusterContext(
  supabase: DbClient,
  brief: NormalizedBrief | null,
  websiteId: string | null,
  articleId: string,
  sitePages: SitePage[],
): Promise<NormalizedBrief | null> {
  if (!websiteId) return brief;
  const { data: articles } = await supabase
    .from('seo_articles')
    .select('title, target_keyword, published_url')
    .eq('website_id', websiteId)
    .eq('status', 'completed')
    .neq('id', articleId)
    .limit(30);
  const already = [
    ...((articles ?? []) as { title: string | null; target_keyword: string | null; published_url: string | null }[])
      .map((a) => `${a.title ?? a.target_keyword} (our article${a.published_url ? `, ${a.published_url}` : ''})`),
    ...sitePages.slice(0, SITE_CONTEXT_PAGES).map((p) => `${p.title ?? p.url} (our page, ${p.url})`),
  ];
  if (already.length === 0) return brief;

  const base = brief ?? normalizeContentBrief({})!;
  const cluster = base.clusterContext ?? { pillarTopic: null, relatedArticles: [], differentiationNote: null };
  return {
    ...base,
    clusterContext: { ...cluster, relatedArticles: [...cluster.relatedArticles, ...already] },
  };
}

/** Pick the secondary keyword that best appears in the target page's title/description, else fall back to title. */
function pickAnchor(plan: ArticlePlan, pageTitle: string | null, pageDescription: string | null): string {
  const haystack = `${pageTitle || ''} ${pageDescription || ''}`.toLowerCase();
  for (const kw of [plan.primaryKeyword, ...plan.secondaryKeywords]) {
    if (!kw) continue;
    if (haystack.includes(kw.toLowerCase())) return kw;
  }
  return pageTitle || plan.primaryKeyword;
}
