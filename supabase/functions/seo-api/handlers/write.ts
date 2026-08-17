/**
 * SEO Write Edge Function
 *
 * Generates a full SEO article from an article plan using Claude Opus.
 * Claude is chosen for writing due to superior prose quality,
 * natural tone, and stronger E-E-A-T experiential signals.
 *
 * Credit cost: 20 credits
 */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { serpBlock, serpValue } from './untrusted.ts';
import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { getToolPrompt, getGenerationPrompt, renderPromptTemplate } from '../../_shared/prompt-utils.ts';
import { generateWithClaude } from '../../_shared/ai-client.ts';
import type {
  SEOWriteRequest,
  SEOWriteResponse,
  ArticlePlan,
  ContentBrief,
  KeywordResearchResult,
  SerpSignalBlob,
} from '../../_shared/seo-types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CREDIT_COST = 20;


export async function handleWrite(req: Request, body: any): Promise<Response> {
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
  const userId = auth.userId ?? body.user_id;
  if (!userId) {
    return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  }

  try {

    if (!body.article_plan) {
      return jsonResponse(
        { success: false, error: 'Missing required field: article_plan' },
        400,
      );
    }

    // Paid module — refuse before the debit and the LLM call (#212 + invariant 10).
    const { response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId);
    if (entResponse) return entResponse;

    // Debit credits
    const { data: debitResult, error: debitError } = await supabase.rpc(
      'debit_credits',
      {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_operation_type: 'seo_write',
        p_description: `SEO article writing: "${body.article_plan.title}"`,
        p_metadata: {
          title: body.article_plan.title,
          target_keyword: body.article_plan.primaryKeyword,
        },
        p_workspace_id: null,
      },
    );

    if (debitError || !debitResult?.[0]?.success) {
      const msg = debitResult?.[0]?.error_message || debitError?.message || 'Insufficient credits';
      return jsonResponse({ success: false, error: msg }, 402);
    }

    console.log(`[seo-write] Writing article: "${body.article_plan.title}" (user: ${userId})`);

    const plan = body.article_plan;
    const brief = body.content_brief;
    const research = body.keyword_research_summary;

    // Load base system prompt from DB, then append dynamic context
    const baseSystemPrompt = await getToolPrompt(supabase, 'seo_writer');
    const systemPrompt = await buildWritingSystemPrompt(supabase, baseSystemPrompt, plan, brief, research);
    const userPrompt = await buildWritingUserPrompt(supabase, plan, brief, research);

    // Call Claude Opus for writing (auto-tracked)
    const result = await generateWithClaude(userPrompt, {
      task: 'seo_write',
      systemPrompt,
      temperature: 0.7,
      maxTokens: 8192,
    });

    // Clean response — strip markdown fences if present
    let markdown = result.text;
    if (markdown.startsWith('```markdown')) {
      markdown = markdown.slice('```markdown'.length);
    }
    if (markdown.startsWith('```')) {
      markdown = markdown.slice(3);
    }
    if (markdown.endsWith('```')) {
      markdown = markdown.slice(0, -3);
    }
    markdown = markdown.trim();

    // Calculate metrics
    const wordCount = markdown.split(/\s+/).filter(Boolean).length;
    const title = plan.title;

    console.log(
      `[seo-write] Article written: ${wordCount} words, ${result.usage.totalTokens} tokens`,
    );

    const response: SEOWriteResponse = {
      success: true,
      data: {
        content_markdown: markdown,
        word_count: wordCount,
        title,
        credits_used: CREDIT_COST,
      },
    };

    return jsonResponse(response);
  } catch (error: any) {
    console.error('[seo-write] Error:', error);
    try {
      await supabase.rpc('refund_credits', {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_operation_type: 'seo_write_refund',
        p_description: 'Refund: SEO writing failed',
        p_metadata: { error: error.message },
        p_workspace_id: null,
      });
      console.log('[seo-write] Credits refunded');
    } catch (refundErr) {
      console.error('[seo-write] Refund failed:', refundErr);
    }
    return jsonResponse(
      { success: false, error: error.message || 'Writing failed' },
      500,
    );
  }
}

// ════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ════════════════════════════════════════════════════════════════

