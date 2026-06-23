// Business → contact resolution. A CRM contact attached to a company ALWAYS
// uses that company's billing/VAT identity and pricing — a person who belongs to
// a business has no separate commercial identity (the per-section "different from
// business" override was removed 2026-06). Only an unattached contact (sole
// trader / freelancer) carries its own billing/VAT/pricing.
//
// "Primary company" = the contact's crm_company_contacts row flagged is_primary,
// falling back to the oldest attachment when none is flagged. These helpers run
// under the service-role client in edge functions (invoice-builder, price-tools).

// deno-lint-ignore no-explicit-any
type Db = any;

/** The contact's primary company row (full row), or null when unattached. */
export async function getPrimaryCompanyForContact(supabase: Db, contactId: string): Promise<any | null> {
  const { data } = await supabase
    .from('crm_company_contacts')
    .select('is_primary, created_at, crm_companies!inner(*)')
    .eq('contact_id', contactId)
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.crm_companies ?? null;
}

/**
 * The row whose BILLING/VAT identity represents this contact for invoicing.
 * Returns the primary company when one is attached; otherwise the contact itself.
 * Both shapes are accepted by `partyFromCrm`, so callers can feed the result
 * straight in.
 */
export async function resolveContactBillingSource(supabase: Db, contact: any): Promise<any> {
  const company = await getPrimaryCompanyForContact(supabase, contact.id);
  return company ?? contact;
}

/**
 * The row whose PRICING (discount_percent / user_level_key / prices_vat_inclusive)
 * applies to this contact. Primary company when attached, else the contact itself.
 */
export async function resolveContactPricingSource(supabase: Db, contact: any): Promise<any> {
  const company = await getPrimaryCompanyForContact(supabase, contact.id);
  return company ?? contact;
}
