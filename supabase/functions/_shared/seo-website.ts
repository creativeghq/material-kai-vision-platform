/**
 * seo-website.ts — resolve the connected website an SEO operation belongs to.
 *
 * Connected websites (`user_websites`) are workspace-shared. Every SEO output —
 * articles, keyword research, toolkit runs, domain audits — is filed under the
 * website it was produced for, and the SEO toolkits default to the workspace's
 * primary (default) website when the caller doesn't name one.
 *
 * Shared by: seo-api pipeline/research handlers, seo-agent-tools, seo-tools.
 * The Supabase client passed in is the SERVICE-ROLE client — callers are
 * expected to have already reconciled the caller against the workspace.
 */

export interface ResolvedWebsite {
  id: string;
  url: string;
  /** bare host, no protocol/path — e.g. "flobali.gr". Feeds domain-shaped tool params. */
  domain: string;
  display_name: string | null;
  is_default: boolean;
}

type SupaLike = { from: (t: string) => any };

/** Strip protocol, path, and a leading www. → bare host. Returns '' if unparseable. */
export function domainFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '');
  } catch {
    return String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] || '';
  }
}

function mapRow(r: any): ResolvedWebsite {
  return {
    id: r.id,
    url: r.url,
    domain: domainFromUrl(r.url),
    display_name: r.display_name ?? null,
    is_default: !!r.is_default,
  };
}

/**
 * List a workspace's active connected websites, default first. Used to build the
 * agent's website-picker context. Returns [] when the workspace has none.
 */
export async function listWorkspaceWebsites(
  supabase: SupaLike,
  workspaceId: string | null | undefined,
): Promise<ResolvedWebsite[]> {
  if (!workspaceId) return [];
  const { data, error } = await supabase
    .from('user_websites')
    .select('id, url, display_name, is_default, is_active')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as any[]).map(mapRow);
}

/**
 * Resolve the website an SEO operation should use.
 *  - explicitWebsiteId set → that row IF it belongs to the workspace (else null).
 *  - otherwise → the workspace's default (or, absent a default, the newest) active site.
 * Returns null when the workspace has no usable website — callers then run generically.
 */
export async function resolveWebsite(
  supabase: SupaLike,
  opts: { workspaceId: string | null | undefined; explicitWebsiteId?: string | null },
): Promise<ResolvedWebsite | null> {
  const { workspaceId, explicitWebsiteId } = opts;
  if (!workspaceId) return null;

  if (explicitWebsiteId) {
    const { data } = await supabase
      .from('user_websites')
      .select('id, url, display_name, is_default, is_active')
      .eq('id', explicitWebsiteId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    return data ? mapRow(data) : null;
  }

  const sites = await listWorkspaceWebsites(supabase, workspaceId);
  return sites[0] ?? null;
}
