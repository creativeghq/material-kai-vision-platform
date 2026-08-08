import { supabase } from '@/integrations/supabase/client';

/**
 * Per-product supplier price list (#324 phase 5) over `supplier_products`.
 *
 * `cost` here is THIS workspace's negotiated deal with THAT supplier — it is private and is
 * never written by a manufacturer publish. Two workspaces legitimately hold different costs
 * for the same SKU. The only automated path into a cost is the operator accepting a published
 * ask (`catalogMasterService.acceptPrice`), and that touches the operator catalog alone.
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
    const { data, error } = await supabase
      .from('supplier_products').select('*')
      .eq('product_id', productId)
      .order('is_preferred', { ascending: false })
      .order('cost', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as unknown as SupplierProductRow[];
  },

  /** Supplier company names for the rows (the table carries only ids). */
  async supplierNames(ids: string[]): Promise<Record<string, string>> {
    if (ids.length === 0) return {};
    const { data } = await supabase.from('crm_companies').select('id, name').in('id', [...new Set(ids)]);
    return Object.fromEntries((data ?? []).map((c) => [c.id, c.name]));
  },

  /**
   * Add or update one supplier row. Explicit field list, never a spread of caller input —
   * `workspace_id` and identity columns are set from trusted context only.
   */
  async upsert(workspaceId: string, productId: string, input: SupplierProductInput, id?: string): Promise<void> {
    const payload = {
      workspace_id: workspaceId,
      product_id: productId,
      supplier_company_id: input.supplier_company_id,
      supplier_sku: input.supplier_sku ?? null,
      cost: input.cost ?? null,
      currency: input.currency ?? 'EUR',
      moq: input.moq ?? null,
      lead_time_days: input.lead_time_days ?? null,
      is_preferred: input.is_preferred ?? false,
      availability: input.availability ?? null,
      valid_until: input.valid_until ?? null,
    };
    const { error } = id
      ? await supabase.from('supplier_products').update(payload).eq('id', id)
      : await supabase.from('supplier_products').insert(payload);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('supplier_products').delete().eq('id', id);
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
    const { error } = await supabase
      .from('products').update({ enforce_moq: enabled }).eq('id', productId);
    if (error) throw error;
  },

  /** Exactly one preferred supplier per product — the sourcing resolver picks preferred first. */
  async setPreferred(productId: string, rowId: string): Promise<void> {
    const { error: clearErr } = await supabase
      .from('supplier_products').update({ is_preferred: false }).eq('product_id', productId);
    if (clearErr) throw clearErr;
    const { error } = await supabase.from('supplier_products').update({ is_preferred: true }).eq('id', rowId);
    if (error) throw error;
  },
};
