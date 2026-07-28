import { supabase } from '@/integrations/supabase/client';
import { PRODUCT_IMAGE_SELECT, getProductImageUrl } from '@/utils/productMetadata';
import { mivaaApi } from '@/services/mivaaApiClient';

/** A catalog product offered as the match for a supplier line. */
export interface CatalogMatch {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;
  /** Visual-similarity score when the match came from an image; null for a text match. */
  score?: number | null;
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
  // #207 — catalog depth (Oxygen warehouse_products parity)
  barcode: string | null;
  serial_number: string | null;
  cpv_code: string | null;
  taric_code: string | null;
  mydata_classification_type: string | null;
  mydata_classification_category: string | null;
  // Physical + identity metadata, mostly parsed from the supplier line at intake.
  width_mm: number | null;
  length_mm: number | null;
  thickness_mm: number | null;
  weight_kg: number | null;
  manufacturer: string | null;
  supplier_product_code: string | null;
  image_urls: string[];
  notes: string | null;
  is_active: boolean;
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
  notes?: string | null;
  is_active?: boolean;
}

/** The #207 catalog-depth fields, set on create and editable afterwards. */
export interface WarehouseItemCatalogFields {
  barcode?: string | null;
  serial_number?: string | null;
  cpv_code?: string | null;
  taric_code?: string | null;
  mydata_classification_type?: string | null;
  mydata_classification_category?: string | null;
  // Operational fields — editable after creation (previously only settable at create time).
  reorder_point?: number;
  location?: string | null;
  unit?: string;
}

export const warehouseService = {
  // ── Warehouses (#207 multi-warehouse) ──────────────────────────────────────
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
      barcode: input.barcode ?? null,
      serial_number: input.serial_number ?? null,
      cpv_code: input.cpv_code ?? null,
      taric_code: input.taric_code ?? null,
      mydata_classification_type: input.mydata_classification_type ?? null,
      mydata_classification_category: input.mydata_classification_category ?? null,
      width_mm: input.width_mm ?? null,
      length_mm: input.length_mm ?? null,
      thickness_mm: input.thickness_mm ?? null,
      weight_kg: input.weight_kg ?? null,
      manufacturer: input.manufacturer ?? null,
      supplier_product_code: input.supplier_product_code ?? null,
      image_urls: input.image_urls ?? [],
      notes: input.notes ?? null,
    }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  },

  /** Patch a stock item's physical/identity metadata. Same patch-only semantics as
   *  `updateItemCatalog` — an omitted key is left alone, never nulled. */
  async updateItemPhysical(id: string, fields: WarehouseItemPhysicalFields): Promise<void> {
    const patch: Record<string, unknown> = {};
    for (const k of [
      'width_mm', 'length_mm', 'thickness_mm', 'weight_kg',
      'manufacturer', 'supplier_product_code', 'image_urls', 'notes', 'is_active',
    ] as const) {
      if (fields[k] !== undefined) patch[k] = fields[k];
    }
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from('warehouse_items').update(patch).eq('id', id);
    if (error) throw error;
  },

  /** Update a stock item's catalog-depth fields (#207 codes/classification) and/or its operational
   *  fields (reorder point, location, unit). Only the keys present in `fields` are written, so a
   *  caller editing just the reorder point never clears the codes and vice-versa. RLS enforces
   *  finance-manager + the 'stock' entitlement (same gate as stock-api). */
  async updateItemCatalog(id: string, fields: WarehouseItemCatalogFields): Promise<void> {
    const patch: Record<string, unknown> = {};
    for (const k of [
      'barcode', 'serial_number', 'cpv_code', 'taric_code',
      'mydata_classification_type', 'mydata_classification_category',
      'reorder_point', 'location', 'unit',
    ] as const) {
      if (fields[k] !== undefined) patch[k] = fields[k];
    }
    if (Object.keys(patch).length === 0) return;
    const { error } = await supabase.from('warehouse_items').update(patch).eq('id', id);
    if (error) throw error;
  },

  /** Minimal catalog product (name + sku) — used when building stock from a supplier
   *  expense line so the received good is also sellable. Returns the new product id.
   *
   *  `products` has no dimension/unit columns (they live in `metadata`, which is what the
   *  catalog search and the product modal read), so the physical facts parsed at intake are
   *  written there rather than invented as new columns. */
  async createProduct(input: {
    workspaceId: string; name: string; sku?: string | null; itemType?: 'good' | 'service';
    unit?: string | null; cost?: number | null; costCurrency?: string | null;
    dimensions?: { width_mm?: number | null; length_mm?: number | null; thickness_mm?: number | null };
    manufacturer?: string | null; externalSku?: string | null; grade?: string | null;
  }): Promise<string> {
    const dims = input.dimensions ?? {};
    const hasDims = dims.width_mm != null || dims.length_mm != null || dims.thickness_mm != null;
    const metadata: Record<string, unknown> = {};
    if (input.unit) metadata.unit = input.unit;
    if (input.manufacturer) metadata.factory_name = input.manufacturer;
    if (input.grade) metadata.quality_grade = input.grade;
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
    }).select('id').single();
    if (error) throw error;
    return (data as any).id as string;
  },

  /** Catalog candidates for matching a supplier line to an existing product. Searches name,
   *  sku and external_sku, and brings back the best image so the operator confirms visually
   *  rather than on a name alone. */
  async searchCatalogProducts(workspaceId: string, query: string, limit = 8): Promise<CatalogMatch[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const esc = q.replace(/[,%()]/g, ' ').trim();
    const { data, error } = await supabase
      .from('products')
      .select(`id, name, sku, external_sku, metadata, ${PRODUCT_IMAGE_SELECT}`)
      .eq('workspace_id', workspaceId)
      .neq('supply_mode', 'reference_only')
      .or(`name.ilike.%${esc}%,sku.ilike.%${esc}%,external_sku.ilike.%${esc}%`)
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
      const seen = new Set<string>();
      const out: CatalogMatch[] = [];
      for (const r of results) {
        // The multi-vector index is image-first: a hit may be an image that belongs to a
        // product, or the product itself. Only image hits carrying a product are usable here.
        const id = r.product_id ?? r.id;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        out.push({
          id,
          name: r.product_name ?? r.name ?? r.title ?? 'Untitled product',
          sku: r.sku ?? r.external_sku ?? null,
          image_url: r.image_url ?? r.thumbnail_url ?? null,
          score: typeof r.score === 'number' ? r.score : (typeof r.similarity === 'number' ? r.similarity : null),
        });
      }
      return out;
    } catch {
      return [];
    }
  },

  /** Upload intake photos for a stock item. Public bucket — these are product shots, and the
   *  catalog matcher needs a stable URL it can hand to visual search later. */
  async uploadItemImages(workspaceId: string, files: File[]): Promise<string[]> {
    const urls: string[] = [];
    for (const file of files) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `warehouse/${workspaceId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('generation-images').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg',
      });
      if (error) throw error;
      urls.push(supabase.storage.from('generation-images').getPublicUrl(path).data.publicUrl);
    }
    return urls;
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
  async listPending(workspaceId: string): Promise<PendingProduct[]> {
    const { data, error } = await supabase.from('warehouse_pending_items')
      .select('*').eq('workspace_id', workspaceId).eq('status', 'pending')
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
}
