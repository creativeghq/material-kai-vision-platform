import { supabase } from '@/integrations/supabase/client';
import { quotesService } from '@/modules/quotes/services/QuotesService';
import type { LeadSource, LeadStatus } from '@/modules/crm/leadVocabulary';

export * from '@/modules/crm/leadVocabulary';

export interface Lead {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  source: LeadSource;
  title: string | null;
  request: string | null;
  notes: string | null;
  estimated_value: number | null;
  currency: string;
  status: LeadStatus;
  lost_reason: string | null;
  follow_up_on: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  converted_at: string | null;
  converted_contact_id: string | null;
  converted_deal_id: string | null;
}

export interface LeadInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company_name?: string | null;
  source?: LeadSource;
  title?: string | null;
  request?: string | null;
  notes?: string | null;
  estimated_value?: number | null;
  status?: Exclude<LeadStatus, 'converted'>;
  lost_reason?: string | null;
  follow_up_on?: string | null;
  source_ref?: string | null;
}

export interface LeadConversion {
  contact_id: string;
  deal_id: string | null;
  reused_contact: boolean;
  already_converted: boolean;
}

export interface LeadQuote {
  id: string;
  quote_number: string | null;
  name: string | null;
  status: string | null;
  grand_total: number | null;
  currency: string | null;
  created_at: string | null;
}

const LEAD_QUOTE_SELECT = 'id, quote_number, name, status, grand_total, currency, created_at';

const LEAD_SELECT =
  'id, workspace_id, name, email, phone, company_name, source, title, request, notes, estimated_value, currency, status, lost_reason, follow_up_on, source_ref, created_at, updated_at, converted_at, converted_contact_id, converted_deal_id';

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function payload(input: LeadInput) {
  return {
    name: input.name.trim(),
    email: blank(input.email),
    phone: blank(input.phone),
    company_name: blank(input.company_name),
    source: input.source ?? 'email',
    title: blank(input.title),
    request: blank(input.request),
    notes: blank(input.notes),
    estimated_value: input.estimated_value ?? null,
    status: input.status ?? 'new',
    lost_reason: input.status === 'lost' ? blank(input.lost_reason) : null,
    follow_up_on: input.follow_up_on || null,
    source_ref: blank(input.source_ref),
  };
}

export const crmLeadsService = {
  async list(workspaceId: string): Promise<Lead[]> {
    const { data, error } = await supabase
      .from('crm_leads')
      .select(LEAD_SELECT)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Lead[];
  },

  async create(workspaceId: string, input: LeadInput): Promise<Lead> {
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('crm_leads')
      .insert({ ...payload(input), workspace_id: workspaceId, owner_user_id: user?.id ?? null })
      .select(LEAD_SELECT)
      .single();
    if (error) throw error;
    return data as Lead;
  },

  async update(leadId: string, input: LeadInput): Promise<Lead> {
    const { data, error } = await supabase
      .from('crm_leads')
      .update(payload(input))
      .eq('id', leadId)
      .is('converted_at', null)
      .select(LEAD_SELECT)
      .single();
    if (error) throw error;
    return data as Lead;
  },

  async remove(leadId: string): Promise<void> {
    const { error } = await supabase.from('crm_leads').delete().eq('id', leadId);
    if (error) throw error;
  },

  async convert(leadId: string, createDeal: boolean): Promise<LeadConversion> {
    const { data, error } = await supabase.rpc('convert_crm_lead', { p_lead_id: leadId, p_create_deal: createDeal });
    if (error) throw error;
    return data as unknown as LeadConversion;
  },

  async get(leadId: string): Promise<Lead | null> {
    const { data, error } = await supabase.from('crm_leads').select(LEAD_SELECT).eq('id', leadId).maybeSingle();
    if (error) throw error;
    return (data as Lead | null) ?? null;
  },

  async setStatus(leadId: string, status: Exclude<LeadStatus, 'converted'>): Promise<void> {
    const { error } = await supabase
      .from('crm_leads')
      .update(status === 'lost' ? { status } : { status, lost_reason: null })
      .eq('id', leadId)
      .is('converted_at', null);
    if (error) throw error;
  },

  async quotes(leadId: string): Promise<LeadQuote[]> {
    const { data, error } = await supabase
      .from('quotes')
      .select(LEAD_QUOTE_SELECT)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as LeadQuote[];
  },

  async quoteCounts(workspaceId: string): Promise<Map<string, number>> {
    const { data, error } = await supabase
      .from('quotes')
      .select('lead_id')
      .eq('workspace_id', workspaceId)
      .not('lead_id', 'is', null);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of data ?? []) if (r.lead_id) counts.set(r.lead_id, (counts.get(r.lead_id) ?? 0) + 1);
    return counts;
  },

  async linkableQuotes(workspaceId: string): Promise<LeadQuote[]> {
    const { data, error } = await supabase
      .from('quotes')
      .select(LEAD_QUOTE_SELECT)
      .eq('workspace_id', workspaceId)
      .is('lead_id', null)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as LeadQuote[];
  },

  async linkQuote(quoteId: string, lead: Lead | null): Promise<void> {
    const { error } = await supabase.from('quotes').update({ lead_id: lead?.id ?? null }).eq('id', quoteId);
    if (error) throw error;
    if (lead) await markQuoted(lead.id);
  },

  async createQuote(lead: Lead): Promise<string> {
    const quote = await quotesService.createQuote({
      name: lead.title ?? `Quote — ${lead.name}`,
      workspace_id: lead.workspace_id,
      custom_request_text: lead.request ?? undefined,
      lead_id: lead.id,
    });
    await markQuoted(lead.id);
    return quote.id;
  },
};

async function markQuoted(leadId: string): Promise<void> {
  const { error } = await supabase
    .from('crm_leads')
    .update({ status: 'quoted' })
    .eq('id', leadId)
    .in('status', ['new', 'contacted']);
  if (error) throw error;
}