async function buildWritingSystemPrompt(
  supabase: DbClient,
  basePrompt: string,
  plan: ArticlePlan,
  brief?: ContentBrief,
  research?: Partial<KeywordResearchResult>,
): Promise<string> {
  let prompt = basePrompt;

  // Modern SEO + AEO (Answer Engine Optimization) scaffolding rules — required for every article.
  // The frontend reads these conventions to render custom blocks (TL;DR card, Key Takeaways, definitions,
  // FAQ accordion). Stay strict on these markers — drift breaks the rendering.
  prompt += await getToolPrompt(supabase, 'seo_writer_article_structure');

  if (brief) {
    prompt += `

=== BRAND VOICE ===
Tone: ${brief.brandVoice.toneAttributes.join(', ')}
Personality: ${brief.brandVoice.personalityTraits.join('. ')}
Writing style: ${brief.brandVoice.writingStyle || 'Clear, concise, actionable'}
NEVER use: ${brief.brandVoice.avoidList.join(', ') || 'N/A'}
Preferred terminology: ${brief.brandVoice.terminologyPreferences.join(', ') || 'N/A'}

=== AUDIENCE ===
Writing for: ${brief.audience.primaryPersona}
Knowledge level: ${brief.audience.knowledgeLevel}
Pain points: ${brief.audience.painPoints.join(', ')}
Decision stage: ${brief.audience.decisionStage}
${brief.audience.knowledgeLevel === 'beginner' ? 'Explain industry terms when first used. Use analogies.' : ''}
${brief.audience.knowledgeLevel === 'expert' ? 'Skip basic explanations. Use industry jargon freely. Go deep on nuance.' : ''}

=== CONTENT OBJECTIVE ===
Business goal: ${brief.businessObjective}
Call to action: ${brief.callToAction || 'No hard CTA — focus on value'}`;
  }

  // E-E-A-T: the only input carrying information the SERP does not already have.
  prompt += await buildFirsthandExperienceBlock(supabase, brief);

  // Dynamic context from the article plan
  prompt += `

=== DYNAMIC CONTEXT ===
- Primary keyword: "${plan.primaryKeyword}" — in first 100 words, in at least 1 H2, and in conclusion
- Top secondaries: ${plan.secondaryKeywords.slice(0, 5).join(', ')}
- Named entities to include: ${plan.entityMentions.join(', ')}
- FAQ questions: ${plan.faqQuestions.slice(0, 5).join('; ')}
- Start with # ${plan.title} as H1
- Target word count: ${plan.targetWordCount} words (±10%)`;

  if (brief?.internalLinksContext?.length) {
    prompt += `\n- Existing articles to link to: ${brief.internalLinksContext.join(', ')}`;
  }

  // Phase 3 — append mention-monitoring SERP signals so the writer optimizes
  // direct-answer paragraphs against the actual current SERP state.
  prompt += await buildSerpSignalsWriterBlock(supabase, research?.serpSignals);

  return prompt;
}

/**
 * First-hand experience block — the "E" in E-E-A-T.
 *
 * Every other input to the writer (research, SERP signals, competitor content
 * scores) is derived from the pages we are trying to outrank, so an article built
 * from those alone is by construction a better-formatted restatement of what is
 * already ranking. Google's helpful-content guidance calls that out directly
 * ("adds substantial value beyond source material", "demonstrates first-hand
 * expertise"). This block is the only place where information the SERP does not
 * contain enters the prompt.
 *
 * Returns '' when the brief carries none — the analyzer raises a `firsthand_experience`
 * fix in that case rather than the writer inventing experience it does not have.
 */
async function buildFirsthandExperienceBlock(supabase: DbClient, brief?: ContentBrief): Promise<string> {
  const fx = brief?.firsthandExperience;
  if (!fx) return '';

  const data = fx.proprietaryData?.filter(Boolean) ?? [];
  const examples = fx.ownedExamples?.filter(Boolean) ?? [];
  if (!data.length && !examples.length && !fx.methodology && !fx.credentials) return '';

  let block = await getToolPrompt(supabase, 'seo_writer_firsthand_header');

  if (fx.credentials) {
    block += `\n\n**Our standing to write this**: ${fx.credentials}
Reflect this in how directly the article speaks. Do not claim credentials beyond this line.`;
  }

  if (data.length) {
    block += `\n\n**Our own data** — cite these as ours ("in our own testing", "across the N orders we handled"), NOT as an external source:
${data.map((d) => `- ${d}`).join('\n')}
Put at least one of these inside a \`> [!example]\` block with the concrete number visible.`;
  }

  if (examples.length) {
    block += `\n\n**Our own examples** — real products/projects/customers to reference by name:
${examples.map((e) => `- ${e}`).join('\n')}
Use at least one as the concrete example required by the ARTICLE STRUCTURE rules, instead of a generic hypothetical.`;
  }

  if (fx.methodology) {
    block += `\n\n**How we know it** (Google's "How"): ${fx.methodology}
State this explicitly wherever our data is cited — one clause is enough ("measured across 40 samples over six months"). Unexplained proprietary numbers read as invented.`;
  }

  block += await getToolPrompt(supabase, 'seo_writer_firsthand_hardrule');

  return block;
}

/**
 * Tactical writer guidance derived from `serpSignals`. Tells the writer
 * exactly which sentences to tune for AI Overview citation, featured-
 * snippet capture, and PAA matching. The system block already covers
 * structural rules — this layer is content-specific.
 */
