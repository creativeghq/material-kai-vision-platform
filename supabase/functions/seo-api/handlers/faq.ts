/**
 * Add one question and answer to the article's FAQ section.
 *
 * The only way to get a question into an article was Research → Questions, which appends
 * `## <question>` plus a TODO marker to the BOTTOM of the document — below the conclusion, outside
 * the FAQ, and with no answer. For a question that is the wrong place twice over: it breaks the
 * FAQ block the viewer renders as an accordion, and it breaks `faq_schema`, which is what a
 * FAQPage rich result is built from.
 *
 * So this puts the pair where it belongs, in the section that already exists, and keeps
 * `faq_schema` in step. The insertion is a pure function so it can be tested without a model call
 * — where the text lands is the part that can silently go wrong.
 */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { generateWithClaude } from '../../_shared/ai-client.ts';
import { getGenerationPrompt, renderPromptTemplate } from '../../_shared/prompt-utils.ts';
import { normalizeContentBrief, briefList } from './content-brief.ts';
import { analyzeContent } from './analyze.ts';
import { loadOwnedArticle, storedArticlePlan, persistAnalysis } from './article-access.ts';
import { buildGapsGains, type GapSources } from './gaps.ts';
import { insertFaqEntry, STRIP_ACCENTS as stripAccents } from './faq-insert.ts';
import type { ArticlePlan, ContentAnalysisResult } from '../../_shared/seo-types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/** One short answer, one model turn. */
const FAQ_CREDIT_COST = 2;
const FAQ_MAX_TOKENS = 1200;

/** The stored FAQ pairs. Written as a bare array of {question, answer} by the pipeline. */
function existingFaqPairs(stagesData: unknown): { question: string; answer: string }[] {
  const raw = (stagesData as { extra?: { faq_schema?: unknown } } | null)?.extra?.faq_schema;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is { question: string; answer: string } =>
    !!e && typeof (e as { question?: unknown }).question === 'string'
    && typeof (e as { answer?: unknown }).answer === 'string');
}

