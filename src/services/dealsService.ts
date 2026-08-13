/**
 * Deals & pipeline (#311) — the one service over `crm_deals`.
 *
 * The pipeline is a CRM object, not a Real Estate feature: Real Estate is a consumer that filters
 * to the `real_estate` deal type. Everything reads this service, so there is one place that knows
 * how a deal is loaded and one visibility rule (RLS on `crm_deals`, which carries the property
 * agent-scoping so the CRM board cannot show a listing Real Estate would hide).
 *
 * Stages are DATA, not a TypeScript union. Each deal type owns its own stage set and the database
 * enforces the pairing through a composite FK on `(deal_type_id, stage)` — a construction deal
 * physically cannot sit in "Conveyancing". Never hardcode a stage list in a component.
 */
import { supabase } from '@/integrations/supabase/client';

export interface DealType {
  id: string;
  workspace_id: string | null;      // null = platform default, non-null = this tenant's own
  key: string;
  label: string;
  subject_kind: 'property' | 'project' | 'none';
  sort: number;
  is_active: boolean;
}

export interface DealStage {
  id: string;
  deal_type_id: string;
  key: string;
  label: string;
  sort: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface Deal {
  id: string;
  workspace_id: string;
  deal_type_id: string;
  title: string | null;
  stage: string;
  status: 'open' | 'won' | 'lost';
  value: number | null;
  currency: string;
  probability: number | null;
  expected_close_date: string | null;
  lost_reason: string | null;
  notes: string | null;
  contact_id: string | null;
  company_id: string | null;
  property_id: string | null;
  project_id: string | null;
  owner_user_id: string | null;
  created_at: string;
  updated_at: string;
  contact?: { id: string; name: string | null } | null;
  company?: { id: string; name: string | null } | null;
  property?: { id: string; title: string | null; reference_code: string | null; town: string | null } | null;
  task_total?: number;
  task_done?: number;
}

export interface DealTask {
  id: string;
  deal_id: string;
  title: string;
  done: boolean;
  due_date: string | null;
  created_at: string;
}

/** Fields a caller may set. Identity and tenancy (`workspace_id`, `created_by`) are server-side. */
export interface DealInput {
  deal_type_id: string;
  stage: string;
  title?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  property_id?: string | null;
  project_id?: string | null;
  value?: number | null;
  currency?: string;
  probability?: number | null;
  expected_close_date?: string | null;
  notes?: string | null;
  status?: 'open' | 'won' | 'lost';
  lost_reason?: string | null;
}

const DEAL_SELECT =
  'id, workspace_id, deal_type_id, title, stage, status, value, currency, probability, ' +
  'expected_close_date, lost_reason, notes, contact_id, company_id, property_id, project_id, ' +
  'owner_user_id, created_at, updated_at, ' +
  'contact:crm_contacts!crm_deals_contact_id_fkey ( id, name ), ' +
  'company:crm_companies ( id, name ), ' +
  'property:properties ( id, title, reference_code, town ), ' +
  'tasks:crm_deal_tasks ( id, done )';

/** Collapse the embedded task rows into the two counts the board renders. */
function withTaskCounts(row: any): Deal {
  const tasks = row?.tasks ?? [];
  const { tasks: _drop, ...rest } = row ?? {};
  return { ...rest, task_total: tasks.length, task_done: tasks.filter((t: any) => t.done).length } as Deal;
}

export const dealsService = {
  /** Platform defaults + this workspace's own types, in display order. */
  async listTypes(workspaceId: string): Promise<DealType[]> {
    const { data, error } = await supabase
      .from('crm_deal_types')
      .select('id, workspace_id, key, label, subject_kind, sort, is_active')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .eq('is_active', true)
      .order('sort');
    if (error) throw error;
    return (data ?? []) as DealType[];
  },

  /** The stage set for one type — the board's columns. */
  async listStages(dealTypeId: string): Promise<DealStage[]> {
    const { data, error } = await supabase
      .from('crm_deal_stages')
      .select('id, deal_type_id, key, label, sort, is_won, is_lost')
      .eq('deal_type_id', dealTypeId)
      .order('sort');
    if (error) throw error;
    return (data ?? []) as DealStage[];
  },

  /** Deals of one type. RLS applies the property agent-scoping; no client-side filtering needed. */
  async listDeals(workspaceId: string, dealTypeId: string): Promise<Deal[]> {
    const { data, error } = await supabase
      .from('crm_deals')
      .select(DEAL_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('deal_type_id', dealTypeId)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(withTaskCounts);
  },

  async createDeal(workspaceId: string, input: DealInput): Promise<Deal> {
    const { data: { user } } = await supabase.auth.getUser();
    // Allowlisted payload — never spread caller input into a write (invariant 8).
    const { data, error } = await supabase
      .from('crm_deals')
      .insert({
        workspace_id: workspaceId,
        deal_type_id: input.deal_type_id,
        stage: input.stage,
        title: input.title?.trim() || null,
        contact_id: input.contact_id ?? null,
        company_id: input.company_id ?? null,
        property_id: input.property_id ?? null,
        project_id: input.project_id ?? null,
        value: input.value ?? null,
        currency: input.currency || 'EUR',
        probability: input.probability ?? null,
        expected_close_date: input.expected_close_date ?? null,
        notes: input.notes ?? null,
        status: input.status ?? 'open',
        owner_user_id: user?.id ?? null,
        created_by: user?.id ?? null,
      })
      .select(DEAL_SELECT)
      .single();
    if (error) throw error;
    return withTaskCounts(data);
  },

  async updateDeal(dealId: string, patch: Partial<DealInput>): Promise<Deal> {
    const payload: Record<string, unknown> = {};
    for (const k of ['stage', 'title', 'contact_id', 'company_id', 'property_id', 'project_id',
                     'value', 'currency', 'probability', 'expected_close_date', 'notes',
                     'status', 'lost_reason'] as const) {
      if (patch[k] !== undefined) payload[k] = patch[k];
    }
    payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from('crm_deals').update(payload).eq('id', dealId).select(DEAL_SELECT).single();
    if (error) throw error;
    return withTaskCounts(data);
  },

  /**
   * Move a deal to a stage, and let a winning stage win the deal. Which stage wins is DATA
   * (`crm_deal_stages.is_won`) — the old board hardcoded `stage === 'completed'`, which is only
   * true for the property stage set.
   */
  async moveToStage(dealId: string, stage: DealStage): Promise<Deal> {
    return this.updateDeal(dealId, {
      stage: stage.key,
      ...(stage.is_won ? { status: 'won' as const } : {}),
      ...(stage.is_lost ? { status: 'lost' as const } : {}),
    });
  },

  async deleteDeal(dealId: string): Promise<void> {
    const { error } = await supabase.from('crm_deals').delete().eq('id', dealId);
    if (error) throw error;
  },

  async listTasks(dealId: string): Promise<DealTask[]> {
    const { data, error } = await supabase
      .from('crm_deal_tasks').select('id, deal_id, title, done, due_date, created_at')
      .eq('deal_id', dealId).order('created_at');
    if (error) throw error;
    return (data ?? []) as DealTask[];
  },

  async addTask(workspaceId: string, dealId: string, title: string, dueDate?: string | null): Promise<DealTask> {
    const { data, error } = await supabase
      .from('crm_deal_tasks')
      .insert({ workspace_id: workspaceId, deal_id: dealId, title: title.trim(), due_date: dueDate ?? null })
      .select('id, deal_id, title, done, due_date, created_at').single();
    if (error) throw error;
    return data as DealTask;
  },

  async toggleTask(taskId: string, done: boolean): Promise<void> {
    const { error } = await supabase.from('crm_deal_tasks').update({ done }).eq('id', taskId);
    if (error) throw error;
  },

  async deleteTask(taskId: string): Promise<void> {
    const { error } = await supabase.from('crm_deal_tasks').delete().eq('id', taskId);
    if (error) throw error;
  },
};
