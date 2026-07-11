// Stock Management agent toolkit. Lets a workspace owner/admin (or finance manager) ask the KAI agent
// natural-language inventory questions ("what's low on stock?", "how many X do we have?", "receive 20
// units of Y") from chat, instead of navigating the /stock module UI.
//
// DESIGN: a thin natural-language front-end over the existing `stock-api` edge function. It calls
// stock-api over HTTP with the CALLER'S JWT, so stock-api authenticates AS the user and applies its
// full security stack (workspace binding via userCanAccessWorkspace, isModuleEnabled('stock'),
// assertEntitled(ws,'stock') 402, and the RLS/RPC finance-manager guards on writes). We re-implement
// NONE of that here; workspace_id is server-derived (never model-supplied).

// deno-lint-ignore-file no-explicit-any

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const MODULE_SLUG = 'stock';
const DIRECTIONS = ['in', 'out', 'adjust'] as const;

function svcClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/** Call a stock-api action AS the user (so all stock-api RBAC/entitlement applies). */
async function callStockApi(jwt: string, workspaceId: string, action: string, extra: Record<string, unknown> = {}): Promise<any> {
  try {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/stock-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, workspace_id: workspaceId, ...extra }),
    });
    const bodyText = await resp.text();
    let parsed: any = {};
    try { parsed = bodyText ? JSON.parse(bodyText) : {}; } catch { parsed = { error: bodyText }; }
    if (!resp.ok) return { ok: false, status: resp.status, error: parsed?.error || `stock-api ${action} failed (${resp.status})` };
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: `stock-api ${action} call failed: ${(e as Error).message}` };
  }
}

