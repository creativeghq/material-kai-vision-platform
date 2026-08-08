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
  list_price: number | null;
  list_price_currency: string | null;
  list_price_updated_at: string | null;
  published_at: string | null;
  authority_revoked_at: string | null;
  updated_at: string;
}

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

  /** Master rows for a supplier identity (the supplier's own published catalog). */
  async listForSupplier(platformSupplierId: string): Promise<CatalogMasterProduct[]> {
    const { data, error } = await supabase
      .from('catalog_master_products')
      .select('*')
      .eq('platform_supplier_id', platformSupplierId)
      .order('normalized_sku');
    if (error) throw error;
    return (data ?? []) as unknown as CatalogMasterProduct[];
  },

  async get(masterId: string): Promise<CatalogMasterProduct | null> {
    const { data, error } = await supabase
      .from('catalog_master_products').select('*').eq('id', masterId).maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as CatalogMasterProduct | null;
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
