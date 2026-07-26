// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

// #207 — Public online storefront (public link / mini-store).
//
// Anonymous, no auth. Three actions (discriminated by `action`):
//   • meta     {slug}                         → storefront config + workspace branding
//   • products {slug}                         → published products with gross prices
//   • checkout {slug, items[], customer}      → recompute server-side, create a DRAFT 11.1
//                                               retail receipt + items, mint a pay token,
//                                               return /pay/:token (existing Stripe flow).
//
// Prices are ALWAYS recomputed from product_prices server-side — the client cart is never
// trusted for amounts. The order is a draft until the buyer pays (existing stripe-webhooks
// flips it to paid), so abandoned carts never burn a legal receipt number.

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const publicAppUrl = () => Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Pull a usable image URL out of the product's metadata jsonb (best-effort, schema-loose). */
function imageFromMetadata(meta: any): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const direct = meta.image_url || meta.thumbnail_url || meta.primary_image || meta.image || meta.cover_image;
  if (typeof direct === 'string' && direct.startsWith('http')) return direct;
  const arr = meta.images || meta.gallery;
  if (Array.isArray(arr) && arr.length) {
    const first = arr[0];
    if (typeof first === 'string' && first.startsWith('http')) return first;
    if (first && typeof first.url === 'string') return first.url;
  }
  return null;
}

