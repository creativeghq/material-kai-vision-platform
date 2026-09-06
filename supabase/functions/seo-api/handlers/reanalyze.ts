/**
 * Re-score an article that is already written, and store the result.
 *
 * This exists because the applicable-fix list is only as current as the analysis it was
 * derived from, and there was no way to refresh one. Two consequences, both silent:
 *
 *   • An article analysed before per-paragraph anchors shipped has fixes with no `scope` and
 *     no `anchor`, so NOTHING is applicable and the Apply card rendered nothing at all. Every
 *     article in the database was in that state — the feature was live and invisible.
 *   • Applying a fix rewrites the paragraph the analysis anchored to, so that fix's anchor no
 *     longer occurs in the article. The stored list still offered it, and clicking it returned
 *     "that paragraph is no longer in the article". Correct, and a dead end.
 *
 * It is FREE and it is not a model call. `analyzeContent` is pure TypeScript — the writer and
 * the fixer call models, the analyzer counts. So there is no debit here, and nothing to refund:
 * charging for arithmetic we already do on every apply would be charging for nothing.
 *
 * It never touches `markdown_content`. Re-analysing must be safe to press at any time; a
 * button that silently rewrote the article would make the honest answer ("your analysis is
 * stale") too expensive to act on.
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

    const markdown = article.markdown_content || '';
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
    if (!plan) {
      return jsonResponse({
        success: false,
        error: 'This article has no stored plan, so it cannot be re-analysed. Only articles the '
          + 'pipeline completed carry one.',
      }, 409);
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

    const { error: writeErr } = await persistAnalysis(
      supabase,
      article,
      analysis,
      {},
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
        credits_used: 0,
      },
    });
  } catch (error: any) {
    console.error('[seo-reanalyze] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not re-analyse the article' }, 500);
  }
}
