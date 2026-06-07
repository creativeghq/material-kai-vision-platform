import { supabase } from '@/integrations/supabase/client';

export interface RefRow { category: string; code: string; description: string; rate: number | null; is_enabled: boolean; sort_order: number | null; }
export interface DocTypeSetting { code: string; enabled: boolean; default_income_classification_type: string | null; default_income_classification_category: string | null; }
export interface DocSeries { id: string; doc_code: string; series: string; next_number: number; is_active: boolean; branch_id: string | null; }
export interface FinanceBranch {
  id: string; workspace_id: string; branch_code: number; name: string;
  address: string | null; street_number: string | null; postal_code: string | null; city: string | null; is_active: boolean;
}

export const invoicingSetupService = {
  async listReference(category: string): Promise<RefRow[]> {
    const { data, error } = await supabase.from('mydata_reference').select('*').eq('category', category).order('sort_order');
    if (error) throw error;
    return (data ?? []) as RefRow[];
  },

  async getDocTypeSettings(workspaceId: string): Promise<Record<string, DocTypeSetting>> {
    const { data } = await supabase.from('workspace_doc_type').select('*').eq('workspace_id', workspaceId);
    return Object.fromEntries((data ?? []).map((r: any) => [r.code, r as DocTypeSetting]));
  },

  async setDocType(workspaceId: string, code: string, patch: Partial<DocTypeSetting>): Promise<void> {
    const { error } = await supabase.from('workspace_doc_type').upsert(
      { workspace_id: workspaceId, code, ...patch }, { onConflict: 'workspace_id,code' });
    if (error) throw error;
  },

  async listSeries(workspaceId: string): Promise<DocSeries[]> {
    const { data } = await supabase.from('document_series').select('*').eq('workspace_id', workspaceId).order('doc_code');
    return (data ?? []) as DocSeries[];
  },

  async addSeries(workspaceId: string, docCode: string, series: string, nextNumber: number, branchId?: string | null): Promise<void> {
    const { error } = await supabase.from('document_series').insert({ workspace_id: workspaceId, doc_code: docCode, series, next_number: nextNumber, branch_id: branchId ?? null });
    if (error) throw error;
  },

  async updateSeries(id: string, patch: Partial<DocSeries>): Promise<void> {
    const { error } = await supabase.from('document_series').update(patch).eq('id', id);
    if (error) throw error;
  },

  async deleteSeries(id: string): Promise<void> {
    const { error } = await supabase.from('document_series').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Establishments / branches ──────────────────────────────────────────────
  async listBranches(workspaceId: string): Promise<FinanceBranch[]> {
    const { data } = await supabase.from('finance_branches').select('*').eq('workspace_id', workspaceId).order('branch_code');
    return (data ?? []) as FinanceBranch[];
  },

  /** Ensure a Headquarters (branch 0) row exists; returns the current branch list. */
  async ensureHeadquarters(workspaceId: string): Promise<FinanceBranch[]> {
    const existing = await this.listBranches(workspaceId);
    if (existing.length > 0) return existing;
    await supabase.from('finance_branches').insert({ workspace_id: workspaceId, branch_code: 0, name: 'Headquarters' });
    return this.listBranches(workspaceId);
  },

  async addBranch(workspaceId: string, input: { branch_code: number; name: string; address?: string; street_number?: string; postal_code?: string; city?: string }): Promise<void> {
    const { error } = await supabase.from('finance_branches').insert({ workspace_id: workspaceId, ...input });
    if (error) throw error;
  },

  async updateBranch(id: string, patch: Partial<FinanceBranch>): Promise<void> {
    const { error } = await supabase.from('finance_branches').update(patch).eq('id', id);
    if (error) throw error;
  },

  async deleteBranch(id: string): Promise<void> {
    const { error } = await supabase.from('finance_branches').delete().eq('id', id);
    if (error) throw error;
  },
};