export const createManageStockTool = (
  _userId: string,
  workspaceId: string | undefined,
  jwt: string | undefined,
  onChunk?: (chunk: any) => void,
) => {
  async function moduleReady(): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!workspaceId) return { ok: false, error: 'No active workspace for the current user.' };
      if (!jwt) return { ok: false, error: 'Stock tools require an authenticated user session.' };
      const svc = svcClient();
      const { data: mod } = await svc.from('modules').select('enabled').eq('slug', MODULE_SLUG).maybeSingle();
      if (!mod?.enabled) return { ok: false, error: 'The Stock module is not enabled on this platform.' };
      const { data: entitled } = await svc.rpc('is_workspace_entitled', { p_workspace_id: workspaceId, p_module_slug: MODULE_SLUG });
      if (entitled !== true) return { ok: false, error: 'This workspace has not activated the Stock module. Activate it under Profile → Modules.' };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Stock availability check failed: ${(e as Error).message}` };
    }
  }

  /** Resolve an item by id or fuzzy name/SKU → one row, or a clarification error. */
  async function resolveItem(ws: string, item_id?: string, query?: string): Promise<
    { ok: true; item: any } | { ok: false; error: string; candidates?: any[] }
  > {
    const res = await callStockApi(jwt!, ws, 'list-items', {});
    if (!res.ok) return { ok: false, error: res.error };
    const items: any[] = res.data?.items ?? [];
    if (item_id) {
      const hit = items.find((i) => i.id === item_id);
      if (!hit) return { ok: false, error: 'No stock item with that id in this workspace.' };
      return { ok: true, item: hit };
    }
    if (query) {
      const q = query.trim().toLowerCase();
      const matches = items.filter((i) => `${i.name} ${i.sku ?? ''}`.toLowerCase().includes(q));
      if (matches.length === 0) return { ok: false, error: `No stock item matching "${query}".` };
      if (matches.length > 1) {
        return {
          ok: false,
          error: `Multiple items match "${query}". Ask the user which one.`,
          candidates: matches.slice(0, 8).map((i) => ({ id: i.id, name: i.name, sku: i.sku, qty_on_hand: i.qty_on_hand })),
        };
      }
      return { ok: true, item: matches[0] };
    }
    return { ok: false, error: 'Provide item_id or item_query.' };
  }

  return tool(
    async ({ action, item_id, item_query, direction, quantity, reason }: any) => {
      const gate = await moduleReady();
      if (!gate.ok) return JSON.stringify({ success: false, error: gate.error });
      const ws = workspaceId!;

      if (action === 'overview') {
        const res = await callStockApi(jwt!, ws, 'overview');
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        onChunk?.({ type: 'stock_overview', overview: res.data?.overview ?? {}, timestamp: Date.now() });
        return JSON.stringify({ success: true, overview: res.data?.overview ?? {} });
      }

      if (action === 'list_low_stock') {
        const res = await callStockApi(jwt!, ws, 'list-low-stock');
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const items = (res.data?.items ?? []).map((i: any) => ({ id: i.id, name: i.name, sku: i.sku, unit: i.unit, qty_on_hand: i.qty_on_hand, reorder_point: i.reorder_point }));
        onChunk?.({ type: 'stock_low', items, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: items.length, items });
      }

      if (action === 'check_stock') {
        const res = await callStockApi(jwt!, ws, 'list-items', item_query ? { search: String(item_query) } : {});
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const items = (res.data?.items ?? []).slice(0, 50).map((i: any) => ({
          id: i.id, name: i.name, sku: i.sku, unit: i.unit,
          qty_on_hand: i.qty_on_hand, qty_reserved: i.qty_reserved,
          available: Number(i.qty_on_hand) - Number(i.qty_reserved), reorder_point: i.reorder_point, location: i.location,
        }));
        onChunk?.({ type: 'stock_items', items, query: item_query ?? null, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: items.length, items });
      }

      if (action === 'list_movements') {
        const res = await callStockApi(jwt!, ws, 'list-movements', { limit: 50 });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const movements = (res.data?.movements ?? []).map((m: any) => ({
          item: m.item?.name ?? null, sku: m.item?.sku ?? null, direction: m.direction,
          quantity: m.quantity, reason: m.reason, source_type: m.source_type, occurred_at: m.occurred_at,
        }));
        onChunk?.({ type: 'stock_movements', movements, timestamp: Date.now() });
        return JSON.stringify({ success: true, count: movements.length, movements });
      }

      if (action === 'forecast') {
        const res = await callStockApi(jwt!, ws, 'ai-forecast');
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const fc = res.data?.forecast ?? {};
        const recs = (fc.recommendations ?? []).slice(0, 15).map((r: any) => ({
          item: r.name, sku: r.sku, priority: r.priority, days_of_cover: r.days_of_cover,
          trend: r.trend, lead_time_days: r.lead_time_days, recommended_order_qty: r.recommended_order_qty,
          order_by_days: r.order_by_days, reason: r.reason, warehouse_item_id: r.warehouse_item_id,
        }));
        onChunk?.({ type: 'stock_forecast', recommendations: recs, timestamp: Date.now() });
        if (recs.length === 0) {
          return JSON.stringify({ success: true, recommendations: [], message: 'No resupply needed right now — nothing is on track to stock out before it can be reordered.' });
        }
        return JSON.stringify({ success: true, count: recs.length, recommendations: recs, message: `Top resupply priorities identified (5 credits). Use "reorder" to draft a PO for any of them.` });
      }

      if (action === 'reorder') {
        const resolved = await resolveItem(ws, item_id, item_query);
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
        const res = await callStockApi(jwt!, ws, 'reorder', {
          item_id: resolved.item.id,
          ...(quantity != null ? { quantity: Number(quantity) } : {}),
        });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const r = res.data?.reorder;
        if (!r?.ok) return JSON.stringify({ success: false, error: r?.message ?? 'No supplier configured for this product.' });
        onChunk?.({ type: 'stock_reordered', reorder: r, timestamp: Date.now() });
        const channel = r.supplier_is_app_user ? 'in-app supplier (portal)' : 'supplier (email)';
        return JSON.stringify({
          success: true, reorder: r,
          message: `Drafted a purchase order for ${r.quantity} ${resolved.item.unit} of ${r.item_name} from ${r.supplier_name ?? 'supplier'} → ${channel}. Costs 2 credits. Review & send it in Finance → Orders.`,
        });
      }

      if (action === 'adjust_stock') {
        if (!DIRECTIONS.includes(direction)) return JSON.stringify({ success: false, error: `direction must be one of ${DIRECTIONS.join(', ')} (in=receive, out=issue, adjust=set exact on-hand).` });
        const qty = Number(quantity);
        if (!Number.isFinite(qty) || qty < 0) return JSON.stringify({ success: false, error: 'quantity must be a non-negative number.' });
        const resolved = await resolveItem(ws, item_id, item_query);
        if (!resolved.ok) return JSON.stringify({ success: false, error: resolved.error, candidates: (resolved as any).candidates });
        const res = await callStockApi(jwt!, ws, 'adjust-stock', { item_id: resolved.item.id, direction, quantity: qty, reason: reason ? String(reason) : undefined });
        if (!res.ok) return JSON.stringify({ success: false, error: res.error });
        const verb = direction === 'in' ? 'Received' : direction === 'out' ? 'Issued' : 'Set';
        onChunk?.({ type: 'stock_adjusted', item: resolved.item.name, direction, quantity: qty, qty_on_hand: res.data?.qty_on_hand, timestamp: Date.now() });
        return JSON.stringify({ success: true, item: resolved.item.name, direction, quantity: qty, qty_on_hand: res.data?.qty_on_hand, message: `${verb} ${qty} ${resolved.item.unit} of ${resolved.item.name}. On hand: ${res.data?.qty_on_hand}.` });
      }

      return JSON.stringify({ success: false, error: `unknown action: ${action}` });
    },
    {
      name: 'manage_stock',
      description: [
        'Answer inventory questions and take stock actions for the current user\'s workspace.',
        'Requires the Stock module active for the workspace; write actions (adjust_stock) require',
        'finance-manager permission (owner/admin) — enforced server-side.',
        '',
        'Actions:',
        '  overview        → warehouse count, items, units on hand/reserved, low-stock, out-of-stock, pending intake.',
        '  check_stock     → find items by name/SKU (item_query) with on-hand / reserved / available quantities.',
        '  list_low_stock  → items at or below their reorder point (need restocking).',
        '  list_movements  → the most recent stock movements (receive/issue/adjust) across the warehouse.',
        '  adjust_stock    → change on-hand for ONE item. Give item_id OR item_query, direction, quantity.',
        '                    direction: in = receive/add, out = issue/remove, adjust = set the exact on-hand.',
        '  reorder         → draft a replenishment PURCHASE ORDER for ONE item from its supplier (preferred/',
        '                    cheapest). Give item_id OR item_query, optional quantity (else tops back up above the',
        '                    reorder point, rounded to MOQ). Routes to the in-app supplier portal if the supplier',
        '                    is a tenant, else email. COSTS 2 CREDITS. Confirm with the user before calling.',
        '  forecast        → AI resupply forecast: ranks which items will run out soonest (consumption velocity',
        '                    + trend vs supplier lead time) and recommends order quantities. COSTS 5 CREDITS.',
        '                    Confirm with the user before calling.',
        '',
        'Examples:',
        '  "what\'s low on stock?"          → action=list_low_stock',
        '  "how many oak planks do we have?" → action=check_stock, item_query="oak plank"',
        '  "receive 50 white tiles"          → action=adjust_stock, item_query="white tile", direction="in", quantity=50',
        '  "set stock of SKU-123 to 12"      → action=adjust_stock, item_query="SKU-123", direction="adjust", quantity=12',
        '  "reorder the white tiles"         → action=reorder, item_query="white tile"',
        'If a query matches multiple items, ask the user which one before writing.',
      ].join('\n'),
      schema: z.object({
        action: z.enum(['overview', 'check_stock', 'list_low_stock', 'list_movements', 'adjust_stock', 'reorder', 'forecast']),
        item_id: z.string().uuid().optional().describe('Target stock item id (adjust_stock).'),
        item_query: z.string().optional().describe('Fuzzy name or SKU to search/resolve (check_stock, adjust_stock).'),
        direction: z.enum(DIRECTIONS as unknown as [string, ...string[]]).optional().describe('in=receive, out=issue, adjust=set exact on-hand (adjust_stock).'),
        quantity: z.number().optional().describe('Quantity for adjust_stock.'),
        reason: z.string().optional().describe('Optional movement reason note.'),
      }),
    },
  );
};
