// customer-assets-api — the installed base (#343): a customer's equipment, its warranties,
// and its recurring service plans.
//
// One action-discriminated function (merge rule). Every write goes through the RLS-bound USER
// client or a SECURITY DEFINER RPC that calls `assert_workspace_member` — never the service-role
// client trusting a body-supplied id, which is the shape the pentest kept finding (invariant 1).
//
// There is deliberately no `next_due_on` anywhere in here. "When is this next due" is answered by
// the single open row in `customer_asset_service_events`, surfaced by the
// `customer_asset_service_due` view. Completing an occurrence is the only thing that opens the
// next one, and that happens inside `complete_asset_service` so it cannot half-apply.

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, getUserId, userCanAccessWorkspace } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';

// Lazy getters — the bootstrap populates env at handler entry, so a module-load capture
// would read undefined.
const supabaseUrl = () => Deno.env.get('SUPABASE_URL') || '';
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const anonKey = () => Deno.env.get('SUPABASE_ANON_KEY') || '';

/** Invariant 8: build an allowlisted payload; never spread the request body into a write. */
function pick(body: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (body[k] !== undefined) out[k] = body[k];
  return out;
}

const ASSET_WRITABLE = [
  'name', 'brand', 'model', 'serial_number', 'quantity', 'status', 'purchased_on',
  'installed_on', 'location_note', 'notes', 'project_id', 'room_id', 'supplier_company_id',
] as const;

const WARRANTY_WRITABLE = [
  'kind', 'provider_company_id', 'provider_name', 'policy_number', 'starts_on', 'ends_on',
  'coverage_notes', 'document_bucket', 'document_path', 'remind_days_before',
] as const;

const PLAN_WRITABLE = [
  'title', 'instructions', 'interval_months', 'interval_days', 'lead_days',
  'assignee_user_id', 'notify_internal', 'notify_customer', 'is_active',
] as const;

const DEFAULT_WRITABLE = [
  'product_id', 'product_category', 'title', 'instructions', 'interval_months',
  'interval_days', 'lead_days', 'notify_internal', 'notify_customer', 'position', 'is_active',
] as const;

const ASSET_SELECT =
  'id, workspace_id, customer_company_id, customer_contact_id, project_id, room_id, product_id, ' +
  'name, brand, model, serial_number, quantity, status, purchased_on, installed_on, ' +
  'location_note, notes, source_order_id, source_order_item_id, supplier_company_id, ' +
  'created_at, updated_at';

/**
 * Map a Postgres error from one of the RPCs onto an HTTP status. P0002 (the id was not in this
 * workspace) and 42501 (not a member) both become 404, never 403 — a 403 confirms the id exists
 * and hands an outsider an enumeration oracle (invariant 1).
 */
function rpcError(err: { code?: string; message?: string }): never {
  if (err.code === 'P0002' || err.code === '42501') throw new HttpError(404, 'not found');
  if (err.code === '22023') throw new HttpError(400, err.message || 'invalid request');
  throw new HttpError(400, err.message || 'request failed');
}