async function buildSerpSignalsWriterBlock(supabase: DbClient, signals?: SerpSignalBlob): Promise<string> {
  if (!signals) return '';
  let block = '=== SERP-AWARE WRITING TARGETS ===';

  if (signals.aiOverviewText) {
    block += `\n\n**AI Overview text Google currently shows:**\n"${serpValue(signals.aiOverviewText, 800)}"`;
    if (signals.aiOverviewBrandMentioned === false) {
      block += `\nGoal: write paragraphs Google's AI would prefer to cite over the current sources. Use direct-answer first sentence, statistics with attribution, and structured definitions. Match the tone but go deeper.`;
    } else {
      block += `\nReinforce the framing — your brand is already cited. Don't contradict it.`;
    }
  }

  if (signals.featuredSnippetTarget?.description) {
    block += `\n\n**Featured snippet to displace** (currently held by ${serpValue(signals.featuredSnippetTarget.domain, 120) || 'unknown'}):\n"${serpValue(signals.featuredSnippetTarget.description, 600)}"\nThe TL;DR block's lead sentence MUST answer the same question more concisely (40–60 words) so Google considers replacing the current snippet.`;
  }

  const paaAnswers = signals.paaAnswers || [];
  if (paaAnswers.length) {
    block += `\n\n**PAA answers currently shown by Google** — write tighter answers than these for the matching FAQ entries:`;
    for (const a of paaAnswers.slice(0, 6)) {
      block += `\n- Q: ${serpValue(a.question, 300)}`;
      if (a.answerSnippet) {
        block += `\n  Current answer: "${serpValue(a.answerSnippet, 240)}"`;
      }
    }
  }

  if (signals.relatedSearches?.length) {
    block += `\n\n**Related searches Google clusters with this query** (use as natural cross-references in body, not forced):\n${signals.relatedSearches.slice(0, 8).map((t) => `- ${serpValue(t, 200)}`).join('\n')}`;
  }

  if (signals.knowledgeGraphPresent === false) {
    block += await getToolPrompt(supabase, 'seo_writer_no_knowledge_panel');
  }

  // Everything above is Google's rendering of pages we do not control: the AI Overview
  // paragraph, the snippet a competitor currently holds, the answers Google shows under PAA.
  // It went into the writer prompt raw, so a competitor page could address the writer directly
  // (#361 `EG-5`, invariant 9). Fenced and labelled as data.
  return serpBlock(block);
}

async function buildWritingUserPrompt(
  supabase: DbClient,
  plan: ArticlePlan,
  brief?: ContentBrief,
  research?: Partial<KeywordResearchResult>,
): Promise<string> {
  const outline = buildOutlineText(plan.sections, 0);
  const faqList = plan.faqQuestions.length
    ? plan.faqQuestions.map((q, i) => `   ${i + 1}. ${q}`).join('\n')
    : '   (no FAQs provided — generate 4–6 reasonable questions matching search intent)';

  return renderPromptTemplate(await getGenerationPrompt(supabase, 'seo_writer_user'), { outline: outline, featured_snippet_target: (plan.featuredSnippetTarget || research?.serpSignals?.featuredSnippetTarget?.description)
  ? `\nFEATURED SNIPPET TARGET: The TL;DR block's lead sentence MUST answer: "${serpValue(plan.featuredSnippetTarget || research?.serpSignals?.featuredSnippetTarget?.description, 600)}"\n`
  : '', faq_list: faqList, primary_keyword: plan.primaryKeyword, secondary_keywords: plan.secondaryKeywords.join(', '), lsi_keywords: plan.lsiKeywords.join(', '), target_word_count: plan.targetWordCount });
}

function buildOutlineText(sections: ArticlePlan['sections'], depth: number): string {
  const indent = '  '.repeat(depth);
  return sections
    .map((s) => {
      const prefix = '#'.repeat(
        s.headingLevel === 'h1' ? 1 : s.headingLevel === 'h2' ? 2 : s.headingLevel === 'h3' ? 3 : 4,
      );
      let line = `${indent}${prefix} ${s.heading} (~${s.estimatedWordCount} words)`;
      if (s.targetKeywords.length > 0) {
        line += ` [keywords: ${s.targetKeywords.join(', ')}]`;
      }
      if (s.description) {
        line += `\n${indent}  → ${s.description}`;
      }
      if (s.includeFaq) line += `\n${indent}  → Include FAQ`;
      if (s.includeTable) line += `\n${indent}  → Include comparison table`;
      if (s.includeList) line += `\n${indent}  → Include bullet list`;
      if (s.subsections.length > 0) {
        line += '\n' + buildOutlineText(s.subsections, depth + 1);
      }
      return line;
    })
    .join('\n');
}
