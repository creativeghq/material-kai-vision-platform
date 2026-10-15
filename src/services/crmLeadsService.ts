import { supabase } from '@/integrations/supabase/client';
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
};
