/**
 * Cost codes — the classification every construction cost and every priced line hangs off.
 *
 * Unlike `project_categories`, there is NO platform-default tier. Nobody numbers a cost breakdown
 * the same way ("05.2 Plumbing" is one firm's convention and another's nonsense), so every row
 * belongs to one workspace and is that workspace's to rename. The starter library is COPIED in by
 * `install_starter_cost_codes` rather than shared, which is what makes it editable on day one.
 *
 * RLS is the boundary — select for members, write for workspace admins — so this service adds no
 * scoping of its own beyond the workspace filter the query needs anyway. What it adds is a
 * readable sentence for the errors a user can actually cause: a raw 23505 / 23503 / 23514 / 42501
 * says nothing about what to do next, and the hierarchy guard raises three different 23514s.
 */
import { supabase } from '@/integrations/supabase/client';
import { type CostCode } from '@/utils/costCodeTree';

// The shape and the tree maths are import-free so they can be tested without a Supabase client
// (#cost-codes). Re-exported here so callers can import either from.
export {
  COST_CODE_MAX_DEPTH,
  costCodeLabel,
  costCodeTree,
  flattenCostCodes,
} from '@/utils/costCodeTree';
export type { CostCode, CostCodeNode } from '@/utils/costCodeTree';

/** One row of `get_project_cost_by_code`. A null `cost_code_id` is the uncoded bucket. */
export interface ProjectCostByCode {
  cost_code_id: string | null;
  code: string | null;
  name: string | null;
  parent_id: string | null;
  supplier_cost: number;
  labor_cost: number;
  expense_cost: number;
  total_cost: number;
  entry_count: number;
}

const COLUMNS = 'id, workspace_id, code, name, description, parent_id, sort, is_active';

/**
 * Turns the Postgres errors a user can cause into something actionable.
 *
 * 23514 covers four different refusals from the hierarchy guard, so the message is matched on
 * rather than the code — the guard raises them with sentences written for this purpose.
 */
function readable(error: { code?: string; message: string }): Error {
  if (error.code === '23505') return new Error('A cost code with that number already exists in this workspace.');
  if (error.code === '42501') return new Error('Only a workspace owner or admin can manage cost codes.');
  if (error.code === '23503') {
    // The same code covers "still in use" (delete) and "not one of yours" (attach). The message
    // the DB raised distinguishes them; the FK violation Postgres raises by itself does not.
    if (/not one of this workspace/i.test(error.message)) return new Error(error.message);
    if (/parent cost code does not exist/i.test(error.message)) return new Error(error.message);
    return new Error('That cost code is still in use. Move what is coded to it first, or archive the code instead.');
  }
  if (error.code === '23514') return new Error(error.message);
  return new Error(error.message);
}

export const costCodesService = {
  /** The pickable set: active codes only, in the operator's own order. */
  async list(workspaceId: string): Promise<CostCode[]> {
    const { data, error } = await supabase
      .from('cost_codes')
      .select(COLUMNS)
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('sort')
      .order('code');
    if (error) throw readable(error);
    return (data ?? []) as CostCode[];
  },

  /** Everything, archived included — the manager has to be able to bring one back. */
  async listAll(workspaceId: string): Promise<CostCode[]> {
    const { data, error } = await supabase
      .from('cost_codes')
      .select(COLUMNS)
      .eq('workspace_id', workspaceId)
      .order('sort')
      .order('code');
    if (error) throw readable(error);
    return (data ?? []) as CostCode[];
  },

  async create(
    workspaceId: string,
    input: { code: string; name: string; description?: string | null; parentId?: string | null },
  ): Promise<CostCode> {
    const code = input.code.trim();
    const name = input.name.trim();
    if (!code) throw new Error('Give the cost code a number.');
    if (!name) throw new Error('Give the cost code a name.');

    const { data: { user } } = await supabase.auth.getUser();

    // Append after everything currently in the workspace, so a new code does not interleave
    // unpredictably with a numbering scheme somebody chose deliberately.
    const existing = await this.listAll(workspaceId);
    const nextSort = existing.reduce((max, c) => Math.max(max, c.sort), 0) + 10;

    const { data, error } = await supabase
      .from('cost_codes')
      .insert({
        workspace_id: workspaceId,
        code,
        name,
        description: input.description?.trim() || null,
        parent_id: input.parentId ?? null,
        sort: nextSort,
        created_by: user?.id ?? null,
      })
      .select(COLUMNS)
      .single();
    if (error) throw readable(error);
    return data as CostCode;
  },

  async update(
    id: string,
    patch: { code?: string; name?: string; description?: string | null; parentId?: string | null; sort?: number },
  ): Promise<void> {
    const next: Record<string, unknown> = {};
    if (patch.code !== undefined) {
      const code = patch.code.trim();
      if (!code) throw new Error('Give the cost code a number.');
      next.code = code;
    }
    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) throw new Error('Give the cost code a name.');
      next.name = name;
    }
    if (patch.description !== undefined) next.description = patch.description?.trim() || null;
    if (patch.parentId !== undefined) next.parent_id = patch.parentId;
    if (patch.sort !== undefined) next.sort = patch.sort;
    if (Object.keys(next).length === 0) return;

    const { error } = await supabase.from('cost_codes').update(next).eq('id', id);
    if (error) throw readable(error);
  },

  /**
   * Archive rather than delete is the normal move: the FK is ON DELETE RESTRICT, so a code that
   * has ever been used cannot be removed, and blanking the classification on historic money would
   * be the wrong answer anyway.
   */
  async setActive(id: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('cost_codes').update({ is_active: isActive }).eq('id', id);
    if (error) throw readable(error);
  },

  /** Only ever succeeds on a code nothing references and nothing sits under. */
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('cost_codes').delete().eq('id', id);
    if (error) throw readable(error);
  },

  /**
   * Copy the starter library in. Idempotent on the server — codes that already exist are skipped,
   * so running it on a workspace that has hand-edited codes adds only what is missing.
   * Returns how many rows it actually created.
   */
  async installStarter(workspaceId: string): Promise<number> {
    const { data, error } = await supabase.rpc('install_starter_cost_codes', { p_workspace_id: workspaceId });
    if (error) throw readable(error);
    return (data as number) ?? 0;
  },

  /**
   * Actual cost on one project, split by code, with the uncoded remainder as its own row.
   *
   * Derived entirely in SQL from the same predicates `get_project_pnl` uses, so the rows sum to
   * that function's supplier + labour + expense cost exactly. Callers format; they never re-add.
   */
  async projectCostByCode(projectId: string): Promise<ProjectCostByCode[]> {
    const { data, error } = await supabase.rpc('get_project_cost_by_code', { p_project_id: projectId });
    if (error) throw readable(error);
    return (data ?? []) as ProjectCostByCode[];
  },
};

