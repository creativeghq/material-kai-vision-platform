/** Global finance categories (Κατηγορία) for classifying income/expense docs + payments. */
import { supabase } from '@/integrations/supabase/client';

export interface FinanceCategory {
  id: string;
  name: string;
  kind: 'income' | 'expense' | 'both';
  color: string | null;
  is_active: boolean;
}

export const financeCategoriesService = {
  async list(workspaceId: string): Promise<FinanceCategory[]> {
    const { data, error } = await supabase
      .from('finance_categories')
      .select('id, name, kind, color, is_active')
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

  async remove(id: string): Promise<void> {
    // Soft-disable so historical references keep their label.
    const { error } = await supabase.from('finance_categories').update({ is_active: false }).eq('id', id);
    if (error) throw error;
  },
};
