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

export interface ForecastCandidate {
  warehouse_item_id: string;
  name: string;
  sku: string | null;
  unit: string;
  product_id: string | null;
  qty_on_hand: number;
  available: number;
  reorder_point: number;
  out_30d: number;
  out_90d: number;
  velocity_per_day: number;
  days_of_cover: number | null;
  trend: 'flat' | 'accelerating' | 'slowing' | 'steady';
  trend_ratio: number | null;
  lead_time_days: number | null;
  moq: number | null;
  has_supplier: boolean;
  below_reorder: boolean;
  stockout_before_reorder: boolean;
  // AI-merged fields (ai-forecast only):
  priority?: number;
  recommended_order_qty?: number;
  order_by_days?: number;
  reason?: string;
}

export interface AiForecast {
  candidates: ForecastCandidate[];
  recommendations: ForecastCandidate[];
  credits_used?: number;
}

export interface ShippingCredsStatus {
  configured: boolean;
  provider?: string;
  enabled?: boolean;
  base_url?: string | null;
  key_masked?: string | null;
  searates_configured?: boolean;
  searates_platform_id?: string | null;
  searates_key_masked?: string | null;
}

export interface FreightOffer {
  carrier: string | null;
  amount: number | null;
  currency: string | null;
  transit_days: number | null;
  valid_until: string | null;
  mode: string;
}

export interface FreightQuote {
  id: string;
  workspace_id: string;
  origin: string;
  destination: string;
  mode: 'fcl' | 'lcl' | 'air';
  container_type: string | null;
  ready_date: string | null;
  offers: FreightOffer[];
  offer_count: number;
  cheapest_amount: number | null;
  cheapest_currency: string | null;
  created_at: string;
}

export interface ShipmentMilestone {
  code: string | null;
  name: string;
  date: string | null;
  location: string | null;
  status: 'past' | 'current' | 'future' | 'unknown';
}

export interface InboundShipment {
  id: string;
  workspace_id: string;
  order_id: string | null;
  reference: string;
  tracking_type: 'container' | 'bl' | 'booking';
  carrier: string | null;
  status: string;
  eta: string | null;
  last_event: string | null;
  origin: string | null;
  destination: string | null;
  milestones: ShipmentMilestone[];
  provider: string;
  provider_ref: string | null;
  is_active: boolean;
  created_at: string;
  last_polled_at: string | null;
  order?: { id: string; order_number: string | null; status: string } | null;
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

  // ── Resupply forecast ───────────────────────────────────────────────────────
  forecast: (ws: string) => call<{ forecast: { candidates: ForecastCandidate[] } }>('forecast', ws).then((r) => r.forecast.candidates),
  aiForecast: (ws: string) => call<{ forecast: AiForecast }>('ai-forecast', ws).then((r) => r.forecast),

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

  // ── Inbound shipment tracking ───────────────────────────────────────────────
  listShipments: (ws: string) => call<{ shipments: InboundShipment[] }>('shipment-list', ws).then((r) => r.shipments),
  addShipment: (ws: string, input: { reference: string; tracking_type: string; carrier?: string; order_id?: string }) =>
    call<{ shipment: InboundShipment }>('shipment-add', ws, input).then((r) => r.shipment),
  refreshShipment: (ws: string, shipment_id: string) =>
    call<{ shipment: InboundShipment }>('shipment-refresh', ws, { shipment_id }).then((r) => r.shipment),
  removeShipment: (ws: string, shipment_id: string) => call<{ ok: true }>('shipment-remove', ws, { shipment_id }),
  receiveShipment: (ws: string, shipment_id: string) => call<{ received: unknown }>('shipment-receive', ws, { shipment_id }),

  // ── Shipping BYOK credentials (per-workspace; the tenant's own ShipsGo key) ──
  async getShippingStatus(ws: string): Promise<ShippingCredsStatus> {
    const { data, error } = await supabase.rpc('get_shipping_creds_status', { p_workspace_id: ws });
    if (error) throw error;
    return (data ?? { configured: false }) as ShippingCredsStatus;
  },
  async saveShippingCreds(ws: string, input: { provider?: string; apiKey?: string | null; enabled: boolean; baseUrl?: string | null }): Promise<void> {
    const { error } = await supabase.rpc('save_shipping_credentials', {
      p_workspace_id: ws, p_provider: input.provider ?? 'shipsgo',
      p_api_key: input.apiKey ?? null, p_enabled: input.enabled, p_base_url: input.baseUrl ?? null,
    });
    if (error) throw error;
  },
  async saveSearatesCreds(ws: string, input: { platformId?: string | null; apiKey?: string | null }): Promise<void> {
    const { error } = await supabase.rpc('save_searates_credentials', {
      p_workspace_id: ws, p_platform_id: input.platformId ?? null, p_api_key: input.apiKey ?? null,
    });
    if (error) throw error;
  },

  // ── Freight quotes (SeaRates, BYOK) ─────────────────────────────────────────
  listFreightQuotes: (ws: string) => call<{ quotes: FreightQuote[] }>('shipping-quotes-list', ws).then((r) => r.quotes),
  getFreightQuote: (ws: string, input: { origin: string; destination: string; mode: string; container_type?: string; ready_date?: string }) =>
    call<{ quote: FreightQuote }>('shipping-quote', ws, input).then((r) => r.quote),
};
