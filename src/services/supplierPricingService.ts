import { supabase } from '@/integrations/supabase/client';

/** Per-product supplier price list (#324 phase 5) over `supplier_products`. */
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
