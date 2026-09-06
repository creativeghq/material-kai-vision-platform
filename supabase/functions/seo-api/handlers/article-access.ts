/**
 * Loading an article the caller is allowed to touch, and writing an analysis back to it.
 *
 * Both live here because both were about to exist twice. The ownership check is invariant 1:
 * the caller comes from the verified JWT, the article is looked up by id, and a miss and a
 * FOREIGN article return the same 404 — never 403, which would confirm the id exists. Copying
 * fifteen lines of that into a second handler is how one copy ends up with the weaker check.
 *
 * The write is here for the same reason. `content_analysis` is not a column: the pipeline
 * diverts it into `stages_data.extra` (naming a non-existent column makes PostgREST reject the
 * WHOLE update). So persisting an analysis means a read-merge-write of one jsonb field, and a
 * second hand-rolled merge is a chance to drop a sibling key that somebody else wrote.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { userCanAccessWorkspace } from '../../_shared/auth.ts';
import type { ContentAnalysisResult } from '../../_shared/seo-types.ts';

export interface OwnedArticle {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  markdown_content: string | null;
  content_brief: unknown;
  stages_data: Record<string, unknown> | null;
}

/** The columns every caller here needs. Kept in one place so the two handlers agree. */
export const ARTICLE_COLUMNS = 'id, workspace_id, user_id, markdown_content, content_brief, stages_data';

/**
 * The article, or the Response to return instead. Never a 403: a foreign id and an absent id
 * are indistinguishable from the outside, which is what stops id enumeration.
 */
export async function loadOwnedArticle(
  supabase: SupabaseClient,
  userId: string,
  articleId: string,
): Promise<{ article: OwnedArticle } | { response: Response }> {
  const { data, error } = await supabase
    .from('seo_articles')
    .select(ARTICLE_COLUMNS)
    .eq('id', articleId)
    .maybeSingle();

  if (error) return { response: jsonResponse({ success: false, error: error.message }, 500) };
  if (!data) return { response: jsonResponse({ success: false, error: 'Not found' }, 404) };

  const article = data as OwnedArticle;
  if (article.workspace_id) {
    const ok = await userCanAccessWorkspace(supabase, userId, article.workspace_id);
    if (!ok) return { response: jsonResponse({ success: false, error: 'Not found' }, 404) };
  } else if (article.user_id !== userId) {
    return { response: jsonResponse({ success: false, error: 'Not found' }, 404) };
  }
  return { article };
}

/** The stored plan, which lives in `stages_data.extra` like everything else the pipeline derives. */
export function storedArticlePlan(article: Pick<OwnedArticle, 'stages_data'>): unknown | null {
  const extra = (article.stages_data as { extra?: Record<string, unknown> } | null)?.extra;
  return extra && typeof extra === 'object' ? (extra.article_plan ?? null) : null;
}

/**
 * Persist a fresh analysis: the `content_analysis` the viewer reads its applicable fixes from,
 * the `overall_score` beside it, and the two real columns.
 *
 * All four together, in ONE statement. They are four views of one computation, and the stored
 * analysis disagreeing with the stored score is the shape that made the analysis look fine
 * while the fix list described an article that no longer existed.
 */
export async function persistAnalysis(
  supabase: SupabaseClient,
  article: Pick<OwnedArticle, 'id' | 'stages_data'>,
  analysis: ContentAnalysisResult,
  /** Real columns to set in the same statement (the revert snapshot, say). */
  columns: Record<string, unknown> = {},
  /** Further `stages_data.extra` keys to merge — gaps/gains, when they were re-derived. */
  extraKeys: Record<string, unknown> = {},
): Promise<{ error: string | null }> {
  const stages = (article.stages_data ?? {}) as Record<string, unknown>;
  const extra = (stages.extra ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from('seo_articles')
    .update({
      stages_data: {
        ...stages,
        extra: {
          ...extra, ...extraKeys, content_analysis: analysis, overall_score: analysis.overallScore,
        },
      },
      seo_score: analysis.overallScore,
      ...(analysis.readabilityScore !== null ? { readability_score: analysis.readabilityScore } : {}),
      updated_at: new Date().toISOString(),
      ...columns,
    })
    .eq('id', article.id);

  return { error: error?.message ?? null };
}
