/** Does the site already have a page for this keyword? Search Console first, then the closest crawled page. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { generateStandardEmbedding } from '../../_shared/embedding-utils.ts';
import type { ExistingPage } from '../../_shared/seo-types.ts';

const SIMILAR_PAGE_THRESHOLD = 0.72;

export async function findExistingPage(
  supabase: DbClient,
  opts: { userId: string; workspaceId: string | null; websiteId: string | null; keyword: string; searchConsoleOnly?: boolean },
): Promise<ExistingPage | null> {
  if (!opts.websiteId || !opts.keyword.trim()) return null;
  const keyword = opts.keyword.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`);

  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data: ranked } = await supabase
    .from('gsc_performance')
    .select('page, position, impressions, clicks')
    .eq('website_id', opts.websiteId).ilike('query', keyword).gte('date', since)
    .order('impressions', { ascending: false }).limit(50);
  const rows = (ranked ?? []) as Array<{ page: string; position: number; impressions: number; clicks: number }>;
  if (rows.length) {
    const byPage = new Map<string, { impressions: number; clicks: number; weighted: number }>();
    for (const r of rows) {
      const p = byPage.get(r.page) ?? { impressions: 0, clicks: 0, weighted: 0 };
      p.impressions += r.impressions; p.clicks += r.clicks; p.weighted += r.position * r.impressions;
      byPage.set(r.page, p);
    }
    const [url, best] = [...byPage.entries()].sort((a, b) => b[1].impressions - a[1].impressions)[0];
    return {
      url,
      source: 'search_console',
      position: best.impressions ? Math.round((best.weighted / best.impressions) * 10) / 10 : null,
      impressions: best.impressions,
      clicks: best.clicks,
      similarity: null,
      title: null,
    };
  }

  if (opts.searchConsoleOnly) return null;
  try {
    const embedding = await generateStandardEmbedding(opts.keyword, 'query', {
      operationType: 'seo_existing_page_check', userId: opts.userId, workspaceId: opts.workspaceId,
    });
    const { data: matches, error } = await supabase.rpc('match_user_website_pages', {
      p_user_id: opts.userId,
      p_query_embedding: embedding,
      p_match_threshold: SIMILAR_PAGE_THRESHOLD,
      p_limit: 1,
      p_website_id: opts.websiteId,
    });
    const top = (matches as Array<{ url: string; title: string | null; similarity: number }> | null)?.[0];
    if (error || !top) return null;
    return {
      url: top.url,
      source: 'similar_page',
      position: null,
      impressions: null,
      clicks: null,
      similarity: Math.round(Number(top.similarity) * 100) / 100,
      title: top.title ?? null,
    };
  } catch (e) {
    console.warn('[seo-existing-page] similar-page check failed:', e instanceof Error ? e.message : String(e));
    return null;
  }
}
