// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import {
  oxygenGET,
  oxygenPOST,
  OxygenError,
  loadOxygenSettings,
  type OxygenSettings,
} from '../_shared/oxygen/client.ts';
import {
  buildContactPayloadForCompany,
  buildContactPayloadForContact,
  buildNoticePayload,
  buildProductPayloadFromQuoteLine,
} from '../_shared/oxygen/mappers.ts';

// Module: Oxygen pre-invoice creation
// Trigger: admin clicks "Make Pre-Invoice" on an accepted quote
// Endpoint hit at Oxygen: POST /notices (NEVER /invoices — pre-invoice only by design)
// Idempotent: once quotes.oxygen_notice_id is set, returns it without external calls.
// Config: read from `oxygen_settings` table (env fallback only when the row is empty).

interface RequestBody {
  quote_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin'] });
    if (!auth.success) {
      return json({ error: auth.error ?? 'Unauthorized' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json()) as RequestBody;
    if (!body.quote_id) return json({ error: 'quote_id is required' }, 400);

    const settings = await loadOxygenSettings(supabase);
    if (!settings.apiKey || !settings.defaultTaxId24 || !settings.defaultWarehouseId) {
      return json({
        error: 'Oxygen module is not configured. Open /admin/modules/oxygen → Settings to set the API key, default tax id, and warehouse id.',
        missing: {
          api_key: !settings.apiKey,
          default_tax_id_24: !settings.defaultTaxId24,
          default_warehouse_id: !settings.defaultWarehouseId,
        },
      }, 503);
    }

    // 1. Load quote + items + linked customer (contact OR company)
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select(`
        id, status, quote_number, notes, currency,
        customer_contact_id, customer_company_id,
        oxygen_notice_id, oxygen_sync_status,
        items:quote_items(
          id, quantity, unit_price, discounted_price, line_total,
          custom_sku, custom_product_name,
          product:products(id, name, sku, oxygen_product_id, oxygen_tax_id)
        ),
        contact:crm_contacts!customer_contact_id(*),
        company:crm_companies!customer_company_id(*)
      `)
      .eq('id', body.quote_id)
      .single();

    if (quoteErr || !quote) return json({ error: `Quote not found: ${quoteErr?.message ?? body.quote_id}` }, 404);

    // 2. Idempotency — if already synced, short-circuit
    if (quote.oxygen_notice_id) {
      return json({
        ok: true,
        already_synced: true,
        oxygen_notice_id: quote.oxygen_notice_id,
        quote_id: quote.id,
      });
    }

    // 3. Hard gate — only accepted quotes
    if (quote.status !== 'accepted') {
      return json({ error: `Quote status is "${quote.status}", must be "accepted"` }, 409);
    }

    // 4. Customer must be linked
    const customerKind: 'contact' | 'company' | null = quote.company ? 'company' : quote.contact ? 'contact' : null;
    if (!customerKind) {
      return json({ error: 'Quote has no linked customer. Link a contact or company before creating the pre-invoice.' }, 422);
    }

    // 5. Quote must have at least one priced item
    const items = (quote.items ?? []).filter((it: any) => (it.unit_price ?? 0) > 0);
    if (items.length === 0) {
      return json({ error: 'Quote has no priced items.' }, 422);
    }

    // 6. Lock — atomically claim this quote. Two simultaneous admin clicks can
    //    both pass the idempotency check at step 2; without a conditional
    //    update the second click would also create a notice on Oxygen,
    //    leaving us with duplicate notices. Filter on
    //    oxygen_sync_status NOT IN ('syncing','synced') so only one writer
    //    captures the row.
    const { data: claimed, error: claimErr } = await supabase
      .from('quotes')
      .update({
        oxygen_sync_status: 'syncing',
        oxygen_sync_error: null,
      })
      .eq('id', quote.id)
      .or('oxygen_sync_status.is.null,oxygen_sync_status.in.(failed,pending)')
      .select('id');
    if (claimErr) return json({ error: `Failed to lock quote: ${claimErr.message}` }, 500);
    if (!claimed || claimed.length === 0) {
      return json({
        error: 'Another sync is already in progress for this quote (or it has already been synced). Wait and refresh.',
        quote_id: quote.id,
      }, 409);
    }

    try {
      // 7. Resolve Oxygen contact_id (lookup → create if missing)
      const oxygenContactId = await resolveOxygenContactId(
        supabase,
        settings,
        customerKind,
        customerKind === 'company' ? quote.company : quote.contact,
      );

      // 8. Resolve oxygen_product_id for each line that links to a catalog product
      for (const item of items) {
        if (item.product?.id && !item.product.oxygen_product_id) {
          const code = item.product.sku ?? `PROD-${String(item.product.id).slice(0, 8)}`;
          const productPayload = buildProductPayloadFromQuoteLine({
            productName: item.product.name ?? 'Unnamed product',
            productCode: code,
            unitNetAmount: Number(item.unit_price ?? 0),
            saleTaxId: item.product.oxygen_tax_id ?? settings.defaultTaxId24,
            warehouseId: settings.defaultWarehouseId,
          });
          const created = await oxygenPOST(settings, '/products', productPayload);
          item.product.oxygen_product_id = created.id;
          await supabase.from('products').update({
            oxygen_product_id: created.id,
            sku: item.product.sku ?? code,
          }).eq('id', item.product.id);
        }
      }

      // 9. Build notice payload
      const lines = items.map((it: any) => {
        const unitPrice = Number(it.discounted_price ?? it.unit_price ?? 0);
        const code = it.product?.oxygen_product_id ?? it.product?.sku ?? it.custom_sku ?? `LINE-${it.id.slice(0, 8)}`;
        return {
          code,
          quantity: Number(it.quantity ?? 1),
          unit_net_value: unitPrice,
          tax_id: it.product?.oxygen_tax_id ?? settings.defaultTaxId24,
          warehouse_id: settings.defaultWarehouseId,
          description: it.product?.name ?? it.custom_product_name ?? undefined,
        };
      });

      const noticePayload = buildNoticePayload({
        contactId: oxygenContactId,
        issueDate: new Date().toISOString().slice(0, 10),
        notes: [quote.quote_number, quote.notes].filter(Boolean).join(' — ') || undefined,
        defaultTaxId: settings.defaultTaxId24,
        defaultWarehouseId: settings.defaultWarehouseId,
        lines,
      });

      // 10. Create the notice
      const notice = await oxygenPOST(settings, '/notices', noticePayload);

      // 11. Persist sync state
      await supabase.from('quotes').update({
        oxygen_notice_id: notice.id,
        oxygen_contact_id: oxygenContactId,
        oxygen_sync_status: 'synced',
        oxygen_last_sync_at: new Date().toISOString(),
        oxygen_sync_error: null,
      }).eq('id', quote.id);

      return json({
        ok: true,
        oxygen_notice_id: notice.id,
        oxygen_contact_id: oxygenContactId,
        quote_id: quote.id,
        items_count: lines.length,
      });
    } catch (err) {
      const message = err instanceof OxygenError
        ? `Oxygen ${err.method} ${err.path} → ${err.status}: ${err.body}`
        : (err instanceof Error ? err.message : String(err));

      await supabase.from('quotes').update({
        oxygen_sync_status: 'failed',
        oxygen_sync_error: message,
        oxygen_last_sync_at: new Date().toISOString(),
      }).eq('id', quote.id);

      return json({ error: message, quote_id: quote.id }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[oxygen-create-pre-invoice] Unhandled error:', err);
    return json({ error: message }, 500);
  }
});

async function resolveOxygenContactId(
  supabase: any,
  settings: OxygenSettings,
  kind: 'contact' | 'company',
  row: any,
): Promise<string> {
  if (row?.oxygen_contact_id) return row.oxygen_contact_id;

  // Lookup by VAT (companies & B2B contacts) or email (private contacts)
  let lookupQuery = '';
  if (kind === 'company' || row.vat_number) {
    if (!row.vat_number) throw new Error('Company customer is missing vat_number');
    lookupQuery = `?vat=${encodeURIComponent(row.vat_number)}`;
  } else if (row.email) {
    lookupQuery = `?email=${encodeURIComponent(row.email)}`;
  } else {
    throw new Error('Customer must have either vat_number or email for Oxygen lookup');
  }

  let oxygenContactId: string | null = null;
  try {
    const result = await oxygenGET(settings, `/contacts${lookupQuery}`);
    const items: any[] = Array.isArray(result) ? result : (result?.data ?? []);
    if (items.length > 0 && items[0].id) oxygenContactId = items[0].id;
  } catch (err) {
    // Lookup failure is non-fatal — we'll try create. Re-throws if create also fails.
    console.warn('[oxygen] contact lookup failed, will attempt create:', err);
  }

  if (!oxygenContactId) {
    const payload = kind === 'company'
      ? buildContactPayloadForCompany(row)
      : buildContactPayloadForContact(row);
    const created = await oxygenPOST(settings, '/contacts', payload);
    oxygenContactId = created.id;
  }

  if (!oxygenContactId) throw new Error('Could not resolve or create Oxygen contact');

  // Cache on our side
  const tableName = kind === 'company' ? 'crm_companies' : 'crm_contacts';
  await supabase.from(tableName).update({ oxygen_contact_id: oxygenContactId }).eq('id', row.id);

  return oxygenContactId;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
