/** Global finance categories for classifying income/expense docs + payments. */
import { supabase } from '@/integrations/supabase/client';

export interface FinanceCategory {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'both';
  color: string | null;
  is_active: boolean;
  /** #207 — default sell margin % for products in this category; auto-prices received goods. */
  margin_pct: number | null;
  /** Protected built-in: every workspace has one of each; can't be renamed/re-kinded/deactivated/
   *  deleted. Enforced by the guard_system_finance_category DB trigger. */
  is_system: boolean;
  /** Which built-in this is, when is_system: 'orders' (auto-attached to order costs) or
   *  'myaade' (default landing category for myDATA-synced expenses). Null for user categories. */
  system_key: 'orders' | 'myaade' | string | null;
}

export const financeCategoriesService = {
  async list(workspaceId: string): Promise<FinanceCategory[]> {
    const { data, error } = await supabase
      .from('finance_categories')
      .select('id, name, kind, color, is_active, margin_pct, is_system, system_key')
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

  /** Set the default sell margin % for a category (used to auto-price received goods). */
  async setMargin(id: string, marginPct: number | null): Promise<void> {
    const { error } = await supabase.from('finance_categories').update({ margin_pct: marginPct } as any).eq('id', id);
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

/** Standard chart-of-categories seed. Workspaces can edit/remove after importing. */
export const DEFAULT_CATEGORIES: { name: string; kind: FinanceCategory['kind'] }[] = [
  // Income
  { name: 'Product sales', kind: 'income' },
  { name: 'Service revenue', kind: 'income' },
  { name: 'Consulting', kind: 'income' },
  { name: 'Shipping income', kind: 'income' },
  { name: 'Other income', kind: 'income' },
  // Expense — cost of goods
  { name: 'Materials & supplies', kind: 'expense' },
  { name: 'Inventory purchases', kind: 'expense' },
  { name: 'Subcontractors', kind: 'expense' },
  { name: 'Shipping & freight', kind: 'expense' },
  // Expense — operating
  { name: 'Rent', kind: 'expense' },
  { name: 'Utilities', kind: 'expense' },
  { name: 'Salaries & wages', kind: 'expense' },
  { name: 'Insurance', kind: 'expense' },
  { name: 'Marketing & advertising', kind: 'expense' },
  { name: 'Software & subscriptions', kind: 'expense' },
  { name: 'Professional fees', kind: 'expense' },
  { name: 'Bank & payment fees', kind: 'expense' },
  { name: 'Travel', kind: 'expense' },
  { name: 'Office supplies', kind: 'expense' },
  { name: 'Equipment', kind: 'expense' },
  { name: 'Taxes & duties', kind: 'expense' },
  { name: 'Other expense', kind: 'expense' },
];
