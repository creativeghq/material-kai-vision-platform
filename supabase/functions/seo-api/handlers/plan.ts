/**
 * SEO Plan Edge Function
 *
 * Generates an article plan from keyword research data using Gemini.
 * Produces: title, meta tags, slug, section outline, FAQ questions,
 * entity mentions, citation sources, schema recommendations.
 *
 * Credit cost: 2 credits
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import {
  generateStructuredWithGemini,
  z,
} from '../../_shared/ai-client.ts';
import type {
  SEOPlanRequest,
  SEOPlanResponse,
  ArticlePlan,
  KeywordResearchResult,
} from '../../_shared/seo-types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CREDIT_COST = 2;

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Zod schema for structured Gemini output
const ArticleSectionSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    heading: z.string(),
    headingLevel: z.enum(['h1', 'h2', 'h3', 'h4']),
    targetKeywords: z.array(z.string()),
    description: z.string(),
    estimatedWordCount: z.number(),
    includeFaq: z.boolean(),
    includeTable: z.boolean(),
    includeList: z.boolean(),
    subsections: z.array(ArticleSectionSchema).default([]),
  }),
);

const ArticlePlanSchema = z.object({
  title: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  slug: z.string(),
  primaryKeyword: z.string(),
  secondaryKeywords: z.array(z.string()),
  lsiKeywords: z.array(z.string()),
  sections: z.array(ArticleSectionSchema),
  targetWordCount: z.number(),
  searchIntent: z.enum(['informational', 'navigational', 'commercial', 'transactional']),
  recommendedSchema: z.array(z.enum(['Article', 'FAQPage', 'HowTo', 'Review', 'Product', 'ItemList'])),
  featuredSnippetTarget: z.string().nullable(),
  faqQuestions: z.array(z.string()),
  entityMentions: z.array(z.string()),
  citationSources: z.array(z.string()),
  statisticalClaims: z.array(z.string()),
});

export async function handlePlan(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await authenticate(req);
  if (!auth.success || !auth.userId) {
    return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  }

  const userId = auth.userId;

  try {

    if (!body.topic || !body.target_keyword || !body.keyword_research) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: topic, target_keyword, keyword_research' },
        400,
      );
    }

    // Debit credits
    const { data: debitResult, error: debitError } = await supabase.rpc(
      'debit_user_credits',
      {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_operation_type: 'seo_plan',
        p_description: `SEO article planning: "${body.target_keyword}"`,
        p_metadata: { topic: body.topic, target_keyword: body.target_keyword },
      },
    );

    if (debitError || !debitResult?.[0]?.success) {
      const msg = debitResult?.[0]?.error_message || debitError?.message || 'Insufficient credits';
      return jsonResponse({ success: false, error: msg }, 402);
    }

    console.log(`[seo-plan] Planning article for "${body.target_keyword}" (user: ${userId})`);

    const research = body.keyword_research;
    const brief = body.content_brief;

    // Load base system prompt from DB, then append dynamic context
    const baseSystemPrompt = await getToolPrompt(supabase, 'seo_planner');
    const systemPrompt = buildPlanningSystemPrompt(baseSystemPrompt, brief, research);
    const userPrompt = buildPlanningUserPrompt(body.topic, body.target_keyword, research, brief);

    // Call Gemini with structured output (auto-tracked)
    const result = await generateStructuredWithGemini(userPrompt, ArticlePlanSchema, {
      task: 'seo_plan',
      systemPrompt,
      temperature: 0.4,
      maxTokens: 4096,
      thinkingLevel: 'high',
    });

    const plan = result.output as ArticlePlan;

    // Validate constraints
    if (plan.metaTitle.length > 65) {
      plan.metaTitle = plan.metaTitle.substring(0, 60);
    }
    if (plan.metaDescription.length > 160) {
      plan.metaDescription = plan.metaDescription.substring(0, 155);
    }

    console.log(
      `[seo-plan] Plan complete: "${plan.title}" — ${plan.sections.length} sections, ` +
      `${plan.targetWordCount} target words, ${result.usage.totalTokens} tokens`,
    );

    const response: SEOPlanResponse = {
      success: true,
      data: { plan, credits_used: CREDIT_COST },
    };

    return jsonResponse(response);
  } catch (error: any) {
    console.error('[seo-plan] Error:', error);
    return jsonResponse(
      { success: false, error: error.message || 'Planning failed' },
      500,
    );
  }
}

// ════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ════════════════════════════════════════════════════════════════

function buildPlanningSystemPrompt(
  basePrompt: string,
  brief?: SEOPlanRequest['content_brief'],
  research?: KeywordResearchResult,
): string {
  let prompt = basePrompt;

  // Append AI Overview context if detected
  if (research?.serpFeatures?.hasAiOverview) {
    const citedDomains = research.serpFeatures.aiOverviewSources.map((s) => s.domain).join(', ');
    prompt += `

=== AI OVERVIEW DETECTED ===
Google shows an AI Overview for this keyword. Optimize for AI citation:
- Cited sources in AI Overview: ${citedDomains || 'various'}
- Use structured definitions, statistics with attribution, direct answers
- Match the format of cited sources (well-structured, authoritative, Q&A-friendly)`;
  }

  // ── Mention-monitoring SERP signals (Phase 2 enrichment) ──
  // Injects AI Overview text, featured-snippet target, related searches,
  // PAA answers, video / news / shopping carousel state, knowledge-graph
  // presence, paid bidders, and per-keyword intent classification.
  prompt += buildSerpSignalsSystemBlock(research?.serpSignals);

  if (brief) {
    prompt += `

=== BUSINESS CONTEXT ===
Objective: ${brief.businessObjective}
Target audience: ${brief.audience.primaryPersona}
Knowledge level: ${brief.audience.knowledgeLevel}
Decision stage: ${brief.audience.decisionStage}
Pain points: ${brief.audience.painPoints.join(', ')}
Content type: ${brief.contentType}`;

    if (brief.clusterContext) {
      prompt += `

=== CLUSTER CONTEXT ===
Pillar topic: ${brief.clusterContext.pillarTopic || 'N/A'}
Already published: ${brief.clusterContext.relatedArticles.join(', ') || 'None'}
Unique angle: ${brief.clusterContext.differentiationNote || 'N/A'}
Do NOT repeat topics already covered in related articles.`;
    }

    if (brief.requiredPoints?.length) {
      prompt += `

=== REQUIRED COVERAGE ===
${brief.requiredPoints.map((p) => `- MUST include: ${p}`).join('\n')}`;
    }

    if (brief.performanceFeedback) {
      prompt += `

=== PERFORMANCE INSIGHTS ===
Previous issues: ${brief.performanceFeedback.previousArticleScores.map((a) => a.topIssue).join(', ')}
Audience feedback: ${brief.performanceFeedback.audienceFeedbackNotes || 'N/A'}`;
    }
  }

  return prompt;
}

function buildPlanningUserPrompt(
  topic: string,
  targetKeyword: string,
  research: KeywordResearchResult,
  brief?: SEOPlanRequest['content_brief'],
): string {
  const secondaries = research.recommendedSecondaries
    .slice(0, 10)
    .map((k) => `${k.term} (vol: ${k.searchVolume}, KD: ${k.keywordDifficulty ?? '?'})`)
    .join('\n  ');

  const competitorHeadings = research.serpInsights
    .slice(0, 5)
    .map((c) => `- #${c.position} "${c.title}" (${c.domain})`)
    .join('\n');

  const gaps = research.contentGapOpportunities.slice(0, 10).join('\n  - ');

  const paaList = research.paaQuestions.slice(0, 10).join('\n  - ');

  const lsiTerms = research.clusters
    .flatMap((c) => c.lsiKeywords)
    .slice(0, 20)
    .join(', ');

  const signals = research.serpSignals;
  const aiOverviewSection = signals?.aiOverviewText
    ? `

=== GOOGLE'S AI OVERVIEW (current generative answer) ===
${signals.aiOverviewText}
Cited sources: ${(signals.aiOverviewReferences || []).map((r) => r.domain || r.url).filter(Boolean).slice(0, 8).join(', ') || 'none'}
Brand mentioned in AI Overview: ${signals.aiOverviewBrandMentioned ? 'YES' : 'NO'}`
    : '';

  const featuredSnippetSection = signals?.featuredSnippetTarget?.description
    ? `

=== FEATURED SNIPPET TO OUTRANK (position 0) ===
Currently held by: ${signals.featuredSnippetTarget.domain || 'unknown'}
Current snippet: "${signals.featuredSnippetTarget.description}"
Goal: write a 40-60 word answer in a single paragraph immediately after a matching H2 to displace this.`
    : '';

  const relatedSection = signals?.relatedSearches?.length
    ? `

=== GOOGLE'S RELATED SEARCHES (intent cluster) ===
  - ${signals.relatedSearches.slice(0, 10).join('\n  - ')}
These are queries Google groups with the primary keyword by user intent. Cover them as subsections or H3s.`
    : '';

  const paaAnswers = signals?.paaAnswers || [];
  const paaSection = paaAnswers.length
    ? `

=== PAA WITH CURRENT TOP-ANSWER SNIPPETS ===
${paaAnswers
  .slice(0, 8)
  .map((a) => `- Q: ${a.question}${a.answerSnippet ? `\n  Current top answer: "${a.answerSnippet}"` : ''}`)
  .join('\n')}
Target each as an FAQ entry, write a tighter answer than the current one shown.`
    : '';

  const intentSection = signals?.keywordIntents && Object.keys(signals.keywordIntents).length
    ? `

=== KEYWORD INTENT CLASSIFICATION ===
${Object.entries(signals.keywordIntents)
  .slice(0, 10)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}
Match the article's structure to the dominant intent of the primary keyword.`
    : '';

  return `Create an article plan for the following topic.

=== TOPIC ===
${topic}

=== PRIMARY KEYWORD ===
${targetKeyword} (volume: ${research.recommendedPrimary.searchVolume}, KD: ${research.recommendedPrimary.keywordDifficulty ?? '?'})

=== TOP SECONDARY KEYWORDS ===
  ${secondaries}

=== LSI TERMS ===
${lsiTerms}

=== COMPETITOR HEADINGS (top SERP results) ===
${competitorHeadings}

=== CONTENT GAPS (topics competitors cover) ===
  - ${gaps}

=== PEOPLE ALSO ASK ===
  - ${paaList}
${aiOverviewSection}${featuredSnippetSection}${relatedSection}${paaSection}${intentSection}

=== TOTAL ADDRESSABLE VOLUME ===
${research.totalAddressableVolume} monthly searches across all related keywords

Create a comprehensive article plan targeting 2000-3000 words.`;
}

/**
 * Append the SerpSignalBlob's structural insights to the system prompt.
 * Tells the planner WHAT to optimize for at a strategy level (intent
 * matching, entity authority, video/news carousel competition) — the
 * tactical "here's the AI Overview text" content goes in the user prompt.
 */
