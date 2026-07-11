// deno-lint-ignore-file no-explicit-any
// Stock Management module API. Promotes the warehouse/inventory feature (previously a Finance tab)
// into a first-class PAID ADD-ON, mirroring hr-api (#252).
//
// SECURITY (pen-test #250 baseline):
//  • authenticate() yields the caller's user id; the gate chain runs on a SERVICE-ROLE client so it
//    can't be spoofed by RLS: userCanAccessWorkspace() (no body-trust tenancy bind, 404 on mismatch),
//    isModuleEnabled('stock') [global publish], assertEntitled(ws,'stock') [402 per-workspace upsell].
//  • The actual data operations run on a USER-JWT client, so Postgres RLS + the SECURITY DEFINER stock
//    RPCs (record_stock_movement / transfer_stock / create_stock_count / post_stock_count) re-enforce
//    membership (reads) and is_workspace_finance_manager + is_workspace_entitled (writes) as the caller.
//    Defense in depth: even if the gate chain were bypassed, RLS still refuses an un-entitled writer.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { isModuleEnabled } from '../_shared/modules/registry.ts';

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const DIRECTIONS = ['in', 'out', 'adjust'];

/** Item fields a client may write on create/update (allowlist — no mass assignment). */
const ITEM_WRITABLE = [
  'name', 'sku', 'unit', 'reorder_point', 'location',
  'barcode', 'serial_number', 'cpv_code', 'taric_code',
  'mydata_classification_type', 'mydata_classification_category',
] as const;

function pick(body: any, cols: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const c of cols) if (body?.[c] !== undefined) out[c] = body[c];
  return out;
}

