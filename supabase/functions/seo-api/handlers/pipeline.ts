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
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { SEO_MODULE } from './entitlement.ts';
import { generateStandardEmbedding } from '../../_shared/embedding-utils.ts';
import { resolveWebsite } from '../../_shared/seo-website.ts';
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


/** Call another edge function internally */
async function callEdgeFunction(
  functionName: string,
  body: any,
  timeoutMs: number = 120_000,
): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || `${functionName} returned failure`);
    }
    return result;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`${functionName} timed out after ${timeoutMs}ms`);
    }
    throw error;
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
        content_type: body.content_brief?.contentType || 'guide',
        content_brief: body.content_brief || null,
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

    // Return the article ID immediately — the pipeline continues running
    // The frontend polls seo_articles for progress updates

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
      const researchResult = await callEdgeFunction('seo-research', {
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

    const planResult = await callEdgeFunction('seo-plan', {
      topic: body.topic,
      target_keyword: body.target_keyword,
      keyword_research: research,
      content_brief: body.content_brief,
      additional_instructions: body.additional_instructions,
      user_id: userId,
    }, 60_000);

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

    const writeResult = await callEdgeFunction('seo-write', {
      article_plan: plan,
      content_brief: body.content_brief,
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
    }, 180_000);

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

    const analyzeResult = await callEdgeFunction('seo-analyze', {
      content_markdown: contentMarkdown,
      article_plan: plan,
      content_brief: body.content_brief,
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
    const publishedMarkdown = appendProvenanceBlock(finalMarkdown, body.content_brief, website);

    // Generate HTML from markdown (basic conversion)
    const htmlContent = markdownToHtml(publishedMarkdown);

    // Build schema markup
    const schemaMarkup = buildSchemaMarkup(plan, publishedMarkdown, {
      brief: body.content_brief,
      website,
      publishedAt,
    });
    const faqSchema = buildFaqSchema(plan, publishedMarkdown);

    // Build gaps/gains
    const gapsGains = buildGapsGains(finalMarkdown, research);

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
        targetHeadings: `${plan.sections.length + plan.sections.reduce((s, sec) => s + sec.subsections.length, 0)}`,
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

    // Query existing platform articles for interlinking
    const { data: existingArticlesRaw } = await supabase
      .from('seo_articles')
      // `overall_score` is not a column and was never read from this result anyway — its
      // presence alone got the select rejected, so existingArticlesRaw was always null and
      // interlinking never found a single existing article.
      .select('id, title, slug, target_keyword')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .neq('id', articleId)
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
      const { data: relatedMatchesRaw } = await supabase
        .from('seo_articles')
        .select('id, title, slug, target_keyword')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .neq('id', articleId)
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

    // Build full ArticleOutput
    const articleOutput: ArticleOutput = {
      // `articleRow` is narrowed non-null by the `if (insertError || !articleRow) throw`
      // guard above, so this needs no assertion — unlike `articleId`, which stays
      // `string | null` for the catch block.
      id: articleRow.id,
      topic: body.topic,
      targetKeyword: body.target_keyword,
      title: plan.title,
      contentMarkdown: publishedMarkdown,
      contentHtml: htmlContent,
      wordCount: finalWordCount,
      metaTitle: plan.metaTitle,
      metaDescription: plan.metaDescription,
      slug: plan.slug,
      primaryKeyword: plan.primaryKeyword,
      secondaryKeywords: plan.secondaryKeywords,
      schemaMarkup,
      faqSchema,
      optimize: optimizeData,
      brief: briefData,
      gapsGains,
      research: researchTabData,
      interlinking: interlinkingData,
      pipelineLog: [],
      fixIterations,
      status: 'completed',
      createdAt: new Date().toISOString(),
    };

    return jsonResponse({
      success: true,
      data: { article_id: articleId, article: articleOutput },
    });
  } catch (error: any) {
    console.error(`[seo-pipeline] Error:`, error);

    // Update article with failure status
    if (articleId) {
      // `processing_time_ms` is NOT a column — including it here got the FAILURE write
      // rejected too, so a failed article was indistinguishable from a running one and
      // spun at its last current_stage forever. Written directly (not via updateArticle)
      // because this is the error path: it must not throw, and it must not depend on the
      // read-modify-write that updateArticle performs.
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

// ════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * The REAL columns on `seo_articles` (verified against information_schema).
 * `id`, `user_id`, `workspace_id` and `created_at` are deliberately excluded — identity
 * is never rewritten by the pipeline.
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

/** Basic markdown → HTML conversion */
function markdownToHtml(markdown: string): string {
  let html = markdown;

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

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

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
    brief?: ContentBrief | null;
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
  brief: ContentBrief | null | undefined,
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

/** Build gaps/gains analysis */
function buildGapsGains(
  markdown: string,
  research: KeywordResearchResult,
): ArticleOutput['gapsGains'] {
  const content = markdown.toLowerCase();
  const gaps: MissingTopic[] = [];
  const gains: MissingTopic[] = [];

  // Check competitor topics against our content
  for (const gap of research.contentGapOpportunities) {
    const gapLower = gap.toLowerCase();
    const isPresent = content.includes(gapLower.slice(0, 20));

    if (isPresent) {
      gains.push({
        topic: gap,
        type: 'gain',
        competitorCount: 0,
        relevanceScore: 0.7,
      });
    } else {
      gaps.push({
        topic: gap,
        type: 'gap',
        competitorCount: 3, // Approximate
        relevanceScore: 0.6,
      });
    }
  }

  return {
    all: [...gaps, ...gains],
    gaps,
    gains,
    gapCount: gaps.length,
    gainCount: gains.length,
  };
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
