/**
 * real-estate-rent-invoicing (#281) — recurring rent → Finance.
 *
 * Daily, for every rent charge coming due within the window that has no invoice yet (on an active
 * tenancy with a tenant), creates a DRAFT Finance invoice to the tenant and links it back on the
 * charge. Drafts are never transmitted to myDATA — the PM/operator reviews VAT + doc-type and
 * issues them in Finance. Runs via pg_cron (x-cron-secret).
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { isCronAuthorized } from '../_shared/auth.ts';

const WINDOW_DAYS = 7; // draft the invoice up to a week before the due date

serve(withApiLogging('real-estate-rent-invoicing', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const horizon = new Date(Date.now() + WINDOW_DAYS * 864e5).toISOString().slice(0, 10);

  const { data: charges, error } = await supabase.from('property_rent_charges')
    .select('id, workspace_id, amount, currency, due_date, tenancy:property_tenancies!property_rent_charges_tenancy_id_fkey ( property_id, tenant_contact_id, status, property:properties!property_tenancies_property_id_fkey ( title ) )')
    .eq('status', 'due').is('invoice_id', null).lte('due_date', horizon)
    .limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let created = 0, skipped = 0, failed = 0;
  for (const c of charges ?? []) {
    const t = (c as any).tenancy;
    if (!t || t.status !== 'active' || !t.tenant_contact_id) { skipped++; continue; }
    try {
      const amount = Number(c.amount);
      const title = t.property?.title ?? 'property';
      const { data: draftNumber, error: numErr } = await supabase.rpc('next_invoice_number', { p_workspace_id: c.workspace_id });
      if (numErr) { failed++; continue; }
      const { data: inv, error: invErr } = await supabase.from('invoices').insert({
        workspace_id: c.workspace_id, customer_contact_id: t.tenant_contact_id,
        internal_number: draftNumber as string, status: 'draft', document_type: '1.1',
        currency: c.currency ?? 'EUR', subtotal_net: amount, vat_rate: 0, vat_amount: 0, total: amount,
        notes: `Rent — ${title} — due ${c.due_date}`, issued_at: null, due_at: c.due_date,
      }).select('id').single();
      if (invErr) { failed++; continue; }
      await supabase.from('invoice_items').insert({
        invoice_id: (inv as any).id, description: `Rent — ${title} (${c.due_date})`,
        quantity: 1, unit_price: amount, net_value: amount, vat_amount: 0, line_total: amount,
      });
      await supabase.from('property_rent_charges').update({ invoice_id: (inv as any).id }).eq('id', c.id);
      created++;
    } catch { failed++; }
  }

  return new Response(JSON.stringify({ ok: true, candidates: (charges ?? []).length, created, skipped, failed }), { headers: { 'Content-Type': 'application/json' } });
}));