function num(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(withApiLogging('stock-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  const url = Deno.env.get('SUPABASE_URL')!;
  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // User-scoped client → auth.uid() resolves inside RLS + the SECURITY DEFINER stock RPCs.
  const usr = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }

  const action = String(body?.action ?? '').trim();
  const workspaceId = String(body?.workspace_id ?? '').trim();
  if (!action) return json({ error: 'action is required' }, 400);
  if (!workspaceId) return json({ error: 'workspace_id is required' }, 400);

  // Gate chain (evaluate in strict priority order: access 404 → module 404 → entitlement 402).
  const accessP = userCanAccessWorkspace(svc, userId, workspaceId);
  const moduleP = isModuleEnabled(svc, 'stock');
  const entP = assertEntitled(svc, workspaceId, 'stock');
  if (!(await accessP)) return json({ error: 'not found' }, 404); // 404 (not 403) — no ws-id enumeration
  if (!(await moduleP)) throw new HttpError(404, 'Stock module is not available');
  const ent = await entP;
  if (!ent.ok) return ent.response;

  // Helper: surface a Postgres RLS/guard denial as 403 (not a 500) so the client can react cleanly.
  const denied = (e: any) => /not authorized|permission denied|row-level security|violates row-level/i.test(String(e?.message ?? ''));

  try {
    switch (action) {
      // ── Dashboard ──────────────────────────────────────────────────────────
      case 'overview': {
        const { data, error } = await usr.rpc('stock_overview', { p_workspace_id: workspaceId });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ overview: data ?? {} });
      }
      case 'valuation': {
        const { data, error } = await usr.rpc('stock_valuation', { p_workspace_id: workspaceId });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ valuation: data ?? {} });
      }

      // ── Warehouses ─────────────────────────────────────────────────────────
      case 'list-warehouses': {
        const { data, error } = await usr.from('warehouses').select('*')
          .eq('workspace_id', workspaceId).order('is_default', { ascending: false }).order('name');
        if (error) throw new HttpError(400, error.message);
        return json({ warehouses: data ?? [] });
      }
      case 'ensure-default-warehouse': {
        const { data, error } = await usr.rpc('ensure_default_warehouse', { p_workspace_id: workspaceId });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ warehouse_id: data });
      }
      case 'create-warehouse': {
        const name = String(body?.name ?? '').trim();
        if (!name) return json({ error: 'name is required' }, 400);
        const { data, error } = await usr.from('warehouses').insert({
          workspace_id: workspaceId, name,
          code: body?.code ? String(body.code) : null,
          location: body?.location ? String(body.location) : null,
          is_default: body?.is_default === true,
        }).select('*').single();
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ warehouse: data }, 201);
      }

      // ── Items ──────────────────────────────────────────────────────────────
      case 'list-items': {
        let q = usr.from('warehouse_items').select('*').eq('workspace_id', workspaceId);
        if (body?.warehouse_id) q = q.eq('warehouse_id', String(body.warehouse_id));
        const { data, error } = await q.order('name');
        if (error) throw new HttpError(400, error.message);
        let items: any[] = data ?? [];
        if (body?.low_only === true) items = items.filter((i) => i.reorder_point > 0 && i.qty_on_hand <= i.reorder_point);
        if (body?.search) {
          const s = String(body.search).toLowerCase();
          items = items.filter((i) => `${i.name} ${i.sku ?? ''}`.toLowerCase().includes(s));
        }
        return json({ items });
      }
      case 'list-low-stock': {
        const { data, error } = await usr.from('warehouse_items').select('*')
          .eq('workspace_id', workspaceId).gt('reorder_point', 0).order('name');
        if (error) throw new HttpError(400, error.message);
        const items = (data ?? []).filter((i: any) => i.qty_on_hand <= i.reorder_point);
        return json({ items, count: items.length });
      }
      case 'create-item': {
        const warehouseId = String(body?.warehouse_id ?? '').trim();
        const name = String(body?.name ?? '').trim();
        if (!warehouseId) return json({ error: 'warehouse_id is required' }, 400);
        if (!name) return json({ error: 'name is required' }, 400);
        const fields = pick(body, ITEM_WRITABLE);
        const { data, error } = await usr.from('warehouse_items').insert({
          workspace_id: workspaceId, warehouse_id: warehouseId, name,
          product_id: body?.product_id ? String(body.product_id) : null,
          unit: (fields.unit as string) || 'pcs',
          qty_on_hand: num(body?.qty_on_hand) ?? 0,
          reorder_point: num(body?.reorder_point) ?? 0,
          location: (fields.location as string) ?? null,
          sku: (fields.sku as string) ?? null,
          barcode: (fields.barcode as string) ?? null,
          serial_number: (fields.serial_number as string) ?? null,
          cpv_code: (fields.cpv_code as string) ?? null,
          taric_code: (fields.taric_code as string) ?? null,
          mydata_classification_type: (fields.mydata_classification_type as string) ?? null,
          mydata_classification_category: (fields.mydata_classification_category as string) ?? null,
        }).select('*').single();
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ item: data }, 201);
      }
      case 'update-item': {
        const id = String(body?.item_id ?? '');
        if (!id) return json({ error: 'item_id is required' }, 400);
        const fields = pick(body, ITEM_WRITABLE);
        if (fields.reorder_point !== undefined) fields.reorder_point = num(fields.reorder_point) ?? 0;
        if (!Object.keys(fields).length) return json({ error: 'nothing to update' }, 400);
        const { data, error } = await usr.from('warehouse_items').update(fields)
          .eq('id', id).eq('workspace_id', workspaceId).select('*').maybeSingle();
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        if (!data) return json({ error: 'not found' }, 404);
        return json({ item: data });
      }
      case 'delete-item': {
        const id = String(body?.item_id ?? '');
        if (!id) return json({ error: 'item_id is required' }, 400);
        const { error } = await usr.from('warehouse_items').delete().eq('id', id).eq('workspace_id', workspaceId);
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ ok: true });
      }

      // ── Movements ──────────────────────────────────────────────────────────
      case 'adjust-stock': {
        const id = String(body?.item_id ?? '');
        const direction = String(body?.direction ?? '');
        const quantity = num(body?.quantity);
        if (!id) return json({ error: 'item_id is required' }, 400);
        if (!DIRECTIONS.includes(direction)) return json({ error: `direction must be one of ${DIRECTIONS.join(', ')}` }, 400);
        if (quantity === null || quantity < 0) return json({ error: 'quantity must be a non-negative number' }, 400);
        const { data, error } = await usr.rpc('record_stock_movement', {
          p_item_id: id, p_direction: direction, p_quantity: quantity,
          p_reason: body?.reason ? String(body.reason) : null, p_source_type: 'manual', p_source_id: null,
        });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ qty_on_hand: data });
      }
      case 'transfer': {
        const fromId = String(body?.from_item_id ?? '');
        const toWh = String(body?.to_warehouse_id ?? '');
        const quantity = num(body?.quantity);
        if (!fromId || !toWh) return json({ error: 'from_item_id and to_warehouse_id are required' }, 400);
        if (quantity === null || quantity <= 0) return json({ error: 'quantity must be a positive number' }, 400);
        const { data, error } = await usr.rpc('transfer_stock', { p_from_item_id: fromId, p_to_warehouse_id: toWh, p_qty: quantity });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ target_item_id: data });
      }
      case 'list-movements': {
        let q = usr.from('stock_movements')
          .select('*, item:warehouse_items!stock_movements_item_id_fkey ( id, name, sku, unit )')
          .eq('workspace_id', workspaceId).order('occurred_at', { ascending: false });
        if (body?.item_id) q = q.eq('item_id', String(body.item_id));
        const limit = Math.min(Math.max(Number(body?.limit ?? 100), 1), 500);
        const { data, error } = await q.limit(limit);
        if (error) throw new HttpError(400, error.message);
        return json({ movements: data ?? [] });
      }

      // ── Stock counts (stocktake) ─────────────────────────────────────────────
      case 'list-counts': {
        const { data, error } = await usr.from('stock_counts')
          .select('*, warehouse:warehouses!stock_counts_warehouse_id_fkey ( id, name )')
          .eq('workspace_id', workspaceId).order('created_at', { ascending: false });
        if (error) throw new HttpError(400, error.message);
        return json({ counts: data ?? [] });
      }
      case 'get-count': {
        const id = String(body?.count_id ?? '');
        if (!id) return json({ error: 'count_id is required' }, 400);
        const [{ data: count, error: cErr }, { data: lines, error: lErr }] = await Promise.all([
          usr.from('stock_counts').select('*').eq('id', id).eq('workspace_id', workspaceId).maybeSingle(),
          usr.from('stock_count_lines').select('*').eq('count_id', id).order('name'),
        ]);
        if (cErr) throw new HttpError(400, cErr.message);
        if (lErr) throw new HttpError(400, lErr.message);
        if (!count) return json({ error: 'not found' }, 404);
        return json({ count, lines: lines ?? [] });
      }
      case 'create-count': {
        const warehouseId = String(body?.warehouse_id ?? '');
        if (!warehouseId) return json({ error: 'warehouse_id is required' }, 400);
        const { data, error } = await usr.rpc('create_stock_count', {
          p_workspace_id: workspaceId, p_warehouse_id: warehouseId, p_note: body?.note ? String(body.note) : null,
        });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ count_id: data }, 201);
      }
      case 'update-count-line': {
        const lineId = String(body?.line_id ?? '');
        if (!lineId) return json({ error: 'line_id is required' }, 400);
        const patch: Record<string, unknown> = {};
        if (body?.counted_qty !== undefined) patch.counted_qty = num(body.counted_qty);
        if (body?.note !== undefined) patch.note = body.note === null ? null : String(body.note);
        if (!Object.keys(patch).length) return json({ error: 'nothing to update' }, 400);
        const { data, error } = await usr.from('stock_count_lines').update(patch)
          .eq('id', lineId).eq('workspace_id', workspaceId).select('*').maybeSingle();
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        if (!data) return json({ error: 'not found' }, 404);
        return json({ line: data });
      }
      case 'post-count': {
        const id = String(body?.count_id ?? '');
        if (!id) return json({ error: 'count_id is required' }, 400);
        const { data, error } = await usr.rpc('post_stock_count', { p_count_id: id });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ result: data });
      }
      case 'cancel-count': {
        const id = String(body?.count_id ?? '');
        if (!id) return json({ error: 'count_id is required' }, 400);
        const { error } = await usr.rpc('cancel_stock_count', { p_count_id: id });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ ok: true });
      }

      // ── Pending intake (AI-extracted from inbound expenses) ──────────────────
      case 'list-pending': {
        const { data, error } = await usr.from('warehouse_pending_items').select('*')
          .eq('workspace_id', workspaceId).eq('status', 'pending').order('created_at', { ascending: false });
        if (error) throw new HttpError(400, error.message);
        return json({ pending: data ?? [] });
      }
      case 'approve-pending': {
        const id = String(body?.pending_id ?? '');
        if (!id) return json({ error: 'pending_id is required' }, 400);
        const { data, error } = await usr.rpc('approve_pending_warehouse_item', {
          p_id: id, p_overrides: body?.overrides ?? {},
        });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ warehouse_item_id: data });
      }
      case 'dismiss-pending': {
        const id = String(body?.pending_id ?? '');
        if (!id) return json({ error: 'pending_id is required' }, 400);
        const { error } = await usr.rpc('dismiss_pending_warehouse_item', { p_id: id });
        if (error) throw new HttpError(denied(error) ? 403 : 400, error.message);
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error('[stock-api] unexpected error:', e);
    return json({ error: (e as Error).message || 'internal error' }, 500);
  }
}));
