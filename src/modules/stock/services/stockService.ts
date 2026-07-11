import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Client for the `stock-api` edge function (Overview / Movements / Stocktake). Every call passes the
// active workspace_id; the edge function re-derives access from the caller (JWT) and enforces
// isModuleEnabled('stock') + assertEntitled('stock') + RLS/RPC finance-manager guards. The Inventory
// grid itself is served by the existing WarehousePanel (direct-table, RLS-gated) for parity.

export interface StockOverview {
  warehouses: number;
  items: number;
  total_on_hand: number;
  total_reserved: number;
  total_value: number;
  items_missing_cost: number;
  low_stock: number;
  out_of_stock: number;
  pending_intake: number;
  open_counts: number;
  movements_7d: number;
}

export interface StockValuation {
  total_value: number;
  valued_items: number;
  items_missing_cost: number;
  currencies: string[];
  by_warehouse: { warehouse_id: string; warehouse_name: string; value: number; items: number }[];
}

export interface StockMovement {
  id: string;
  workspace_id: string;
  item_id: string | null;
  direction: 'in' | 'out' | 'adjust';
  quantity: number;
  reason: string | null;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string;
  created_by: string | null;
  item: { id: string; name: string; sku: string | null; unit: string } | null;
}

export type StockCountStatus = 'draft' | 'posted' | 'cancelled';

export interface StockCount {
  id: string;
  workspace_id: string;
  warehouse_id: string;
  status: StockCountStatus;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  posted_at: string | null;
  posted_by: string | null;
  adjusted_lines: number | null;
  warehouse?: { id: string; name: string } | null;
}

export interface StockCountLine {
  id: string;
  count_id: string;
  workspace_id: string;
  warehouse_item_id: string;
  product_id: string | null;
  name: string;
  sku: string | null;
  unit: string;
  system_qty: number;
  counted_qty: number | null;
  note: string | null;
}

export interface ReorderResult {
  ok: boolean;
  reason?: string;
  message?: string;
  order_id?: string;
  order_number?: string | null;
  supplier_company_id?: string;
  supplier_name?: string | null;
  supplier_is_app_user?: boolean;
  quantity?: number;
  unit_cost?: number | null;
  currency?: string;
  line_total?: number;
  item_name?: string;
}

export interface LowStockItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  qty_on_hand: number;
  qty_reserved: number;
  reorder_point: number;
  location: string | null;
  warehouse_id: string | null;
}

async function call<T>(action: string, workspaceId: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('stock-api', {
    body: { action, workspace_id: workspaceId, ...extra },
  });
  if (error) throw await edgeError(error, `stock-api ${action} failed`);
  return data as T;
}

export const stockService = {
  overview: (ws: string) => call<{ overview: StockOverview }>('overview', ws).then((r) => r.overview),
  valuation: (ws: string) => call<{ valuation: StockValuation }>('valuation', ws).then((r) => r.valuation),
  lowStock: (ws: string) => call<{ items: LowStockItem[]; count: number }>('list-low-stock', ws),
  listMovements: (ws: string, opts: { item_id?: string; limit?: number } = {}) =>
    call<{ movements: StockMovement[] }>('list-movements', ws, opts).then((r) => r.movements),

  // ── Reorder (Stock → Sourcing bridge) — credit-metered ──────────────────────
  reorder: (ws: string, item_id: string, opts: { quantity?: number; supplier_product_id?: string } = {}) =>
    call<{ reorder: ReorderResult }>('reorder', ws, { item_id, ...opts }).then((r) => r.reorder),

  // ── Stocktake ──────────────────────────────────────────────────────────────
  listCounts: (ws: string) => call<{ counts: StockCount[] }>('list-counts', ws).then((r) => r.counts),
  getCount: (ws: string, count_id: string) => call<{ count: StockCount; lines: StockCountLine[] }>('get-count', ws, { count_id }),
  createCount: (ws: string, warehouse_id: string, note?: string) =>
    call<{ count_id: string }>('create-count', ws, { warehouse_id, note }).then((r) => r.count_id),
  updateCountLine: (ws: string, line_id: string, patch: { counted_qty?: number | null; note?: string | null }) =>
    call<{ line: StockCountLine }>('update-count-line', ws, { line_id, ...patch }).then((r) => r.line),
  postCount: (ws: string, count_id: string) =>
    call<{ result: { count_id: string; adjusted_lines: number } }>('post-count', ws, { count_id }).then((r) => r.result),
  cancelCount: (ws: string, count_id: string) => call<{ ok: true }>('cancel-count', ws, { count_id }),
};
