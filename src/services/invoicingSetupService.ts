import { supabase } from '@/integrations/supabase/client';

export interface RefRow { category: string; code: string; description: string; rate: number | null; is_enabled: boolean; sort_order: number | null; }
export interface DocTypeSetting { code: string; enabled: boolean; default_income_classification_type: string | null; default_income_classification_category: string | null; }
export interface DocSeries { id: string; doc_code: string; series: string; next_number: number; is_active: boolean; }

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

  async addSeries(workspaceId: string, docCode: string, series: string, nextNumber: number): Promise<void> {
    const { error } = await supabase.from('document_series').insert({ workspace_id: workspaceId, doc_code: docCode, series, next_number: nextNumber });
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
};
