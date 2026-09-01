/**
 * Project categories — "what KIND of job is this" (Renovation, Trip, Warehouse, Real Estate).
 *
 * Two tiers, exactly like `crm_deal_types`, and the distinction is the whole point:
 *
 *   • `workspace_id IS NULL` — a PLATFORM DEFAULT. Shared by every tenant and read-only to them,
 *     so one workspace renaming "Trip" cannot rename it for everyone. There is no per-workspace
 *     copy of the defaults, which is what keeps a fix to a default reaching every workspace.
 *   • `workspace_id = <ws>` — that tenant's own, created and edited from the category manager.
 *
 * RLS is the boundary (select: default OR member; write: workspace admin), so this service adds
 * no filtering of its own beyond the read scope. What it does add is a readable sentence for the
 * three errors a user can actually cause — duplicate label, category still in use, not an admin —
 * because a raw 23505 / 23503 / 42501 tells them nothing about what to do next.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ProjectCategory {
  id: string;
  /** null = platform default (shared, read-only here); non-null = this workspace's own. */
  workspace_id: string | null;
  /** Derived from the label by a DB trigger — never sent by the client. */
  key: string;
  label: string;
  sort: number;
  is_active: boolean;
}

const COLUMNS = 'id, workspace_id, key, label, sort, is_active';

/** A workspace's own category, as opposed to a platform default it may only read. */
export const isOwnCategory = (c: ProjectCategory): boolean => c.workspace_id !== null;

/** Turns the three user-caused Postgres errors into something actionable. */
function readable(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('A category with that name already exists in this workspace.');
  if (error.code === '23503') return new Error('That category is still used by projects. Move them to another category first.');
  if (error.code === '42501') return new Error('Only a workspace owner or admin can manage project categories.');
  return new Error(error.message);
}

export const projectCategoriesService = {
  /**
   * The pickable set for one workspace: the platform defaults plus that workspace's own.
   * Ordered by `sort` then label, so workspace additions (seeded above the defaults' range)
   * land after them rather than interleaving unpredictably.
   */
  async list(workspaceId: string | null): Promise<ProjectCategory[]> {
    let query = supabase
      .from('project_categories')
      .select(COLUMNS)
      .eq('is_active', true);

    // Without an active workspace there is nothing tenant-scoped to add — the defaults stand on
    // their own, and RLS would filter the rest out anyway.
    query = workspaceId
      ? query.or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      : query.is('workspace_id', null);

    const { data, error } = await query.order('sort').order('label');
    if (error) throw readable(error);
    return (data ?? []) as ProjectCategory[];
  },

  /**
   * Append a category to this workspace. `key` is deliberately not sent: the DB trigger derives
   * it from the label and resolves collisions, so a Greek or emoji label still gets a usable key
   * instead of an empty string or a 23505 the user cannot act on.
   */
  async create(workspaceId: string, label: string): Promise<ProjectCategory> {
    const trimmed = label.trim();
    if (!trimmed) throw new Error('Give the category a name.');

    const { data: { user } } = await supabase.auth.getUser();

    // Append after everything currently visible, defaults included.
    const existing = await this.list(workspaceId);
    const nextSort = existing.reduce((max, c) => Math.max(max, c.sort), 0) + 10;

    const { data, error } = await supabase
      .from('project_categories')
      .insert({
        workspace_id: workspaceId,
        label: trimmed,
        sort: nextSort,
        created_by: user?.id ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw readable(error);
    return data as ProjectCategory;
  },

  /** Rename one of the workspace's own. RLS refuses this on a platform default. */
  async rename(id: string, label: string): Promise<void> {
    const trimmed = label.trim();
    if (!trimmed) throw new Error('Give the category a name.');

    const { error } = await supabase
      .from('project_categories')
      .update({ label: trimmed })
      .eq('id', id);
    if (error) throw readable(error);
  },

  /**
   * Delete one of the workspace's own. The FK is ON DELETE RESTRICT, so a category still in use
   * is refused rather than silently blanking the kind on every project that had it.
   */
  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('project_categories')
      .delete()
      .eq('id', id);
    if (error) throw readable(error);
  },

  /** Swap two categories' sort values — the manager's move up / move down. */
  async setSort(id: string, sort: number): Promise<void> {
    const { error } = await supabase
      .from('project_categories')
      .update({ sort })
      .eq('id', id);
    if (error) throw readable(error);
  },
};
