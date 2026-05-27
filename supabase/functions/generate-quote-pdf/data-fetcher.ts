import { SupabaseClient } from '@supabase/supabase-js';
import { QuoteData, QuoteItemData, ClientData, TemplateConfig } from './types.ts';

/**
 * Fetch complete quote data including items with product details
 */
export async function fetchQuoteData(
  supabase: SupabaseClient,
  quoteId: string
): Promise<QuoteData> {
  // Fetch quote record
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*')
    .eq('id', quoteId)
    .single();

  if (quoteError || !quote) {
    throw new Error(`Quote not found: ${quoteError?.message || 'No data'}`);
  }

  // Fetch quote items with product join
  const { data: items, error: itemsError } = await supabase
    .from('quote_items')
    .select(`
      id,
      product_id,
      quantity,
      notes,
      selected_size,
      selected_color,
      unit_price,
      discounted_price,
      line_total,
      custom_product_name,
      custom_product_description,
      custom_sku,
      custom_unit,
      room,
      dimensions,
      installation_requirements,
      delivery_date,
      products (
        id,
        name,
        sku,
        description,
        metadata
      )
    `)
    .eq('quote_id', quoteId)
    .order('added_at', { ascending: true });

  if (itemsError) {
    throw new Error(`Failed to fetch quote items: ${itemsError.message}`);
  }

  if (!items || items.length === 0) {
    throw new Error('Cannot generate PDF: quote has no items.');
  }

  // Validate all items have prices
  const unpricedItems = items.filter(
    (item: any) => item.unit_price === null || item.unit_price === undefined
  );
  if (unpricedItems.length > 0) {
    throw new Error(
      `Cannot generate PDF: ${unpricedItems.length} item(s) are missing prices. Set all item prices first.`
    );
  }

  // Resolve client details — use the bill-to customer (company or contact),
  // NOT quote.user_id (which is the designer/operator who created the quote).
  const client = await fetchClientData(
    supabase,
    quote.user_id,
    quote.customer_company_id ?? null,
    quote.customer_contact_id ?? null,
  );

  // Map items (supports both catalog products and custom items)
  const mappedItems: QuoteItemData[] = items.map((item: any) => {
    const product = item.products;
    const metadata = product?.metadata || {};
    const isCustom = !product;

    return {
      id: item.id,
      product_name: isCustom
        ? (item.custom_product_name || 'Custom Item')
        : (product?.name || 'Unknown Product'),
      description: isCustom
        ? (item.custom_product_description || null)
        : (product?.description || metadata?.description || null),
      sku: isCustom
        ? (item.custom_sku || null)
        : (product?.sku || metadata?.sku || null),
      selected_size: item.selected_size || null,
      selected_color: item.selected_color || null,
      quantity: item.quantity,
      unit: isCustom ? (item.custom_unit || 'pcs') : (metadata?.unit || 'pcs'),
      unit_price: parseFloat(item.unit_price) || 0,
      discounted_price: item.discounted_price != null ? parseFloat(item.discounted_price) : null,
      line_total: parseFloat(item.line_total) || 0,
      notes: item.notes || null,
      room: item.room || null,
      dimensions: item.dimensions || null,
      installation_requirements: item.installation_requirements || null,
      delivery_date: item.delivery_date || null,
    };
  });

  return {
    id: quote.id,
    user_id: quote.user_id,
    workspace_id: quote.workspace_id,
    name: quote.name,
    quote_number: quote.quote_number,
    status: quote.status,
    notes: quote.notes,
    subtotal: parseFloat(quote.subtotal) || 0,
    vat_rate: parseFloat(quote.vat_rate) || 24,
    vat_amount: parseFloat(quote.vat_amount) || 0,
    grand_total: parseFloat(quote.grand_total) || 0,
    currency: quote.currency || 'EUR',
    expires_at: quote.expires_at,
    created_at: quote.created_at,
    items: mappedItems,
    client,
  };
}

/**
 * Resolve client details. Priority:
 * 1. customer_company_id → crm_companies (B2B bill-to)
 * 2. customer_contact_id → crm_contacts (B2C bill-to)
 * 3. Legacy fallback: user_id → crm_contacts (via user_id) → company chain
 * 4. user_profiles (last resort)
 */
