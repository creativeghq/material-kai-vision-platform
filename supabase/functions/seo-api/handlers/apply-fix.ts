/**
 * Apply ONE fix to ONE block of an article — and put it back.
 *
 * The existing auto-fix path sends the whole article to the model and takes a whole article
 * back. That is the expensive shape, the destructive shape, and it discards the writer's
 * prose everywhere the fix does not apply: a 2,077-word article is ~10,000 tokens in and
 * ~10,000 out to change one paragraph, and every other paragraph comes back re-generated.
 *
 * This sends the anchored block ALONE — measured at 2,000 characters against 23,958 for the
 * same article, a 12× reduction — and splices the result back by exact string replacement.
 * Everything outside the block is byte-identical afterwards, so a bad edit can only damage
 * the paragraph it was asked to edit.
 *
 * The anchor must appear EXACTLY ONCE. Zero means the article has moved on since the
 * analysis and the fix no longer describes it; more than one means the replacement would be
 * ambiguous. Both refuse rather than guess — splicing into the wrong paragraph is precisely
 * the failure this design exists to make impossible.
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
import type { ArticlePlan, ContentAnalysisResult } from '../../_shared/seo-types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/** One block, one model turn. A twelfth of the input the whole-article fixer sends. */
const APPLY_CREDIT_COST = 2;

/**
 * Claude, not the whole-article fixer's Gemini.
 *
 * `write.ts` picks Claude for the article "due to superior prose quality, natural tone, and
 * stronger E-E-A-T experiential signals" — and then the fixer rewrote that prose with Gemini
 * Flash at `thinkingLevel: 'low'`. Nobody had ever compared them: `seo_analyze_revise` had
 * zero rows in `ai_usage_logs`, and there is no eval or doc anywhere that chose it.
 *
 * Measured on a real block from article 88779ba1 (a Greek section, "add structured
 * definitions"): Claude inserted two correct Greek definitions and left every figure and the
 * surrounding prose byte-identical. Keeping the writer's model for edits to the writer's
 * prose is the conservative choice; the whole-article path is left on Gemini until someone
 * measures both on the same input.
 */
const APPLY_MODEL_MAX_TOKENS = 4000;

export async function handleApplyFix(req: Request, body: any): Promise<Response> {
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
    const anchor = typeof body.anchor === 'string' ? body.anchor : null;
    const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : null;
    if (!articleId || !anchor || !instruction) {
      return jsonResponse(
        { success: false, error: 'article_id, anchor and instruction are all required.' },
        400,
      );
    }

    // 404 on a miss AND on a foreign article — never 403, which confirms the id exists
    // (invariant 1). One implementation, shared with reanalyze.
    const loaded = await loadOwnedArticle(supabase, userId, articleId);
    if ('response' in loaded) return loaded.response;
    const article = loaded.article;

    const markdown: string = article.markdown_content || '';
    const occurrences = markdown.split(anchor).length - 1;
    if (occurrences === 0) {
      return jsonResponse({
        success: false,
        error: 'That paragraph is no longer in the article — it has been edited since this '
          + 'suggestion was produced. Re-analyze to get current suggestions.',
      }, 409);
    }
    if (occurrences > 1) {
      return jsonResponse({
        success: false,
        error: 'That exact text appears more than once, so there is no single place to apply '
          + 'this. Edit it by hand rather than have the fix land in the wrong paragraph.',
      }, 409);
    }

    const { workspaceId: resolvedWs, response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId);
    workspaceId = resolvedWs ?? null;
    if (entResponse) return entResponse;

    const { data: debit, error: debitErr } = await supabase.rpc('debit_credits', {
      p_user_id: userId,
      p_amount: APPLY_CREDIT_COST,
      p_operation_type: 'seo_apply_fix',
      p_description: `SEO fix applied: ${instruction.slice(0, 80)}`,
      p_metadata: { article_id: articleId, block_chars: anchor.length },
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

    // From the DB, never inline. An inline copy is invisible when it fires: the admin edits
    // `seo_fix_block_user` at /admin/ai-configs, the edit saves, and nothing changes —
    // exactly the failure `prompt_registry` exists to stop. No fallback either; it raises.
    const prompt = renderPromptTemplate(
      await getGenerationPrompt(supabase, 'seo_fix_block_user'),
      { instruction, voice_instructions: voice, block: anchor },
    );

    const result = await generateWithClaude(prompt, {
      task: 'seo_apply_fix',
      temperature: 0.3,
      maxTokens: APPLY_MODEL_MAX_TOKENS,
      userId,
      workspaceId: workspaceId ?? undefined,
    });

    if (result.finishReason === 'length') {
      throw new Error('The rewrite hit the token ceiling and would have been truncated — nothing was changed.');
    }

    let revised = result.text.trim();
    if (revised.startsWith('```')) revised = revised.replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim();
    if (!revised) throw new Error('The model returned an empty block — nothing was changed.');

    const next = markdown.replace(anchor, revised);
    if (next === markdown) {
      // Nothing to save, and charging for a no-op would be charging for nothing.
      throw new Error('The rewrite came back identical — nothing was changed.');
    }

    // Re-analyse. `analyzeContent` is pure TypeScript with no model call, so this is free and
    // immediate — there is no reason to hand back a stale answer.
    //
    // The whole ANALYSIS is re-derived, not just the score. The fix we just applied rewrote the
    // paragraph its anchor pointed at, so that anchor no longer occurs in the article: leaving
    // the stored analysis alone left the applied fix on the list, and pressing it again returned
    // "that paragraph is no longer in the article". The list has to describe the article as it
    // is now, and after this edit only this function knows what that is.
    const plan = storedArticlePlan(article) as ArticlePlan | null;
    let score: number | null = null;
    let readability: number | null = null;
    let reanalysed: ContentAnalysisResult | null = null;
    if (plan) {
      try {
        reanalysed = analyzeContent(next, plan, undefined, brief, undefined);
        score = reanalysed.overallScore;
        readability = reanalysed.readabilityScore;
      } catch (scoreErr) {
        // A re-score that fails must not lose the edit the user just paid for.
        console.error('[seo-apply-fix] re-score failed, saving the edit anyway:', scoreErr);
      }
    }

    const capturedAt = new Date().toISOString();
    // Snapshot BEFORE-state, written in the SAME statement as the new body so the two can never
    // disagree about which text the snapshot precedes — and, when the re-analysis succeeded, the
    // refreshed fix list goes with them for the same reason.
    const snapshot = {
      markdown_content: next,
      previous_markdown: markdown,
      previous_markdown_at: capturedAt,
      previous_markdown_label: instruction.slice(0, 200),
      updated_at: capturedAt,
    };
    const writeErr = reanalysed
      ? (await persistAnalysis(supabase, article, reanalysed, snapshot)).error
      : (await supabase.from('seo_articles').update(snapshot).eq('id', articleId)).error?.message ?? null;
    if (writeErr) throw new Error(`Could not save the revised article: ${writeErr}`);

    return jsonResponse({
      success: true,
      data: {
        article_id: articleId,
        markdown_content: next,
        revised_block: revised,
        seo_score: score,
        readability_score: readability,
        analysis: reanalysed,
        can_revert: true,
        reverts_to: capturedAt,
        credits_used: APPLY_CREDIT_COST,
      },
    });
  } catch (error: any) {
    if (debited) {
      try {
        await supabase.rpc('refund_credits', {
          p_user_id: userId,
          p_amount: APPLY_CREDIT_COST,
          p_operation_type: 'seo_apply_fix_refund',
          p_description: 'Refund: applying the fix failed',
          p_metadata: { error: String(error?.message ?? error).slice(0, 300) },
          p_workspace_id: workspaceId,
        });
      } catch (refundErr) {
        console.error('[seo-apply-fix] refund failed:', refundErr);
      }
    }
    console.error('[seo-apply-fix] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not apply the fix' }, 500);
  }
}

