/**
 * SEO Write Edge Function
 *
 * Generates a full SEO article from an article plan using Claude Opus.
 * Claude is chosen for writing due to superior prose quality,
 * natural tone, and stronger E-E-A-T experiential signals.
 *
 * Credit cost: 20 credits
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
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

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export async function handleWrite(req: Request, body: any): Promise<Response> {
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

    if (!body.article_plan) {
      return jsonResponse(
        { success: false, error: 'Missing required field: article_plan' },
        400,
      );
    }

    // Debit credits
    const { data: debitResult, error: debitError } = await supabase.rpc(
      'debit_user_credits',
      {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_operation_type: 'seo_write',
        p_description: `SEO article writing: "${body.article_plan.title}"`,
        p_metadata: {
          title: body.article_plan.title,
          target_keyword: body.article_plan.primaryKeyword,
        },
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
    const systemPrompt = buildWritingSystemPrompt(baseSystemPrompt, plan, brief, research);
    const userPrompt = buildWritingUserPrompt(plan, brief, research);

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
      await supabase.rpc('credit_user_credits', {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_operation_type: 'seo_write_refund',
        p_description: 'Refund: SEO writing failed',
        p_metadata: { error: error.message },
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

function buildWritingSystemPrompt(
  basePrompt: string,
  plan: ArticlePlan,
  brief?: ContentBrief,
  research?: Partial<KeywordResearchResult>,
): string {
  let prompt = basePrompt;

  // Modern SEO + AEO (Answer Engine Optimization) scaffolding rules — required for every article.
  // The frontend reads these conventions to render custom blocks (TL;DR card, Key Takeaways, definitions,
  // FAQ accordion). Stay strict on these markers — drift breaks the rendering.
  prompt += `

=== ARTICLE STRUCTURE (REQUIRED — DO NOT SKIP ANY OF THESE) ===
Every article MUST follow this structure in this exact order:

1. **H1 title** — \`# {plan.title}\` (one line only)

2. **Lead paragraph** — exactly 2–3 sentences (40–70 words). Primary keyword in first 8 words. Hook the reader with the problem or stake. Plain paragraph, no heading.

3. **TL;DR block** — write it as:
   > [!tldr]
   > One-sentence answer to the core question (≤ 30 words, primary keyword in this sentence).
   > Then 2–3 bullet sub-points starting with "- ".
   This is the AEO / Featured Snippet target — be tight and quotable.

4. **Key Takeaways block** — write it as:
   > [!key]
   > - Bullet 1 (≤ 18 words, action-oriented)
   > - Bullet 2
   > - Bullet 3
   > - Bullet 4
   > - Bullet 5
   Five bullets, each one a standalone insight.

5. **Body sections** — H2/H3 from the outline.
   For EVERY H2 section:
   - First sentence directly answers a question implied by the heading (AEO).
   - Include either a comparison **table** OR a **bulleted list** somewhere in the section.
   - Use \`> [!definition]\` blockquote for the first mention of any jargon term, formatted as:
     > [!definition] Term Name
     > Plain-language one-sentence definition.
   - Use \`> [!info]\` for asides, \`> [!warning]\` for risks/pitfalls. Use sparingly (≤ 3 per article each).

6. **Examples / Case Studies** — at least one concrete example block (real product, real number, real scenario) somewhere mid-article. Tag it with \`> [!example]\` blockquote and a 1-line label.

7. **FAQ section** — REQUIRED. H2 heading exactly: "Frequently Asked Questions"
   Then for each FAQ question (use exactly the questions provided in DYNAMIC CONTEXT):
   - H3 with the literal question (no markdown styling, no quotes)
   - Answer immediately following: 40–80 words, plain paragraphs only (no nested lists).
   The answer's first sentence MUST be a complete, self-contained answer (AEO requirement).

8. **Conclusion** — H2 heading "Conclusion" or "Next Steps".
   - 2–3 sentence recap that mentions the primary keyword once.
   - Final paragraph with a single, specific call-to-action (no fluff like "thanks for reading").

=== SEO / AEO RULES ===
- **Primary keyword density**: appear in title (H1), lead paragraph, TL;DR sentence, ≥1 H2, conclusion. Do NOT keyword-stuff — natural placement only.
- **Semantic richness**: use 4–6 of the listed LSI terms naturally across the body.
- **Answer-first paragraphs**: every section opens with the answer, then explains. Inverted pyramid.
- **Statistics with sources**: when citing a number, attribute it inline like "(Source: Company Name, 2024)".
- **Self-contained paragraphs**: each paragraph stands alone — search engines can quote it without surrounding context.
- **Active voice, second person** ("you / your") for instructional/how-to sections.
- **Sentence length**: vary. Mix short punchy sentences with longer explanatory ones. Avg 14–20 words.
- **No filler**: skip "in today's world", "in the modern era", "let's dive in", "without further ado". Get to the point.
- **No em-dashes for asides** — use commas or parens. (Em-dashes ARE fine for direct contrast.)

=== CALLOUT BLOCK REFERENCE (use these exact tags) ===
> [!tldr]      — TL;DR / direct answer (one per article, after lead)
> [!key]       — Key Takeaways (one per article, after TL;DR)
> [!definition] Term Name — first-mention jargon (use as needed)
> [!example]   — Concrete example or case study (≥1 per article)
> [!info]      — Side note / clarifying aside
> [!warning]   — Risk, pitfall, common mistake
> [!quote]     — Direct quote from a named source (with attribution on the next line)

These blockquote tags are rendered as custom UI components on the frontend — keep formatting tight or they'll break.`;

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
  prompt += buildSerpSignalsWriterBlock(research?.serpSignals);

  return prompt;
}

/**
 * Tactical writer guidance derived from `serpSignals`. Tells the writer
 * exactly which sentences to tune for AI Overview citation, featured-
 * snippet capture, and PAA matching. The system block already covers
 * structural rules — this layer is content-specific.
 */
