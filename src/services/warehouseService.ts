import { supabase } from '@/integrations/supabase/client';
import { isQuotaError } from '@/hooks/useQuotaErrorHandler';
import { PRODUCT_IMAGE_SELECT, getProductImageUrl, getProductName } from '@/utils/productMetadata';
import { mivaaApi } from '@/services/mivaaApiClient';
import { dealerProductsService, type ManualImageRef } from '@/services/dealerProductsService';

/** A catalog product offered as the match for a supplier line. */
export interface CatalogMatch {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  /** Visual-similarity score when the match came from an image; null for a text match. */
  score?: number | null;
}

/** A product the OPERATOR already carries that looks like the one being added. */
export interface OperatorCatalogMatch extends CatalogMatch {
  factoryName: string | null;
  /** False when the caller's workspace is `own_products_only` — they can see the duplicate
   *  but must be granted catalog access before they can sell ours. */
  hasCatalogAccess: boolean;
  operatorWorkspaceId: string | null;
}

export interface Warehouse {
  id: string;
  workspace_id: string;
  name: string;
  code: string | null;
  location: string | null;
  is_default: boolean;
}

export interface WarehouseItem {
  id: string;
  workspace_id: string;
  warehouse_id: string | null;
  product_id: string | null;
  sku: string | null;
  name: string;
  unit: string;
  qty_on_hand: number;
  qty_reserved: number;
  reorder_point: number;
  location: string | null;
  serial_number: string | null;
  // Physical + identity metadata, mostly parsed from the supplier line at intake.
  width_mm: number | null;
  length_mm: number | null;
  thickness_mm: number | null;
  weight_kg: number | null;
  manufacturer: string | null;
  supplier_product_code: string | null;
  image_urls: string[];
  is_active: boolean;
}

/** A stock row with its warehouse resolved — what the product record shows. */
export interface ProductStockRow extends WarehouseItem {
  warehouse_name: string | null;
  warehouse_is_default: boolean;
}

export interface StockMovementRow {
  id: string;
  item_id: string;
  direction: 'in' | 'out' | 'adjust';
  quantity: number;
  reason: string | null;
  source_type: string | null;
  source_id: string | null;
  occurred_at: string;
}

/**
 * Physical / identity metadata. Populated at intake by `parseSupplierLine` (dimensions out of
 * "AMALFI GRIS 80X80", maker from the issuer) and by operator photo uploads. Lengths are
 * canonical millimetres regardless of how the supplier wrote them.
 */
export interface WarehouseItemPhysicalFields {
  width_mm?: number | null;
  length_mm?: number | null;
  thickness_mm?: number | null;
  weight_kg?: number | null;
  manufacturer?: string | null;
  supplier_product_code?: string | null;
  image_urls?: string[];
  is_active?: boolean;
}

/**
 * Stock-level operational fields.
 *
 * Fiscal identity (barcode, CPV, TARIC, myDATA classifications, VAT categories, invoicing
 * unit) deliberately does NOT live here — it lives on `products`, which is what
 * `_shared/fiscal/invoice-builder.ts`, the POS and OrdersPanel actually read when they build
 * a line. Duplicating it on the stock row produced fields an operator could fill in that
 * were then submitted nowhere; see `ProductFiscalFields` below.
 */
export interface WarehouseItemCatalogFields {
  serial_number?: string | null;
  reorder_point?: number;
  location?: string | null;
  /** The WAREHOUSE unit — how stock is counted. The invoicing unit is
   *  products.measurement_unit_code. They legitimately differ (buy by pallet, sell by m²). */
  unit?: string;
}

/**
 * Catalog + fiscal identity of a product. Every field here is read by at least one
 * downstream process: invoice-builder (VAT category + income classification + unit), the POS
 * (same three), OrdersPanel (unit), quote/order lines (discount), and the product modal.
 */
