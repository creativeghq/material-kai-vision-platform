import type { SupabaseClient } from '@supabase/supabase-js';

const safeDecode = (u: string) => { try { return decodeURI(u); } catch { return u; } };

export interface StoredPage { id: string; website_id: string; workspace_id: string; url: string }

/** The crawled page this URL is, inside this workspace; null when the URL is not one of ours. */
export async function findWorkspacePage(
  supabase: SupabaseClient, workspaceId: string | null | undefined, url: string, websiteId?: string,
): Promise<StoredPage | null> {
  if (!workspaceId || !url) return null;
  const variants = new Set<string>();
  for (const u of [url, safeDecode(url), encodeURI(safeDecode(url))]) {
    const bare = u.replace(/\/+$/, '');
    variants.add(bare);
    variants.add(`${bare}/`);
  }
  let q = supabase.from('user_website_pages')
    .select('id, website_id, url, user_websites!inner(workspace_id)')
    .eq('user_websites.workspace_id', workspaceId)
    .in('url', [...variants])
    .limit(1);
  if (websiteId) q = q.eq('website_id', websiteId);
  const { data, error } = await q.maybeSingle();
  if (error || !data) return null;
  return { id: data.id, website_id: data.website_id, url: data.url, workspace_id: workspaceId };
}

/** One instant-page audit of a page, as returned by MIVAA onpage/quick-page. A failed section is recorded, not dropped. */
export async function recordPageAudit(
  supabase: SupabaseClient, page: StoredPage, userId: string | null,
  sections: Record<string, any>, errors: Record<string, unknown> | null | undefined,
): Promise<string | null> {
  const ip = sections?.instant_page?.items?.[0];
  const { data, error } = await supabase.from('website_page_audits').insert({
    page_id: page.id, website_id: page.website_id, workspace_id: page.workspace_id,
    onpage_score: typeof ip?.onpage_score === 'number' ? ip.onpage_score : null,
    checks: ip?.checks ?? null,
    meta: ip?.meta ?? null,
    content_parsing: sections?.content_parsing?.items?.[0] ?? null,
    source_errors: errors ?? {},
    created_by: userId,
  }).select('id').single();
  if (error) {
    console.warn(`[page-audit-store] audit not saved for ${page.url}: ${error.message}`);
    return null;
  }
  return data.id;
}

/** A content score (seo_score_url) of one of our pages, kept beside its on-page audit. */
export async function recordPageContentScores(
  supabase: SupabaseClient, page: StoredPage, userId: string | null, scores: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('website_page_audits').insert({
    page_id: page.id, website_id: page.website_id, workspace_id: page.workspace_id,
    content_scores: { ...scores, scored_at: new Date().toISOString() },
    created_by: userId,
  });
  if (error) console.warn(`[page-audit-store] content score not saved for ${page.url}: ${error.message}`);
}
