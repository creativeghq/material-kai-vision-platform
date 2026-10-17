// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { findOrCreateParty, normalizeEmail } from '../_shared/crm-party.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';

// Public online storefront (public link / mini-store).
// Anonymous, no auth.


const publicAppUrl = () => Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr';
import { grossFromNet, round2 } from '../_shared/money.ts';
import { verifyTurnstile, clientIp } from '../_shared/turnstile.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { MYDATA_PAYMENT_CODE } from '../_shared/paymentVocabulary.generated.ts';

import { associatedImagesByProduct, productImages } from '../_shared/product-media.ts';
import {
  PUBLIC_PRODUCT_STATUS, listingKey, loadDefaultVatRate, normaliseVariantKey, productVatPct,
  variantAttrsFromKey as variantAttrs,
} from '../_shared/commerce/public-catalogue.ts';

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
      // The SITE key is public by design — it is rendered into the widget in the page source.
      // Returned here so the storefront knows whether to show a challenge at all: when Turnstile
      // is unconfigured this is null and checkout stays open, matching the server's fail-open.
      const siteKey = (await resolveSecret(supabase, 'TURNSTILE_SITE_KEY').catch(() => ({ value: null })))?.value ?? null;
      // EAA art. 13 + Annex I: the statement belongs on the service, not in a drawer.
      const { data: stmt } = await supabase.from('accessibility_statements')
        .select('body').eq('workspace_id', ws.id).eq('language_code', 'el').maybeSingle();
      return json({
        ok: true, enabled: true, workspace_name: ws.name,
        headline: store?.headline ?? ws.name, subheadline: store?.subheadline ?? null, accent: store?.accent ?? null,
        turnstile_site_key: siteKey,
        accessibility_statement: stmt?.body ?? null,
      });
    }

    if (!enabled) return json({ error: 'store is not open' }, 403);

    if (action === 'products') {
      const { data: rows, error: rowsErr } = await supabase
        .from('product_prices')
        .select('product_id, variant_key, list_price, currency, unit, '
          + 'product:products!inner(id, name, description, metadata, item_type, status, mydata_vat_category)')
        .eq('workspace_id', ws.id).eq('storefront_published', true).not('list_price', 'is', null)
        .eq('product.status', PUBLIC_PRODUCT_STATUS);
      if (rowsErr) return json({ error: 'could not load products' }, 500);
      // list_price is NET (ex-VAT); the consumer storefront shows the VAT-inclusive price.
      const defaultVat = await loadDefaultVatRate(supabase, ws.id);
      // A listing is the product's BASE price row; its published variant rows ride along under it.
      const all = (rows ?? []).filter((r: any) => r.product);
      const listed = all.filter((r: any) => r.variant_key == null);
      const variantsOf = new Map<string, any[]>();
      for (const r of all as any[]) {
        if (r.variant_key == null) continue;
        const list = variantsOf.get(r.product_id) ?? [];
        list.push(r);
        variantsOf.set(r.product_id, list);
      }
      const images = await associatedImagesByProduct(supabase, listed.map((r: any) => r.product_id));
      // GPSR art. 19: the manufacturer contact, the responsible person, the identifier and
      // the warnings travel WITH the offer. Art 2(1) excludes only Chapter III section 1 for
      // CE-marked goods, so a CE mark carves nothing out of this.
      const disclosures = new Map<string, any>();
      await Promise.all(listed.map(async (r: any) => {
        const { data } = await supabase.rpc('product_offer_disclosure', {
          p_product: r.product_id, p_language: 'el',
        });
        if (data) disclosures.set(r.product_id, data);
      }));
      const variantLabels = new Map<string, string | null>();
      const variantRows = [...variantsOf.values()].flat();
      for (let i = 0; i < variantRows.length; i += 500) {
        const { data } = await supabase.rpc('get_variant_labels', {
          p_rows: variantRows.slice(i, i + 500).map((r: any) => ({
            key: listingKey(r.product_id, r.variant_key), product_id: r.product_id, attributes: variantAttrs(r.variant_key),
          })),
        });
        for (const l of (data ?? []) as Array<{ row_key: string; label: string | null }>) {
          variantLabels.set(l.row_key, l.label ?? null);
        }
      }
      const products = listed.map((r: any) => {
        const vat = productVatPct(r.product.mydata_vat_category, defaultVat);
        return {
          product_id: r.product_id,
          name: r.product.name,
          description: r.product.description ?? null,
          unit: r.unit ?? null,
          item_type: r.product.item_type ?? 'good',
          price: grossFromNet(r.list_price, vat),
          vat_percent: vat,
          currency: r.currency ?? 'EUR',
          image_url: productImages(images.get(r.product_id), r.product.metadata)[0] ?? null,
          safety: disclosures.get(r.product_id) ?? null,
          variants: (variantsOf.get(r.product_id) ?? []).map((v: any) => ({
            variant_key: v.variant_key,
            label: variantLabels.get(listingKey(v.product_id, v.variant_key)) ?? null,
            unit: v.unit ?? null,
            price: grossFromNet(v.list_price, vat),
            currency: v.currency ?? 'EUR',
            image_url: productImages(images.get(v.product_id), r.product.metadata, v.variant_key)[0] ?? null,
          })),
        };
      });
      return json({ ok: true, products });
    }

    if (action === 'checkout') {
      const items: { product_id: string; variant_key?: string | null; qty: number }[] =
        Array.isArray(body?.items) ? body.items : [];
      const customer = body?.customer ?? {};
      const clean = items
        .filter((i) => i?.product_id && Number(i.qty) > 0)
        .map((i) => ({
          product_id: String(i.product_id), variant_key: normaliseVariantKey(i.variant_key), qty: Number(i.qty),
        }));
      if (clean.length === 0) return json({ error: 'cart is empty' }, 400);
      if (!customer?.email || !customer?.name) return json({ error: 'name and email are required' }, 400);
      const custEmail = normalizeEmail(customer.email);
      if (!custEmail) return json({ error: 'a valid email address is required' }, 400);

      // Bot gate BEFORE any work: this mints a document, a CRM contact and a pay token from an
      // ANONYMOUS caller. Above the entitlement check on purpose — a 403/400 difference would
      // enumerate which workspaces own Finance.
      const bot = await verifyTurnstile(supabase, body?.turnstile_token, clientIp(req));
      if (!bot.ok) return json({ error: 'Bot check failed. Please try again.' }, 400);

      // Checkout creates a fiscal retail receipt, so the selling workspace must own the
      // Finance module. (Browse actions above stay open so a store can showcase products.)
      const ent = await assertEntitled(supabase, ws.id, 'sales-finance');
      if (!ent.ok) return ent.response;

      // Recompute every line from the DB — the client cart never sets a price.
      const ids = [...new Set(clean.map((i) => i.product_id))];
      const { data: priceRows, error: priceErr } = await supabase
        .from('product_prices')
        .select('product_id, variant_key, list_price, currency, unit, product:products!inner(name, status, '
          + 'mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category)')
        .eq('workspace_id', ws.id).eq('storefront_published', true).in('product_id', ids)
        .eq('product.status', PUBLIC_PRODUCT_STATUS);
      if (priceErr) return json({ error: 'could not price the cart' }, 500);
      const priceByListing = new Map<string, any>();
      for (const r of (priceRows ?? []) as any[]) priceByListing.set(listingKey(r.product_id, r.variant_key), r);

      const defaultVat = await loadDefaultVatRate(supabase, ws.id);

      let currency = 'EUR';
      const lines: any[] = [];
      for (const it of clean) {
        const pr = priceByListing.get(listingKey(it.product_id, it.variant_key));
        if (!pr || pr.list_price == null) return json({ error: 'a product is no longer available' }, 409);
        currency = pr.currency ?? currency;
        const qty = Math.min(it.qty, 9999);
        // list_price is NET (ex-VAT); keep net per line for myDATA.
        const unitNet = Number(pr.list_price);
        const netValue = round2(unitNet * qty);
        const vatPct = productVatPct(pr.product?.mydata_vat_category, defaultVat);
        lines.push({
          description: pr.product?.name ?? 'Item', quantity: qty,
          unit_price: unitNet, net_value: netValue, line_total: netValue,
          vat_amount: round2(netValue * vatPct / 100),
          vat_category: pr.product?.mydata_vat_category ?? null,
          income_classification_type: pr.product?.mydata_income_classification_type ?? null,
          income_classification_category: pr.product?.mydata_income_classification_category ?? null,
          product_id: it.product_id,
          selected_attributes: it.variant_key ? variantAttrs(it.variant_key) : null,
          vat_pct: vatPct,
        });
      }
      // Header derived FROM THE LINES, in one direction only.
      const totalNet = round2(lines.reduce((s, l) => s + l.net_value, 0));
      const totalVat = round2(lines.reduce((s, l) => s + l.vat_amount, 0));
      const totalGross = round2(totalNet + totalVat);
      const rates = new Set(lines.map((l) => l.vat_pct));
      const vatRate = rates.size === 1 ? [...rates][0] : defaultVat;

      // Guest checkout carries only name+email. The invoices_customer_xor CHECK requires
      // exactly one of customer_company_id / customer_contact_id, so find-or-create a CRM
      // contact by email in this workspace and link it (otherwise every order 500s).
      const party = await findOrCreateParty(
        supabase, 'crm_contacts', ws.id, { email: custEmail },
        { name: String(customer.name).slice(0, 200), email: custEmail },
        { nameFallback: 'never' },
      );
      if (party.status === 'unavailable' || party.status === 'failed') {
        return json({ error: `could not create customer: ${party.message}` }, 500);
      }
      const contactId: string = party.id;

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
        // AADE 8.12 — POS / e-POS. Named, not the literal 7: the same table is spelled out
        // elsewhere in a rotated form where 7 means a domestic bank account.
        payment_method_code: MYDATA_PAYMENT_CODE.pos,
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

      const itemsPayload = lines.map((l) => ({
        description: l.description, quantity: l.quantity, unit_price: l.unit_price,
        net_value: l.net_value, line_total: l.line_total, vat_amount: l.vat_amount,
        vat_category: l.vat_category, income_classification_type: l.income_classification_type,
        income_classification_category: l.income_classification_category,
        product_id: l.product_id, selected_attributes: l.selected_attributes,
        invoice_id: (invoice as any).id,
      }));
      const { error: itErr } = await supabase.from('invoice_items').insert(itemsPayload);
      if (itErr) return json({ error: `could not add items: ${itErr.message}` }, 500);

      // If the visitor never pays, no later event fires — this is the only moment the business
      // hears about the order. Best-effort: it must not fail a checkout already completed.
      try {
        await emitFlowEventToWorkspaceRoles(ws.id, ['owner', 'admin'], 'order_created', (uid) => ({
          user_id: uid, type: 'order_created', workspace_id: ws.id,
          invoice_id: (invoice as any).id, order_type: 'sales', status: 'draft',
          source: 'storefront', total: totalGross, currency,
          title: 'New order from your online store',
          body: `${customer.name} placed an order for ${totalGross.toFixed(2)} ${currency}, awaiting payment.`,
          action_url: `/finance?tab=invoices`,
        }));
      } catch { /* the order is recorded; a notification is not worth losing it over */ }

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
