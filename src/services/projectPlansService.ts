import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

/**
 * Project Plans — per-project (or ephemeral) instances of a Blueprint (#242).
 * CRUD/read is direct-supabase (RLS-gated); the authoritative compute
 * (create-from-blueprint, rescale, reprice, versioning, quote bridge) is the
 * `project-plan-engine` edge function — the only writer of persisted money.
 */

export interface ProjectPlan {
  id: string;
  project_id: string | null;
  workspace_id: string;
  user_id: string;
  blueprint_id: string | null;
  quote_id: string | null;
  title: string;
  brief: string | null;
  dimensions: Record<string, number>;
  source_currency: string;
  status: 'draft' | 'finalized' | 'quoted' | 'approved' | 'archived';
  subtotal: number;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectPlanItem {
  id: string;
  plan_id: string;
  parent_id: string | null;
  sort_order: number;
  kind: 'section' | 'task';
  label: string;
  notes: string | null;
  unit: string | null;
  quantity_formula: string | null;
  quantity: number;
  line_kind: 'labor' | 'materials' | 'both';
  service_id: string | null;
  product_id: string | null;
  material_cost: number | null;
  labor_rate: number | null;
  margin_pct: number;
  unit_price: number;
  line_total: number;
  option_group: string | null;
  tier: 'good' | 'better' | 'best' | null;
  is_selected: boolean;
  is_allowance: boolean;
  allowance_amount: number | null;
  source: 'manual' | 'template' | 'ai';
  created_at: string;
  updated_at: string;
}

export interface ProjectPlanVersion {
  id: string;
  plan_id: string;
  version: number;
  snapshot: { dimensions: Record<string, number>; subtotal: number; items: ProjectPlanItem[] };
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PlanWithItems { plan: ProjectPlan; items: ProjectPlanItem[]; }

async function callEngine<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('project-plan-engine', { body: { action, ...payload } });
  if (error) throw await edgeError(error, `project-plan-engine ${action} failed`);
  return data as T;
}

class ProjectPlansService {
  async listForProject(projectId: string): Promise<ProjectPlan[]> {
    const { data, error } = await supabase
      .from('project_plans')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProjectPlan[];
  }

  async get(planId: string): Promise<ProjectPlan | null> {
    const { data, error } = await supabase.from('project_plans').select('*').eq('id', planId).maybeSingle();
    if (error) throw error;
    return (data as ProjectPlan) ?? null;
  }

  async listItems(planId: string): Promise<ProjectPlanItem[]> {
    const { data, error } = await supabase
      .from('project_plan_items')
      .select('*')
      .eq('plan_id', planId)
      .order('sort_order', { ascending: true });
    if (error) throw error;
    return (data ?? []) as ProjectPlanItem[];
  }

  async listVersions(planId: string): Promise<ProjectPlanVersion[]> {
    const { data, error } = await supabase
      .from('project_plan_versions')
      .select('*')
      .eq('plan_id', planId)
      .order('version', { ascending: false });
    if (error) throw error;
    return (data ?? []) as ProjectPlanVersion[];
  }

  /** Create a new plan instance for a project from a blueprint. */
  createFromBlueprint(input: { project_id: string; blueprint_id: string; dimensions?: Record<string, number>; title?: string }): Promise<PlanWithItems> {
    return callEngine<PlanWithItems>('create-from-blueprint', input);
  }