function buildSerpSignalsWriterBlock(signals?: SerpSignalBlob): string {
  if (!signals) return '';
  let block = '\n\n=== SERP-AWARE WRITING TARGETS ===';

  if (signals.aiOverviewText) {
    block += `\n\n**AI Overview text Google currently shows:**\n"${signals.aiOverviewText.slice(0, 800)}"`;
    if (signals.aiOverviewBrandMentioned === false) {
      block += `\nGoal: write paragraphs Google's AI would prefer to cite over the current sources. Use direct-answer first sentence, statistics with attribution, and structured definitions. Match the tone but go deeper.`;
    } else {
      block += `\nReinforce the framing — your brand is already cited. Don't contradict it.`;
    }
  }

  if (signals.featuredSnippetTarget?.description) {
    block += `\n\n**Featured snippet to displace** (currently held by ${signals.featuredSnippetTarget.domain || 'unknown'}):\n"${signals.featuredSnippetTarget.description}"\nThe TL;DR block's lead sentence MUST answer the same question more concisely (40–60 words) so Google considers replacing the current snippet.`;
  }

  const paaAnswers = signals.paaAnswers || [];
  if (paaAnswers.length) {
    block += `\n\n**PAA answers currently shown by Google** — write tighter answers than these for the matching FAQ entries:`;
    for (const a of paaAnswers.slice(0, 6)) {
      block += `\n- Q: ${a.question}`;
      if (a.answerSnippet) {
        block += `\n  Current answer: "${a.answerSnippet.slice(0, 240)}"`;
      }
    }
  }

  if (signals.relatedSearches?.length) {
    block += `\n\n**Related searches Google clusters with this query** (use as natural cross-references in body, not forced):\n${signals.relatedSearches.slice(0, 8).map((t) => `- ${t}`).join('\n')}`;
  }

  if (signals.knowledgeGraphPresent === false) {
    block += `\n\n**No Knowledge Panel** — when first introducing the brand or primary entity, write a one-sentence Wikipedia-style structured definition (e.g. "Brand X is a [category] founded in [year] specializing in [domain]."). This kind of sentence is what AI Overviews and knowledge layers index for entity recognition.`;
  }

  return block;
}

function buildWritingUserPrompt(
  plan: ArticlePlan,
  brief?: ContentBrief,
  research?: Partial<KeywordResearchResult>,
): string {
  const outline = buildOutlineText(plan.sections, 0);
  const faqList = plan.faqQuestions.length
    ? plan.faqQuestions.map((q, i) => `   ${i + 1}. ${q}`).join('\n')
    : '   (no FAQs provided — generate 4–6 reasonable questions matching search intent)';

  return `Write the complete article following the ARTICLE STRUCTURE rules from the system prompt.

REMEMBER — every article must contain, in this order:
  1. H1 title
  2. Lead paragraph (2–3 sentences, 40–70 words)
  3. \`> [!tldr]\` block (one quotable sentence + 2–3 sub-bullets)
  4. \`> [!key]\` block with 5 takeaway bullets
  5. Body sections (matching the outline below)
  6. At least one \`> [!example]\` block somewhere in the body
  7. H2 "Frequently Asked Questions" with each question as an H3
  8. H2 "Conclusion" or "Next Steps" with a CTA

Outline (match these H2/H3 headings exactly, but ADD the structure blocks above):
${outline}

${(plan.featuredSnippetTarget || research?.serpSignals?.featuredSnippetTarget?.description)
  ? `\nFEATURED SNIPPET TARGET: The TL;DR block's lead sentence MUST answer: "${plan.featuredSnippetTarget || research?.serpSignals?.featuredSnippetTarget?.description}"\n`
  : ''}

FAQ QUESTIONS to include verbatim as H3 under "Frequently Asked Questions":
${faqList}

Primary keyword: ${plan.primaryKeyword}
Secondary keywords: ${plan.secondaryKeywords.join(', ')}
LSI terms: ${plan.lsiKeywords.join(', ')}
Target word count: ${plan.targetWordCount} words (±10%)

Write the full article now in Markdown. Use the callout blockquote syntax (\`> [!tldr]\`, \`> [!key]\`, \`> [!definition] Term\`, \`> [!example]\`, \`> [!info]\`, \`> [!warning]\`) exactly as specified — these become custom UI cards on the frontend.`;
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
