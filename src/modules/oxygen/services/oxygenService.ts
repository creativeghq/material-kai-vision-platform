import { supabase } from '@/integrations/supabase/client';
import type { OxygenSyncResult, CrmContactSearchRow, CrmCompanySearchRow } from '../types';

class OxygenService {
  async createPreInvoice(quoteId: string): Promise<OxygenSyncResult> {
    const { data, error } = await supabase.functions.invoke('oxygen-create-pre-invoice', {
      body: { quote_id: quoteId },
    });
    if (error) {
      const message = (data as { error?: string } | null)?.error ?? error.message;
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data as OxygenSyncResult;
  }

  async searchContacts(query: string, limit = 20): Promise<CrmContactSearchRow[]> {
    const term = `%${query.trim()}%`;
    const { data, error } = await supabase
      .from('crm_contacts')
      .select('id, name, email, vat_number, contact_type, company')
      .or(`name.ilike.${term},email.ilike.${term},vat_number.ilike.${term}`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as CrmContactSearchRow[];
  }

  async searchCompanies(query: string, limit = 20): Promise<CrmCompanySearchRow[]> {
    const term = `%${query.trim()}%`;
    const { data, error } = await supabase
      .from('crm_companies')
      .select('id, name, email, vat_number')
      .or(`name.ilike.${term},email.ilike.${term},vat_number.ilike.${term}`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as CrmCompanySearchRow[];
  }

  async linkCustomerToQuote(
    quoteId: string,
    link: { customer_contact_id?: string | null; customer_company_id?: string | null },
  ): Promise<void> {
    const update: Record<string, string | null> = {
      customer_contact_id: null,
      customer_company_id: null,
    };
    if (link.customer_contact_id) update.customer_contact_id = link.customer_contact_id;
    if (link.customer_company_id) update.customer_company_id = link.customer_company_id;
    const { error } = await supabase.from('quotes').update(update).eq('id', quoteId);
    if (error) throw error;
  }
}

export const oxygenService = new OxygenService();