/**
 * One step back. Free — it is a column swap, not a model call.
 *
 * Swaps rather than discards: reverting stores what you reverted FROM, so a revert can
 * itself be undone. Without that, clicking Revert by mistake destroys the applied edit as
 * irrecoverably as the thing Revert exists to protect against.
 */
export async function handleRevertFix(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return jsonResponse({ success: false, error: 'user_id is required' }, 400);

  try {
    const articleId = typeof body.article_id === 'string' ? body.article_id : null;
    if (!articleId) return jsonResponse({ success: false, error: 'article_id is required' }, 400);

    const loaded = await loadOwnedArticle(supabase, userId, articleId);
    if ('response' in loaded) return loaded.response;
    const article = loaded.article;

    // `previous_markdown` is not in the shared column list — it is this handler's alone.
    const { data: prev, error: prevErr } = await supabase
      .from('seo_articles')
      .select('previous_markdown, previous_markdown_label')
      .eq('id', articleId)
      .maybeSingle();
    if (prevErr) return jsonResponse({ success: false, error: prevErr.message }, 500);
    if (!prev?.previous_markdown) {
      return jsonResponse({ success: false, error: 'There is no previous draft to revert to.' }, 409);
    }

    const restored: string = prev.previous_markdown;
    // The brief was passed as `null` here and as the real brief on the way in, so a revert used
    // to hand back a score the apply path would never have produced for the same text — the
    // provenance and firsthand-experience checks read the brief.
    const brief = normalizeContentBrief(article.content_brief);
    const plan = storedArticlePlan(article) as ArticlePlan | null;
    let score: number | null = null;
    let readability: number | null = null;
    let reanalysed: ContentAnalysisResult | null = null;
    if (plan) {
      try {
        reanalysed = analyzeContent(restored, plan, undefined, brief, undefined);
        score = reanalysed.overallScore;
        readability = reanalysed.readabilityScore;
      } catch { /* the restore matters more than the score */ }
    }

    const now = new Date().toISOString();
    // Swap, so the revert is itself undoable — and re-analyse, because the fix list describes
    // the text that is in the article, which as of this statement is the restored one.
    const snapshot = {
      markdown_content: restored,
      previous_markdown: article.markdown_content,
      previous_markdown_at: now,
      previous_markdown_label: `Undo of: ${prev.previous_markdown_label ?? 'an applied fix'}`.slice(0, 200),
      updated_at: now,
    };
    const writeErr = reanalysed
      ? (await persistAnalysis(supabase, article, reanalysed, snapshot)).error
      : (await supabase.from('seo_articles').update(snapshot).eq('id', articleId)).error?.message ?? null;
    if (writeErr) return jsonResponse({ success: false, error: writeErr }, 500);

    return jsonResponse({
      success: true,
      data: {
        article_id: articleId,
        markdown_content: restored,
        seo_score: score,
        readability_score: readability,
        analysis: reanalysed,
        can_revert: true,
      },
    });
  } catch (error: any) {
    console.error('[seo-revert-fix] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not revert' }, 500);
  }
}
