import type { DbClient } from '../_shared/supabase-client.ts';
import { SupabaseClient } from '@supabase/supabase-js';
import { QuoteData, QuoteItemData, ClientData, TemplateConfig } from './types.ts';
import { HttpError } from '../_shared/api-logger.ts';

import { fetchImageGuardedOrNull } from '../_shared/fetch-image.ts';
import { lineDetailLabel } from '../_shared/finance/configured-options.ts';
/**
 * Fetch complete quote data including items with product details
 */
export async function fetchQuoteData(
  supabase: DbClient,
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
      selected_attributes,
      configured_options,
      unit_price,
      discounted_price,
      line_total,
      pricing_status,
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

  // "call for price" / awaiting-supplier lines legitimately carry a NULL
  // price and render as "Call for price" (excluded from totals). Only a line that claims
  // to be `priced` yet has no unit_price is a genuine data error worth blocking on.
  const brokenPricedItems = items.filter(
    (item: any) =>
      (item.pricing_status ?? 'priced') === 'priced' &&
      (item.unit_price === null || item.unit_price === undefined)
  );
  if (brokenPricedItems.length > 0) {
    throw new HttpError(
      400,
      `Cannot generate PDF: ${brokenPricedItems.length} item(s) are missing prices. Set all item prices first.`
    );
  }

  const client = await fetchClientData(
    supabase,
    quote.customer_company_id ?? null,
    quote.customer_contact_id ?? null,
  );

  // #374 Phase 8 — the image for each LINE, from the one derivation the quote screen also uses.
  //
  // This previously read the associations directly with NO `order by overall_score`, while
  // QuotesService.getQuote ordered by it — so the PDF and the screen could disagree about which
  // photo represents a product. Now both ask `get_product_variant_images`, which prefers the
  // chosen variant's own photo and never returns another variant's.
  const productImageMap: Record<string, string> = {};
  const productIds = items.map((i: any) => i.products?.id).filter(Boolean);
  if (productIds.length > 0) {
    try {
      const { data: imageRows } = await supabase.rpc('get_product_variant_images', {
        p_pairs: items
          .filter((it: any) => it.products?.id)
          .map((it: any) => ({
            product_id: it.products.id,
            // The raw map, canonicalised by SQL `_variant_key`. Deno has no copy of the
            // TypeScript twin and must not grow one — that is how five registries happened.
            attributes: it.selected_attributes ?? {},
          })),
      });
      for (const r of (imageRows ?? []) as Array<{ product_id: string; image_url: string | null }>) {
        if (r.image_url && !productImageMap[r.product_id]) productImageMap[r.product_id] = r.image_url;
      }
    } catch { /* images are optional — a missing thumbnail just renders blank */ }
  }

  // #374 Phase 6 — one round trip for every line's variant label. Derived in SQL because the
  // rule needs the field registry (which keys are identity axes, which are internal and must
  // never reach a customer's PDF) and re-implementing that here would be a second copy of it.
  // Best-effort: a quote must still render when the registry is unreachable.
  const variantLabels: Record<string, string> = {};
  try {
    const { data: labels } = await supabase.rpc('get_variant_labels', {
      p_rows: items.map((it: any) => ({
        key: it.id,
        product_id: it.product_id ?? null,
        attributes: it.selected_attributes ?? {},
      })),
    });
    for (const r of (labels ?? []) as Array<{ row_key: string; label: string | null }>) {
      if (r.label) variantLabels[r.row_key] = r.label;
    }
  } catch { /* labels are an aid; the line still prints without them */ }

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
      // Variant AND configuration (#375). The configurator's choices are inside `unit_price` as
      // deltas, so a quote that prints only the product name states a figure the customer cannot
      // account for. Read from the line's frozen `configured_options`, never from a live lookup.
      variant_label: lineDetailLabel(variantLabels[item.id] ?? null, item.configured_options) || null,
      quantity: item.quantity,
      unit: isCustom ? (item.custom_unit || 'pcs') : (metadata?.unit || 'pcs'),
      unit_price: parseFloat(item.unit_price) || 0,
      discounted_price: item.discounted_price != null ? parseFloat(item.discounted_price) : null,
      line_total: parseFloat(item.line_total) || 0,
      pricing_status: item.pricing_status || 'priced',
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
  supabase: DbClient,
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
 * Fetch a file from Supabase Storage as Uint8Array
 */
export async function fetchStorageFile(
  supabase: DbClient,
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
/** A byte-identical twin of the copy in _shared/pdf/branding.ts, with the same three
 *  faults: `http://` accepted, `redirect: 'follow'`, and an 8 MB cap consulted only
 *  after arrayBuffer() had already read everything. Sixth implementation of this. */
export async function fetchImageBytesFromUrl(url: string): Promise<Uint8Array | null> {
  const img = await fetchImageGuardedOrNull(url);
  return img?.bytes ?? null;
}