export async function handleAddFaq(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return jsonResponse({ success: false, error: 'user_id is required' }, 400);

  let workspaceId: string | null = null;
  let debited = false;

  try {
    const articleId = typeof body.article_id === 'string' ? body.article_id : null;
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    // An answer the user typed themselves. Free: there is no model turn to pay for.
    const providedAnswer = typeof body.answer === 'string' ? body.answer.trim() : '';
    if (!articleId || !question) {
      return jsonResponse({ success: false, error: 'article_id and question are required.' }, 400);
    }

    const loaded = await loadOwnedArticle(supabase, userId, articleId);
    if ('response' in loaded) return loaded.response;
    const article = loaded.article;

    const markdown = article.markdown_content || '';
    if (!markdown.trim()) {
      return jsonResponse({ success: false, error: 'This article has no content yet.' }, 409);
    }

    const pairs = existingFaqPairs(article.stages_data);
    const already = pairs.some((p) => stripAccents(p.question) === stripAccents(question))
      || new RegExp(`^#{2,4}\\s+${question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im').test(markdown);
    if (already) {
      return jsonResponse({ success: false, error: 'That question is already in the FAQ.' }, 409);
    }

    const { workspaceId: resolvedWs, response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId);
    workspaceId = resolvedWs ?? null;
    if (entResponse) return entResponse;

    let answer = providedAnswer;
    if (!answer) {
      const { data: debit, error: debitErr } = await supabase.rpc('debit_credits', {
        p_user_id: userId,
        p_amount: FAQ_CREDIT_COST,
        p_operation_type: 'seo_add_faq',
        p_description: `SEO FAQ answer: ${question.slice(0, 80)}`,
        p_metadata: { article_id: articleId },
        p_workspace_id: workspaceId,
      });
      if (debitErr || !debit?.[0]?.success) {
        return jsonResponse(
          { success: false, error: debit?.[0]?.error_message || debitErr?.message || 'Insufficient credits' },
          402,
        );
      }
      debited = true;

      const brief = normalizeContentBrief(article.content_brief);
      const voice = brief
        ? `\nKeep this voice: ${briefList(brief.brandVoice.toneAttributes)}. `
          + `${brief.brandVoice.writingStyle || ''}`.trim()
        : '';

      // From the DB, never inline (an inline copy is invisible when it fires). The existing FAQ
      // pairs go in as the example, which is what keeps the new answer the same length and
      // register as the ones already there.
      const sample = pairs.slice(0, 2)
        .map((p) => `Q: ${p.question}\nA: ${p.answer}`).join('\n\n') || '(none yet)';

      const prompt = renderPromptTemplate(
        await getGenerationPrompt(supabase, 'seo_faq_answer_user'),
        { question, voice_instructions: voice, existing_faqs: sample, article_title: articleTitleOf(article) },
      );

      const result = await generateWithClaude(prompt, {
        task: 'seo_add_faq',
        temperature: 0.3,
        maxTokens: FAQ_MAX_TOKENS,
        userId,
        workspaceId: workspaceId ?? undefined,
      });
      if (result.finishReason === 'length') {
        throw new Error('The answer hit the token ceiling and would have been truncated — nothing was added.');
      }
      answer = result.text.trim();
      if (answer.startsWith('```')) answer = answer.replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim();
      // The model sometimes echoes the question as a heading; the section supplies it.
      answer = answer.replace(/^#{1,6}\s+.*\n+/, '').trim();
      if (!answer) throw new Error('The model returned an empty answer — nothing was added.');
    }

    const inserted = insertFaqEntry(markdown, question, answer);
    if (inserted.markdown === markdown) {
      throw new Error('The FAQ entry could not be placed — nothing was changed.');
    }

    const plan = storedArticlePlan(article) as ArticlePlan | null;
    const brief = normalizeContentBrief(article.content_brief);
    let reanalysed: ContentAnalysisResult | null = null;
    if (plan) {
      try { reanalysed = analyzeContent(inserted.markdown, plan, undefined, brief, undefined); }
      catch (e) { console.error('[seo-add-faq] re-score failed, saving anyway:', e); }
    }
    const research = (article.stages_data as { extra?: { research_tab_data?: GapSources } } | null)
      ?.extra?.research_tab_data;
    const gapsGains = research ? buildGapsGains(inserted.markdown, research) : null;

    const capturedAt = new Date().toISOString();
    const columns = {
      markdown_content: inserted.markdown,
      previous_markdown: markdown,
      previous_markdown_at: capturedAt,
      previous_markdown_label: `FAQ added: ${question.slice(0, 160)}`,
      updated_at: capturedAt,
    };
    // `faq_schema` travels with the body. They are one fact — the rich result is built from the
    // schema and the reader sees the markdown, and the two disagreeing is how a page claims an
    // FAQ it does not show (or shows one it does not claim).
    const extraKeys: Record<string, unknown> = {
      faq_schema: [...pairs, { question, answer }],
      ...(gapsGains ? { gaps_gains_data: gapsGains } : {}),
    };

    if (reanalysed) {
      const { error } = await persistAnalysis(supabase, article, reanalysed, columns, extraKeys);
      if (error) throw new Error(`Could not save the FAQ: ${error}`);
    } else {
      const stages = (article.stages_data ?? {}) as Record<string, unknown>;
      const extra = (stages.extra ?? {}) as Record<string, unknown>;
      const { error } = await supabase.from('seo_articles')
        .update({ ...columns, stages_data: { ...stages, extra: { ...extra, ...extraKeys } } })
        .eq('id', articleId);
      if (error) throw new Error(`Could not save the FAQ: ${error.message}`);
    }

    return jsonResponse({
      success: true,
      data: {
        article_id: articleId,
        markdown_content: inserted.markdown,
        question,
        answer,
        created_section: inserted.createdSection,
        heading: inserted.heading,
        analysis: reanalysed,
        gaps_gains: gapsGains,
        can_revert: true,
        reverts_to: capturedAt,
        credits_used: debited ? FAQ_CREDIT_COST : 0,
      },
    });
  } catch (error: any) {
    if (debited) {
      try {
        await supabase.rpc('refund_credits', {
          p_user_id: userId,
          p_amount: FAQ_CREDIT_COST,
          p_operation_type: 'seo_add_faq_refund',
          p_description: 'Refund: adding the FAQ failed',
          p_metadata: { error: String(error?.message ?? error).slice(0, 300) },
          p_workspace_id: workspaceId,
        });
      } catch (refundErr) {
        console.error('[seo-add-faq] refund failed:', refundErr);
      }
    }
    console.error('[seo-add-faq] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not add the FAQ' }, 500);
  }
}

/** The article's own title, for the answer prompt's context. */
function articleTitleOf(article: { stages_data: Record<string, unknown> | null }): string {
  const plan = (article.stages_data as { extra?: { article_plan?: { title?: string } } } | null)?.extra?.article_plan;
  return plan?.title ?? '';
}
