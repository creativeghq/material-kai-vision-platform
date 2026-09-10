/** A module purchase can entitle more than one module. */
// deno-lint-ignore no-explicit-any
type SupabaseLike = { from: (t: string) => any };

/**
 * Every module slug a purchase of `moduleSlug` entitles, itself first.
 *
 * Falls back to just the slug when the lookup fails: granting narrowly is recoverable (the
 * customer notices and support fixes it), granting widely on a failed read is not.
 */
export async function bundledSlugs(supabase: SupabaseLike, moduleSlug: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('modules').select('grants_slugs').eq('slug', moduleSlug).maybeSingle();
  if (error || !data) return [moduleSlug];
  const extra = (data.grants_slugs ?? []) as string[];
  return [moduleSlug, ...extra.filter((s) => s && s !== moduleSlug)];
}

/** Enable the entitlement row for every slug in the bundle. */
export async function grantBundle(
  supabase: SupabaseLike,
  workspaceId: string,
  moduleSlug: string,
  grantedBy: string | null,
): Promise<{ slugs: string[]; error?: string }> {
  const slugs = await bundledSlugs(supabase, moduleSlug);
  const { error } = await supabase.from('workspace_module_entitlements').upsert(
    slugs.map((slug) => ({ workspace_id: workspaceId, module_slug: slug, enabled: true, granted_by: grantedBy })),
    { onConflict: 'workspace_id,module_slug' },
  );
  return { slugs, error: error ? String(error.message ?? error) : undefined };
}

/**
 * Disable the entitlement row for every slug in the bundle.
 *
 * `keep` is the caller's own coverage check — a slug the workspace's PLAN still covers must not be
 * revoked just because an add-on lapsed. That check belongs to the caller because only it knows
 * the plan level it already read.
 */
export async function revokeBundle(
  supabase: SupabaseLike,
  workspaceId: string,
  moduleSlug: string,
  keep: (slug: string) => boolean = () => false,
): Promise<string[]> {
  const slugs = (await bundledSlugs(supabase, moduleSlug)).filter((s) => !keep(s));
  if (!slugs.length) return [];
  await supabase
    .from('workspace_module_entitlements')
    .update({ enabled: false, granted_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .in('module_slug', slugs);
  return slugs;
}
