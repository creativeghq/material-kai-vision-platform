import { supabase } from '@/integrations/supabase/client';

/**
 * Master catalog (#324) — the shared, cross-tenant record of what a product IS.
 *
 * Two rules this service exists to keep honest, both enforced server-side:
 *  1. Only the ONE user the operator confirmed as representing a factory may publish.
 *     Workspace membership is never enough — see `supplier_publishing_allowed`.
 *  2. A published PRICE reaches the operator's catalog and nowhere else. `publishPrice`
 *     writes the factory's ask onto the master row; it never touches any workspace's cost.
 *     `acceptPrice` is the only path to a real cost and is operator-only.
 */

/** Per-field provenance. Manufacturer beats operator beats our extraction. */
export type FieldAuthority = 'extracted' | 'operator' | 'manufacturer';

export interface CatalogMasterProduct {
  id: string;
  platform_supplier_id: string;
  normalized_sku: string;
  source_sku: string | null;
  barcode: string | null;
  name: string | null;
  attributes: Record<string, unknown>;
  field_authority: Record<string, FieldAuthority>;
  /** Values our ingestion had before a manufacturer superseded them — kept for audit. */
  superseded: Record<string, unknown>;
  published_at: string | null;
  authority_revoked_at: string | null;
  updated_at: string;
  /**
   * The factory's current ask, merged in from `catalog_master_price_offers`.
   *
   * It is NOT a column on the master row and must never become one: the master is
   * world-readable by design (a shared catalog of what products ARE), so a price living
   * there would hand every tenant the operator's buying prices. The offers table is
   * readable only by the operator and by the manufacturer who published it.
   */
  list_price?: number | null;
  list_price_currency?: string | null;
  list_price_updated_at?: string | null;
}

/** The columns `withOffers` reads off `catalog_master_price_offers`. */
interface MasterPriceOfferRow {
  master_product_id: string;
  list_price: number;
  currency: string;
  updated_at: string;
}

/**
 * One published volume tier. Mirrors `product_price_breaks`: a tier is either an explicit
 * `unit_price` OR a `discount_percent` off the flat ask — never both (the DB CHECK enforces it).
 * Two ways to express one number is how the sell side ended up with four derivations.
 */
export interface MasterPriceBreak {
  id: string;
  min_quantity: number;
  unit: string | null;
  unit_price: number | null;
  discount_percent: number | null;
  currency: string;
  notes: string | null;
}

/** Same tier, as the publisher supplies it: currency and notes default server-side. */
export type MasterPriceBreakInput =
  Omit<MasterPriceBreak, 'id' | 'currency' | 'notes'> & { currency?: string; notes?: string | null };

/** What the factory asks vs what the operator currently pays. Operator-facing. */
export interface MasterPriceDrift {
  master_product_id: string;
  platform_supplier_id: string;
  supplier_name: string | null;
  normalized_sku: string;
  name: string | null;
  list_price: number | null;
  list_price_currency: string | null;
  list_price_updated_at: string | null;
  operator_product_id: string | null;
  operator_cost: number | null;
  operator_cost_currency: string | null;
  needs_review: boolean;
}

export interface MasterChangelogEntry {
  id: string;
  master_product_id: string;
  change_kind: 'facts' | 'price' | 'authority';
  changed_fields: Record<string, unknown>;
  previous_values: Record<string, unknown>;
  created_at: string;
}

/** The fields a manufacturer may publish. Mirrors the server allowlist exactly. */
export const PUBLISHABLE_FACT_FIELDS = [
  'name', 'description', 'long_description', 'barcode', 'country_of_origin', 'warranty',
  'product_url', 'dimensions', 'finish', 'composition', 'images', 'discontinued',
  'material', 'color', 'weight', 'coverage', 'surface', 'application', 'certifications',
] as const;
export type PublishableFactField = (typeof PUBLISHABLE_FACT_FIELDS)[number];

