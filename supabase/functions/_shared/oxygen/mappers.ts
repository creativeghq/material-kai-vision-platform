// Maps platform rows → Oxygen API payloads.

import type {
  OxygenContact,
  OxygenContactType,
  OxygenNoticeItem,
  OxygenNoticePayload,
  OxygenProductPayload,
} from './types.ts';

// Oxygen requires ISO-2 country codes; we may store free-text country names.
const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  'greece': 'GR', 'ελλάδα': 'GR', 'ελλαδα': 'GR',
  'cyprus': 'CY', 'κύπρος': 'CY',
  'germany': 'DE', 'france': 'FR', 'italy': 'IT', 'spain': 'ES',
  'united kingdom': 'GB', 'uk': 'GB',
  'united states': 'US', 'usa': 'US',
};

export function normalizeCountry(input: string | null | undefined): string {
  if (!input) return 'GR';
  const t = input.trim();
  if (t.length === 2) return t.toUpperCase();
  return COUNTRY_NAME_TO_ISO2[t.toLowerCase()] ?? 'GR';
}

// Picks the best name pair for a private contact when only `name` is stored.
function splitName(full?: string | null): { name: string; surname: string } {
  if (!full) return { name: '', surname: '' };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { name: parts[0], surname: '' };
  return { name: parts[0], surname: parts.slice(1).join(' ') };
}

export interface CrmContactRow {
  id: string;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  tax_office?: string | null;
  profession?: string | null;
  contact_type?: string | null;
  street?: string | null;
  street_number?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  company?: string | null;
}

export interface CrmCompanyRow {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  vat_number?: string | null;
  tax_office?: string | null;
  profession?: string | null;
  street?: string | null;
  street_number?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  country?: string | null;
  country_code?: string | null;
}

export function buildContactPayloadForCompany(c: CrmCompanyRow): OxygenContact {
  return {
    type: 2,
    is_client: true,
    is_supplier: false,
    company_name: c.name,
    profession: c.profession ?? 'Trade',
    vat_number: c.vat_number ?? '',
    tax_office: c.tax_office ?? '',
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    street: c.street ?? c.address ?? undefined,
    street_number: c.street_number ?? undefined,
    city: c.city ?? undefined,
    postal_code: c.postal_code ?? undefined,
    country: normalizeCountry(c.country_code ?? c.country),
  };
}

export function buildContactPayloadForContact(c: CrmContactRow): OxygenContact {
  const isCompany = c.contact_type === 'company' || !!c.vat_number;
  const type: OxygenContactType = isCompany ? 2 : 1;
  const { name, surname } = c.first_name || c.last_name
    ? { name: c.first_name ?? '', surname: c.last_name ?? '' }
    : splitName(c.name);

  if (type === 2) {
    return {
      type: 2,
      is_client: true,
      is_supplier: false,
      company_name: c.company ?? c.name ?? `${name} ${surname}`.trim(),
      profession: c.profession ?? 'Trade',
      vat_number: c.vat_number ?? '',
      tax_office: c.tax_office ?? '',
      email: c.email ?? undefined,
      phone: c.phone ?? undefined,
      street: c.street ?? c.address ?? undefined,
      street_number: c.street_number ?? undefined,
      city: c.city ?? undefined,
      postal_code: c.postal_code ?? undefined,
      country: normalizeCountry(c.country_code ?? c.country),
    };
  }
  return {
    type: 1,
    is_client: true,
    is_supplier: false,
    name,
    surname,
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
    street: c.street ?? c.address ?? undefined,
    street_number: c.street_number ?? undefined,
    city: c.city ?? undefined,
    postal_code: c.postal_code ?? undefined,
    country: normalizeCountry(c.country_code ?? c.country),
  };
}

// Build a minimal Oxygen product payload from a quote line.
// Used only when quote_items.product_id has no oxygen_product_id yet.
export function buildProductPayloadFromQuoteLine(args: {
  productName: string;
  productCode: string;
  unitNetAmount: number;
  saleTaxId: number;
  warehouseId: number;
  description?: string;
}): OxygenProductPayload {
  return {
    name: args.productName,
    code: args.productCode,
    sale_net_amount: args.unitNetAmount,
    sale_tax_id: args.saleTaxId,
    status: 'active',
    warehouses: [{ warehouse_id: args.warehouseId, quantity: 0 }],
    description: args.description,
  };
}

export interface QuoteLineForOxygen {
  quantity: number;
  unit_price: number | null;
  discounted_price: number | null;
  custom_sku: string | null;
  custom_product_name: string | null;
  product?: { id: string; name?: string | null; sku?: string | null; oxygen_product_id?: string | null; oxygen_tax_id?: number | null } | null;
}

export function buildNoticePayload(args: {
  contactId: string;
  issueDate: string;
  notes?: string;
  defaultTaxId: number;
  defaultWarehouseId: number;
  lines: Array<{
    code: string;
    quantity: number;
    unit_net_value: number;
    tax_id: number;
    warehouse_id: number;
    description?: string;
    discount_type?: 'fixed' | 'percent';
    discount_value?: number;
  }>;
}): OxygenNoticePayload {
  const items: OxygenNoticeItem[] = args.lines.map(l => ({
    code: l.code,
    quantity: l.quantity,
    unit_net_value: l.unit_net_value,
    tax_id: l.tax_id ?? args.defaultTaxId,
    warehouse_id: l.warehouse_id ?? args.defaultWarehouseId,
    description: l.description,
    discount_type: l.discount_type,
    discount_value: l.discount_value,
  }));
  return {
    contact_id: args.contactId,
    issue_date: args.issueDate,
    items,
    notes: args.notes,
  };
}