  /** Start an empty plan on a project (build it from premade sections / blank rows). */
  async createBlank(input: { project_id: string; workspace_id: string; title?: string }): Promise<ProjectPlan> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data, error } = await supabase.from('project_plans').insert({
      project_id: input.project_id,
      workspace_id: input.workspace_id,
      user_id: user.id,
      title: input.title || 'Project plan',
      status: 'draft',
      created_by: user.id,
    }).select('*').single();
    if (error) throw error;
    return data as ProjectPlan;
  }

  /** Append a premade section (+ its tasks) from a blueprint into the plan. */
  addSectionFromBlueprint(planId: string, sourceBlueprintId: string, sectionId: string): Promise<PlanWithItems> {
    return callEngine<PlanWithItems>('add-section-from-blueprint', { plan_id: planId, source_blueprint_id: sourceBlueprintId, section_id: sectionId });
  }

  /** Update dimensions and recompute quantities + prices. */
  rescale(planId: string, dimensions: Record<string, number>): Promise<PlanWithItems> {
    return callEngine<PlanWithItems>('rescale', { plan_id: planId, dimensions });
  }

  /** Recompute prices from current dimensions + rates (after manual edits). */
  reprice(planId: string): Promise<PlanWithItems> {
    return callEngine<PlanWithItems>('reprice', { plan_id: planId });
  }

  async saveVersion(planId: string, note?: string): Promise<number> {
    const { version } = await callEngine<{ version: number }>('save-version', { plan_id: planId, note });
    return version;
  }

  restoreVersion(planId: string, version: number): Promise<PlanWithItems> {
    return callEngine<PlanWithItems>('restore-version', { plan_id: planId, version });
  }

  async createQuote(planId: string): Promise<string> {
    const { quote_id } = await callEngine<{ quote_id: string }>('create-quote-from-plan', { plan_id: planId });
    return quote_id;
  }

  /** Derive a material shopping list (→ project_purchase_items). Returns count written. */
  async generateMaterialList(planId: string): Promise<number> {
    const { count } = await callEngine<{ count: number }>('generate-material-list', { plan_id: planId });
    return count;
  }

  /** After approval: spawn a revision quote (change order) from the current plan. */
  async createChangeOrder(planId: string): Promise<string> {
    const { quote_id } = await callEngine<{ quote_id: string }>('create-change-order', { plan_id: planId });
    return quote_id;
  }

  /** Direct metadata edit (title/brief). Item edits go through updateItems + reprice. */
  async update(planId: string, patch: Partial<Pick<ProjectPlan, 'title' | 'brief' | 'status'>>): Promise<ProjectPlan> {
    const { data, error } = await supabase.from('project_plans').update(patch).eq('id', planId).select('*').single();
    if (error) throw error;
    return data as ProjectPlan;
  }

  /** Add a new section or task to a plan (direct insert; caller reprices). */
  async addItem(planId: string, item: { kind: 'section' | 'task'; label: string; parent_id?: string | null; unit?: string | null; quantity?: number; line_kind?: 'labor' | 'materials' | 'both'; sort_order?: number; }): Promise<ProjectPlanItem> {
    const { data, error } = await supabase.from('project_plan_items').insert({
      plan_id: planId,
      parent_id: item.parent_id ?? null,
      kind: item.kind,
      label: item.label,
      unit: item.unit ?? null,
      quantity: item.quantity ?? 1,
      line_kind: item.line_kind ?? 'labor',
      sort_order: item.sort_order ?? 0,
      source: 'manual',
    }).select('*').single();
    if (error) throw error;
    return data as ProjectPlanItem;
  }

  async deleteItem(planId: string, itemId: string): Promise<void> {
    const { error } = await supabase.from('project_plan_items').delete().eq('id', itemId).eq('plan_id', planId);
    if (error) throw error;
  }

  /** Persist manual edits to plan items (label/qty/rates/selection), then reprice. */
  async updateItems(planId: string, items: Array<Partial<ProjectPlanItem> & { id: string }>): Promise<PlanWithItems> {
    for (const it of items) {
      const { id, ...patch } = it;
      const { error } = await supabase.from('project_plan_items').update(patch).eq('id', id).eq('plan_id', planId);
      if (error) throw error;
    }
    return this.reprice(planId);
  }

  async remove(planId: string): Promise<void> {
    const { error } = await supabase.from('project_plans').delete().eq('id', planId);
    if (error) throw error;
  }
}

export const projectPlansService = new ProjectPlansService();
