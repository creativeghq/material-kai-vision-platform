/**
 * Pricing an intake line. Issue #342 §3.
 *
 * ONE resolver, always: `get_product_price_for_workspace`. The model never supplies a price and
 * this module never computes one — it asks the same RPC `QuotesService.addItem` and
 * `quote-tools.resolveLine` ask, with the same `audience: 'seller'`, so a line proposed from a
 * WhatsApp message is priced identically to the same line typed into a quote.
 *
 * A product the resolver cannot price comes back `null`, and the line is flagged for a human.
 * Null means NO PRICE — never a fallback, never a list price standing in for a customer price.
 * The customer-specific layers (company/contact discounts, the markup ladder) only apply because
 * the party is passed in, which is why pricing is re-run when the reviewer assigns the customer.
 */

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
  },
): Promise<ResolvedPrice> {
  const { data, error } = await db.rpc('get_product_price_for_workspace', {
    p_workspace_id: args.workspaceId,
    p_product_id: args.productId,
    p_company_id: args.companyId,
    p_contact_id: args.contactId,
    p_audience: 'seller',
    // `p_quantity` is deliberately NOT passed, so an intake line prices identically to the same
    // line typed into a quote — `QuotesService.addItem` and `quote-tools.resolveLine` both omit
    // it. Passing it here would make order intake the platform's FIRST caller to fire quantity
    // breaks, i.e. the first to exercise an untested pricing path, on a money quantity. That is
    // a deliberate follow-up on #342, not something to switch on by accident.
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
