export interface OxygenSyncResult {
  ok: boolean;
  oxygen_notice_id: string;
  oxygen_contact_id?: string;
  quote_id: string;
  already_synced?: boolean;
  items_count?: number;
}

export interface QuoteCustomerLink {
  customer_contact_id?: string | null;
  customer_company_id?: string | null;
}

export interface CrmContactSearchRow {
  id: string;
  name: string | null;
  email: string | null;
  vat_number: string | null;
  contact_type: string | null;
  company: string | null;
}

export interface CrmCompanySearchRow {
  id: string;
  name: string;
  email: string | null;
  vat_number: string | null;
}

export interface QuoteOxygenView {
  id: string;
  status: string;
  customer_contact_id: string | null;
  customer_company_id: string | null;
  oxygen_notice_id: string | null;
  oxygen_sync_status: 'pending' | 'syncing' | 'synced' | 'failed' | null;
  oxygen_last_sync_at: string | null;
  oxygen_sync_error: string | null;
}
