export interface CatalogPDFRequest {
  catalog_id: string;
  regenerate?: boolean;
}

export interface CatalogPDFResponse {
  success: boolean;
  pdf_url?: string;
  pdf_storage_path?: string;
  page_count?: number;
  error?: string;
}

export interface CatalogMaterial {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_source: string | null;
  price: number | null;
  currency: string | null;
  price_source: string | null;
  specs: Record<string, any> | null;
  provenance?: Record<string, any>;
}

export interface CatalogSection {
  id: string;
  title: string;
  intro: string | null;
  materials: CatalogMaterial[];
}

export interface CatalogCoverData {
  title?: string;
  subtitle?: string;
  client_name?: string;
  date?: string;
  cover_image_url?: string;
}

export interface CatalogBackCoverData {
  contact_line?: string;
  closing_message?: string;
}

export interface CatalogRow {
  id: string;
  owner_user_id: string;
  template_id: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_data: CatalogCoverData;
  body_data: { sections: CatalogSection[] };
  back_cover_data: CatalogBackCoverData;
  status: string;
}

export interface CatalogTemplateRow {
  id: string;
  name: string;
  cover_image_path: string;
  content_background_path: string | null;
  back_cover_image_path: string;
  accent_color_hex: string | null;
}

export interface OwnerBranding {
  logo_url?: string | null;
  company_name?: string | null;
  contact_line?: string | null;
}
