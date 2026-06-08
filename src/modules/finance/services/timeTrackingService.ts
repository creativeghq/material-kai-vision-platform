/**
 * #207 — Time-tracking & billing (Oxygen tasks_management + time reports parity). Log billable
 * hours against a customer, then turn the unbilled entries into a draft invoice (one line per
 * entry) that flows through the normal issue → myDATA path.
 */
import { supabase } from '@/integrations/supabase/client';

export interface TimeEntry {
  id: string;
  workspace_id: string;
  user_id: string | null;
  customer_company_id: string | null;
  customer_contact_id: string | null;
  work_date: string;
  minutes: number;
  hourly_rate: number;
  description: string;
  is_billable: boolean;
  billed_invoice_id: string | null;
  billed_at: string | null;
  created_at: string;
}

export interface NewTimeEntry {
  customer_company_id?: string | null;
  customer_contact_id?: string | null;
  work_date: string;
  minutes: number;
  hourly_rate: number;
  description: string;
  is_billable?: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export const timeTrackingService = {
  async list(workspaceId: string, opts?: { onlyUnbilled?: boolean; customerId?: string; from?: string; to?: string }): Promise<TimeEntry[]> {
    let q = supabase.from('time_entries').select('*').eq('workspace_id', workspaceId).order('work_date', { ascending: false });
    if (opts?.onlyUnbilled) q = q.is('billed_invoice_id', null).eq('is_billable', true);
    if (opts?.from) q = q.gte('work_date', opts.from);
    if (opts?.to) q = q.lte('work_date', opts.to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as TimeEntry[];
  },

  async create(workspaceId: string, entry: NewTimeEntry): Promise<TimeEntry> {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('time_entries').insert({
      workspace_id: workspaceId,
      user_id: auth.user?.id ?? null,
      customer_company_id: entry.customer_company_id ?? null,
      customer_contact_id: entry.customer_contact_id ?? null,
      work_date: entry.work_date,
      minutes: entry.minutes,
      hourly_rate: entry.hourly_rate,
      description: entry.description,
      is_billable: entry.is_billable ?? true,
      created_by: auth.user?.id ?? null,
    }).select().single();
    if (error) throw error;
    return data as TimeEntry;
  },

  async update(id: string, patch: Partial<Pick<TimeEntry, 'work_date' | 'minutes' | 'hourly_rate' | 'description' | 'is_billable'>>): Promise<void> {
    const { error } = await supabase.from('time_entries').update(patch).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('time_entries').delete().eq('id', id).is('billed_invoice_id', null);
    if (error) throw error;
  },

  /**
   * Bill a set of unbilled entries (all for the SAME customer) → one draft invoice with a line
   * per entry (quantity = hours, unit_price = hourly_rate). Returns the draft invoice id; the
   * caller routes the user to the invoice editor to set classifications + issue.
   */
  async billToInvoice(
    workspaceId: string,
    customer: { type: 'company' | 'contact'; id: string } | null,
    entryIds: string[],
    vatRate: number,
  ): Promise<string> {
    if (entryIds.length === 0) throw new Error('No entries selected');
    const { data: entries, error: selErr } = await supabase
      .from('time_entries').select('*')
      .in('id', entryIds).eq('workspace_id', workspaceId).is('billed_invoice_id', null);
    if (selErr) throw selErr;
    const rows = (entries ?? []) as TimeEntry[];
    if (rows.length === 0) throw new Error('Selected entries are already billed');

    const lines = rows.map((e) => {
      const hours = round2(e.minutes / 60);
      const net = round2(hours * Number(e.hourly_rate));
      return { e, hours, net };
    });
    const totalNet = round2(lines.reduce((s, l) => s + l.net, 0));
    const vatAmount = round2(totalNet * vatRate / 100);

    const { data: draftNumber, error: numErr } = await supabase.rpc('next_invoice_number', { p_workspace_id: workspaceId });
    if (numErr) throw numErr;

    const { data: invoice, error: insErr } = await supabase.from('invoices').insert({
      workspace_id: workspaceId,
      internal_number: draftNumber as string,
      customer_company_id: customer?.type === 'company' ? customer.id : null,
      customer_contact_id: customer?.type === 'contact' ? customer.id : null,
      status: 'draft',
      currency: 'EUR',
      subtotal_net: totalNet, vat_rate: vatRate, vat_amount: vatAmount, total: round2(totalNet + vatAmount),
      document_type: '1.1',
      payment_terms_days: 30,
      notes: 'Generated from logged time',
      issued_at: null, due_at: null,
    }).select().single();
    if (insErr) throw insErr;

    const itemsPayload = lines.map((l) => ({
      invoice_id: (invoice as any).id,
      description: `${l.e.description} (${l.hours}h @ ${Number(l.e.hourly_rate).toFixed(2)}/h)`,
      quantity: l.hours,
      unit_price: Number(l.e.hourly_rate),
      net_value: l.net,
      line_total: l.net,
    }));
    const { error: itErr } = await supabase.from('invoice_items').insert(itemsPayload);
    if (itErr) throw itErr;

    const { error: stampErr } = await supabase.from('time_entries')
      .update({ billed_invoice_id: (invoice as any).id, billed_at: new Date().toISOString() })
      .in('id', rows.map((r) => r.id));
    if (stampErr) throw stampErr;

    return (invoice as any).id as string;
  },
};
