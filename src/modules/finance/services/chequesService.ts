/** Cheques (Επιταγές) — post-dated cheques in (from customers) / out (to suppliers). */
import { supabase } from '@/integrations/supabase/client';

export interface Cheque {
  id: string;
  workspace_id: string;
  direction: 'in' | 'out';
  cheque_number: string | null;
  bank: string | null;
  amount: number;
  currency: string;
  due_date: string | null;
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
  notes: string | null;
  created_at: string;
}

export const chequesService = {
  async list(workspaceId: string): Promise<Cheque[]> {
    const { data, error } = await supabase
      .from('cheques')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as Cheque[];
  },

  async create(workspaceId: string, input: {
    direction: 'in' | 'out'; chequeNumber?: string; bank?: string; amount: number;
    currency?: string; dueDate?: string; notes?: string;
  }): Promise<string> {
    const { data, error } = await supabase.from('cheques').insert({
      workspace_id: workspaceId,
      direction: input.direction,
      cheque_number: input.chequeNumber || null,
      bank: input.bank || null,
      amount: input.amount,
      currency: input.currency || 'EUR',
      due_date: input.dueDate || null,
      notes: input.notes || null,
    } as any).select('id').single();
    if (error) throw error;
    return (data as any).id;
  },

  async setStatus(id: string, status: Cheque['status']): Promise<void> {
    const { error } = await supabase.from('cheques').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },
};