export interface ProductFiscalFields {
  barcode?: string | null;
  cpv_code?: string | null;
  taric_code?: string | null;
  /** AADE measurement-unit code 1-6 — the invoicing unit. */
  measurement_unit_code?: number | null;
  /** Sale-side AADE VAT category (1 = 24%, 2 = 13%, 3 = 6%, …). */
  mydata_vat_category?: number | null;
  /** Wholesale income classification (χονδρική). */
  mydata_income_classification_category?: string | null;
  mydata_income_classification_type?: string | null;
  /** Retail income classification (λιανική) — a different E3 code for the same item. */
  mydata_income_classification_category_retail?: string | null;
  mydata_income_classification_type_retail?: string | null;
  prices_include_vat?: boolean;
  markup_percent?: number | null;
  warranty?: string | null;
  product_url?: string | null;
  notes?: string | null;
  item_type?: string;
  category_id?: string | null;
  supplier_company_id?: string | null;
}

/** The one place the fiscal column list is written down, shared by create and update. */
const FISCAL_KEYS = [
  'barcode', 'cpv_code', 'taric_code', 'measurement_unit_code',
  'mydata_vat_category',
  'mydata_income_classification_category', 'mydata_income_classification_type',
  'mydata_income_classification_category_retail', 'mydata_income_classification_type_retail',
  'prices_include_vat', 'markup_percent',
  'warranty', 'product_url', 'notes', 'item_type', 'category_id', 'supplier_company_id',
] as const;

function pickFiscal(fields: ProductFiscalFields | undefined): Record<string, unknown> {
  if (!fields) return {};
  const patch: Record<string, unknown> = {};
  for (const k of FISCAL_KEYS) if (fields[k] !== undefined) patch[k] = fields[k];
  return patch;
}