Deno.serve(withApiLogging('customer-assets-api', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  await bootstrapForFunction();

  const auth = await authenticate(req, { requireUser: true });
  const userId = getUserId(auth);
  if (!auth.success || !userId) throw new HttpError(401, 'Unauthorized');

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? '');
  const workspaceId = body.workspace_id ? String(body.workspace_id) : '';
  if (!workspaceId) throw new HttpError(400, 'workspace_id is required');

  const service = createClient(supabaseUrl(), serviceKey()) as DbClient;
  if (!(await userCanAccessWorkspace(service, userId, workspaceId))) {
    throw new HttpError(404, 'not found');
  }

  // Reads and writes both run in the caller's own RLS context.
  const authHeader = req.headers.get('Authorization') ?? '';
  const db = (auth.supabaseAsUser
    ?? createClient(supabaseUrl(), anonKey(), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })) as DbClient;

  switch (action) {
    // ── Assets ──────────────────────────────────────────────────────────────
    case 'list': {
      let q = db.from('customer_assets').select(ASSET_SELECT)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(Math.min(Number(body.limit ?? 200), 500));
      if (body.customer_company_id) q = q.eq('customer_company_id', String(body.customer_company_id));
      if (body.customer_contact_id) q = q.eq('customer_contact_id', String(body.customer_contact_id));
      if (body.project_id) q = q.eq('project_id', String(body.project_id));
      if (body.status) q = q.eq('status', String(body.status));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ assets: data ?? [] });
    }

    case 'get': {
      const assetId = String(body.asset_id ?? '');
      if (!assetId) throw new HttpError(400, 'asset_id is required');
      const { data: asset, error } = await db.from('customer_assets').select(ASSET_SELECT)
        .eq('id', assetId).eq('workspace_id', workspaceId).maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!asset) throw new HttpError(404, 'not found');

      const [warranties, plans, events] = await Promise.all([
        db.from('customer_asset_warranties').select('*').eq('asset_id', assetId).order('ends_on'),
        db.from('customer_asset_service_plans').select('*').eq('asset_id', assetId).order('title'),
        db.from('customer_asset_service_events').select('*').eq('asset_id', assetId)
          .order('due_on', { ascending: false }).limit(100),
      ]);
      return json({
        asset,
        warranties: warranties.data ?? [],
        plans: plans.data ?? [],
        events: events.data ?? [],
      });
    }

    case 'register': {
      const { data, error } = await db.rpc('register_customer_asset', {
        p_workspace_id: workspaceId,
        p_name: String(body.name ?? ''),
        p_customer_company_id: body.customer_company_id ?? null,
        p_customer_contact_id: body.customer_contact_id ?? null,
        p_project_id: body.project_id ?? null,
        p_room_id: body.room_id ?? null,
        p_product_id: body.product_id ?? null,
        p_brand: body.brand ?? null,
        p_model: body.model ?? null,
        p_serial_number: body.serial_number ?? null,
        p_quantity: body.quantity ?? 1,
        p_purchased_on: body.purchased_on ?? null,
        p_installed_on: body.installed_on ?? null,
        p_location_note: body.location_note ?? null,
        p_notes: body.notes ?? null,
        p_source_order_id: body.source_order_id ?? null,
        p_source_order_item_id: body.source_order_item_id ?? null,
        p_supplier_company_id: body.supplier_company_id ?? null,
        p_apply_defaults: body.apply_defaults ?? true,
      });
      if (error) rpcError(error);
      return json({ asset_id: data });
    }

    case 'update': {
      const assetId = String(body.asset_id ?? '');
      if (!assetId) throw new HttpError(400, 'asset_id is required');
      const patch = pick(body, ASSET_WRITABLE);
      if (Object.keys(patch).length === 0) throw new HttpError(400, 'nothing to update');
      const { data, error } = await db.from('customer_assets').update(patch)
        .eq('id', assetId).eq('workspace_id', workspaceId).select(ASSET_SELECT).maybeSingle();
      if (error) throw new HttpError(400, error.message);
      if (!data) throw new HttpError(404, 'not found');
      return json({ asset: data });
    }

    case 'delete': {
      const assetId = String(body.asset_id ?? '');
      if (!assetId) throw new HttpError(400, 'asset_id is required');
      const { error } = await db.from('customer_assets').delete()
        .eq('id', assetId).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ success: true });
    }

    case 'apply_defaults': {
      // Re-run product defaults against an asset registered before those defaults existed.
      // Ownership is proven through the RLS-bound client BEFORE the definer RPC is called.
      const assetId = String(body.asset_id ?? '');
      if (!assetId) throw new HttpError(400, 'asset_id is required');
      const { data: owned } = await db.from('customer_assets').select('id')
        .eq('id', assetId).eq('workspace_id', workspaceId).maybeSingle();
      if (!owned) throw new HttpError(404, 'not found');
      const { data, error } = await service.rpc('apply_asset_service_defaults', { p_asset_id: assetId });
      if (error) throw new HttpError(400, error.message);
      return json({ created: data ?? 0 });
    }

    // ── Warranties ──────────────────────────────────────────────────────────
    case 'warranty.save': {
      const warrantyId = body.warranty_id ? String(body.warranty_id) : '';
      const patch = pick(body, WARRANTY_WRITABLE);

      if (warrantyId) {
        const { data, error } = await db.from('customer_asset_warranties').update(patch)
          .eq('id', warrantyId).eq('workspace_id', workspaceId).select('*').maybeSingle();
        if (error) throw new HttpError(400, error.message);
        if (!data) throw new HttpError(404, 'not found');
        return json({ warranty: data });
      }

      const assetId = String(body.asset_id ?? '');
      if (!assetId) throw new HttpError(400, 'asset_id is required');
      const { data: owned } = await db.from('customer_assets').select('id')
        .eq('id', assetId).eq('workspace_id', workspaceId).maybeSingle();
      if (!owned) throw new HttpError(404, 'not found');
      if (!patch.starts_on || !patch.ends_on) throw new HttpError(400, 'starts_on and ends_on are required');

      const { data, error } = await db.from('customer_asset_warranties')
        .insert({ ...patch, workspace_id: workspaceId, asset_id: assetId, created_by: userId })
        .select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      return json({ warranty: data });
    }

    case 'warranty.delete': {
      const id = String(body.warranty_id ?? '');
      if (!id) throw new HttpError(400, 'warranty_id is required');
      const { error } = await db.from('customer_asset_warranties').delete()
        .eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ success: true });
    }

    // ── Service plans ───────────────────────────────────────────────────────
    case 'plan.save': {
      const planId = body.plan_id ? String(body.plan_id) : '';
      const patch = pick(body, PLAN_WRITABLE);

      if (planId) {
        const { data, error } = await db.from('customer_asset_service_plans').update(patch)
          .eq('id', planId).eq('workspace_id', workspaceId).select('*').maybeSingle();
        if (error) throw new HttpError(400, error.message);
        if (!data) throw new HttpError(404, 'not found');
        return json({ plan: data });
      }

      const assetId = String(body.asset_id ?? '');
      if (!assetId) throw new HttpError(400, 'asset_id is required');
      const { data: asset } = await db.from('customer_assets')
        .select('id, installed_on, purchased_on')
        .eq('id', assetId).eq('workspace_id', workspaceId).maybeSingle();
      if (!asset) throw new HttpError(404, 'not found');
      if (!patch.title) throw new HttpError(400, 'title is required');
      if ((patch.interval_months == null) === (patch.interval_days == null)) {
        throw new HttpError(400, 'exactly one of interval_months or interval_days is required');
      }

      const { data, error } = await db.from('customer_asset_service_plans')
        .insert({ ...patch, workspace_id: workspaceId, asset_id: assetId, created_by: userId })
        .select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);

      // Open the first occurrence so a brand-new plan shows on the worklist immediately —
      // a plan with no open event would sit at "never due" and remind nobody, forever.
      const dates = asset as { installed_on?: string | null; purchased_on?: string | null };
      const anchor = String(body.anchor_date ?? '')
        || dates.installed_on
        || dates.purchased_on
        || new Date().toISOString().slice(0, 10);
      await service.rpc('open_next_service_event', {
        p_plan_id: (data as { id: string }).id,
        p_from: anchor,
      });
      return json({ plan: data });
    }

    case 'plan.delete': {
      const id = String(body.plan_id ?? '');
      if (!id) throw new HttpError(400, 'plan_id is required');
      const { error } = await db.from('customer_asset_service_plans').delete()
        .eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ success: true });
    }

    // ── Occurrences ─────────────────────────────────────────────────────────
    case 'service.due': {
      let q = db.from('customer_asset_service_due').select('*')
        .eq('workspace_id', workspaceId)
        .order('due_on', { ascending: true })
        .limit(Math.min(Number(body.limit ?? 200), 500));
      if (body.customer_company_id) q = q.eq('customer_company_id', String(body.customer_company_id));
      if (body.customer_contact_id) q = q.eq('customer_contact_id', String(body.customer_contact_id));
      if (body.project_id) q = q.eq('project_id', String(body.project_id));
      if (body.asset_id) q = q.eq('asset_id', String(body.asset_id));
      if (body.within_lead_time === true) q = q.eq('is_within_lead_time', true);
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ due: data ?? [] });
    }

    case 'service.history': {
      // Everything ever done for this customer, across every unit they own — including work
      // whose schedule has since been deleted (the event keeps its own plan_title).
      let q = db.from('customer_asset_service_history').select('*')
        .eq('workspace_id', workspaceId)
        .order('happened_on', { ascending: false })
        .limit(Math.min(Number(body.limit ?? 200), 500));
      if (body.customer_company_id) q = q.eq('customer_company_id', String(body.customer_company_id));
      if (body.customer_contact_id) q = q.eq('customer_contact_id', String(body.customer_contact_id));
      if (body.project_id) q = q.eq('project_id', String(body.project_id));
      if (body.asset_id) q = q.eq('asset_id', String(body.asset_id));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ history: data ?? [] });
    }

    case 'service.complete':
    case 'service.skip': {
      const eventId = String(body.event_id ?? '');
      if (!eventId) throw new HttpError(400, 'event_id is required');
      const { data, error } = await db.rpc('complete_asset_service', {
        p_event_id: eventId,
        p_completed_on: body.completed_on ?? null,
        p_notes: body.notes ?? null,
        p_cost: body.cost ?? null,
        p_performed_by_name: body.performed_by_name ?? null,
        p_skip: action === 'service.skip',
      });
      if (error) rpcError(error);
      return json({ next_event_id: data });
    }

    // ── Product-level defaults ──────────────────────────────────────────────
    case 'defaults.list': {
      let q = db.from('product_service_defaults').select('*')
        .eq('workspace_id', workspaceId).order('position').order('title');
      if (body.product_id) q = q.eq('product_id', String(body.product_id));
      if (body.product_category) q = q.eq('product_category', String(body.product_category));
      const { data, error } = await q;
      if (error) throw new HttpError(400, error.message);
      return json({ defaults: data ?? [] });
    }

    case 'defaults.save': {
      const id = body.default_id ? String(body.default_id) : '';
      const patch = pick(body, DEFAULT_WRITABLE);
      if (id) {
        const { data, error } = await db.from('product_service_defaults').update(patch)
          .eq('id', id).eq('workspace_id', workspaceId).select('*').maybeSingle();
        if (error) throw new HttpError(400, error.message);
        if (!data) throw new HttpError(404, 'not found');
        return json({ default: data });
      }
      if (!patch.title) throw new HttpError(400, 'title is required');
      if ((patch.product_id == null) === (patch.product_category == null)) {
        throw new HttpError(400, 'set exactly one of product_id or product_category');
      }
      if ((patch.interval_months == null) === (patch.interval_days == null)) {
        throw new HttpError(400, 'exactly one of interval_months or interval_days is required');
      }
      const { data, error } = await db.from('product_service_defaults')
        .insert({ ...patch, workspace_id: workspaceId, created_by: userId })
        .select('*').maybeSingle();
      if (error) throw new HttpError(400, error.message);
      return json({ default: data });
    }

    case 'defaults.delete': {
      const id = String(body.default_id ?? '');
      if (!id) throw new HttpError(400, 'default_id is required');
      const { error } = await db.from('product_service_defaults').delete()
        .eq('id', id).eq('workspace_id', workspaceId);
      if (error) throw new HttpError(400, error.message);
      return json({ success: true });
    }

    default:
      throw new HttpError(400, 'unknown action: ' + (action || '(none)'));
  }
}));
