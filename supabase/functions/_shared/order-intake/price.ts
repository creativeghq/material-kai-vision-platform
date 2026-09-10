/** Pricing an intake line. Issue #342 §3. */

import type { DbClient } from '../supabase-client.ts';

export interface ResolvedPrice {
  unit_price: number | null;
  unit_cost: number | null;
  measurement_unit_code: string | null;
  currency: string | null;
  /** True when the resolver explicitly reports the product as unpriced ("call for price"). */
  unpriced: boolean;
}

const NO_PRICE: ResolvedPrice = {
  unit_price: null, unit_cost: null, measurement_unit_code: null, currency: null, unpriced: true,
};

export async function resolveLinePrice(
  db: DbClient,
  args: {
    workspaceId: string;
    productId: string;
    companyId: string | null;
    contactId: string | null;
    /** The line's quantity and its unit. #332 step 1c INVERTED the earlier decision here. */
    quantity?: number | null;
    unit?: string | null;
  },
): Promise<ResolvedPrice> {
  const qty = args.quantity == null ? null : Number(args.quantity);
  const hasQty = qty != null && Number.isFinite(qty) && qty > 0;
  const breakArgs = hasQty && args.unit ? { p_quantity: qty, p_unit: args.unit } : {};
  const { data, error } = await db.rpc('get_product_price_for_workspace', {
    p_workspace_id: args.workspaceId,
    p_product_id: args.productId,
    p_company_id: args.companyId,
    p_contact_id: args.contactId,
    p_audience: 'seller',
    ...breakArgs,
  });
  if (error) {
    console.warn('[order-intake] price resolver failed:', error.message);
    return NO_PRICE;
  }
  // The seller payload: { unpriced, cost_basis, retail, discount_pct, final_sell, suggested_sell,
  // currency, price_unit, ... }. Field names verified against the function body, not assumed —
  // a misspelled key here is a price that silently reads null forever.
  const p = (data || {}) as Record<string, unknown>;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    unit_price: num(p.suggested_sell),
    unit_cost: num(p.cost_basis),
    measurement_unit_code: (p.price_unit as string | null) ?? null,
    currency: (p.currency as string | null) ?? null,
    unpriced: p.unpriced === true,
  };
}

/** The workspace's default VAT rate, so a proposed line totals the way an order line will. */
export async function defaultVatPercent(db: DbClient, workspaceId: string): Promise<number | null> {
  const { data } = await db
    .from('finance_settings')
    .select('default_vat_rate')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const v = (data as { default_vat_rate?: number } | null)?.default_vat_rate;
  return v == null ? null : Number(v);
}
