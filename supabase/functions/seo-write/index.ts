/**
 * SEO Write Edge Function
 *
 * Generates a full SEO article from an article plan using Claude Sonnet.
 * Claude is chosen for writing due to superior prose quality,
 * natural tone, and stronger E-E-A-T experiential signals.
 *
 * Credit cost: 20 credits
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { getToolPrompt } from '../_shared/prompt-utils.ts';
import { generateWithClaude } from '../_shared/ai-client.ts';
import type {
  SEOWriteRequest,
  SEOWriteResponse,
  ArticlePlan,
  ContentBrief,
} from '../_shared/seo-types.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const CREDIT_COST = 20;

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(withApiLogging('seo-write', async (req) => {
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
    const body: SEOWriteRequest = await req.json();

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

    // Load base system prompt from DB, then append dynamic context
    const baseSystemPrompt = await getToolPrompt(supabase, 'seo_writer');
    const systemPrompt = buildWritingSystemPrompt(baseSystemPrompt, plan, brief);
    const userPrompt = buildWritingUserPrompt(plan, brief);

    // Call Claude Sonnet for writing (auto-tracked)
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
    return jsonResponse(
      { success: false, error: error.message || 'Writing failed' },
      500,
    );
  }
}));

// ════════════════════════════════════════════════════════════════
// PROMPT BUILDERS
// ════════════════════════════════════════════════════════════════

function buildWritingSystemPrompt(basePrompt: string, plan: ArticlePlan, brief?: ContentBrief): string {
  let prompt = basePrompt;

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

  return prompt;
}

function buildWritingUserPrompt(plan: ArticlePlan, brief?: ContentBrief): string {
  const outline = buildOutlineText(plan.sections, 0);

  return `Write the complete article following this outline exactly:

${outline}

${plan.featuredSnippetTarget ? `\nFEATURED SNIPPET TARGET: Write a 40-60 word direct answer for: "${plan.featuredSnippetTarget}"\n` : ''}

Primary keyword: ${plan.primaryKeyword}
Secondary keywords: ${plan.secondaryKeywords.join(', ')}
LSI terms: ${plan.lsiKeywords.join(', ')}
Target word count: ${plan.targetWordCount} words

Write the full article now in Markdown.`;
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
