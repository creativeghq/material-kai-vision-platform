/**
 * SEO Pipeline Edge Function (Async Orchestrator)
 *
 * Orchestrates the full SEO article pipeline:
 * 1. Research → 2. Plan → 3. Write → 4. Analyze → 5. Finalize
 *
 * Follows the Interior Designer async pattern:
 * - Creates seo_articles record immediately
 * - Updates status/progress after each stage (for frontend polling)
 * - Stores intermediate results in stages_data JSONB
 * - Credits delegated to sub-functions
 */

import { createClient } from '@supabase/supabase-js';
import { escapeHtml } from '../../_shared/html.ts';
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
import { normalizeContentBrief, type NormalizedBrief } from './content-brief.ts';
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


/**
 * The four stages, called IN-PROCESS.
 *
 * They used to be `fetch`ed as standalone edge functions — `seo-research`, `seo-plan`,
 * `seo-write`, `seo-analyze`. Those functions do not exist and never did after the SEO
 * surface was consolidated into this one (`seo-api`, action-routed); only the call sites
 * inside this file were left pointing at the old names. So every run POSTed to a 404,
 * `result.success` came back undefined, and stage 1 threw the generic
 * `seo-research returned failure` — which is exactly what every `seo_articles` row records.
 * The pipeline has therefore never produced an article since the consolidation, while
 * still creating the row, charging the module and reporting a plausible error.
 *
 * They are handlers of the shape `(req, body) => Response` and read `req` only for the
 * method check and `authenticate(req)`, so handing them THIS request re-authenticates the
 * same caller at the same level and needs no service-key round trip. In-process also drops
 * four self-invocations of `seo-api` (four cold starts, four nested calls against the same
 * Supabase trace budget) off a path that is already one long request.
 */
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
  // A stage that hangs would otherwise hang the whole isolate until the platform kills it,
  // and the catch below — the only thing that marks the row `failed` — would never run. The
  // race does not cancel the work, it just guarantees we get to write down what happened.
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
      // Name the stage, the status AND whatever the stage itself said. The old message was a
      // bare `<fn> returned failure` with the real reason dropped, which is why a dead URL
      // and a genuine research error were indistinguishable in `error_message`.
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

    const autoFix = body.auto_fix !== false;
    const maxFixIterations = body.max_fix_iterations || 3;

    // Get workspace ID.
    // Was `.single()`, which ERRORS (PGRST116, "multiple rows returned") for any user who
    // belongs to more than one workspace — and the error was not destructured, so
    // workspaceId silently became null. The article then failed the
    // `seo_articles_ws_select` RLS predicate (is_workspace_member(workspace_id)), so no
    // colleague could see it, and resolveWebsite(null) could not pick the workspace's
    // default site either. Prefer an explicit body.workspace_id reconciled against
    // membership; otherwise take the caller's most recent active membership.
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

    // ── Idempotency (#361 `EG-8`) ────────────────────────────────────────────────────────
    //
    // This handler is one long synchronous request: research alone debits 18 credits and fires
    // six DataForSEO calls, then the writer and the analyzer each run a model, and the whole
    // thing takes minutes. Nothing linked one attempt to the next, so a caller whose connection
    // timed out and retried — or an agent tool invoked twice — ran the entire pipeline again
    // and paid for all of it again. Two guards, both BEFORE the article row and every debit:
    //
    //   1. An explicit `idempotency_key` returns the run it already started.
    //   2. Failing that, an in-flight run for the same keyword is returned rather than
    //      duplicated. This is the retry case specifically: the first attempt is still going,
    //      the caller has simply stopped waiting for it.
    //
    // Neither blocks a deliberate re-run: a finished article is not in-flight, so asking for
    // the same keyword again tomorrow starts a fresh one, as it should.
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

    // In-flight guard. Bounded by age as well as status: a run that died mid-request leaves its
    // row in a non-terminal status forever (the catch only fires when the isolate survives), and
    // without the window that stuck row would block the keyword permanently — trading a
    // double-charge for a feature that never works again, which is the worse failure.
    const IN_FLIGHT_WINDOW_MS = 30 * 60 * 1000;
    // Two `neq`s rather than `.not('status', 'in', '(…)')`: the negated-in spelling is easy to
    // get subtly wrong, and a rejected filter here does not fail loudly — PostgREST returns an
    // error, supabase-js resolves, and the guard just silently stops finding anything. Excluding
    // the two TERMINAL states also means a stage added later is treated as in-flight, which is
    // the direction that keeps the guard working.
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
      // Never silently: an unreadable guard is a guard that is not running, and the cost of
      // that is a duplicated paid pipeline.
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

    // One normalization for the whole run - see content-brief.ts. Every stage normalizes
    // defensively too, but doing it here means the shape STORED on the article row is the
    // canonical one, so a re-run, the viewer and the provenance byline all read the same
    // brief rather than whatever the caller happened to send.
    const brief = normalizeContentBrief(body.content_brief);

    // Resolve the connected website this article belongs to — explicit body.website_id
    // when the agent picked one, else the workspace's default site. Also feeds the
    // interlink page-matcher below so suggestions come from the same site.
    const website = await resolveWebsite(supabase, { workspaceId, explicitWebsiteId: body.website_id });
    const websiteId = website?.id ?? null;

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
        stages_data: {},
      })
      .select('id')
      .single();

    if (insertError || !articleRow) {
      throw new Error(`Failed to create article record: ${insertError?.message}`);
    }

    articleId = articleRow.id;
    console.log(`[seo-pipeline] Article ${articleId} created. Starting pipeline for "${body.target_keyword}"`);

    // ── Return the article id NOW; the stages run past the response ──────────────────────
    //
    // The comment here used to say "Return the article ID immediately" directly above code
    // that ran all five stages inline and returned only once they finished. Everything
    // downstream was built for the version in the comment: `create_seo_article` describes
    // itself as async, emits `article_generation_started` so the frontend can start polling,
    // and `SEOArticleViewer` polls `seo_articles` until it reads `completed` or `failed`.
    //
    // Awaiting the stages cannot work, and not by a small margin. agent-chat caps a tool at
    // `DEFAULT_TOOL_TIMEOUT_MS = 90s`, while a real run is research ~4s + plan ~25s + write
    // 60-120s + analyze with up to two fix passes. Article d8037c81 reached "Writing article
    // with Claude Opus..." at 12:25:58 and the turn died on
    // `Tool 'create_seo_article' timed out after 90s` (Sentry KAI-T5) while the isolate was
    // still writing. Raising that cap is not the fix either: the agent-chat invocation has a
    // ~150s wall of its own, so the tool would still lose the race, just later.
    //
    // `runInBackground` is `EdgeRuntime.waitUntil`, so the isolate stays alive for the stages
    // after this response is sent. If the platform tears it down anyway, the row is left
    // mid-stage — which is exactly what d8037c81 did, sitting at `writing` / 45% forever —
    // so `seo.article_stuck_in_stage` sweeps those and records a real reason.
    // `articleId` stays `string | null` for the catch below; this is the narrowed copy the
    // background work closes over, so it cannot go null underneath it.
    const backgroundArticleId: string = articleRow.id;
    runInBackground(
      runPipelineStages({
        supabase, req, body, brief, userId, workspaceId, websiteId, website,
        articleId: backgroundArticleId, autoFix, maxFixIterations, startTime,
      }).catch(async (stageError: unknown) => {
        const message = stageError instanceof Error ? stageError.message : String(stageError);
        console.error('[seo-pipeline] stage failure:', stageError);
        // Written directly, not through updateArticle: this is the error path, so it must not
        // throw and must not depend on the read-modify-write updateArticle performs.
        // `processing_time_ms` is NOT a column — naming it here once got the FAILURE write
        // rejected too, which is how a failed article became indistinguishable from a running
        // one and spun at its last stage forever.
        const { error: failErr } = await supabase
          .from('seo_articles')
          .update({
            status: 'failed',
            error_message: message.slice(0, 2000),
            updated_at: new Date().toISOString(),
          })
          .eq('id', backgroundArticleId);
        if (failErr) {
          console.error(`[seo-pipeline] could not mark article ${backgroundArticleId} failed:`, failErr.message);
        }
      }),
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
    // Only reached for a failure BEFORE the stages were handed off — auth, validation,
    // entitlement, the insert itself. Once `runInBackground` has the work, failures are
    // recorded on the row by the catch above, because there is no response left to fail.
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
  autoFix: boolean;
  maxFixIterations: number;
  startTime: number;
}): Promise<void> {
  const {
    supabase, req, body, brief, userId, workspaceId, websiteId, website,
    articleId, autoFix, maxFixIterations, startTime,
  } = ctx;
  let totalCredits = 0;

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
      totalCredits += researchResult.data.credits_used || 18;

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

    const planResult = await callStage('plan', req, {
      topic: body.topic,
      target_keyword: body.target_keyword,
      keyword_research: research,
      content_brief: brief,
      additional_instructions: body.additional_instructions,
      language_code: body.language_code || undefined,
      user_id: userId,
      // 180s, like write and analyze. It was 60 — set when the plan call had a 4096-token
      // budget that could not finish anyway. A reasoning model with room to think takes
      // longer, and losing the race here does NOT cancel `handlePlan`: it completes, keeps
      // its 2 credits (its own catch never fires, so nothing refunds), and the pipeline
      // fails holding a plan that exists.
    }, 180_000);

    const plan: ArticlePlan = planResult.data.plan;
    totalCredits += planResult.data.credits_used || 2;

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
      language_code: body.language_code || undefined,
      keyword_research_summary: {
        targetKeyword: research.targetKeyword,
        recommendedPrimary: research.recommendedPrimary,
        recommendedSecondaries: research.recommendedSecondaries.slice(0, 5),
        paaQuestions: research.paaQuestions,
        // Phase 3 — forward mention-monitoring SERP signals so the writer
        // can use AI Overview text, featured-snippet target, and PAA
        // answer snippets directly inside the prompt.
        serpSignals: research.serpSignals,
      },
      user_id: userId,
      // 300s, measured not guessed. Claude Opus 5 writing this pipeline's own plan — 2,200
      // Greek words over 7 sections — took 217s and 9,934 output tokens against the live API
      // on 2026-09-06 (Sonnet 5 took 154s for the same brief, so the model choice does not
      // rescue a 180s budget either). At 180s the stage was killed mid-generation and the run
      // died as `The write stage did not finish within 180s.`
      //
      // This only works because the stages run under EdgeRuntime.waitUntil: a request-bound
      // call is capped by the gateway at `{"code":"IDLE_TIMEOUT","message":"Request idle
      // timeout limit (150s) reached"}`, which a direct `write` call hits every time.
    }, 300_000);

    const contentMarkdown = writeResult.data.content_markdown;
    const wordCount = writeResult.data.word_count;
    totalCredits += writeResult.data.credits_used || 20;

    await updateArticle(supabase, articleId, {
      markdown_content: contentMarkdown,
      word_count: wordCount,
      progress_percentage: 70,
    }, `Article written: ${wordCount} words`);

    // ────────────────────────────────────────────────────────────
    // STAGE 4: ANALYZE + AUTO-FIX
    // ────────────────────────────────────────────────────────────
    await updateArticle(supabase, articleId, {
      status: 'analyzing',
      progress_percentage: 75,
      current_stage: 'analyze',
    }, 'Analyzing content quality and SEO...');

    const analyzeResult = await callStage('analyze', req, {
      content_markdown: contentMarkdown,
      article_plan: plan,
      content_brief: brief,
      auto_fix: autoFix,
      max_iterations: maxFixIterations,
      user_id: userId,
      // Phase 4 — forward mention-monitoring SERP signals so the analyzer
      // can run gap-scoring rules tied to current SERP state.
      serp_signals: research.serpSignals,
    }, 180_000);

    const finalMarkdown = analyzeResult.data.content_markdown;
    const analysis: ContentAnalysisResult = analyzeResult.data.analysis;
    const fixIterations = analyzeResult.data.fix_iterations;
    const finalWordCount = analyzeResult.data.word_count;
    totalCredits += analyzeResult.data.credits_used || (2 + fixIterations * 5);

    await updateArticle(supabase, articleId, {
      progress_percentage: 90,
    }, `Analysis complete: score ${analysis.overallScore}/100, ${fixIterations} fix iterations`);

    // ────────────────────────────────────────────────────────────
    // STAGE 5: FINALIZE — Build Frase-style report
    // ────────────────────────────────────────────────────────────
    await updateArticle(supabase, articleId, {
      current_stage: 'finalize',
      progress_percentage: 92,
    }, 'Building SEO report...');

    // Append the visible byline / disclosure before HTML conversion, so the markdown
    // the operator copies into their CMS carries it too. No-ops when the brief has no
    // `provenance` block — an invented byline is worse than none, and the analyzer
    // already reports the gap.
    const publishedAt = new Date().toISOString();
    const publishedMarkdown = appendProvenanceBlock(finalMarkdown, brief, website);

    // Generate HTML from markdown (basic conversion)
    const htmlContent = markdownToHtml(publishedMarkdown);

    // Build schema markup
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

    // Query existing platform articles for interlinking.
    //
    // Scoped to the WORKSPACE, not just the author. A user who belongs to two workspaces was
    // being offered their own articles from the other one as interlink targets — titles, slugs
    // and target keywords from a tenant this article has nothing to do with, surfaced in a
    // deliverable (#361 `EG-7`). `user_id` stays as well: with no workspace resolved (a user
    // with no membership) the author is the only boundary there is.
    let existingQuery = supabase
      .from('seo_articles')
      // `overall_score` is not a column and was never read from this result anyway — its
      // presence alone got the select rejected, so existingArticlesRaw was always null and
      // interlinking never found a single existing article.
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

    // ── Phase 5 — auto-interlink from Google's "related searches" block ──
    // Each term in serpSignals.relatedSearches is a query Google clusters
    // with the primary keyword by user intent. We use this as a high-quality
    // signal in two ways:
    //   1. Boost any existing platform article whose target_keyword matches
    //      a related-search term (stronger than generic keyword overlap).
    //   2. For related searches with NO matching article yet, surface them
    //      in suggestedLinks as "write-this-next" cluster opportunities.
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
        // was `overall_score` (not a column) — the real one is `seo_score`, which the final
        // update writes from the same analysis.overallScore value.
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
    // columns are written, and the 15 non-columns this used to name (html_content,
    // reading_time_minutes, content_analysis, overall_score, keyword_density, schema_markup,
    // faq_schema, optimize_data, brief_data, gaps_gains_data, research_tab_data,
    // fix_iterations, geo_score, credits_used, processing_time_ms) are preserved in
    // stages_data.extra instead of taking the whole statement down with them.
    await updateArticle(supabase, articleId, {
      markdown_content: publishedMarkdown,
      html_content: htmlContent,
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
      fix_iterations: fixIterations,
      geo_score: analysis.geoScore?.overall || null,
      credits_used: totalCredits,
      processing_time_ms: processingTimeMs,
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
 *
 * This exists because the pipeline was writing 15+ fields that are not columns
 * (`html_content`, `meta_title`, `article_plan`, `overall_score`, `credits_used`,
 * `processing_time_ms`, `keyword_research_id`, …). PostgREST rejects the WHOLE statement
 * when any one column is unknown, so those updates landed nothing — and took the REAL
 * columns in the same payload down with them. That is why finished articles had
 * `title = NULL`, `slug = NULL`, no markdown and a status stuck mid-pipeline, while the
 * endpoint returned `{success: true}` and the credits were already spent.
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
 * Schemes an `<a href>` in generated article HTML may carry.
 *
 * React 18 still renders a `javascript:` href (it warns, it does not block — #358), and this
 * HTML is the deliverable an operator pastes into their CMS, where nothing warns at all.
 */
const SAFE_HREF_RE = /^(?:https?:\/\/|mailto:|tel:|[./#?])/i;

/**
 * URL for the `href` of a converted markdown link, or `#` when it is not one we will emit.
 *
 * The value arrives already HTML-escaped (see `markdownToHtml`), which is what makes a plain
 * prefix test sufficient: an entity-encoded evasion like `&#106;avascript:` has had its `&`
 * escaped to `&amp;` and reaches the browser as literal text, not as a scheme.
 */
function safeHref(escapedUrl: string): string {
  // Strip whitespace and control characters, which browsers historically ignore INSIDE a
  // scheme (`java<TAB>script:` is read as `javascript:`), before deciding what it is.
  const probe = escapedUrl.replace(/[^\x21-\x7e]/g, '');
  return SAFE_HREF_RE.test(probe) ? escapedUrl : '#';
}

/**
 * Basic markdown → HTML conversion.
 *
 * The input is NOT trusted. It is model output, and the model was given Google's AI Overview
 * text, the current featured snippet, PAA answers and competitor headings — all authored by
 * whoever ranks for the watched query. This used to interpolate that straight into HTML: raw
 * `<script>` in the markdown passed through untouched, and `[x](javascript:…)` became a live
 * href (#361 `EG-6`, invariant 11).
 *
 * So the source is escaped ONCE, up front, with the canonical escaper — every tag emitted
 * below is then a tag this function wrote, and every character that came from the model is
 * text. The remaining hole after escaping is the one attribute we emit, which `safeHref`
 * closes.
 */
function markdownToHtml(markdown: string): string {
  let html = escapeHtml(markdown);

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links. `$2` is already escaped, so it is safe as an attribute VALUE; `safeHref` is what
  // decides whether it is a URL we are willing to emit at all.
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text: string, url: string) => `<a href="${safeHref(url)}">${text}</a>`,
  );

  // Horizontal rule — must run BEFORE the list rule, which would otherwise read
  // `---` as a bullet, and before paragraph wrapping, which would emit `<p>---</p>`.
  html = html.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, '<hr />');

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');

  // Paragraphs (lines not already wrapped in tags)
  const lines = html.split('\n');
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith('<h') &&
      !trimmed.startsWith('<li') &&
      !trimmed.startsWith('<ul') &&
      !trimmed.startsWith('<ol') &&
      !trimmed.startsWith('<hr')
    ) {
      result.push(`<p>${trimmed}</p>`);
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
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

/**
 * Append a visible byline + AI-disclosure block to the article markdown.
 *
 * Google's helpful-content self-assessment is explicit that the "Who / How / Why"
 * answers should be *visible to readers*, not only present in structured data — so
 * this goes into the markdown the operator copies into their CMS, not just the JSON-LD.
 *
 * Returns the markdown unchanged when the brief has no `provenance` block. That is the
 * deliberate behaviour: the pipeline never fabricates an author, and the analyzer
 * reports the omission as a `provenance` fix instead.
 */
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

/**
 * Match this article's plan against the user's indexed website pages.
 *
 * Strategy:
 *  1. Check the user has a connected website (user_websites where is_active and is_default).
 *     Falls back to any active website if no default is set.
 *  2. Build an embedding from the article's plan (title + meta + section headings + secondary keywords).
 *  3. Call match_user_website_pages RPC for top 8 semantic matches.
 *  4. For each match, propose an anchor text by picking the secondary keyword most likely to fit.
 *
 * Silent-failure-safe: any error returns empty array — inter-linking simply omits the section.
 */
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

/** Pick the secondary keyword that best appears in the target page's title/description, else fall back to title. */
function pickAnchor(plan: ArticlePlan, pageTitle: string | null, pageDescription: string | null): string {
  const haystack = `${pageTitle || ''} ${pageDescription || ''}`.toLowerCase();
  for (const kw of [plan.primaryKeyword, ...plan.secondaryKeywords]) {
    if (!kw) continue;
    if (haystack.includes(kw.toLowerCase())) return kw;
  }
  return pageTitle || plan.primaryKeyword;
}
