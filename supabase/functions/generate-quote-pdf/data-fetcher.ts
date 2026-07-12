import { SupabaseClient } from '@supabase/supabase-js';
import { QuoteData, QuoteItemData, ClientData, TemplateConfig } from './types.ts';
import { HttpError } from '../_shared/api-logger.ts';

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
      custom_image_url,
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
    throw new HttpError(400, 'Cannot generate PDF: quote has no items.');
  }

  // Validate all items have prices
  const unpricedItems = items.filter(
    (item: any) => item.unit_price === null || item.unit_price === undefined
  );
  if (unpricedItems.length > 0) {
    throw new HttpError(
      400,
      `Cannot generate PDF: ${unpricedItems.length} item(s) are missing prices. Set all item prices first.`
    );
  }

  const client = await fetchClientData(
    supabase,
    quote.customer_company_id ?? null,
    quote.customer_contact_id ?? null,
  );

  // Resolve a primary image per catalog product (same source as QuotesService.getQuote).
  const productImageMap: Record<string, string> = {};
  const productIds = items.map((i: any) => i.products?.id).filter(Boolean);
  if (productIds.length > 0) {
    try {
      const { data: rels } = await supabase
        .from('image_product_associations')
        .select('product_id, image:document_images(image_url)')
        .in('product_id', productIds);
      for (const rel of rels || []) {
        const img = (rel as any).image;
        if (img?.image_url && !productImageMap[(rel as any).product_id]) {
          productImageMap[(rel as any).product_id] = img.image_url;
        }
      }
    } catch { /* images are optional — a missing thumbnail just renders blank */ }
  }

  // Map items (supports both catalog products and custom items)
  const mappedItems: QuoteItemData[] = items.map((item: any) => {
    const product = item.products;
    const metadata = product?.metadata || {};
    const isCustom = !product;

    return {
      id: item.id,
      image_url: isCustom
        ? (item.custom_image_url || null)
        : (productImageMap[product.id] || metadata?.image_url || null),
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
    cash_discount_pct: parseFloat(quote.cash_discount_pct) || 0,
    currency: quote.currency || 'EUR',
    expires_at: quote.expires_at,
    created_at: quote.created_at,
    items: mappedItems,
    client,
  };
}

/**
 * Resolve client details from the quote's explicit customer fields.
 * 1. customer_company_id → crm_companies (B2B bill-to)
 * 2. customer_contact_id → crm_contacts (B2C bill-to)
 * If neither is set, the PDF renders with empty client details.
 */
async function fetchClientData(
  supabase: SupabaseClient,
  customerCompanyId?: string | null,
  customerContactId?: string | null,
): Promise<ClientData> {
  const client: ClientData = {
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

  if (customerCompanyId) {
    const { data: company } = await supabase
      .from('crm_companies')
      .select('name, email, phone, address, city, postal_code, country, vat_number')
      .eq('id', customerCompanyId)
      .single();
    if (company) {
      client.company_name = company.name;
      client.email = company.email;
      client.phone = company.phone;
      client.address = company.address;
      client.city = company.city;
      client.postal_code = company.postal_code;
      client.country = company.country;
      client.vat_number = company.vat_number;
      return client;
    }
  }

  if (customerContactId) {
    const { data: contact } = await supabase
      .from('crm_contacts')
      .select('name, email, phone, company, address, city, postal_code, country, vat_number')
      .eq('id', customerContactId)
      .single();
    if (contact) {
      client.contact_name = contact.name;
      client.email = contact.email;
      client.phone = contact.phone;
      client.address = contact.address;
      client.city = contact.city;
      client.postal_code = contact.postal_code;
      client.country = contact.country;
      client.vat_number = contact.vat_number;
      if (contact.company) client.company_name = contact.company;
      return client;
    }
  }

  return client;
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
 * #177 white-label: overlay the quote's workspace business identity (finance_settings)
 * onto the global PDF template's "FROM" block, so each seller's quote renders under
 * their own company name/address/contact/VAT — not the platform default. Only overlays
 * when the workspace has set a business_name; otherwise the global template stands.
 */
export async function applyWorkspaceBranding(
  supabase: SupabaseClient,
  config: TemplateConfig,
  workspaceId: string | null | undefined
): Promise<TemplateConfig> {
  if (!workspaceId) return config;
  try {
    const { data: fs } = await supabase
      .from('finance_settings')
      .select('business_name, business_address, business_street_number, business_city, business_postal_code, business_phone, business_email, business_vat, contact_phone, contact_email')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!fs || !fs.business_name) return config;

    const addressLine = [
      [fs.business_address, fs.business_street_number].filter(Boolean).join(' '),
      [fs.business_postal_code, fs.business_city].filter(Boolean).join(' '),
    ].filter(Boolean).join(', ');

    return {
      ...config,
      company_name: fs.business_name || config.company_name,
      company_address: addressLine || config.company_address,
      company_phone: fs.business_phone || fs.contact_phone || config.company_phone,
      company_email: fs.business_email || fs.contact_email || config.company_email,
      company_vat: fs.business_vat || config.company_vat,
    };
  } catch {
    return config; // non-fatal — fall back to the global template identity
  }
}

/**
 * Fetch a file from Supabase Storage as Uint8Array
 */
export async function fetchStorageFile(
  supabase: SupabaseClient,
  bucket: string,
  path: string
): Promise<Uint8Array | null> {
  // Template backgrounds are optional: a missing one renders the PDF without
  // that image rather than hard-failing generation. Upload them via Quote
  // Settings for branded output.
  try {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error || !data) {
      console.warn(`[generate-quote-pdf] Missing template image: ${bucket}/${path} — rendering without it.`);
      return null;
    }
    return new Uint8Array(await data.arrayBuffer());
  } catch (e) {
    console.warn(`[generate-quote-pdf] Failed to fetch template image ${bucket}/${path}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Fetch an item thumbnail from its (public) URL as Uint8Array. Defensive: only
 * https(s), 8 MB cap, image/* only — a failure just renders a blank thumbnail
 * cell rather than breaking PDF generation.
 */
export async function fetchImageBytesFromUrl(url: string): Promise<Uint8Array | null> {
  try {
    if (!/^https?:\/\//i.test(url)) return null;
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (ct && !ct.startsWith('image/')) return null;
    const buf = new Uint8Array(await resp.arrayBuffer());
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null;
    return buf;
  } catch {
    return null;
  }
}
