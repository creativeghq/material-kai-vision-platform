export interface QuotePDFRequest {
  quote_id: string;
  regenerate?: boolean;
}

export interface QuotePDFResponse {
  success: boolean;
  quote_number?: string;
  pdf_url?: string;
  pdf_storage_path?: string;
  error?: string;
}

export interface QuoteData {
  id: string;
  user_id: string;
  workspace_id?: string;
  name?: string;
  quote_number?: string;
  status: string;
  notes?: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  grand_total: number;
  currency: string;
  expires_at: string;
  created_at: string;
  items: QuoteItemData[];
  client: ClientData;
}

export interface QuoteItemData {
  id: string;
  product_name: string;
  description: string | null;
  sku: string | null;
  selected_size: string | null;
  selected_color: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  discounted_price: number | null;
  line_total: number;
  notes: string | null;
  // FF&E fields
  room: string | null;
  dimensions: string | null;
  installation_requirements: string | null;
  delivery_date: string | null;
}

export interface ClientData {
  contact_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  vat_number: string | null;
}

export interface TemplateConfig {
  /** Legacy key: cover page image path */
  cover_image_path: string;
  /** Alias: first page image path */
  first_page_path?: string;
  /** Company / client details page background image */
  company_details_page_path?: string;
  /** Items / content pages background image */
  content_page_path?: string;
  /** Alias: items background image path */
  items_background_path: string;
  /** Legacy key: back cover image path */
  backcover_image_path: string;
  /** Alias: last page image path */
  last_page_path?: string;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_vat: string;
  vat_rate_default: number;
}
