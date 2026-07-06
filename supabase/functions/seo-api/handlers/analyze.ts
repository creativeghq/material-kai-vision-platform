/**
 * SEO Analyze Edge Function
 *
 * Analyzes article content for SEO quality and auto-fixes issues.
 * Runs 15+ custom checks, calculates scores, and optionally
 * uses Gemini to apply targeted fixes (up to 3 iterations).
 *
 * Credit cost: 2 per analysis + 5 per fix iteration (max 17 credits)
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import { generateWithGemini } from '../../_shared/ai-client.ts';
import type {
  SEOAnalyzeRequest,
  SEOAnalyzeResponse,
  ArticlePlan,
  ContentAnalysisResult,
  ContentFix,
  SectionScore,
  ContentBrief,
  GEOScore,
  SerpSignalBlob,
} from '../../_shared/seo-types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const ANALYSIS_CREDIT_COST = 2;
const FIX_CREDIT_COST = 5;
const DEFAULT_MAX_ITERATIONS = 3;
const MIN_ACCEPTABLE_SCORE = 70;

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleAnalyze(req: Request, body: any): Promise<Response> {
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
  // #250 C31: only a secret-level caller may specify user_id in the body — a JWT caller is
  // pinned to their own verified id (can't act on behalf of another user).
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) {
    return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  }

  try {

    if (!body.content_markdown || !body.article_plan) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: content_markdown, article_plan' },
        400,
      );
    }

    // Debit credits for initial analysis
    const { data: debitResult, error: debitError } = await supabase.rpc(
      'debit_user_credits',
      {
        p_user_id: userId,
        p_amount: ANALYSIS_CREDIT_COST,
        p_operation_type: 'seo_analyze',
        p_description: `SEO content analysis: "${body.article_plan.title}"`,
        p_metadata: { target_keyword: body.article_plan.primaryKeyword },
      },
    );

    if (debitError || !debitResult?.[0]?.success) {
      const msg = debitResult?.[0]?.error_message || debitError?.message || 'Insufficient credits';
      return jsonResponse({ success: false, error: msg }, 402);
    }

    const autoFix = body.auto_fix !== false;
    const maxIterations = body.max_iterations || DEFAULT_MAX_ITERATIONS;
    let content = body.content_markdown;
    let fixIterations = 0;
    // Track fix credits actually debited so the failure path can refund them too
    // (the catch previously refunded only the analysis credit — audit #217 H15).
    let fixCreditsDebited = 0;

    console.log(`[seo-analyze] Analyzing "${body.article_plan.title}" (auto_fix: ${autoFix}, max: ${maxIterations})`);

    // Run analysis
    let analysis = analyzeContent(content, body.article_plan, body.serp_signals);

    console.log(`[seo-analyze] Initial score: ${analysis.overallScore}/100, ${analysis.fixes.length} issues`);

    // Auto-fix loop
    if (autoFix && analysis.overallScore < MIN_ACCEPTABLE_SCORE) {
      for (let i = 0; i < maxIterations; i++) {
        const autoFixableFixes = analysis.fixes.filter(
          (f) => f.autoFixable && !f.applied,
        );
        if (autoFixableFixes.length === 0) break;

        // Debit fix credits
        const { data: fixDebit, error: fixDebitErr } = await supabase.rpc(
          'debit_user_credits',
          {
            p_user_id: userId,
            p_amount: FIX_CREDIT_COST,
            p_operation_type: 'seo_fix',
            p_description: `SEO auto-fix iteration ${i + 1}`,
            p_metadata: { iteration: i + 1, fixes_count: autoFixableFixes.length },
          },
        );

        if (fixDebitErr || !fixDebit?.[0]?.success) {
          console.warn(`[seo-analyze] Cannot debit fix credits, stopping auto-fix`);
          break;
        }
        fixCreditsDebited += FIX_CREDIT_COST;

        console.log(`[seo-analyze] Fix iteration ${i + 1}: applying ${autoFixableFixes.length} fixes...`);

        // Apply fixes via Gemini
        content = await applyFixes(supabase, content, autoFixableFixes, body.article_plan, body.content_brief);
        fixIterations++;

        // Re-analyze
        analysis = analyzeContent(content, body.article_plan, body.serp_signals);
        console.log(`[seo-analyze] Post-fix score: ${analysis.overallScore}/100`);

        if (analysis.overallScore >= MIN_ACCEPTABLE_SCORE) break;
      }
    }

    const wordCount = content.split(/\s+/).filter(Boolean).length;

    const response: SEOAnalyzeResponse = {
      success: true,
      data: {
        content_markdown: content,
        word_count: wordCount,
        analysis,
        fix_iterations: fixIterations,
        meets_threshold: analysis.overallScore >= MIN_ACCEPTABLE_SCORE,
        credits_used: ANALYSIS_CREDIT_COST + (fixIterations * FIX_CREDIT_COST),
      },
    };

    return jsonResponse(response);
  } catch (error: any) {
    console.error('[seo-analyze] Error:', error);
    try {
      // Refund the analysis credit AND any auto-fix iteration credits already debited.
      await supabase.rpc('credit_user_credits', {
        p_user_id: userId,
        p_amount: ANALYSIS_CREDIT_COST + fixCreditsDebited,
        p_operation_type: 'seo_analyze_refund',
        p_description: 'Refund: SEO analysis failed',
        p_metadata: { error: error.message, fix_credits_refunded: fixCreditsDebited },
      });
    } catch (refundErr) {
      console.error('[seo-analyze] Refund failed:', refundErr);
    }
    return jsonResponse(
      { success: false, error: error.message || 'Analysis failed' },
      500,
    );
  }
}

// ════════════════════════════════════════════════════════════════
// CONTENT ANALYSIS ENGINE (15+ checks)
// ════════════════════════════════════════════════════════════════

function analyzeContent(
  markdown: string,
  plan: ArticlePlan,
  serpSignals?: SerpSignalBlob,
): ContentAnalysisResult {
  const fixes: ContentFix[] = [];
  const content = markdown.toLowerCase();
  const words = markdown.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const primaryKw = plan.primaryKeyword.toLowerCase();

  // Extract headings
  const headingMatches = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)];
  const headings = headingMatches.map((m) => ({
    level: m[1].length,
    text: m[2].trim(),
  }));

  // Count keyword occurrences
  const primaryCount = countPhrase(content, primaryKw);
  const primaryDensity = wordCount > 0 ? (primaryCount / wordCount) * 100 : 0;

  const keywordDensity: Record<string, number> = {
    [plan.primaryKeyword]: Math.round(primaryDensity * 100) / 100,
  };
  for (const sec of plan.secondaryKeywords) {
    const count = countPhrase(content, sec.toLowerCase());
    keywordDensity[sec] = wordCount > 0 ? Math.round((count / wordCount) * 100 * 100) / 100 : 0;
  }

  // ── Check 1: Primary keyword density (1-2%) ──
  if (primaryDensity < 0.8) {
    fixes.push({
      category: 'keyword_density',
      severity: 'high',
      description: `Primary keyword "${plan.primaryKeyword}" density is ${primaryDensity.toFixed(2)}% (target: 1-2%)`,
      suggestion: `Add more natural mentions of "${plan.primaryKeyword}" throughout the article`,
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  } else if (primaryDensity > 2.5) {
    fixes.push({
      category: 'keyword_density',
      severity: 'medium',
      description: `Primary keyword "${plan.primaryKeyword}" density is ${primaryDensity.toFixed(2)}% — possible keyword stuffing`,
      suggestion: `Reduce mentions of "${plan.primaryKeyword}" and use variations instead`,
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 2: Secondary keyword presence ──
  const missingSecs = plan.secondaryKeywords
    .slice(0, 5)
    .filter((kw) => countPhrase(content, kw.toLowerCase()) === 0);
  if (missingSecs.length > 0) {
    fixes.push({
      category: 'secondary_keywords',
      severity: 'medium',
      description: `Missing secondary keywords: ${missingSecs.join(', ')}`,
      suggestion: `Weave these keywords naturally into relevant sections`,
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 3: Primary keyword in first 100 words ──
  const first100 = words.slice(0, 100).join(' ').toLowerCase();
  if (!first100.includes(primaryKw)) {
    fixes.push({
      category: 'keyword_placement',
      severity: 'high',
      description: `Primary keyword "${plan.primaryKeyword}" not found in first 100 words`,
      suggestion: `Add the primary keyword to the introduction paragraph`,
      affectedSection: 'Introduction',
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 4: H1 count and content ──
  const h1s = headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    fixes.push({
      category: 'h1_heading',
      severity: 'critical',
      description: 'No H1 heading found',
      suggestion: `Add an H1 heading: "# ${plan.title}"`,
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  } else if (h1s.length > 1) {
    fixes.push({
      category: 'h1_heading',
      severity: 'critical',
      description: `${h1s.length} H1 headings found (should be exactly 1)`,
      suggestion: 'Change extra H1s to H2',
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  } else if (!h1s[0].text.toLowerCase().includes(primaryKw)) {
    fixes.push({
      category: 'h1_heading',
      severity: 'high',
      description: `H1 "${h1s[0].text}" doesn't contain primary keyword "${plan.primaryKeyword}"`,
      suggestion: `Revise H1 to include "${plan.primaryKeyword}"`,
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 5: H2 keyword placement ──
  const h2s = headings.filter((h) => h.level === 2);
  const h2WithKeyword = h2s.some((h) => h.text.toLowerCase().includes(primaryKw));
  if (!h2WithKeyword && h2s.length > 0) {
    fixes.push({
      category: 'h2_keyword',
      severity: 'medium',
      description: `No H2 heading contains the primary keyword "${plan.primaryKeyword}"`,
      suggestion: `Revise at least one H2 to include "${plan.primaryKeyword}" or a variation`,
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 6: Heading hierarchy (no skipped levels) ──
  for (let i = 1; i < headings.length; i++) {
    if (headings[i].level > headings[i - 1].level + 1) {
      fixes.push({
        category: 'heading_hierarchy',
        severity: 'medium',
        description: `Skipped heading level: H${headings[i - 1].level} → H${headings[i].level} at "${headings[i].text}"`,
        suggestion: `Change "${headings[i].text}" to H${headings[i - 1].level + 1}`,
        affectedSection: headings[i].text,
        autoFixable: true,
        applied: false,
      });
      break; // Report first occurrence only
    }
  }

  // ── Check 7: Content length ──
  const targetMin = plan.targetWordCount * 0.85;
  const targetMax = plan.targetWordCount * 1.15;
  if (wordCount < targetMin) {
    fixes.push({
      category: 'content_depth',
      severity: 'high',
      description: `Article is ${wordCount} words (target: ${plan.targetWordCount}±15%)`,
      suggestion: `Expand sections to reach at least ${Math.round(targetMin)} words`,
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  } else if (wordCount > targetMax) {
    fixes.push({
      category: 'content_depth',
      severity: 'low',
      description: `Article is ${wordCount} words, ${Math.round(wordCount - targetMax)} over target`,
      suggestion: 'Consider trimming less essential sections',
      affectedSection: null,
      autoFixable: false,
      applied: false,
    });
  }

  // ── Check 8: Meta title length ──
  if (plan.metaTitle.length > 60) {
    fixes.push({
      category: 'meta_tags',
      severity: 'medium',
      description: `Meta title is ${plan.metaTitle.length} characters (max: 60)`,
      suggestion: 'Shorten meta title to 60 characters or less',
      affectedSection: null,
      autoFixable: false, // Plan-level fix
      applied: false,
    });
  }

  // ── Check 9: Meta description length ──
  if (plan.metaDescription.length > 155) {
    fixes.push({
      category: 'meta_tags',
      severity: 'medium',
      description: `Meta description is ${plan.metaDescription.length} characters (max: 155)`,
      suggestion: 'Shorten meta description to 155 characters or less',
      affectedSection: null,
      autoFixable: false,
      applied: false,
    });
  }

  // ── Check 10: FAQ section presence ──
  if (plan.faqQuestions.length > 0) {
    const hasFaq = content.includes('faq') || content.includes('frequently asked');
    if (!hasFaq) {
      fixes.push({
        category: 'faq_section',
        severity: 'high',
        description: 'FAQ section not found but planned',
        suggestion: `Add an FAQ section with questions: ${plan.faqQuestions.slice(0, 3).join('; ')}`,
        affectedSection: null,
        autoFixable: true,
        applied: false,
      });
    }
  }

  // ── Check 11: Internal link placeholders ──
  const internalLinks = (markdown.match(/\[INTERNAL:/g) || []).length;
  if (internalLinks < 3) {
    fixes.push({
      category: 'links',
      severity: 'medium',
      description: `Only ${internalLinks} internal link placeholders (need 3+)`,
      suggestion: 'Add more [INTERNAL: anchor text](topic) placeholders',
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 12: External source citations ──
  const externalCitations = (markdown.match(/\[SOURCE:/g) || []).length;
  if (externalCitations < 3) {
    fixes.push({
      category: 'links',
      severity: 'medium',
      description: `Only ${externalCitations} source citations (need 3+)`,
      suggestion: 'Add more [SOURCE: description](url) citations for GEO',
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 13: Paragraph length ──
  const paragraphs = markdown.split(/\n\n+/).filter((p) => !p.startsWith('#') && p.trim().length > 0);
  const longParagraphs = paragraphs.filter(
    (p) => p.split(/\s+/).length > 80,
  );
  if (longParagraphs.length > 0) {
    fixes.push({
      category: 'readability',
      severity: 'medium',
      description: `${longParagraphs.length} paragraphs exceed 80 words`,
      suggestion: 'Break long paragraphs into shorter ones for readability',
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 14: Sentence length ──
  const sentences = markdown.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const longSentences = sentences.filter((s) => s.split(/\s+/).length > 35);
  if (longSentences.length > 3) {
    fixes.push({
      category: 'readability',
      severity: 'low',
      description: `${longSentences.length} sentences exceed 35 words`,
      suggestion: 'Break long sentences for better readability',
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ── Check 15: GEO entity coverage ──
  const missingEntities = plan.entityMentions.filter(
    (e) => !content.includes(e.toLowerCase()),
  );
  if (missingEntities.length > 0 && plan.entityMentions.length > 0) {
    fixes.push({
      category: 'geo_entities',
      severity: 'medium',
      description: `Missing GEO entities: ${missingEntities.join(', ')}`,
      suggestion: 'Add mentions of these entities in relevant sections',
      affectedSection: null,
      autoFixable: true,
      applied: false,
    });
  }

  // ════════════════════════════════════════════════════════════════
  // Phase 4 — SERP-AWARE GAP CHECKS (6 rules from mention-monitoring)
  // ════════════════════════════════════════════════════════════════
  // Each rule scores the article against the live SERP state captured by
  // the mention-monitoring opportunities call. Skipped silently when
  // signals are absent (Phase 1 enrichment didn't run).
  if (serpSignals) {
    // ── Check 16: Featured-snippet alignment ──
    // If a featured snippet exists, the article needs a 40-60 word direct
    // answer paragraph. Use the existing TL;DR block ([!tldr]) heuristic.
    const fsTarget = serpSignals.featuredSnippetTarget;
    if (fsTarget?.description) {
      const hasTldrBlock = /^\s*>\s*\[!tldr\]/m.test(markdown);
      const hasShortAnswer = paragraphs.some((p) => {
        const wc = p.split(/\s+/).filter(Boolean).length;
        return wc >= 30 && wc <= 80 && p.includes(primaryKw);
      });
      if (!hasTldrBlock && !hasShortAnswer) {
        fixes.push({
          category: 'featured_snippet_target',
          severity: 'high',
          description: `No featured-snippet candidate paragraph found. Currently held by ${fsTarget.domain || 'unknown'}: "${(fsTarget.description || '').slice(0, 120)}"`,
          suggestion: 'Add a [!tldr] block or a 40-60 word paragraph immediately after the H1/lead that directly answers the primary query.',
          affectedSection: 'Lead / TL;DR',
          autoFixable: true,
          applied: false,
        });
      }
    }

    // ── Check 17: AI Overview cited-source coverage ──
    // When Google's AI Overview cites specific domains, the article should
    // cite at least one of them as a [SOURCE:] (or directly link) so search
    // engines see topical alignment with what the AI deems authoritative.
    const aiRefs = serpSignals.aiOverviewReferences || [];
    if (aiRefs.length > 0 && serpSignals.aiOverviewBrandMentioned === false) {
      const cited = aiRefs
        .map((r) => (r.domain || '').toLowerCase())
        .filter(Boolean);
      const lowerContent = content;
      const matched = cited.some((d) => lowerContent.includes(d));
      if (!matched) {
        fixes.push({
          category: 'ai_overview_alignment',
          severity: 'medium',
          description: `Article doesn't reference any of Google's AI-Overview cited sources: ${cited.slice(0, 5).join(', ')}`,
          suggestion: `Add one or more [SOURCE: ...](https://${cited[0] || 'domain'}/...) citations referencing the same authoritative sources Google's AI cites — drives topical-authority alignment.`,
          affectedSection: null,
          autoFixable: true,
          applied: false,
        });
      }
    }

    // ── Check 18: PAA coverage ──
    // Each PAA question Google shows is a search query the article should
    // answer. Compare against H3s + FAQ headings.
    const paaAnswers = serpSignals.paaAnswers || [];
    if (paaAnswers.length > 0) {
      const headingsLower = headings.map((h) => h.text.toLowerCase());
      const missing = paaAnswers
        .map((a) => a.question)
        .filter((q) => {
          const qLower = q.toLowerCase().replace(/[?.]+$/g, '').trim();
          // Loose match: any heading shares ≥3 distinctive words with the question
          const qWords = qLower.split(/\s+/).filter((w) => w.length > 3);
          if (qWords.length === 0) return false;
          return !headingsLower.some((h) => {
            const overlap = qWords.filter((w) => h.includes(w)).length;
            return overlap >= Math.min(3, qWords.length);
          });
        });
      if (missing.length > 0) {
        fixes.push({
          category: 'paa_coverage',
          severity: missing.length >= 3 ? 'high' : 'medium',
          description: `${missing.length} PAA questions not addressed in any heading: ${missing.slice(0, 3).join('; ')}`,
          suggestion: 'Add an H3 (under FAQ) for each missing PAA question with a self-contained 40-80 word answer.',
          affectedSection: 'Frequently Asked Questions',
          autoFixable: true,
          applied: false,
        });
      }
    }

    // ── Check 19: Related-search coverage ──
    // Google's "Searches related to" block shows queries that share intent
    // with the primary keyword. Article should mention at least 30% of
    // those terms naturally somewhere in the body (not necessarily as
    // headings — natural cross-references count).
    const related = serpSignals.relatedSearches || [];
    if (related.length >= 5) {
      const lowerContent = content;
      const covered = related.filter((t) => {
        const tLower = t.toLowerCase().trim();
        return tLower.length > 0 && lowerContent.includes(tLower);
      });
      const coverageRatio = covered.length / related.length;
      if (coverageRatio < 0.3) {
        const missingRelated = related.filter((t) => !covered.includes(t)).slice(0, 5);
        fixes.push({
          category: 'related_search_coverage',
          severity: 'medium',
          description: `Only ${covered.length}/${related.length} of Google's related searches appear in the article (${Math.round(coverageRatio * 100)}% coverage). Missing: ${missingRelated.join(', ')}`,
          suggestion: 'Mention these related-search terms naturally in body paragraphs or as cross-reference H3s — they share search intent with your primary keyword.',
          affectedSection: null,
          autoFixable: true,
          applied: false,
        });
      }
    }

    // ── Check 20: Entity authority (no Knowledge Panel) ──
    // When Google has no Knowledge Panel for the primary subject, the
    // article needs Wikipedia-style structured definitions to help build
    // entity authority. Look for a definition pattern within the first
    // 300 words referring to the primary keyword.
    if (serpSignals.knowledgeGraphPresent === false) {
      const firstChunk = words.slice(0, 300).join(' ').toLowerCase();
      // Generic structured-definition pattern: "<X> is [a/an/the] <Y>"
      const defNearKw = new RegExp(
        `\\b${escapeRe(primaryKw)}\\b[^.]*\\bis\\s+(an?|the)\\s+\\w+`,
        'i',
      ).test(firstChunk);
      if (!defNearKw) {
        fixes.push({
          category: 'entity_authority',
          severity: 'medium',
          description: `Subject has no Google Knowledge Panel — article needs a structured "<primary keyword> is [a/an/the] [category]" definition in the first 300 words.`,
          suggestion: `Add a Wikipedia-style sentence like "${plan.primaryKeyword} is [a/an] [category] that [function]." early in the article. Pair with [!definition] callouts for adjacent jargon.`,
          affectedSection: 'Lead / Introduction',
          autoFixable: true,
          applied: false,
        });
      }
    }

    // ── Check 21: Intent alignment ──
    // The plan declares searchIntent. If the keyword-intent map disagrees
    // (e.g. plan says "informational" but Google's intent for this exact
    // primary keyword is "commercial"), flag a strategic mismatch.
    const intents = serpSignals.keywordIntents || {};
    const primaryIntent = intents[plan.primaryKeyword] || intents[plan.primaryKeyword.toLowerCase()];
    if (primaryIntent && plan.searchIntent && primaryIntent.toLowerCase() !== plan.searchIntent.toLowerCase()) {
      fixes.push({
        category: 'intent_alignment',
        severity: 'medium',
        description: `Plan declares search intent "${plan.searchIntent}" but Google classifies "${plan.primaryKeyword}" as "${primaryIntent}".`,
        suggestion: primaryIntent.toLowerCase() === 'transactional'
          ? 'Restructure as a product/category page with conversion CTAs, not a blog post.'
          : primaryIntent.toLowerCase() === 'commercial'
            ? 'Add a comparison table or buyer\'s-guide section — commercial-investigation queries need vendor comparison.'
            : primaryIntent.toLowerCase() === 'navigational'
              ? 'This is a brand-search query — consider redirecting traffic to a branded landing page instead of generic content.'
              : 'Simplify to a deep how-to / explainer / FAQ — informational queries reward depth and clarity over conversion.',
        affectedSection: null,
        autoFixable: false, // Strategic — needs human re-plan
        applied: false,
      });
    }
  }

  // ── Calculate overall score ──
  let score = 100;
  for (const fix of fixes) {
    switch (fix.severity) {
      case 'critical': score -= 15; break;
      case 'high': score -= 10; break;
      case 'medium': score -= 5; break;
      case 'low': score -= 2; break;
    }
  }
  score = Math.max(0, Math.min(100, score));

  // ── Build section scores ──
  const sectionScores = buildSectionScores(fixes, plan, headings, wordCount, markdown);

  // ── GEO Score (AI-citation-friendliness) ──
  const geoScore = analyzeGEO(markdown, plan);

  return {
    overallScore: score,
    wordCount,
    readabilityScore: null, // Could be enhanced with Flesch-Kincaid
    sentimentPolarity: null,
    keywordDensity,
    topEntities: plan.entityMentions.filter((e) => content.includes(e.toLowerCase())),
    fixes,
    geoScore,
    sectionScores,
  };
}

function buildSectionScores(
  fixes: ContentFix[],
  plan: ArticlePlan,
  headings: { level: number; text: string }[],
  wordCount: number,
  markdown: string,
): ContentAnalysisResult['sectionScores'] {
  const makeScore = (categories: string[]): SectionScore => {
    const relevant = fixes.filter((f) => categories.includes(f.category));
    return {
      status: relevant.length === 0 ? 'all_good' : 'issues_found',
      issueCount: relevant.length,
      details: relevant.map((f) => f.description),
    };
  };

  return {
    promptCoverage: makeScore(['section_coverage', 'paa_coverage', 'related_search_coverage']),
    schemaMarkup: { status: 'all_good', issueCount: 0, details: [] }, // Schema generated post-analysis
    keyTerms: makeScore(['secondary_keywords', 'geo_entities', 'entity_authority', 'intent_alignment']),
    metaTags: makeScore(['meta_tags']),
    url: { status: plan.slug.length <= 75 ? 'all_good' : 'issues_found', issueCount: plan.slug.length > 75 ? 1 : 0, details: plan.slug.length > 75 ? ['URL slug exceeds 75 characters'] : [] },
    featuredSnippet: makeScore(['featured_snippet_target']),
    h1Heading: makeScore(['h1_heading']),
    links: makeScore(['links', 'ai_overview_alignment']),
    h2h6Headings: makeScore(['h2_keyword', 'heading_hierarchy']),
    contentDepth: makeScore(['content_depth']),
    keywordDensity: makeScore(['keyword_density', 'keyword_placement']),
  };
}

// ════════════════════════════════════════════════════════════════
// GEO SCORE — AI Citation Friendliness (10 signals, 0-100)
// ════════════════════════════════════════════════════════════════

function analyzeGEO(markdown: string, plan: ArticlePlan): GEOScore {
  const content = markdown.toLowerCase();
  const recommendations: string[] = [];

  // 1. Statistics with attribution (15 pts) — "According to [Source]", "data from [Source]"
  const attrPatterns = /according to|data from|research (from|by)|study (from|by)|report (from|by)|survey (from|by)/gi;
  const attrCount = (markdown.match(attrPatterns) || []).length;
  const statisticsWithAttribution = Math.min(15, attrCount * 5);
  if (attrCount < 3) recommendations.push('Add statistics with source attribution (e.g., "According to [Source], 73% of...")');

  // 2. Named entities (10 pts) — proper nouns, company/person names from plan
  const entityCount = plan.entityMentions.filter((e) => content.includes(e.toLowerCase())).length;
  const entityTotal = Math.max(1, plan.entityMentions.length);
  const namedEntities = Math.min(10, Math.round((entityCount / entityTotal) * 10));
  if (entityCount < entityTotal * 0.7) recommendations.push('Include more named entities (companies, people, institutions) for AI citation');

  // 3. Structured definitions (10 pts) — "X is a Y that", "refers to", "defined as"
  const defPatterns = /\b\w+ is (a|an|the) \w+|\brefers to\b|\bdefined as\b|\bknown as\b/gi;
  const defCount = (markdown.match(defPatterns) || []).length;
  const structuredDefinitions = Math.min(10, defCount * 3);
  if (defCount < 2) recommendations.push('Add structured definitions (e.g., "X is a Y that Z") for AI snippet extraction');

  // 4. Expert quotes (10 pts) — "[Name] says", "[Role] at [Company]"
  const quotePatterns = /\b\w+ says\b|\b\w+ explains\b|\b\w+ notes\b|\b\w+ recommends\b|"\s*says \w+|according to \w+ \w+,/gi;
  const quoteCount = (markdown.match(quotePatterns) || []).length;
  const expertQuotes = Math.min(10, quoteCount * 4);
  if (quoteCount < 2) recommendations.push('Add expert quotes or attributed statements for authority signals');

  // 5. FAQ Q&A pairs (10 pts)
  const faqPresent = content.includes('faq') || content.includes('frequently asked');
  const questionMarks = (markdown.match(/\?/g) || []).length;
  const faqCoverage = faqPresent ? Math.min(10, 5 + Math.min(5, questionMarks)) : Math.min(5, questionMarks);
  if (!faqPresent) recommendations.push('Add a clear FAQ section with structured Q&A pairs');

  // 6. Schema markup coverage (10 pts) — check plan.recommendedSchema
  const schemaCount = plan.recommendedSchema?.length || 0;
  const schemaCoverage = Math.min(10, schemaCount * 5);
  if (schemaCount < 2) recommendations.push('Ensure multiple schema types are generated (Article, FAQPage)');

  // 7. Source citations (10 pts) — [SOURCE: ...] or [1], [2] style
  const sourceCitations = (markdown.match(/\[SOURCE:/gi) || []).length;
  const bracketCitations = (markdown.match(/\[\d+\]/g) || []).length;
  const totalCitations = sourceCitations + bracketCitations;
  const sourceCitationScore = Math.min(10, totalCitations * 3);
  if (totalCitations < 3) recommendations.push('Add source citations [SOURCE: description](url) to support claims');

  // 8. Direct answer blocks (10 pts) — 40-60 word paragraphs after a question
  const paragraphs = markdown.split(/\n\n+/);
  let directAnswerCount = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i].trim();
    if (p.endsWith('?') && i + 1 < paragraphs.length) {
      const nextWords = paragraphs[i + 1].split(/\s+/).length;
      if (nextWords >= 30 && nextWords <= 80) directAnswerCount++;
    }
  }
  const directAnswers = Math.min(10, directAnswerCount * 4);
  if (directAnswerCount < 2) recommendations.push('Add concise 40-60 word answer paragraphs after questions for featured snippet targeting');

  // 9. Authority tone (5 pts) — penalize hedging language
  const hedgePatterns = /\bmight\b|\bmaybe\b|\bcould be\b|\bperhaps\b|\bsomewhat\b|\bpossibly\b|\bit seems\b/gi;
  const hedgeCount = (markdown.match(hedgePatterns) || []).length;
  const authorityTone = Math.max(0, 5 - hedgeCount);
  if (hedgeCount > 3) recommendations.push('Reduce hedging language ("might", "maybe", "perhaps") — use confident, authoritative tone');

  // 10. Self-contained paragraphs (10 pts) — each paragraph makes a complete claim
  const contentParagraphs = paragraphs.filter((p) => !p.startsWith('#') && p.trim().length > 20);
  const goodParagraphs = contentParagraphs.filter((p) => {
    const words = p.split(/\s+/).length;
    return words >= 20 && words <= 100; // Not too short, not too long
  });
  const selfContainedParagraphs = contentParagraphs.length > 0
    ? Math.min(10, Math.round((goodParagraphs.length / contentParagraphs.length) * 10))
    : 0;
  if (goodParagraphs.length < contentParagraphs.length * 0.6) recommendations.push('Ensure each paragraph is self-contained (20-100 words) with a complete claim');

  const overall = statisticsWithAttribution + namedEntities + structuredDefinitions +
    expertQuotes + faqCoverage + schemaCoverage + sourceCitationScore +
    directAnswers + authorityTone + selfContainedParagraphs;

  return {
    overall: Math.min(100, overall),
    signals: {
      statisticsWithAttribution,
      namedEntities,
      structuredDefinitions,
      expertQuotes,
      faqCoverage,
      schemaCoverage,
      sourceCitations: sourceCitationScore,
      directAnswers,
      authorityTone,
      selfContainedParagraphs,
    },
    recommendations: recommendations.slice(0, 5), // Top 5 recommendations
  };
}

// ════════════════════════════════════════════════════════════════
// AUTO-FIX VIA GEMINI
// ════════════════════════════════════════════════════════════════

async function applyFixes(
  supabase: any,
  content: string,
  fixes: ContentFix[],
  plan: ArticlePlan,
  brief?: ContentBrief,
): Promise<string> {
  const fixList = fixes
    .map(
      (f) =>
        `[${f.severity.toUpperCase()}] ${f.category}: ${f.description}\n   Action: ${f.suggestion}${f.affectedSection ? `\n   Affected section: ${f.affectedSection}` : ''}`,
    )
    .join('\n\n');

  const voiceInstructions = brief
    ? `\n=== VOICE TO PRESERVE ===\nTone: ${brief.brandVoice.toneAttributes.join(', ')}\nStyle: ${brief.brandVoice.writingStyle || 'Clear and professional'}\nNEVER introduce: ${brief.brandVoice.avoidList.join(', ') || 'N/A'}`
    : '';

  // Load base fix prompt from DB
  let baseFixPrompt: string;
  try {
    baseFixPrompt = await getToolPrompt(supabase, 'seo_fixer');
  } catch {
    baseFixPrompt = 'You are an SEO content editor. Apply ONLY the listed fixes to this article.';
  }

  const prompt = `${baseFixPrompt}
${voiceInstructions}

=== STRUCTURE TO PRESERVE (DO NOT REMOVE OR REWRITE) ===
The article uses these custom callout blocks rendered as UI components on the frontend.
Keep them EXACTLY as they appear — same tag, same position. Do NOT collapse them into plain
paragraphs or strip the leading marker. Only edit text inside if a fix targets that section.

  > [!tldr]      — TL;DR / direct answer block (one per article, after lead paragraph)
  > [!key]       — Key Takeaways block (one per article, after TL;DR)
  > [!definition] Term Name — first-mention jargon definition
  > [!example]   — Concrete example or case study
  > [!info]      — Side note
  > [!warning]   — Risk / pitfall
  > [!quote]     — Direct quote with attribution

The article ALSO has these required sections — do not remove or rename them:
  - H1 title (the very first \`# \` line)
  - Lead paragraph (between H1 and the [!tldr] block)
  - H2 "Frequently Asked Questions" with each FAQ as an H3
  - H2 "Conclusion" or "Next Steps" near the end

=== FIXES TO APPLY ===
${fixList}

=== CURRENT ARTICLE ===
${content}

Return the revised article in Markdown. Only changed sections should differ from input. Preserve every callout block and required section verbatim unless a fix explicitly targets one.`;

  const result = await generateWithGemini(prompt, {
    task: 'seo_analyze_revise',
    temperature: 0.3,
    maxTokens: 8192,
    thinkingLevel: 'low',
  });

  let fixed = result.text;
  // Strip markdown fences
  if (fixed.startsWith('```markdown')) fixed = fixed.slice('```markdown'.length);
  if (fixed.startsWith('```')) fixed = fixed.slice(3);
  if (fixed.endsWith('```')) fixed = fixed.slice(0, -3);

  return fixed.trim();
}

// ════════════════════════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════════════════════════

function countPhrase(text: string, phrase: string): number {
  if (!phrase) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(phrase, pos)) !== -1) {
    count++;
    pos += phrase.length;
  }
  return count;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