export const catalogMasterService = {
  /** Can the CURRENT user publish for this workspace? Identity + operator confirmation + being that person. */
  async publishingAllowed(workspaceId: string): Promise<{ allowed: boolean; reason?: string; platformSupplierId?: string; legalName?: string }> {
    const { data, error } = await supabase.rpc('supplier_publishing_allowed', { p_workspace_id: workspaceId });
    if (error) throw error;
    const d = (data ?? {}) as { allowed?: boolean; reason?: string; platform_supplier_id?: string; legal_name?: string };
    return {
      allowed: !!d.allowed, reason: d.reason,
      platformSupplierId: d.platform_supplier_id, legalName: d.legal_name,
    };
  },

  /**
   * Master rows for a supplier identity, with each row's own published ask merged in.
   * The ask comes from a separate, access-controlled table, so RLS decides per row whether
   * the caller sees a price at all — a tenant who may not simply gets `list_price` undefined.
   */
  async listForSupplier(platformSupplierId: string): Promise<CatalogMasterProduct[]> {
    const { data, error } = await supabase
      .from('catalog_master_products')
      .select('*')
      .eq('platform_supplier_id', platformSupplierId)
      .order('normalized_sku');
    if (error) throw error;
    const rows = (data ?? []) as unknown as CatalogMasterProduct[];
    return this.withOffers(rows);
  },

  async get(masterId: string): Promise<CatalogMasterProduct | null> {
    const { data, error } = await supabase
      .from('catalog_master_products').select('*').eq('id', masterId).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return (await this.withOffers([data as unknown as CatalogMasterProduct]))[0] ?? null;
  },

  /** Merge the operator-scoped asks onto master rows. Rows with no visible offer stay priceless. */
  async withOffers(rows: CatalogMasterProduct[]): Promise<CatalogMasterProduct[]> {
    if (rows.length === 0) return rows;
    const { data } = await supabase
      .from('catalog_master_price_offers')
      .select('master_product_id, list_price, currency, updated_at')
      .in('master_product_id', rows.map((r) => r.id));
    // Annotated because the shared client is created as `any` (see integrations/supabase/client.ts),
    // so `data` arrives untyped. Feeding an untyped array to `new Map` leaves its generics
    // uninferrable and they fall back to `unknown`, which is what makes the field reads below
    // fail to compile. Naming the row shape once fixes it for the whole function — same reason
    // the sibling queries in this file cast their results.
    const offers = (data ?? []) as MasterPriceOfferRow[];
    const byId = new Map(offers.map((o) => [o.master_product_id, o] as const));
    return rows.map((r) => {
      const o = byId.get(r.id);
      return o
        ? { ...r, list_price: o.list_price, list_price_currency: o.currency, list_price_updated_at: o.updated_at }
        : r;
    });
  },

  /**
   * Publish product FACTS. These become the effective values platform-wide by derivation
   * (`products_effective_facts`), not by copying into anyone's row. Superseded extraction
   * values stay recoverable.
   */
  async publishFacts(masterId: string, fields: Partial<Record<PublishableFactField, unknown>>): Promise<{ changed: number }> {
    const { data, error } = await supabase.rpc('publish_master_product_facts', {
      p_master_id: masterId, p_fields: fields as never,
    });
    if (error) throw error;
    return { changed: Number((data as { changed?: number } | null)?.changed ?? 0) };
  },

  /**
   * Publish a PRICE. Writes the factory's ask onto the master row only and notifies the
   * operator. No tenant's negotiated cost is touched — not even the operator's, until they accept.
   */
  async publishPrice(masterId: string, price: number, currency = 'EUR'): Promise<void> {
    const { error } = await supabase.rpc('publish_master_product_price', {
      p_master_id: masterId, p_price: price, p_currency: currency,
    });
    if (error) throw error;
  },

  /**
   * The factory's VOLUME tiers for one master product (#332 step 7).
   *
   * `catalog_master_price_offers` carries a single `list_price`, but factories sell in tiers
   * ("€480/m² at 1 pallet, €450 at 5") and the sell side has modelled exactly that in
   * `product_price_breaks` all along — so a published tier structure had nowhere to land and was
   * silently flattened to whatever single number was typed. Same operator-only visibility as the
   * offer itself: RLS decides per row whether the caller sees a price at all.
   */
  async listPriceBreaks(masterId: string): Promise<MasterPriceBreak[]> {
    const { data, error } = await supabase
      .from('catalog_master_price_offer_breaks')
      .select('id, min_quantity, unit, unit_price, discount_percent, currency, notes')
      .eq('master_product_id', masterId)
      .order('min_quantity', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as MasterPriceBreak[];
  },

  /**
   * Replace the tier ladder WHOLESALE. Not a merge, for the same reason composition lines are
   * regenerated rather than carried over: a merge silently keeps a tier the factory deleted, and
   * a stale "€450 at 5 pallets" is a price we would go on honouring.
   */
  async publishPriceBreaks(masterId: string, breaks: MasterPriceBreakInput[]): Promise<{ breaks: number }> {
    const { data, error } = await supabase.rpc('publish_master_product_price_breaks', {
      p_master_id: masterId,
      // An explicit allowlisted literal per tier — never the caller's object spread through.
      p_breaks: breaks.map((b) => ({
        min_quantity: b.min_quantity,
        unit: b.unit ?? null,
        unit_price: b.unit_price ?? null,
        discount_percent: b.discount_percent ?? null,
        currency: b.currency ?? 'EUR',
        notes: b.notes ?? null,
      })) as never,
    });
    if (error) throw error;
    return { breaks: Number((data as { breaks?: number } | null)?.breaks ?? 0) };
  },

  /** Operator-only: take the published ask into the operator catalog's cost. */
  async acceptPrice(masterId: string): Promise<{ productsUpdated: number; cost: number | null }> {
    const { data, error } = await supabase.rpc('accept_master_price', { p_master_id: masterId });
    if (error) throw error;
    const d = (data ?? {}) as { products_updated?: number; cost?: number };
    return { productsUpdated: Number(d.products_updated ?? 0), cost: d.cost ?? null };
  },

  /** Operator review queue: published asks that differ from what we currently pay. */
  async priceDrift(onlyNeedsReview = true): Promise<MasterPriceDrift[]> {
    let q = supabase.from('catalog_master_price_drift').select('*');
    if (onlyNeedsReview) q = q.eq('needs_review', true);
    const { data, error } = await q.order('list_price_updated_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as unknown as MasterPriceDrift[];
  },

  async changelog(masterId: string, limit = 25): Promise<MasterChangelogEntry[]> {
    const { data, error } = await supabase
      .from('catalog_master_changelog').select('*')
      .eq('master_product_id', masterId)
      .order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as unknown as MasterChangelogEntry[];
  },
};
