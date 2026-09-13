/**
 * Island VAT (#443) — ν.5246/2025, live since 1/1/2026.
 *
 * The rate follows where the goods are DELIVERED, not who the customer is. It is derived in SQL
 * once, so the invoice dialog, the PDF and the myDATA envelope cannot give three answers; an
 * unclassifiable destination is REFUSED rather than defaulted, because a wrong VAT rate is a valid
 * percentage that nothing downstream can catch.
 */
import { supabase } from '@/integrations/supabase/client';

import type { VatDestinationVerdict } from '@/modules/finance/islandVatRules';

export type { VatTerritoryStatus, VatDestinationVerdict } from '@/modules/finance/islandVatRules';
export { vatVerdictBlocks } from '@/modules/finance/islandVatRules';

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
