// Oxygen API types — narrowed to what the pre-invoice (notice) flow needs.
// Schema: https://docs.oxygen.gr/oxygen-api.json

export type OxygenContactType = 1 | 2; // 1 = private, 2 = company

export interface OxygenContact {
  id?: string;
  type: OxygenContactType;
  is_client: boolean;
  is_supplier?: boolean;
  email?: string;
  phone?: string;
  // Private (type=1)
  name?: string;
  surname?: string;
  // Company (type=2)
  company_name?: string;
  profession?: string;
  vat_number?: string;
  tax_office?: string;
  // Address
  street?: string;
  street_number?: string;
  city?: string;
  postal_code?: string;
  country?: string; // ISO-2 country code
}

export interface OxygenNoticeItem {
  code: string;            // Oxygen product id (or fallback SKU when product not yet synced)
  quantity: number;
  unit_net_value: number;
  tax_id?: number;
  warehouse_id?: number;
  discount_type?: 'fixed' | 'percent';
  discount_value?: number;
  description?: string;
}

export interface OxygenNoticePayload {
  contact_id: string;
  issue_date: string; // YYYY-MM-DD
  items: OxygenNoticeItem[];
  notes?: string;
  expires_at?: string; // YYYY-MM-DD
}

export interface OxygenNoticeResponse {
  id: string;
  contact_id: string;
  issue_date: string;
  number?: string;
  total?: number;
  status?: string;
}

export interface OxygenProductPayload {
  name: string;
  code: string;
  sale_net_amount: number;
  sale_tax_id: number;
  status: 'active' | 'inactive';
  warehouses: Array<{ warehouse_id: number; quantity: number }>;
  description?: string;
  barcode?: string;
}

export interface OxygenProductResponse {
  id: string;
  name: string;
  code: string;
}
