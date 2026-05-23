import { supabase } from '@/integrations/supabase/client';
import type { OxygenSyncResult, CrmContactSearchRow, CrmCompanySearchRow } from '../types';

export interface OxygenSettingsView {
  api_key_masked: string | null;
  api_key_present: boolean;
  api_base_url: string;
  default_tax_id_24: number | null;
  default_warehouse_id: number | null;
  last_verified_at: string | null;
  last_verified_status: 'ok' | 'failed' | null;
  last_verified_error: string | null;
  updated_at: string | null;
  effective: {
    api_key_present: boolean;
    api_base_url: string;
    default_tax_id_24: number | null;
    default_warehouse_id: number | null;
    source: 'db' | 'env' | 'partial';
  };
}

export interface OxygenTaxRow {
  id: number;
  name?: string;
  rate?: number;
  code?: string;
  [k: string]: unknown;
}

export interface OxygenWarehouseRow {
  id: number;
  name?: string;
  code?: string;
  [k: string]: unknown;
}

export interface SaveSettingsPayload {
  api_key?: string | null;            // null/undefined = leave unchanged; '' = clear
  api_base_url?: string | null;
  default_tax_id_24?: number | null;
  default_warehouse_id?: number | null;
}

class OxygenService {
  // ── Pre-invoice flow ────────────────────────────────────────────────
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

  // ── Customer link picker ────────────────────────────────────────────
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

  // ── Admin: module settings ──────────────────────────────────────────
  async getSettings(): Promise<OxygenSettingsView> {
    return await this.invokeAdmin<OxygenSettingsView>({ action: 'get_settings' });
  }

  async saveSettings(payload: SaveSettingsPayload): Promise<OxygenSettingsView> {
    return await this.invokeAdmin<OxygenSettingsView>({ action: 'save_settings', ...payload });
  }

  async listTaxes(opts: { override_api_key?: string; override_api_base_url?: string } = {}): Promise<OxygenTaxRow[]> {
    const res = await this.invokeAdmin<{ taxes: OxygenTaxRow[] }>({ action: 'list_taxes', ...opts });
    return res.taxes ?? [];
  }

  async listWarehouses(opts: { override_api_key?: string; override_api_base_url?: string } = {}): Promise<OxygenWarehouseRow[]> {
    const res = await this.invokeAdmin<{ warehouses: OxygenWarehouseRow[] }>({ action: 'list_warehouses', ...opts });
    return res.warehouses ?? [];
  }

  async testConnection(opts: { override_api_key?: string; override_api_base_url?: string } = {}): Promise<{ taxes_count: number; base_url: string }> {
    return await this.invokeAdmin<{ taxes_count: number; base_url: string }>({ action: 'test_connection', ...opts });
  }

  private async invokeAdmin<T>(body: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('oxygen-admin', { body });
    if (error) {
      const message = (data as { error?: string } | null)?.error ?? error.message;
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }
}

export const oxygenService = new OxygenService();
