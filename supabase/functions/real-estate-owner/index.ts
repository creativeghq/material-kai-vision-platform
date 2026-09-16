import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { toOwner, withRentSettlements } from '../_shared/real-estate.ts';

type Row = Record<string, unknown>;
const num = (x: unknown) => Number(x ?? 0);

Deno.serve(withApiLogging('real-estate-owner', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  await bootstrapForFunction();

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);
  const userId = auth.userId;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: Row;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
  const action = String(body?.action ?? '').trim();

  const { data: grants } = await supabase.from('record_guests')
    .select('record_id, workspace_id, role, accepted_at')
    .eq('user_id', userId).eq('record_type', 'property').eq('role', 'owner')
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  const byProperty = new Map((grants ?? []).map((g: Row) => [String(g.record_id), g]));

  if (action === 'list') {
    const ids = [...byProperty.keys()];
    if (!ids.length) return json({ properties: [] });
    const { data: rows } = await supabase.from('properties')
      .select('*').in('id', ids);
    const { data: photos } = await supabase.from('property_photos')
      .select('property_id, storage_path, is_cover, sort_order').in('property_id', ids).order('sort_order');
    const coverByProperty = new Map<string, string>();
    for (const ph of (photos ?? []) as Row[]) {
      const pid = String(ph.property_id);
      if (!coverByProperty.has(pid) || ph.is_cover) coverByProperty.set(pid, String(ph.storage_path));
    }
    return json({
      properties: ((rows ?? []) as Row[]).map((r) => ({
        ...toOwner(r),
        cover_path: coverByProperty.get(String(r.id)) ?? null,
      })),
    });
  }

  if (action !== 'get') return json({ error: 'unknown action' }, 400);

  const propertyId = String(body?.property_id ?? '').trim();
  const grant = byProperty.get(propertyId);
  if (!grant) throw new HttpError(404, 'not found');
  const workspaceId = String(grant.workspace_id);

  const { data: property } = await supabase.from('properties')
    .select('*').eq('id', propertyId).eq('workspace_id', workspaceId).maybeSingle();
  if (!property) throw new HttpError(404, 'not found');

  const [{ data: perfRows }, { data: viewings }, { data: offers }, { data: priceHistory },
    { data: inquiryRows }, { data: tenancies }] = await Promise.all([
    supabase.rpc('get_property_performance', { p_property_ids: [propertyId] }),
    supabase.from('property_viewings')
      .select('scheduled_at, status, feedback')
      .eq('property_id', propertyId).eq('workspace_id', workspaceId)
      .eq('hidden_from_vendor', false)
      .order('scheduled_at', { ascending: false }).limit(20),
    supabase.from('property_offers')
      .select('amount, currency, status, created_at')
      .eq('property_id', propertyId).eq('workspace_id', workspaceId),
    supabase.from('property_price_history')
      .select('price, currency, changed_at')
      .eq('property_id', propertyId).eq('workspace_id', workspaceId)
      .order('changed_at', { ascending: false }).limit(20),
    supabase.from('property_inquiries')
      .select('id', { count: 'exact', head: false })
      .eq('property_id', propertyId).eq('workspace_id', workspaceId),
    supabase.from('property_tenancies')
      .select('id, status, rent_amount, currency, rent_frequency, deposit, deposit_scheme, deposit_protected_at, start_date, end_date, next_rent_review_date, notice_given_at, termination_date, tenant_contact_id')
      .eq('property_id', propertyId).eq('workspace_id', workspaceId)
      .order('start_date', { ascending: false }),
  ]);

  const live = ((offers ?? []) as Row[]).filter((o) => o.status !== 'withdrawn' && o.status !== 'rejected');
  const offerSummary = {
    total: ((offers ?? []) as Row[]).length,
    live: live.length,
    highest: live.length ? Math.max(...live.map((o) => num(o.amount))) : null,
    currency: ((offers ?? []) as Row[])[0]?.currency ?? property.currency ?? 'EUR',
    leading_status: live.length
      ? (live.find((o) => o.status === 'accepted')?.status ?? live[0].status)
      : null,
    latest_at: ((offers ?? []) as Row[]).map((o) => String(o.created_at)).sort().pop() ?? null,
  };

  const { data: entManagement } = await supabase.rpc('is_workspace_entitled', {
    p_workspace_id: workspaceId, p_module_slug: 'real-estate-management',
  });

  let management: Record<string, unknown> | null = null;
  const tenancy = (tenancies ?? [])[0] ?? null;
  if (entManagement && tenancy) {
    const [{ data: charges }, { data: jobs }, { data: inspections }] = await Promise.all([
      supabase.from('property_rent_charges')
        .select('id, due_date, amount, currency, status, paid_amount, invoice_id')
        .eq('tenancy_id', String(tenancy.id)).eq('workspace_id', workspaceId)
        .order('due_date', { ascending: false }).limit(24),
      supabase.from('property_maintenance')
        .select('id, title, status, priority, reported_at, resolved_at')
        .eq('tenancy_id', String(tenancy.id)).eq('workspace_id', workspaceId)
        .order('reported_at', { ascending: false }).limit(20),
      supabase.from('property_tenancy_inspections')
        .select('id, inspection_type, scheduled_for, completed_at, condition_rating')
        .eq('tenancy_id', String(tenancy.id)).eq('workspace_id', workspaceId)
        .order('scheduled_for', { ascending: false }).limit(10),
    ]);
    const settled = await withRentSettlements(supabase, charges ?? []);
    management = {
      tenancy,
      rent: {
        charged: settled.filter((c: Row) => c.payment_status !== 'waived').reduce((s: number, c: Row) => s + num(c.amount), 0),
        received: settled.reduce((s: number, c: Row) => s + num(c.settled), 0),
        outstanding: settled.reduce((s: number, c: Row) => s + num(c.outstanding), 0),
        currency: tenancy.currency ?? 'EUR',
      },
      charges: settled.map((c: Row) => ({
        id: c.id, due_date: c.due_date, amount: c.amount, currency: c.currency,
        settled: c.settled, outstanding: c.outstanding, payment_status: c.payment_status,
      })),
      maintenance: jobs ?? [],
      inspections: inspections ?? [],
    };
  }

  return json({
    property: toOwner(property),
    performance: (perfRows ?? [])[0] ?? null,
    enquiries: (inquiryRows ?? []).length,
    viewings: viewings ?? [],
    offers: offerSummary,
    price_history: priceHistory ?? [],
    management,
    management_available: !!entManagement,
  });
}));
