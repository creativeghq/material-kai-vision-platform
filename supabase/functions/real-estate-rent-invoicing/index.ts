/**
 * real-estate-rent-invoicing — recurring rent → Finance.
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
import { createRentInvoiceForCharge } from '../_shared/real-estate.ts';

const WINDOW_DAYS = 7; // draft the invoice up to a week before the due date

serve(withApiLogging('real-estate-rent-invoicing', async (req) => {
  await bootstrapForFunction();
  if (!isCronAuthorized(req)) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const horizon = new Date(Date.now() + WINDOW_DAYS * 864e5).toISOString().slice(0, 10);

  const { data: charges, error } = await supabase.from('property_rent_charges')
    .select('id, workspace_id, amount, currency, due_date, tenancy:property_tenancies!property_rent_charges_tenancy_id_fkey ( property_id, tenant_contact_id, status, property:properties!property_tenancies_property_id_fkey ( title ) )')
    .in('status', ['due', 'overdue']).is('invoice_id', null).lte('due_date', horizon)
    .limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  let created = 0, skipped = 0, failed = 0;
  for (const c of charges ?? []) {
    const t = (c as any).tenancy;
    if (!t || t.status !== 'active' || !t.tenant_contact_id) { skipped++; continue; }
    try {
      // Shared with the invoice-rent-charge API action (single source — no VAT/doc-type/numbering drift).
      await createRentInvoiceForCharge(supabase, {
        workspaceId: c.workspace_id, chargeId: c.id, tenantContactId: t.tenant_contact_id,
        amount: Number(c.amount), currency: c.currency ?? 'EUR', dueDate: c.due_date,
        propertyTitle: t.property?.title ?? 'property',
      });
      created++;
    } catch { failed++; }
  }

  return new Response(JSON.stringify({ ok: true, candidates: (charges ?? []).length, created, skipped, failed }), { headers: { 'Content-Type': 'application/json' } });
}));
