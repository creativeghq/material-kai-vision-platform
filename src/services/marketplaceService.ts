import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';
import {
  PRODUCT_IMAGE_SELECT, getProductName, getMaterialCategory,
  getAvailableSizes, getAvailableColors,
} from '@/utils/productMetadata';

/**
 * Surplus / Last-Stock Marketplace client.
 *
 * The marketplace_* tables + RPCs were applied to the DB via MCP migrations; the generated
 * Supabase types (`src/integrations/supabase/types.ts`) don't include them yet (regen tracked
 * on #221). The `as any` cast is isolated to this single boundary — every caller below is fully
 * typed through the interfaces in this file.
 */
const sb = supabase as any;

export type ListingCondition = 'new' | 'open_box' | 'remnant' | 'lot';
export type DeliveryOption = 'pickup' | 'ship' | 'both';

export interface PriceComps {
  n: number;
  min_price: number | null;
  median_price: number | null;
  max_price: number | null;
}

export interface ActiveListingSummary {
  id: string;
  price: number;
  currency: string;
  qty_remaining: number;
}

/** Full listing row as rendered in the Discover Marketplace tab (cross-tenant, safe fields only). */
export interface MarketplaceListing {
  id: string;
  workspace_id: string;
  seller_name: string | null;
  title: string;
  description: string | null;
  material_category: string | null;
  specs: Record<string, unknown>;
  image_urls: string[];
  price: number;
  currency: string;
  unit: string;
  qty_remaining: number;
  condition: ListingCondition;
  batch_lot: string | null;
  location_city: string | null;
  location_region: string | null;
  country_code: string | null;
  delivery_option: DeliveryOption;
  status: string;
  view_count: number;
  created_at: string;
}

export interface BrowseFilters {
  q?: string;
  materialCategory?: string;
  minPrice?: number;
  maxPrice?: number;
  city?: string;
  conditions?: string[];
  deliveries?: string[];
  limit?: number;
  offset?: number;
}

export type MarketplaceParticipationStatus = 'pending' | 'approved' | 'rejected';

