/** Global finance categories for classifying income/expense docs + payments. */
import { supabase } from '@/integrations/supabase/client';
import { EXPENSE_CATEGORY_CHART } from '@/modules/finance/expenseCategoryVocabulary';

export interface FinanceCategory {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'both';
  color: string | null;
  is_active: boolean;
  /** Protected built-in: every workspace has one of each; can't be renamed/re-kinded/deactivated/
   *  deleted. Enforced by the guard_system_finance_category DB trigger. */
  is_system: boolean;
  /**
   * Which built-in this is, when is_system: 'orders' (auto-attached to order costs), 'myaade'
   * (default landing category for myDATA-synced expenses), or 'profit_allocation' (the money-out
   * that draws claimed margin out of the bank — an appropriation, deliberately excluded from the
   * P&L by `report_pnl_per_category`, because the margin it draws is already in there).
   * Null for user categories.
   */
  system_key: 'orders' | 'myaade' | 'profit_allocation' | string | null;
}

export const financeCategoriesService = {
  async list(workspaceId: string): Promise<FinanceCategory[]> {
    const { data, error } = await supabase
      .from('finance_categories')
      .select('id, name, kind, color, is_active, is_system, system_key')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as FinanceCategory[];
  },

  async create(workspaceId: string, input: { name: string; kind: FinanceCategory['kind'] }): Promise<void> {
    const { error } = await supabase.from('finance_categories').insert({
      workspace_id: workspaceId, name: input.name, kind: input.kind,
    } as any);
    if (error) throw error;
  },

  /** Rename / re-kind a category. Historical document references follow automatically (FK by id). */
  async update(id: string, patch: { name?: string; kind?: FinanceCategory['kind'] }): Promise<void> {
    const clean: Record<string, any> = {};
    if (patch.name !== undefined) clean.name = patch.name.trim();
    if (patch.kind !== undefined) clean.kind = patch.kind;
    if (Object.keys(clean).length === 0) return;
    const { error } = await supabase.from('finance_categories').update(clean as any).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    // Soft-disable so historical references keep their label.
    const { error } = await supabase.from('finance_categories').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  },

  /**
   * Seed a standard income/expense category set for the workspace. Idempotent:
   * skips any category whose name already exists (case-insensitive), so it can
   * be run on a partially-populated list to top it up. Returns how many were added.
   */
  async importDefaults(workspaceId: string): Promise<number> {
    const { data: existing } = await supabase
      .from('finance_categories')
      .select('name')
      .eq('workspace_id', workspaceId);
    const have = new Set((existing ?? []).map((r: any) => String(r.name).trim().toLowerCase()));
    const toInsert = DEFAULT_CATEGORIES
      .filter((d) => !have.has(d.name.toLowerCase()))
      .map((d) => ({ workspace_id: workspaceId, name: d.name, kind: d.kind }));
    if (toInsert.length === 0) return 0;
    const { error } = await supabase.from('finance_categories').insert(toInsert as any);
    if (error) throw error;
    return toInsert.length;
  },
};

const DEFAULT_INCOME_CATEGORIES = [
  'Product sales', 'Service revenue', 'Consulting', 'Shipping income', 'Other income',
] as const;

/**
 * Standard chart-of-categories seed. Workspaces can edit/remove after importing.
 *
 * The expense half IS `EXPENSE_CATEGORY_CHART` — the same closed set the categoriser proposes
 * from. Two hand-kept lists would let the importer seed a name the classifier cannot choose.
 */
export const DEFAULT_CATEGORIES: { name: string; kind: FinanceCategory['kind'] }[] = [
  ...DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, kind: 'income' as const })),
  ...EXPENSE_CATEGORY_CHART.map((c) => ({ name: c.name, kind: 'expense' as const })),
];