async function fetchClientData(
  supabase: SupabaseClient,
  userId: string,
  customerCompanyId?: string | null,
  customerContactId?: string | null,
): Promise<ClientData> {
  const emptyClient: ClientData = {
    contact_name: null,
    company_name: null,
    email: null,
    phone: null,
    address: null,
    city: null,
    postal_code: null,
    country: null,
    vat_number: null,
  };

  // Priority 1: explicit B2B customer company
  if (customerCompanyId) {
    const { data: company } = await supabase
      .from('crm_companies')
      .select('name, email, phone, address, city, postal_code, country, vat_number')
      .eq('id', customerCompanyId)
      .single();
    if (company) {
      emptyClient.company_name = company.name;
      emptyClient.email = company.email;
      emptyClient.phone = company.phone;
      emptyClient.address = company.address;
      emptyClient.city = company.city;
      emptyClient.postal_code = company.postal_code;
      emptyClient.country = company.country;
      emptyClient.vat_number = company.vat_number;
      return emptyClient;
    }
  }

  // Priority 2: explicit B2C customer contact
  if (customerContactId) {
    const { data: contact } = await supabase
      .from('crm_contacts')
      .select('name, email, phone, company, address, city, postal_code, country, vat_number')
      .eq('id', customerContactId)
      .single();
    if (contact) {
      emptyClient.contact_name = contact.name;
      emptyClient.email = contact.email;
      emptyClient.phone = contact.phone;
      emptyClient.address = contact.address;
      emptyClient.city = contact.city;
      emptyClient.postal_code = contact.postal_code;
      emptyClient.country = contact.country;
      emptyClient.vat_number = contact.vat_number;
      if (contact.company) emptyClient.company_name = contact.company;
      return emptyClient;
    }
  }

  // Legacy fallback: CRM contact linked to the quote's user_id
  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('id, name, email, phone, company, address, city, postal_code, country')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (contact) {
    emptyClient.contact_name = contact.name;
    emptyClient.email = contact.email;
    emptyClient.phone = contact.phone;
    emptyClient.address = contact.address;
    emptyClient.city = contact.city;
    emptyClient.postal_code = contact.postal_code;
    emptyClient.country = contact.country;

    // Try to get company via junction table
    const { data: companyLink } = await supabase
      .from('crm_company_contacts')
      .select('company_id')
      .eq('contact_id', contact.id)
      .limit(1)
      .single();

    if (companyLink) {
      const { data: company } = await supabase
        .from('crm_companies')
        .select('name, email, phone, address, city, postal_code, country, vat_number')
        .eq('id', companyLink.company_id)
        .single();

      if (company) {
        emptyClient.company_name = company.name;
        emptyClient.vat_number = company.vat_number;
        // Use company address if contact has none
        if (!emptyClient.address) {
          emptyClient.address = company.address;
          emptyClient.city = company.city;
          emptyClient.postal_code = company.postal_code;
          emptyClient.country = company.country;
        }
      }
    }

    // Fallback company name from contact's inline company field
    if (!emptyClient.company_name && contact.company) {
      emptyClient.company_name = contact.company;
    }

    return emptyClient;
  }

  // Fallback: user_profiles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('user_id', userId)
    .single();

  if (profile) {
    emptyClient.contact_name = profile.full_name;
    emptyClient.email = profile.email;
  }

  return emptyClient;
}

/**
 * Fetch PDF template configuration from system_settings
 */
export async function fetchTemplateConfig(
  supabase: SupabaseClient
): Promise<TemplateConfig> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'quote_pdf_template')
    .single();

  if (error || !data) {
    throw new Error('Quote PDF template configuration not found in system_settings.');
  }

  const config = data.setting_value as Record<string, any>;

  return {
    cover_image_path: config.first_page_path || config.cover_image_path || 'cover.png',
    first_page_path: config.first_page_path || config.cover_image_path,
    company_details_page_path: config.company_details_page_path,
    content_page_path: config.content_page_path,
    items_background_path: config.content_page_path || config.items_background_path || 'items-background.png',
    backcover_image_path: config.last_page_path || config.backcover_image_path || 'backcover.png',
    last_page_path: config.last_page_path || config.backcover_image_path,
    company_name: config.company_name || '',
    company_address: config.company_address || '',
    company_phone: config.company_phone || '',
    company_email: config.company_email || '',
    company_vat: config.company_vat || '',
    vat_rate_default: config.vat_rate_default ?? 24,
  };
}

/**
 * Fetch a file from Supabase Storage as Uint8Array
 */
export async function fetchStorageFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<Uint8Array> {
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error || !data) {
    throw new Error(`Missing template image: ${path}. Please upload via System Settings.`);
  }

  return new Uint8Array(await data.arrayBuffer());
}