/** A workspace's surplus-marketplace participation (owner-enabled + operator-approved). */
export interface MarketplaceParticipation {
  workspace_id: string;
  enabled: boolean;
  status: MarketplaceParticipationStatus;
  applied_at: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

/** Operator view of a participation row + the applicant workspace name. */
export interface MarketplaceApplication extends MarketplaceParticipation {
  workspace_name: string | null;
}

/** Result of the market price-cap check for a proposed listing price. */
export interface MarketPriceCheck {
  success: boolean;
  market_median: number | null;
  market_min: number | null;
  market_max: number | null;
  currency: string;
  cap_pct: number;
  /** market_median × (1 + cap%); the highest price a listing may carry. Null when unverified. */
  max_allowed: number | null;
  allowed: boolean;
  /** True when no market price could be resolved — the cap can't be enforced client-side. */
  unverified: boolean;
  from_cache: boolean;
}

/** A buyer's saved surplus alert. A matching new listing emails + bells them. */
export interface WantList {
  id: string;
  label: string | null;
  material_category: string | null;
  keyword: string | null;
  max_price: number | null;
  location_city: string | null;
  is_active: boolean;
}

const LISTING_COLUMNS =
  'id, workspace_id, seller_name, title, description, material_category, specs, image_urls, ' +
  'price, currency, unit, qty_remaining, condition, batch_lot, location_city, location_region, ' +
  'country_code, delivery_option, status, view_count, created_at';

/** Catalog-derived defaults so the "List to Marketplace" modal is confirm-only. */
export interface ListingAutofill {
  title: string;
  material_category: string | null;
  image_urls: string[];
  specs: Record<string, unknown>;
  price_anchor: number | null;
}

export interface CreateListingInput {
  warehouseItemId: string;
  price: number;
  qty: number;
  currency?: string;
  condition?: ListingCondition;
  batchLot?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  countryCode?: string | null;
  deliveryOption?: DeliveryOption;
  expiresAt?: string | null;
  title?: string | null;
  description?: string | null;
  materialCategory?: string | null;
  specs?: Record<string, unknown>;
  imageUrls?: string[];
}

/**
 * Remove characters that carry meaning in the PostgREST filter grammar (`,` `(` `)` `\`) plus the
 * ilike wildcards (`%` `*`) from a free-text search term, so it can be safely interpolated into an
 * `.or(...)` / `.ilike(...)` expression. RLS is the security boundary; this keeps the query grammar intact.
 */
function sanitizeIlike(raw: string): string {
  return raw.replace(/[,()\\%*]/g, ' ').trim();
}

function extractPriceAnchor(meta: Record<string, any>): number | null {
  const candidates = [
    meta?.retail_price, meta?.price,
    meta?.commercial?.retail_price, meta?.commercial?.price,
    meta?.pricing?.retail, meta?.pricing?.price,
  ];
  for (const c of candidates) {
    const n = typeof c === 'object' && c ? Number((c as any).value) : Number(c);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export const marketplaceService = {
  /** Reserve stock + publish a surplus listing. Returns the new listing id. */
  async createListing(i: CreateListingInput): Promise<string> {
    const { data, error } = await sb.rpc('create_marketplace_listing', {
      p_warehouse_item_id: i.warehouseItemId,
      p_price: i.price,
      p_qty: i.qty,
      p_currency: i.currency ?? 'EUR',
      p_condition: i.condition ?? 'new',
      p_batch_lot: i.batchLot ?? null,
      p_location_city: i.locationCity ?? null,
      p_location_region: i.locationRegion ?? null,
      p_country_code: i.countryCode ?? null,
      p_delivery_option: i.deliveryOption ?? 'pickup',
      p_expires_at: i.expiresAt ?? null,
      p_title: i.title ?? null,
      p_description: i.description ?? null,
      p_material_category: i.materialCategory ?? null,
      p_specs: i.specs ?? {},
      p_image_urls: i.imageUrls ?? [],
    });
    if (error) throw error;
    // "saved surplus alert" fan-out to matching buyers is handled at the data layer
    // by the `_notify_want_match` AFTER INSERT trigger on marketplace_listings (cross-tenant,
    // catches every insert path). No app-layer call needed here.
    return data as string;
  },

  /** Withdraw a listing and release its reserved stock. */
  async withdraw(listingId: string): Promise<void> {
    const { error } = await sb.rpc('withdraw_listing', { p_id: listingId });
    if (error) throw error;
  },

  /** Record a sale (releases the hold + decrements on-hand via a stock movement). */
  async markSold(listingId: string, qty?: number): Promise<void> {
    const { error } = await sb.rpc('mark_listing_sold', { p_id: listingId, p_qty: qty ?? null });
    if (error) throw error;
  },

  /** min/median/max of comparable active surplus, excluding the caller's own workspace. */
  async priceComps(materialCategory: string | null, unit: string, excludeWorkspace?: string): Promise<PriceComps> {
    const { data, error } = await sb.rpc('marketplace_price_comps', {
      p_material_category: materialCategory,
      p_unit: unit,
      p_exclude_workspace: excludeWorkspace ?? null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      n: Number(row?.n ?? 0),
      min_price: row?.min_price != null ? Number(row.min_price) : null,
      median_price: row?.median_price != null ? Number(row.median_price) : null,
      max_price: row?.max_price != null ? Number(row.max_price) : null,
    };
  },

  /** Active listings for the workspace, keyed by warehouse_item_id (drives the row badge). */
  async activeListingsByItem(workspaceId: string): Promise<Record<string, ActiveListingSummary>> {
    const { data, error } = await sb
      .from('marketplace_listings')
      .select('id, warehouse_item_id, price, currency, qty_remaining')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active');
    if (error) throw error;
    const map: Record<string, ActiveListingSummary> = {};
    for (const r of (data ?? []) as any[]) {
      if (r.warehouse_item_id) {
        map[r.warehouse_item_id] = {
          id: r.id, price: Number(r.price), currency: r.currency, qty_remaining: Number(r.qty_remaining),
        };
      }
    }
    return map;
  },

  /**
   * Cross-tenant browse of active surplus. Reads the `marketplace_public_listings` definer view,
   * which exposes only the safe projection and self-gates on `status='active' AND is_business_user()`
   * — the base table's RLS no longer has a cross-tenant read branch (T1-1), so this is the only
   * cross-workspace read surface and it can never return created_by / warehouse_item_id.
   */
  async browse(filters: BrowseFilters = {}): Promise<MarketplaceListing[]> {
    let q = sb.from('marketplace_public_listings').select(LISTING_COLUMNS).eq('status', 'active');
    if (filters.materialCategory) q = q.eq('material_category', filters.materialCategory);
    if (filters.minPrice != null) q = q.gte('price', filters.minPrice);
    if (filters.maxPrice != null) q = q.lte('price', filters.maxPrice);
    if (filters.city) q = q.ilike('location_city', `%${sanitizeIlike(filters.city)}%`);
    if (filters.conditions?.length) q = q.in('condition', filters.conditions);
    if (filters.deliveries?.length) q = q.in('delivery_option', filters.deliveries);
    if (filters.q) {
      // Strip PostgREST filter-grammar metacharacters — a raw `,` / `(` / `)` in `q` would
      // otherwise split or break the .or() expression. RLS still gates rows, but keep the
      // query well-formed and injection-proof.
      const term = sanitizeIlike(filters.q);
      if (term) q = q.or(`title.ilike.%${term}%,seller_name.ilike.%${term}%`);
    }
    q = q.order('created_at', { ascending: false })
         .range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 40) - 1);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as MarketplaceListing[];
  },

  /** product_id → cheapest active surplus listing, for the "also available as surplus" badge. */
  async surplusByProduct(): Promise<Record<string, { price: number; currency: string }>> {
    const { data, error } = await sb
      .from('marketplace_public_listings')
      .select('product_id, price, currency')
      .eq('status', 'active')
      .not('product_id', 'is', null);
    if (error) throw error;
    const map: Record<string, { price: number; currency: string }> = {};
    for (const r of (data ?? []) as any[]) {
      const pid = r.product_id as string;
      const price = Number(r.price);
      if (!map[pid] || price < map[pid].price) map[pid] = { price, currency: r.currency };
    }
    return map;
  },

  async getListing(id: string): Promise<MarketplaceListing | null> {
    // Cross-tenant detail read → the safe-projection view (active listings only).
    const { data, error } = await sb.from('marketplace_public_listings').select(LISTING_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw error;
    return (data ?? null) as MarketplaceListing | null;
  },

  /** Buyer → seller inquiry: opens an Inbox thread cross-tenant + notifies the seller. */
  async createInquiry(input: { listingId: string; buyerWorkspaceId: string; qtyWanted?: number | null; message?: string; demandType?: 'order_item' | 'quote_item' | null; demandId?: string | null }): Promise<{ inquiry_id: string; thread_id: string }> {
    const { data, error } = await supabase.functions.invoke('inbox-api', {
      body: {
        action: 'create_marketplace_inquiry',
        listing_id: input.listingId,
        buyer_workspace_id: input.buyerWorkspaceId,
        qty_wanted: input.qtyWanted ?? null,
        message: input.message ?? null,
        // When sourcing a specific demand line, carry it so accept can allocate
        demand_type: input.demandType ?? null,
        demand_id: input.demandId ?? null,
      },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to send inquiry'));
    return data as { inquiry_id: string; thread_id: string };
  },

  // SELLER accepts a surplus inquiry → materializes a draft purchase order
  // (+ on_order allocation if the inquiry carried a sourcing demand) in the BUYER's workspace.
  async acceptInquiry(inquiryId: string, opts?: { acceptedQty?: number; unitPrice?: number }): Promise<{ inquiry_id: string; order_id: string; already?: boolean }> {
    const { data, error } = await supabase.functions.invoke('inbox-api', {
      body: {
        action: 'accept_marketplace_inquiry',
        inquiry_id: inquiryId,
        accepted_qty: opts?.acceptedQty,
        unit_price: opts?.unitPrice,
      },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Failed to accept inquiry'));
    return data as { inquiry_id: string; order_id: string; already?: boolean };
  },

  async incrementView(id: string): Promise<void> {
    try { await sb.rpc('increment_listing_view', { p_id: id }); } catch { /* analytics-only */ }
  },

  // ── Want lists / saved surplus alerts ──────────────────────────────
  async listWantLists(): Promise<WantList[]> {
    const { data, error } = await sb
      .from('marketplace_want_lists')
      .select('id, label, material_category, keyword, max_price, location_city, is_active')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as WantList[];
  },

  async createWantList(input: {
    userId: string; workspaceId: string;
    materialCategory?: string | null; keyword?: string | null; maxPrice?: number | null;
    locationCity?: string | null; label?: string | null;
  }): Promise<void> {
    const { error } = await sb.from('marketplace_want_lists').insert({
      user_id: input.userId,
      workspace_id: input.workspaceId,
      material_category: input.materialCategory ?? null,
      keyword: input.keyword ?? null,
      max_price: input.maxPrice ?? null,
      location_city: input.locationCity ?? null,
      label: input.label ?? null,
    });
    if (error) throw error;
  },

  async deleteWantList(id: string): Promise<void> {
    const { error } = await sb.from('marketplace_want_lists').delete().eq('id', id);
    if (error) throw error;
  },

  /** Pull catalog details for a product so the listing modal pre-fills everything but price. */
  async buildAutofill(productId: string): Promise<ListingAutofill> {
    const { data, error } = await sb
      .from('products')
      .select(`id, name, metadata, ${PRODUCT_IMAGE_SELECT}`)
      .eq('id', productId)
      .single();
    if (error) throw error;

    const meta = (data?.metadata ?? {}) as Record<string, any>;
    const ipa = Array.isArray(data?.image_product_associations) ? [...data.image_product_associations] : [];
    ipa.sort((a: any, b: any) => (b?.overall_score ?? 0) - (a?.overall_score ?? 0));
    const image_urls = ipa
      .map((r: any) => r?.document_images?.image_url)
      .filter((u: unknown): u is string => typeof u === 'string' && !!u)
      .slice(0, 6);

    const specs: Record<string, unknown> = {};
    const sizes = getAvailableSizes(meta);
    const colors = getAvailableColors(meta);
    if (sizes.length) specs.sizes = sizes;
    if (colors.length) specs.colors = colors;
    const finishRaw = meta.finish ?? meta?.material_properties?.finish;
    const finish = typeof finishRaw === 'object' && finishRaw ? (finishRaw as any).value : finishRaw;
    if (finish) specs.finish = finish;

    return {
      title: getProductName({ id: productId, name: data?.name, metadata: meta }),
      material_category: getMaterialCategory(meta),
      image_urls,
      specs,
      price_anchor: extractPriceAnchor(meta),
    };
  },

  // ── Participation (owner-enabled + operator-approved) ─────────────────────
  /** This workspace's marketplace participation row (null if never applied). */
  async getParticipation(workspaceId: string): Promise<MarketplaceParticipation | null> {
    const { data, error } = await sb
      .from('marketplace_participation')
      .select('workspace_id, enabled, status, applied_at, reviewed_at, review_notes')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as MarketplaceParticipation | null;
  },

  /** Owner enables participation → raises an application for operator approval. */
  async applyParticipation(workspaceId: string): Promise<MarketplaceParticipation> {
    const { data, error } = await sb.rpc('marketplace_apply', { p_workspace_id: workspaceId });
    if (error) throw error;
    return data as MarketplaceParticipation;
  },

  /** Owner toggles participation on/off (does not change approval status). */
  async setParticipationEnabled(workspaceId: string, enabled: boolean): Promise<MarketplaceParticipation> {
    const { data, error } = await sb.rpc('marketplace_set_enabled', { p_workspace_id: workspaceId, p_enabled: enabled });
    if (error) throw error;
    return data as MarketplaceParticipation;
  },

  /** The Operator-set markup cap (% over market price). */
  async getMarkupCap(): Promise<number> {
    const { data, error } = await sb.from('marketplace_config').select('markup_cap_pct').eq('id', 1).maybeSingle();
    if (error) throw error;
    return Number(data?.markup_cap_pct ?? 20);
  },

  // ── Operator approvals ────────────────────────────────────────────────────
  /** All participation rows (operator-only via RLS), with the applicant workspace name. */
  async listApplications(): Promise<MarketplaceApplication[]> {
    const { data, error } = await sb
      .from('marketplace_participation')
      .select('workspace_id, enabled, status, applied_at, reviewed_at, review_notes, workspace:workspaces(name, slug)')
      .order('applied_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      workspace_id: r.workspace_id, enabled: r.enabled, status: r.status,
      applied_at: r.applied_at, reviewed_at: r.reviewed_at, review_notes: r.review_notes,
      workspace_name: r.workspace?.name ?? null,
    }));
  },

  /** Operator approve/reject a workspace's marketplace application. */
  async review(workspaceId: string, approve: boolean, notes?: string): Promise<void> {
    const { error } = await sb.rpc('marketplace_review', { p_workspace_id: workspaceId, p_approve: approve, p_notes: notes ?? null });
    if (error) throw error;
  },

  // ── Price check (market cap) ───────────────────────────────────────────────
  /**
   * Resolve the market price of an item + whether a proposed listing price is within the
   * Operator cap. Runs the price monitor (cached 24h server-side) and also populates the
   * server-authoritative reference that create_marketplace_listing enforces against.
   */
  async priceCheck(input: {
    workspaceId: string; productId?: string | null; productName?: string;
    price?: number | null; currency?: string; manufacturer?: string; dimensions?: string;
  }): Promise<MarketPriceCheck> {
    const { data, error } = await supabase.functions.invoke('marketplace-price-check', {
      body: {
        workspace_id: input.workspaceId,
        product_id: input.productId ?? null,
        product_name: input.productName,
        price: input.price ?? null,
        currency: input.currency,
        manufacturer: input.manufacturer,
        dimensions: input.dimensions,
      },
    });
    if (error) throw new Error(await edgeErrorMessage(error, 'Price check failed'));
    return data as MarketPriceCheck;
  },
};
