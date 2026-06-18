import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface QuoteDocumentItem {
  id: string;
  product_name: string;
  description: string | null;
  sku: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  discounted_price: number | null;
  line_total: number;
  selected_size: string | null;
  selected_color: string | null;
  // FF&E fields
  room: string | null;
  dimensions: string | null;
  installation_requirements: string | null;
  delivery_date: string | null;
}

export interface QuoteDocumentClient {
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

export interface QuoteTemplateConfig {
  first_page_url: string | null;
  intro_page_url: string | null;
  company_details_page_url: string | null;
  content_page_url: string | null;
  last_page_url: string | null;
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_vat: string;
  vat_rate_default: number;
}

export interface QuoteDocumentData {
  id: string;
  quote_number: string | null;
  name: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  expires_at: string | null;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  grand_total: number;
  currency: string;
  items: QuoteDocumentItem[];
  client: QuoteDocumentClient;
  template: QuoteTemplateConfig;
}

function getSignedUrl(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  return supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600)
    .then(({ data }) => data?.signedUrl ?? null);
}

export function useQuoteDocument(quoteId: string) {
  const [data, setData] = useState<QuoteDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!quoteId) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Fetch quote
        const { data: quote, error: qErr } = await supabase
          .from('quotes')
          .select('*')
          .eq('id', quoteId)
          .single();

        if (qErr || !quote) throw new Error(qErr?.message || 'Quote not found');

        // Fetch items with product info
        const { data: rawItems, error: iErr } = await supabase
          .from('quote_items')
          .select(`
            id, quantity, notes, selected_size, selected_color, unit_price, discounted_price, line_total,
            custom_product_name, custom_product_description, custom_sku, custom_unit,
            room, dimensions, installation_requirements, delivery_date,
            products ( id, name, metadata )
          `)
          .eq('quote_id', quoteId)
          .order('added_at', { ascending: true });

        if (iErr) throw new Error(iErr.message);

        const items: QuoteDocumentItem[] = (rawItems || []).map((item: any) => {
          const product = item.products;
          const meta = product?.metadata || {};
          const isCustom = !product;
          return {
            id: item.id,
            product_name: isCustom
              ? (item.custom_product_name || 'Custom Item')
              : (product?.name || 'Unknown Product'),
            description: isCustom
              ? (item.custom_product_description || null)
              : (meta.description || null),
            sku: isCustom ? (item.custom_sku || null) : (meta.sku || null),
            quantity: item.quantity,
            unit: isCustom ? (item.custom_unit || 'pcs') : (meta.unit || 'pcs'),
            unit_price: parseFloat(item.unit_price) || 0,
            discounted_price: item.discounted_price != null ? parseFloat(item.discounted_price) : null,
            line_total: parseFloat(item.line_total) || 0,
            selected_size: item.selected_size || null,
            selected_color: item.selected_color || null,
            room: item.room || null,
            dimensions: item.dimensions || null,
            installation_requirements: item.installation_requirements || null,
            delivery_date: item.delivery_date || null,
          };
        });

        // Fetch client (CRM chain → profile fallback)
        const client = await resolveClient(quote.user_id);

        // Fetch template config — non-fatal, defaults to empty if not configured
        let cfg: Record<string, any> = {};
        try {
          const { data: settingRow } = await supabase
            .from('system_settings')
            .select('setting_value')
            .eq('setting_key', 'quote_pdf_template')
            .maybeSingle();
          cfg = (settingRow?.setting_value as Record<string, any>) || {};
        } catch {
          // No template configured yet — continue with empty config
        }

        // Resolve signed URLs for template images
        const [firstUrl, introUrl, detailsUrl, contentUrl, lastUrl] = await Promise.all([
          getSignedUrl('quote-templates', cfg.first_page_path || cfg.cover_image_path || null),
          getSignedUrl('quote-templates', cfg.intro_page_path || null),
          getSignedUrl('quote-templates', cfg.company_details_page_path || null),
          getSignedUrl('quote-templates', cfg.content_page_path || cfg.items_background_path || null),
          getSignedUrl('quote-templates', cfg.last_page_path || cfg.backcover_image_path || null),
        ]);

        const template: QuoteTemplateConfig = {
          first_page_url: firstUrl,
          intro_page_url: introUrl,
          company_details_page_url: detailsUrl,
          content_page_url: contentUrl,
          last_page_url: lastUrl,
          company_name: cfg.company_name || '',
          company_address: cfg.company_address || '',
          company_phone: cfg.company_phone || '',
          company_email: cfg.company_email || '',
          company_vat: cfg.company_vat || '',
          vat_rate_default: cfg.vat_rate_default ?? 24,
        };

        setData({
          id: quote.id,
          quote_number: quote.quote_number || null,
          name: quote.name || null,
          status: quote.status,
          notes: quote.notes || null,
          created_at: quote.created_at,
          expires_at: quote.expires_at || null,
          subtotal: parseFloat(quote.subtotal) || 0,
          vat_rate: parseFloat(quote.vat_rate) || 24,
          vat_amount: parseFloat(quote.vat_amount) || 0,
          grand_total: parseFloat(quote.grand_total) || 0,
          currency: quote.currency || 'EUR',
          items,
          client,
          template,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load quote');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [quoteId]);

  return { data, loading, error };
}

async function resolveClient(userId: string): Promise<QuoteDocumentClient> {
  const empty: QuoteDocumentClient = {
    contact_name: null, company_name: null, email: null,
    phone: null, address: null, city: null,
    postal_code: null, country: null, vat_number: null,
  };

  const { data: contact } = await supabase
    .from('crm_contacts')
    .select('id, name, email, phone, company, address, city, postal_code, country')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (contact) {
    empty.contact_name = contact.name;
    empty.email = contact.email;
    empty.phone = contact.phone;
    empty.address = contact.address;
    empty.city = contact.city;
    empty.postal_code = contact.postal_code;
    empty.country = contact.country;

    const { data: companyLink } = await supabase
      .from('crm_company_contacts')
      .select('company_id')
      .eq('contact_id', contact.id)
      .limit(1)
      .maybeSingle();

    if (companyLink) {
      const { data: company } = await supabase
        .from('crm_companies')
        .select('name, vat_number, address, city, postal_code, country')
        .eq('id', companyLink.company_id)
        .single();

      if (company) {
        empty.company_name = company.name;
        empty.vat_number = company.vat_number;
        if (!empty.address) {
          empty.address = company.address;
          empty.city = company.city;
          empty.postal_code = company.postal_code;
          empty.country = company.country;
        }
      }
    }

    if (!empty.company_name && contact.company) {
      empty.company_name = contact.company;
    }

    return empty;
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('user_id', userId)
    .maybeSingle();

  if (profile) {
    empty.contact_name = profile.full_name;
    empty.email = profile.email;
  }

  return empty;
}