export const warehouseService = {
  // ── Warehouses (multi-warehouse) ──────────────────────────────────────
  async listWarehouses(workspaceId: string): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from('warehouses')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
    return (data ?? []) as Warehouse[];
  },

  /** Get-or-create the workspace's default warehouse; returns its id. */
  async ensureDefaultWarehouse(workspaceId: string): Promise<string> {
    const { data, error } = await supabase.rpc('ensure_default_warehouse', { p_workspace_id: workspaceId });
    if (error) throw error;
    return data as string;
  },

  async createWarehouse(input: { workspaceId: string; name: string; code?: string; location?: string; isDefault?: boolean }): Promise<Warehouse> {
    const { data, error } = await supabase.from('warehouses').insert({
      workspace_id: input.workspaceId,
      name: input.name,
      code: input.code ?? null,
      location: input.location ?? null,
      is_default: input.isDefault ?? false,
    }).select('*').single();
    if (error) throw error;
    return data as Warehouse;
  },

  /** Move stock of an item's product into another warehouse (out+in movements). */
  async transfer(fromItemId: string, toWarehouseId: string, quantity: number): Promise<string> {
    const { data, error } = await supabase.rpc('transfer_stock', {
      p_from_item_id: fromItemId, p_to_warehouse_id: toWarehouseId, p_qty: quantity,
    });
    if (error) throw error;
    return data as string;
  },

  // ── Items ───────────────────────────────────────────────────────────────
  async listItems(workspaceId: string, warehouseId?: string): Promise<WarehouseItem[]> {
    let q = supabase.from('warehouse_items').select('*').eq('workspace_id', workspaceId);
    if (warehouseId) q = q.eq('warehouse_id', warehouseId);
    const { data, error } = await q.order('name');
    if (error) throw error;
    return (data ?? []) as WarehouseItem[];
  },

  /**
   * Everything the catalog knows about one product's physical stock, for the product record.
   *
   * Scoped by `workspace_id` on top of RLS on purpose: `wh_items_read` is
   * `is_workspace_member(workspace_id)`, so the policy alone would happily return stock for a
   * product that belongs to a DIFFERENT workspace the caller also happens to be a member of.
   * The caller passes the ACTIVE workspace and must already have checked that the product
   * belongs to it — stock for someone else's catalog product is never a meaningful answer.
   */
  async productStock(workspaceId: string, productId: string): Promise<ProductStockRow[]> {
    const { data, error } = await supabase
      .from('warehouse_items')
      .select('*, warehouses(id, name, code, is_default)')
      .eq('workspace_id', workspaceId)
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      ...(r as WarehouseItem),
      warehouse_name: r.warehouses?.name ?? null,
      warehouse_is_default: !!r.warehouses?.is_default,
    })) as ProductStockRow[];
  },

  /** The in/out ledger for one product, newest first. Answers "where did it go". */
  async productMovements(workspaceId: string, productId: string, limit = 20): Promise<StockMovementRow[]> {
    const items = await this.productStock(workspaceId, productId);
    const ids = items.map((i) => i.id);
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, item_id, direction, quantity, reason, source_type, source_id, occurred_at')
      .eq('workspace_id', workspaceId)
      .in('item_id', ids)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as StockMovementRow[];
  },

  async createItem(input: {
    workspaceId: string; name: string; warehouse_id: string; sku?: string; unit?: string;
    qty_on_hand?: number; reorder_point?: number; location?: string; product_id?: string | null;
  } & WarehouseItemCatalogFields & WarehouseItemPhysicalFields): Promise<string> {
    const { data, error } = await supabase.from('warehouse_items').insert({
      workspace_id: input.workspaceId,
      warehouse_id: input.warehouse_id,
      name: input.name,
      sku: input.sku ?? null,
      unit: input.unit ?? 'pcs',
      qty_on_hand: input.qty_on_hand ?? 0,
      reorder_point: input.reorder_point ?? 0,
      location: input.location ?? null,
      product_id: input.product_id ?? null,
      serial_number: input.serial_number ?? null,
      width_mm: input.width_mm ?? null,
      length_mm: input.length_mm ?? null,
      thickness_mm: input.thickness_mm ?? null,
      weight_kg: input.weight_kg ?? null,
      manufacturer: input.manufacturer ?? null,
      supplier_product_code: input.supplier_product_code ?? null,
      image_urls: input.image_urls ?? [],
    }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  },

  /** Update a stock item's operational fields (serial, reorder point, location, warehouse
   *  unit). Only the keys present in `fields` are written, so a caller editing just the
   *  reorder point never clears the rest. RLS enforces finance-manager + the 'stock'
   *  entitlement (same gate as stock-api). Fiscal fields → `updateProductFiscal`. */
  async updateItemCatalog(id: string, fields: WarehouseItemCatalogFields): Promise<void> {
    const patch: Record<string, unknown> = {};
    for (const k of [
      'serial_number', 'reorder_point', 'location', 'unit',
    ] as const) {
      if (fields[k] !== undefined) patch[k] = fields[k];
    }
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from('warehouse_items').update(patch).eq('id', id);
    if (error) throw error;
  },

  /**
   * Create the catalog product for a received supplier line through the SHARED ingest core
   * (`/api/products/create-manual`) — the same path the dealer "Add product" form uses.
   *
   * This is what makes an intake-created product a first-class catalog citizen: the core
   * registers each photo in `document_images`, runs the full image suite (SLIG visual +
   * Claude vision_analysis → Voyage understanding + the 4 aspect vectors), canonicalizes the
   * facets, and writes the Voyage text embedding. Doing a bare `products` insert here — as
   * this used to — produced a product that was invisible to every search surface and whose
   * photos lived nowhere the platform looks.
   *
   * Falls back to the local insert when MIVAA is unreachable: a warehouse receipt must never
   * be blocked by the AI backend being down. The product is then created without embeddings
   * and can be re-ingested later.
   */
  async createProductViaIngestCore(input: {
    workspaceId: string; name: string; sku?: string | null; externalSku?: string | null;
    unit?: string | null; cost?: number | null; costCurrency?: string | null; price?: number | null;
    materialCategory?: string | null;
    dimensions?: { width_mm?: number | null; length_mm?: number | null; thickness_mm?: number | null };
    manufacturer?: string | null; grade?: string | null;
    color?: string | null; finish?: string | null; series?: string | null;
    images?: ManualImageRef[];
    itemType?: 'good' | 'service';
  }): Promise<{ productId: string; embedded: boolean }> {
    const dims = input.dimensions ?? {};
    const sizeLabel = dims.width_mm != null && dims.length_mm != null
      ? `${dims.width_mm}x${dims.length_mm}mm` : undefined;
    const metadata: Record<string, unknown> = {};
    if (input.unit) metadata.unit = input.unit;
    if (input.manufacturer) metadata.factory_name = input.manufacturer;
    if (input.grade) metadata.quality_grade = input.grade;
    if (input.color) metadata.color = input.color;
    if (input.finish) metadata.finish = input.finish;
    if (input.series) metadata.collection = input.series;
    if (dims.width_mm != null || dims.length_mm != null || dims.thickness_mm != null) {
      metadata.dimensions = [{
        width: dims.width_mm ?? null, height: dims.length_mm ?? null,
        depth: dims.thickness_mm ?? null, unit: 'mm', source: 'supplier_line',
      }];
    }
    try {
      const productId = await dealerProductsService.createManualProduct(input.workspaceId, {
        name: input.name,
        material_category: input.materialCategory ?? undefined,
        unit: input.unit ?? undefined,
        dimensions: sizeLabel,
        external_sku: input.externalSku ?? undefined,
        cost: input.cost ?? null,
        cost_currency: input.costCurrency ?? 'EUR',
        price: input.price ?? null,
        metadata,
        images: input.images ?? [],
        source: 'warehouse_intake',
      });
      return { productId, embedded: true };
    } catch (e) {
      // A quota refusal is final — the local fallback insert would hit the same
      // enforce_material_quota trigger. Rethrow so the caller shows the upgrade prompt (#214).
      if (isQuotaError(e)) throw e;
      const productId = await this.createProduct({
        workspaceId: input.workspaceId, name: input.name, sku: input.sku ?? null,
        externalSku: input.externalSku ?? null, unit: input.unit, cost: input.cost,
        costCurrency: input.costCurrency, dimensions: input.dimensions,
        manufacturer: input.manufacturer, grade: input.grade,
        color: input.color, finish: input.finish, series: input.series,
        itemType: input.itemType,
      });
      return { productId, embedded: false };
    }
  },

  /** Minimal catalog product (name + sku) — the LOCAL fallback used when the ingest core is
   *  unreachable. Prefer `createProductViaIngestCore`, which also embeds the images.
   *
   *  `products` has no dimension/unit columns (they live in `metadata`, which is what the
   *  catalog search and the product modal read), so the physical facts parsed at intake are
   *  written there rather than invented as new columns. */
  async createProduct(input: {
    workspaceId: string; name: string; sku?: string | null; itemType?: 'good' | 'service';
    unit?: string | null; cost?: number | null; costCurrency?: string | null;
    dimensions?: { width_mm?: number | null; length_mm?: number | null; thickness_mm?: number | null };
    manufacturer?: string | null; externalSku?: string | null; grade?: string | null;
    /** Canonicalized facets read from the supplier line. Written into `metadata` under the
     *  keys the facet canonicalizer and faceted search already use. */
    color?: string | null; finish?: string | null; series?: string | null;
    /** Fiscal identity — what makes the item submittable to myDATA. */
    fiscal?: ProductFiscalFields;
  }): Promise<string> {
    const dims = input.dimensions ?? {};
    const hasDims = dims.width_mm != null || dims.length_mm != null || dims.thickness_mm != null;
    const metadata: Record<string, unknown> = {};
    if (input.unit) metadata.unit = input.unit;
    if (input.manufacturer) metadata.factory_name = input.manufacturer;
    if (input.grade) metadata.quality_grade = input.grade;
    // `color` and `finish` are whitelisted facet keys — writing them here means the product
    // is filterable and canonicalizable on day one instead of after a re-tag pass.
    if (input.color) metadata.color = input.color;
    if (input.finish) metadata.finish = input.finish;
    if (input.series) metadata.collection = input.series;
    if (hasDims) {
      metadata.dimensions = [{
        width: dims.width_mm ?? null, height: dims.length_mm ?? null,
        depth: dims.thickness_mm ?? null, unit: 'mm', source: 'supplier_line',
      }];
    }
    const { data, error } = await supabase.from('products').insert({
      workspace_id: input.workspaceId,
      name: input.name,
      sku: input.sku ?? null,
      external_sku: input.externalSku ?? null,
      item_type: input.itemType ?? 'good',
      cost: input.cost ?? null,
      cost_currency: input.cost != null ? (input.costCurrency ?? 'EUR') : null,
      cost_updated_at: input.cost != null ? new Date().toISOString() : null,
      cost_source: input.cost != null ? 'supplier_invoice' : null,
      ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
      ...pickFiscal(input.fiscal),
    }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  },

  /** Patch the fiscal/catalog identity of an existing product. Patch-only: an omitted key is
   *  left alone. This is the write path for everything that must reach AADE. */
  async updateProductFiscal(productId: string, fields: ProductFiscalFields): Promise<void> {
    const patch = pickFiscal(fields);
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from('products').update(patch).eq('id', productId);
    if (error) throw error;
  },

  /**
   * "We already carry this" — does the OPERATOR catalog already contain this product?
   *
   * A dealer workspace cannot read the operator's products (RLS is workspace-scoped), so
   * without this a dealer adding an item we already stock silently creates a duplicate that
   * shares none of our identity, images or embeddings. The RPC verifies membership before
   * returning anything and reports whether the caller may actually sell the match.
   *
   * Returns [] for the operator itself (nothing above it) and on any failure — this is an
   * advisory check, never a gate on creating a product.
   */
  async findOperatorCatalogMatches(
    workspaceId: string,
    query: string,
    opts: { sku?: string | null; brand?: string | null; limit?: number } = {},
  ): Promise<OperatorCatalogMatch[]> {
    if (!workspaceId || (!query?.trim() && !opts.sku)) return [];
    try {
      const { data, error } = await supabase.rpc('find_operator_catalog_matches', {
        p_workspace_id: workspaceId,
        p_query: query ?? '',
        p_sku: opts.sku ?? null,
        p_brand: opts.brand ?? null,
        p_limit: opts.limit ?? 8,
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        id: r.product_id, name: r.name, sku: r.sku ?? null,
        image_url: r.image_url ?? null, score: r.score != null ? Number(r.score) : null,
        factoryName: r.factory_name ?? null,
        hasCatalogAccess: !!r.has_catalog_access,
        operatorWorkspaceId: r.operator_workspace ?? null,
      }));
    } catch {
      return [];
    }
  },

  /** Catalog candidates for matching a supplier line to an existing product. Searches name,
   *  sku and external_sku, and brings back the best image so the operator confirms visually
   *  rather than on a name alone. */
  async searchCatalogProducts(workspaceId: string, query: string, limit = 8): Promise<CatalogMatch[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    // NOT `esc` — this strips PostgREST `or()` metacharacters, it does NOT escape HTML.
    // Invariant 11: the two contracts shared a name, and swapping them is a silent injection.
    const filterSafe = q.replace(/[,%()]/g, ' ').trim();
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, sku, external_sku, metadata, ${PRODUCT_IMAGE_SELECT}`)
      .eq('workspace_id', workspaceId)
      .neq('supply_mode', 'reference_only')
      .or(`name.ilike.%${filterSafe}%,sku.ilike.%${filterSafe}%,external_sku.ilike.%${filterSafe}%`)
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((p: any) => ({
      id: p.id, name: p.name, sku: p.sku ?? p.external_sku ?? null,
      image_url: getProductImageUrl(p),
    }));
  },

  /**
   * Find catalog products that LOOK like the supplied photo.
   *
   * Runs the platform's existing 7-vector search (`strategy: 'multi_vector'` in MIVAA) over
   * the image — the same engine the material picker and segmentation flows use, which is why
   * this needs no new embedding infrastructure: catalog images are already embedded in
   * `vecs.image_*_embeddings`, and the query image is embedded on the fly.
   *
   * Best-effort: a MIVAA outage returns [] rather than blocking a warehouse intake.
   */
  async matchCatalogByImage(workspaceId: string, imageBase64: string, hint = '', topK = 6): Promise<CatalogMatch[]> {
    try {
      const res = await mivaaApi.searchByImageCrop({
        image_base64: imageBase64, query: hint, workspace_id: workspaceId, top_k: topK,
      });
      const results = (res?.success && (res.data as any)?.results) as any[] | undefined;
      if (!Array.isArray(results)) return [];
      // Same result shape the material picker consumes: `id` is the product, images come as
      // an `images[]` array (primary first), and the name may live in metadata.
      const seen = new Set<string>();
      const out: CatalogMatch[] = [];
      for (const r of results) {
        const id = r?.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const primary = Array.isArray(r.images)
          ? (r.images.find((im: any) => im?.isPrimary) ?? r.images[0])
          : null;
        out.push({
          id,
          name: getProductName(r),
          sku: r.sku ?? r.external_sku ?? null,
          image_url: primary?.url ?? getProductImageUrl(r) ?? null,
          score: typeof r.similarity_score === 'number' ? r.similarity_score
            : (typeof r.score === 'number' ? r.score : null),
        });
      }
      return out;
    } catch {
      return [];
    }
  },

  /**
   * Upload intake photos. Returns full storage refs, not just URLs, because the shared
   * ingest core (`/api/products/create-manual`) needs `storage_path` to register each image
   * in `document_images` and run the embedding suite over it.
   */
  async uploadItemImages(workspaceId: string, files: File[]): Promise<ManualImageRef[]> {
    const refs: ManualImageRef[] = [];
    for (const file of files) {
      // Same prefix the dealer "Add product" flow uses, so intake photos and dealer photos
      // are one class of object with one lifecycle.
      refs.push(await dealerProductsService.uploadImage(workspaceId, file, refs.length));
    }
    return refs;
  },

  async recordMovement(itemId: string, direction: 'in' | 'out' | 'adjust', quantity: number, reason?: string): Promise<number> {
    const { data, error } = await supabase.rpc('record_stock_movement', {
      p_item_id: itemId, p_direction: direction, p_quantity: quantity, p_reason: reason ?? null,
    });
    if (error) throw error;
    return data as number;
  },

  async deleteItem(id: string): Promise<void> {
    const { error } = await supabase.from('warehouse_items').delete().eq('id', id);
    if (error) throw error;
  },

  // ── Pending products (AI-extracted from inbound expenses → ✓ add / ✗ dismiss) ──
  /** Queued supplier lines awaiting ✓/✗. Carries WHERE each line came from (issuer + document)
   *  so the queue reads as "what my partners invoiced me", not a list of anonymous strings. */
  async listPending(workspaceId: string): Promise<PendingProduct[]> {
    const { data, error } = await supabase.from('warehouse_pending_items')
      .select('*, inbound_document:inbound_documents(issuer_name, issuer_vat, series, aa, issue_date, total_gross, currency)')
      .eq('workspace_id', workspaceId).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as PendingProduct[];
  },
  async approvePending(id: string, overrides: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.rpc('approve_pending_warehouse_item', { p_id: id, p_overrides: overrides });
    if (error) throw error;
    return data as string;
  },
  async dismissPending(id: string): Promise<void> {
    const { error } = await supabase.rpc('dismiss_pending_warehouse_item', { p_id: id });
    if (error) throw error;
  },
};

export interface PendingProduct {
  id: string; workspace_id: string; inbound_document_id: string | null; raw_description: string | null;
  name: string; sku: string | null; unit: string | null; size: string | null; attributes: string | null;
  quantity: number; unit_cost: number | null; currency: string;
  suggested_sales_price: number | null; sales_price: number | null; category_id: string | null;
  matched_product_id: string | null; add_to_catalog: boolean; target_warehouse_id: string | null;
  /** Set server-side by `match_pending_items_for_document`. 1.0 = the supplier's own item code
   *  identifies stock we already carry, so approving TOPS UP that item instead of creating a
   *  second product. Below 0.5 nothing matched and approving creates a new product. */
  matched_warehouse_item_id?: string | null;
  match_score?: number | null;
  match_reason?: string | null;
  /** The myDATA document this line came from — who invoiced it and under which number. */
  inbound_document?: {
    issuer_name: string | null; issuer_vat: string | null;
    series: string | null; aa: string | null;
    issue_date: string | null; total_gross: number | null; currency: string | null;
  } | null;
}
