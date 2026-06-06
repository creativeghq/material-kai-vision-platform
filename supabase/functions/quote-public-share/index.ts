/**
 * Public share lookup for quotes.
 *
 * POST /functions/v1/quote-public-share { token, event?, session_id? }
 *   → { quote: { ... } | null, pdf_url: signed-1h-url | null, not_found?: bool }
 *
 * Anonymous-friendly: the route accepts the project anon key in
 * Authorization: Bearer (Supabase enforces this at the gateway), then uses
 * the service role internally to bypass RLS. Only returns quotes where
 * `public_share_token` matches AND `public_share_enabled` is true. The token
 * is a cryptographically random uuid v4, so guessing is infeasible.
 *
 * Every successful lookup writes a `quote_analytics_events` row
 * (view_context='public') so admins can see who is opening the shared link.
 * Passing event:'download' logs a downloaded event instead of a view — the
 * public page calls this just before it opens the signed PDF URL.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { token, event, session_id } = await req.json().catch(() => ({}));

  if (!token || typeof token !== 'string' || token.length < 32) {
    return jsonResponse({ error: 'Invalid token' }, 400);
  }

  // Validate the token + that sharing is currently enabled.
  const { data: quote, error } = await supabase
    .from('quotes')
    .select(
      'id, name, quote_number, status, currency, subtotal, vat_rate, vat_amount, ' +
      'grand_total, extras_total, expires_at, created_at, pdf_storage_path, ' +
      'public_share_enabled, customer_company_id, customer_contact_id, workspace_id',
    )
    .eq('public_share_token', token)
    .maybeSingle();

  if (error || !quote || !quote.public_share_enabled) {
    return jsonResponse({ quote: null, pdf_url: null, not_found: true });
  }

  // Fetch items (catalog + custom).
  const { data: rawItems } = await supabase
    .from('quote_items')
    .select(
      'id, product_id, quantity, selected_size, selected_color, unit_price, ' +
      'discounted_price, line_total, custom_product_name, custom_unit, room, ' +
      'dimensions, products ( name, sku )',
    )
    .eq('quote_id', quote.id)
    .order('added_at', { ascending: true });

  const items = (rawItems ?? []).map((it: any) => {
    const product = it.products;
    const isCustom = !product;
    return {
      id: it.id,
      name: isCustom ? (it.custom_product_name || 'Custom Item') : (product?.name || 'Product'),
      sku: isCustom ? null : (product?.sku ?? null),
      quantity: it.quantity,
      selected_size: it.selected_size ?? null,
      selected_color: it.selected_color ?? null,
      room: it.room ?? null,
      dimensions: it.dimensions ?? null,
      unit_price: it.unit_price != null ? Number(it.unit_price) : null,
      discounted_price: it.discounted_price != null ? Number(it.discounted_price) : null,
      line_total: it.line_total != null ? Number(it.line_total) : null,
    };
  });

  // Resolve a friendly bill-to name (no contact details exposed publicly).
  let client_name: string | null = null;
  if (quote.customer_company_id) {
    const { data: c } = await supabase
      .from('crm_companies').select('name').eq('id', quote.customer_company_id).maybeSingle();
    client_name = c?.name ?? null;
  } else if (quote.customer_contact_id) {
    const { data: c } = await supabase
      .from('crm_contacts').select('name').eq('id', quote.customer_contact_id).maybeSingle();
    client_name = c?.name ?? null;
  }

  // #177 white-label: render the public quote under the seller workspace's identity
  // (business name + logo + contact) instead of the platform default.
  let seller: any = null;
  if (quote.workspace_id) {
    const { data: fs } = await supabase
      .from('finance_settings')
      .select('business_name, business_logo_path, contact_website, contact_phone, contact_email, business_email, business_phone')
      .eq('workspace_id', quote.workspace_id)
      .maybeSingle();
    if (fs?.business_name) {
      let logo_url: string | null = null;
      if (fs.business_logo_path) {
        const { data: pub } = supabase.storage.from('generation-images').getPublicUrl(fs.business_logo_path);
        logo_url = pub?.publicUrl ?? null;
      }
      seller = {
        name: fs.business_name,
        logo_url,
        website: fs.contact_website ?? null,
        phone: fs.contact_phone ?? fs.business_phone ?? null,
        email: fs.contact_email ?? fs.business_email ?? null,
      };
    }
  }

  // Log the public event (best-effort — never block the response).
  const eventType = event === 'download' ? 'downloaded' : 'viewed';
  const sid = (typeof session_id === 'string' && session_id.length > 0)
    ? session_id
    : crypto.randomUUID();
  supabase
    .from('quote_analytics_events')
    .insert({
      event_type: eventType,
      view_context: 'public',
      quote_id: quote.id,
      user_id: null,
      session_id: sid,
      source_page: `/q/${token.slice(0, 8)}…`,
      metadata: {
        user_agent: req.headers.get('user-agent') ?? null,
        method: eventType === 'downloaded' ? 'public_pdf' : undefined,
      },
    })
    .then(() => {});

  // Fresh 1-hour signed URL for the server-generated PDF (if one exists).
  let pdf_url: string | null = null;
  if (quote.pdf_storage_path) {
    const { data: signed } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(quote.pdf_storage_path, 60 * 60);
    pdf_url = signed?.signedUrl ?? null;
  }

  return jsonResponse({
    quote: {
      id: quote.id,
      name: quote.name,
      quote_number: quote.quote_number,
      status: quote.status,
      currency: quote.currency || 'EUR',
      subtotal: quote.subtotal != null ? Number(quote.subtotal) : null,
      vat_rate: quote.vat_rate != null ? Number(quote.vat_rate) : null,
      vat_amount: quote.vat_amount != null ? Number(quote.vat_amount) : null,
      grand_total: quote.grand_total != null ? Number(quote.grand_total) : null,
      extras_total: quote.extras_total != null ? Number(quote.extras_total) : null,
      expires_at: quote.expires_at,
      created_at: quote.created_at,
      client_name,
      items,
    },
    seller,
    pdf_url,
    not_found: false,
  });
});

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
