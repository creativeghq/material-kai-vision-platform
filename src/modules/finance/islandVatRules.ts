/**
 * What a delivery destination means for the VAT rate — the part with no I/O (#443).
 *
 * IMPORT-FREE on purpose. The verdict is derived in SQL and the service that fetches it pulls in
 * the Supabase client, which fails closed when no environment is configured — so a hermetic unit
 * test cannot import it. The rule itself has no dependencies, so it lives here.
 */

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

/**
 * Whether a verdict should STOP the operator rather than merely inform them.
 *
 * Only `unclassified` does. The others are all answers; this one is the absence of one, and
 * letting it through is how a Leros delivery quietly goes out at 24%.
 */
export function vatVerdictBlocks(v: VatDestinationVerdict | null): boolean {
  return v?.status === 'unclassified';
}
