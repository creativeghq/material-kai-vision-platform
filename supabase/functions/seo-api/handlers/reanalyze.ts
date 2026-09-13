/**
 * Re-score an article that is already written, and store the result. Optionally SAVE a
 * hand-edited body first, in the same call.
 *
 * One call on purpose (anti-regression rule 4): two would let the body land while the score did
 * not, and the screen would then show a confident number next to text it was never computed from.
 */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { normalizeContentBrief } from './content-brief.ts';
import { analyzeContent } from './analyze.ts';
import {
  loadOwnedArticle, storedArticlePlan, persistAnalysis, reconciledFaqSchema,
} from './article-access.ts';
import { buildGapsGains, type GapSources } from './gaps.ts';
import type { ArticlePlan } from '../../_shared/seo-types.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export async function handleReanalyze(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return jsonResponse({ success: false, error: 'user_id is required' }, 400);

  try {
    const articleId = typeof body.article_id === 'string' ? body.article_id : null;
    if (!articleId) return jsonResponse({ success: false, error: 'article_id is required.' }, 400);

    const loaded = await loadOwnedArticle(supabase, userId, articleId);
    if ('response' in loaded) return loaded.response;
    const article = loaded.article;

    const { response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId);
    if (entResponse) return entResponse;

    // A hand edit, when the caller sent one. The stored body is scored otherwise.
    const edited = typeof body.markdown_content === 'string' ? body.markdown_content : null;
    if (edited !== null && !edited.trim()) {
      return jsonResponse({ success: false, error: 'An article cannot be saved empty.' }, 400);
    }
    if (edited !== null && edited.length > 400_000) {
      return jsonResponse({ success: false, error: 'That body is too large to save (400,000 characters max).' }, 413);
    }
    const markdown = edited ?? article.markdown_content ?? '';
    if (!markdown.trim()) {
      return jsonResponse(
        { success: false, error: 'This article has no content yet, so there is nothing to analyse.' },
        409,
      );
    }

    // The plan carries the target keyword, the headings and the meta targets every check reads.
    // An article whose run failed before the plan landed cannot be re-analysed, and saying so is
    // better than analysing against an empty plan and returning a confident wrong score.
    const plan = storedArticlePlan(article) as ArticlePlan | null;
    const noPlan = 'This article has no stored plan, so it cannot be scored. Only articles the '
      + 'pipeline completed carry one.';
    if (!plan) {
      // A re-score that cannot run must not eat the edit the writer just made. The save still
      // happens; what is missing is the SCORE, and that is said rather than implied by leaving
      // the old number sitting next to new text.
      if (edited === null) return jsonResponse({ success: false, error: noPlan }, 409);

      const savedAt = new Date().toISOString();
      const { error: saveErr } = await supabase.from('seo_articles').update({
        markdown_content: edited,
        previous_markdown: article.markdown_content ?? '',
        previous_markdown_at: savedAt,
        previous_markdown_label: 'Your edit',
        updated_at: savedAt,
      }).eq('id', articleId);
      if (saveErr) throw new Error(`Could not save your edit: ${saveErr.message}`);

      return jsonResponse({
        success: true,
        data: {
          article_id: articleId, analysis: null, seo_score: null, readability_score: null,
          applicable_fixes: 0, gaps_gains: null, markdown_content: edited, word_count: null,
          saved: true, scored: false, score_unavailable: noPlan,
          can_revert: true, reverts_to: savedAt, credits_used: 0,
        },
      });
    }

    const analysis = analyzeContent(
      markdown,
      plan,
      undefined,
      normalizeContentBrief(article.content_brief),
      undefined,
    );

    // Gaps/Gains are re-derived here too. They were built from competitor PAGE TITLES with two
    // hardcoded numbers beside them, so every article ever produced carries a broken set; without
    // this, the fix would only ever reach articles written after today. `research_tab_data` is
    // stored on the row, which is what makes the repair possible at all.
    const research = (article.stages_data as { extra?: { research_tab_data?: GapSources } } | null)
      ?.extra?.research_tab_data;
    const gapsGains = research ? buildGapsGains(markdown, research) : null;

    // The snapshot goes in the SAME statement as the new body, so the two can never disagree
    // about which text it precedes — and Revert reaches a hand edit exactly as it reaches an
    // applied fix, because both leave the same trail.
    const capturedAt = new Date().toISOString();
    const columns = edited === null ? {} : {
      markdown_content: edited,
      previous_markdown: article.markdown_content ?? '',
      previous_markdown_at: capturedAt,
      previous_markdown_label: 'Your edit',
      updated_at: capturedAt,
    };

    const { error: writeErr } = await persistAnalysis(
      supabase,
      article,
      analysis,
      columns,
      {
        ...(gapsGains ? { gaps_gains_data: gapsGains } : {}),
        // Drops FAQ schema entries the body no longer shows. Free, and it repairs a row that
        // drifted before this existed.
        ...reconciledFaqSchema(article, markdown),
      },
    );
    if (writeErr) throw new Error(`Could not save the analysis: ${writeErr}`);

    const applicable = analysis.fixes.filter((f) => f.scope === 'section' && f.anchor).length;
    console.log(`[seo-reanalyze] ${articleId}: ${analysis.overallScore}/100, `
      + `${analysis.fixes.length} fixes, ${applicable} applicable`);

    return jsonResponse({
      success: true,
      data: {
        article_id: articleId,
        analysis,
        seo_score: analysis.overallScore,
        readability_score: analysis.readabilityScore,
        applicable_fixes: applicable,
        gaps_gains: gapsGains,
        markdown_content: markdown,
        word_count: analysis.wordCount,
        saved: edited !== null,
        scored: true,
        can_revert: edited !== null,
        reverts_to: edited === null ? null : capturedAt,
        credits_used: 0,
      },
    });
  } catch (error: any) {
    console.error('[seo-reanalyze] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not re-analyse the article' }, 500);
  }
}
