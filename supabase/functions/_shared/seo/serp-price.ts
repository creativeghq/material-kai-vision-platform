/** What DataForSEO charges for one live advanced Google SERP, by depth. Import-free so a test can read it. */

const FIRST_PAGE_USD = 0.002;
const EXTRA_PAGE_USD = 0.0015;

/** Measured on DataForSEO's own task ledger 2026-10-25: depth 10 $0.002, 20 $0.0035, 30 $0.005, 50 $0.008, 100 $0.0155. */
export function serpLiveAdvancedUsd(depth: number): number {
  const pages = Math.max(1, Math.ceil((Number.isFinite(depth) && depth > 0 ? depth : 10) / 10));
  return FIRST_PAGE_USD + (pages - 1) * EXTRA_PAGE_USD;
}

/** Billing units ($0.001 each) a SERP of this depth can reach. */
export function serpLiveAdvancedUnits(depth: number): number {
  return Math.ceil(Math.round(serpLiveAdvancedUsd(depth) * 1e6) / 1000);
}

/** How deep the rank tracker reads Google: the estimate and the check must agree or the quoted price is a different product. */
export const RANK_SERP_DEPTH = 100;
