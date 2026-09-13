/**
 * Island VAT (#443) — ν.5246/2025, live since 1/1/2026.
 *
 * The rate follows where the goods are DELIVERED, not who the customer is. It is derived in SQL
 * once, so the invoice dialog, the PDF and the myDATA envelope cannot give three answers; an
 * unclassifiable destination is REFUSED rather than defaulted, because a wrong VAT rate is a valid
 * percentage that nothing downstream can catch.
 */
import { supabase } from '@/integrations/supabase/client';

/**
 * What the destination says about the rate.
 *
 * `unclassified` is the load-bearing one: it means "we could not decide", which is a different
 * fact from `standard`, and it carries a null category so it cannot be read as 24%.
 */
export type VatTerritoryStatus =
  | 'reduced'
  | 'standard'
  | 'not_applicable'
  | 'unclassified'
  | 'already_reduced'
  | 'no_reduced_equivalent';

export interface VatDestinationVerdict {
  status: VatTerritoryStatus;
  reduced: boolean | null;
  reason: string;
  territory?: string | null;
  region?: string | null;
  legal_basis?: string | null;
  /** The category to use. NULL when the destination could not be classified. */
  category?: number | null;
  rate?: number | null;
  standard_category?: number | null;
  standard_rate?: number | null;
  /** Present on the invoice-level read: which address answered, and as at which date. */
  postal_code?: string | null;
  source?: 'address_unit' | 'company_address' | 'contact_address' | 'none';
  as_at?: string;
}

export const islandVatService = {
  /** The verdict for a destination and a myDATA VAT category, as at a date. */
  async forDestination(input: {
    standardCategory: number;
    postalCode: string | null | undefined;
    countryCode?: string | null;
    on?: string;
  }): Promise<VatDestinationVerdict> {
    const { data, error } = await supabase.rpc('vat_category_for_destination' as never, {
      p_standard_category: input.standardCategory,
      p_postal_code: input.postalCode ?? '',
      p_country_code: input.countryCode ?? 'GR',
      p_on: input.on ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as VatDestinationVerdict;
  },

  /** Where an existing invoice's goods land, and what that means for its rate. */
  async forInvoice(invoiceId: string): Promise<VatDestinationVerdict> {
    const { data, error } = await supabase.rpc('invoice_delivery_vat' as never, {
      p_invoice: invoiceId,
    } as never);
    if (error) throw error;
    return data as unknown as VatDestinationVerdict;
  },

  /** The territory list, for the settings screen that has to be checkable against ELTA. */
  async territories() {
    const { data, error } = await supabase
      .from('vat_reduced_territories')
      .select('*')
      .order('region')
      .order('postcode_prefix');
    if (error) throw error;
    return data ?? [];
  },
};

/**
 * Whether a verdict should STOP the operator rather than merely inform them.
 *
 * Only `unclassified` does. The others are all answers; this one is the absence of one, and
 * letting it through is how a Leros delivery quietly goes out at 24%.
 */
export function vatVerdictBlocks(v: VatDestinationVerdict | null): boolean {
  return v?.status === 'unclassified';
}