function buildSerpSignalsSystemBlock(
  signals: KeywordResearchResult['serpSignals'],
): string {
  if (!signals) return '';
  let block = '\n\n=== MENTION-MONITORING SERP SIGNALS ===';
  if (signals.aiOverviewText) {
    block += `\n- AI Overview is present for this keyword. Use direct-answer format, structured definitions, and statistics with attribution to maximize chance of being cited.`;
    if (signals.aiOverviewBrandMentioned === false) {
      block += ` Brand is NOT cited yet — this is a Generative Engine Optimization (GEO) opportunity, weight it as a high-priority section structure decision.`;
    }
  }
  if (signals.featuredSnippetTarget?.description) {
    block += `\n- Featured snippet (position 0) currently held — plan an explicit "snippet target" paragraph (40-60 words, single paragraph after a matching H2) and set it as featuredSnippetTarget in the plan.`;
  }
  if (signals.knowledgeGraphPresent === false) {
    block += `\n- No Google Knowledge Panel — entity authority is weak. Plan to include schema.org Organization markup, named-entity citations, and Wikidata-style structured definitions.`;
  }
  if (signals.videoCarouselPresent === false && signals.videoCarouselPlatforms) {
    const top = Object.entries(signals.videoCarouselPlatforms).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      block += `\n- Video carousel exists for this query and brand is NOT in it (top platform: ${top[0]}). Recommend including a "watch this" embed slot in the plan so the article can be paired with a complementary video asset.`;
    }
  }
  if (signals.paidCompetitors?.length) {
    block += `\n- ${signals.paidCompetitors.length} advertisers paying Google Ads on this keyword (${signals.paidCompetitors.slice(0, 3).map((p) => p.domain).join(', ')}) — high commercial intent. Bias plan toward conversion CTAs and product-comparison structure.`;
  }
  if (signals.shoppingListings?.length) {
    block += `\n- Google Shopping carousel renders for this query. Plan should include a structured price/spec section to match shopping-listing context.`;
  }
  return block;
}
