import { supabase } from '@/integrations/supabase/client';

/**
 * Per-product supplier price list (#324 phase 5) over `supplier_products`.
 *
 * `cost` here is THIS workspace's negotiated deal with THAT supplier — it is private and is
 * never written by a manufacturer publish. Two workspaces legitimately hold different costs
 * for the same SKU. The only automated path into a cost is the operator accepting a published
 * ask (`catalogMasterService.acceptPrice`), and that touches the operator catalog alone.
 *
 * EVERY CALL HERE IS AN RPC, AND THAT IS THE POINT (#368 PD-3).
 * This service used to take a `workspaceId` argument from React state and persist it: it
 * listed by `product_id` alone, mutated by row id alone, and wrote whatever workspace the
 * caller handed it. RLS bounded that, which is why it was a defence-in-depth gap rather than
 * a live leak — but it is the shape invariant 1 forbids, and the mitigation was one layer
 * deep. It also never checked that `supplier_company_id` belonged to the workspace at all.
 *
 * The RPCs derive the workspace from the PRODUCT row and re-check the caller against it, so
 * there is no workspace id on this surface to get wrong. `set_preferred_supplier_product`
 * additionally scopes BOTH of its statements, where the old client version cleared
 * `is_preferred` by product_id alone and so reached into another workspace's row for the same
 * product.
 */
export interface SupplierProductRow {
  id: string;
  workspace_id: string;
  product_id: string;
  supplier_company_id: string;
  supplier_sku: string | null;
  cost: number | null;
  currency: string;
  moq: number | null;
  lead_time_days: number | null;
  is_preferred: boolean;
  availability: string | null;
  valid_until: string | null;
  updated_at: string;
  /** Joined by the RPC — the table carries only ids. */
  supplier_name?: string | null;
}

export interface SupplierProductInput {
  supplier_company_id: string;
  supplier_sku?: string | null;
  cost?: number | null;
  currency?: string;
  moq?: number | null;
  lead_time_days?: number | null;
  is_preferred?: boolean;
  availability?: string | null;
  valid_until?: string | null;
}

export const supplierPricingService = {
  async listForProduct(productId: string): Promise<SupplierProductRow[]> {
    const { data, error } = await supabase.rpc('list_supplier_products' as never, {
      p_product_id: productId,
    } as never);
    if (error) throw error;
    return (data ?? []) as unknown as SupplierProductRow[];
  },

  /**
   * Add or update one supplier row. No workspace argument: the RPC reads it off the product
   * and validates the supplier company against it.
   */
  async upsert(productId: string, input: SupplierProductInput, id?: string): Promise<void> {
    const { error } = await supabase.rpc('upsert_supplier_product' as never, {
      p_product_id: productId,
      p_supplier_company_id: input.supplier_company_id,
      p_supplier_sku: input.supplier_sku ?? null,
      p_cost: input.cost ?? null,
      p_currency: input.currency ?? 'EUR',
      p_moq: input.moq ?? null,
      p_lead_time_days: input.lead_time_days ?? null,
      p_availability: input.availability ?? null,
      p_valid_until: input.valid_until ?? null,
      p_row_id: id ?? null,
    } as never);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.rpc('delete_supplier_product' as never, {
      p_row_id: id,
    } as never);
    if (error) throw error;
  },

  /**
   * Whether sourcing must round an order up to the supplier's minimum order quantity.
   * MOQ figures are inert without this switch: the resolver reads it before deciding whether
   * a shortfall of 3 becomes an order for 3 or an order for the supplier's minimum of 50.
   */
  async getEnforceMoq(productId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('products').select('enforce_moq').eq('id', productId).maybeSingle();
    if (error) throw error;
    return !!data?.enforce_moq;
  },

  async setEnforceMoq(productId: string, enabled: boolean): Promise<void> {
    const { error } = await supabase.rpc('set_product_enforce_moq' as never, {
      p_product_id: productId,
      p_enabled: enabled,
    } as never);
    if (error) throw error;
  },

  /** Exactly one preferred supplier per product — the sourcing resolver picks preferred first. */
  async setPreferred(productId: string, rowId: string): Promise<void> {
    const { error } = await supabase.rpc('set_preferred_supplier_product' as never, {
      p_product_id: productId,
      p_row_id: rowId,
    } as never);
    if (error) throw error;
  },
};