Deno.serve(withApiLogging('finance-storefront', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const action = body?.action as string;
  const slug = String(body?.slug ?? '').trim();
  if (!action || !slug) return json({ error: 'action and slug are required' }, 400);

  try {
    // Resolve the workspace + its storefront config from the public slug.
    const { data: ws } = await supabase.from('workspaces').select('id, name, slug').eq('slug', slug).maybeSingle();
    if (!ws) return json({ error: 'store not found' }, 404);
    const { data: store } = await supabase.from('workspace_storefront').select('*').eq('workspace_id', ws.id).maybeSingle();
    const enabled = !!store?.enabled;

    if (action === 'meta') {
      if (!enabled) return json({ ok: true, enabled: false });
      return json({
        ok: true, enabled: true, workspace_name: ws.name,
        headline: store?.headline ?? ws.name, subheadline: store?.subheadline ?? null, accent: store?.accent ?? null,
      });
    }

    if (!enabled) return json({ error: 'store is not open' }, 403);

    if (action === 'products') {
      const { data: rows } = await supabase
        .from('product_prices')
        .select('product_id, list_price, currency, unit, product:products(id, name, description, metadata, item_type)')
        .eq('workspace_id', ws.id).eq('storefront_published', true).not('list_price', 'is', null);
      // #227 — list_price is NET (ex-VAT) everywhere; the consumer storefront shows the
      // VAT-inclusive price, so add VAT here for display.
      const { data: fsP } = await supabase.from('finance_settings').select('default_vat_rate').eq('workspace_id', ws.id).maybeSingle();
      const vatP = Number(fsP?.default_vat_rate ?? 24);
      const products = (rows ?? [])
        .filter((r: any) => r.product)
        .map((r: any) => ({
          product_id: r.product_id,
          name: r.product.name,
          description: r.product.description ?? null,
          unit: r.unit ?? null,
          item_type: r.product.item_type ?? 'good',
          price: round2(Number(r.list_price) * (1 + vatP / 100)),
          currency: r.currency ?? 'EUR',
          image_url: imageFromMetadata(r.product.metadata),
        }));
      return json({ ok: true, products });
    }

    if (action === 'checkout') {
      const items: { product_id: string; qty: number }[] = Array.isArray(body?.items) ? body.items : [];
      const customer = body?.customer ?? {};
      const clean = items.filter((i) => i?.product_id && Number(i.qty) > 0);
      if (clean.length === 0) return json({ error: 'cart is empty' }, 400);
      if (!customer?.email || !customer?.name) return json({ error: 'name and email are required' }, 400);

      // #212 — checkout creates a fiscal retail receipt, so the selling workspace must own the
      // Finance module. (Browse actions above stay open so a store can showcase products.)
      const ent = await assertEntitled(supabase, ws.id, 'sales-finance');
      if (!ent.ok) return ent.response;

      // Recompute every line from the DB — the client cart never sets a price.
      const ids = [...new Set(clean.map((i) => i.product_id))];
      const { data: priceRows } = await supabase
        .from('product_prices')
        .select('product_id, list_price, currency, unit, product:products(name, mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category)')
        .eq('workspace_id', ws.id).eq('storefront_published', true).in('product_id', ids);
      const priceById = new Map<string, any>();
      for (const r of priceRows ?? []) priceById.set((r as any).product_id, r);

      const { data: fs } = await supabase.from('finance_settings').select('default_vat_rate').eq('workspace_id', ws.id).maybeSingle();
      const vatRate = Number(fs?.default_vat_rate ?? 24);

      let currency = 'EUR';
      let totalGross = 0;
      const lines: any[] = [];
      for (const it of clean) {
        const pr = priceById.get(it.product_id);
        if (!pr || pr.list_price == null) return json({ error: 'a product is no longer available' }, 409);
        currency = pr.currency ?? currency;
        const qty = Math.min(Number(it.qty), 9999);
        // #227 — list_price is NET (ex-VAT); add VAT to get the consumer gross, keep net per line for myDATA.
        const unitNet = Number(pr.list_price);
        const unitGross = round2(unitNet * (1 + vatRate / 100));
        totalGross += round2(unitGross * qty);
        lines.push({
          description: pr.product?.name ?? 'Item', quantity: qty,
          unit_price: unitNet, net_value: round2(unitNet * qty), line_total: round2(unitNet * qty),
          vat_category: pr.product?.mydata_vat_category ?? null,
          income_classification_type: pr.product?.mydata_income_classification_type ?? null,
          income_classification_category: pr.product?.mydata_income_classification_category ?? null,
          product_id: it.product_id,
        });
      }
      totalGross = round2(totalGross);
      const totalNet = round2(totalGross / (1 + vatRate / 100));
      const totalVat = round2(totalGross - totalNet);

      // Guest checkout carries only name+email. The invoices_customer_xor CHECK requires
      // exactly one of customer_company_id / customer_contact_id, so find-or-create a CRM
      // contact by email in this workspace and link it (otherwise every order 500s).
      const custEmail = String(customer.email).trim();
      let contactId: string;
      const { data: existingContacts } = await supabase.from('crm_contacts')
        .select('id').eq('workspace_id', ws.id).ilike('email', custEmail).limit(1);
      if (existingContacts && existingContacts.length > 0) {
        contactId = (existingContacts[0] as any).id;
      } else {
        const { data: newContact, error: cErr } = await supabase.from('crm_contacts')
          .insert({ workspace_id: ws.id, name: String(customer.name).slice(0, 200), email: custEmail })
          .select('id').single();
        if (cErr || !newContact) return json({ error: `could not create customer: ${cErr?.message ?? 'no row returned'}` }, 500);
        contactId = (newContact as any).id;
      }

      // Draft number (no legal-counter advance — abandoned carts can't gap the series).
      const { data: draftNumber, error: numErr } = await supabase.rpc('next_invoice_number', { p_workspace_id: ws.id });
      if (numErr) return json({ error: `numbering failed: ${numErr.message}` }, 500);

      // Optional note the shopper typed at checkout (pickup/delivery instructions, etc.).
      const shopperNote = typeof (body?.note ?? customer?.note) === 'string'
        ? String(body?.note ?? customer?.note).trim().slice(0, 500) : '';
      const orderNotes = `Online store order — ${String(customer.name).slice(0, 120)} <${String(customer.email).slice(0, 160)}>`
        + (shopperNote ? `\nCustomer note: ${shopperNote}` : '');

      const payToken = crypto.randomUUID().replace(/-/g, '');
      const { data: invoice, error: insErr } = await supabase.from('invoices').insert({
        workspace_id: ws.id,
        customer_contact_id: contactId,
        internal_number: draftNumber as string,
        status: 'draft',
        document_type: '11.1',
        currency,
        subtotal_net: totalNet, vat_rate: vatRate, vat_amount: totalVat, total: totalGross,
        prices_include_vat: true,
        payment_method_code: 7, // card (online)
        // Online store sells physical goods → the paid invoice must land on the dispatch board
        // (listDispatchQueue filters has_shipping=true AND status='paid'), where issuing the
        // dispatch note moves stock. Without this the order was a dead end after payment.
        has_shipping: true,
        notes: orderNotes,
        pay_token: payToken,
        pay_token_expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        issued_at: null, due_at: null,
      }).select('id').single();
      if (insErr) return json({ error: `could not create order: ${insErr.message}` }, 500);

      const itemsPayload = lines.map((l) => ({ ...l, invoice_id: (invoice as any).id }));
      const { error: itErr } = await supabase.from('invoice_items').insert(itemsPayload);
      if (itErr) return json({ error: `could not add items: ${itErr.message}` }, 500);

      return json({
        ok: true,
        invoice_id: (invoice as any).id,
        pay_token: payToken,
        pay_url: `${publicAppUrl().replace(/\/$/, '')}/pay/${payToken}`,
        total: totalGross, currency,
      });
    }

    return json({ error: `unknown action: ${action}` }, 400);
  } catch (err: any) {
    console.error('finance-storefront error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
}));
