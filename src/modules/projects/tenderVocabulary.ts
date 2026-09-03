/**
 * Tendering value-sets, written ONCE.
 *
 * IMPORT-FREE, like the vocabularies beside it: the service builds a Supabase client at module
 * load, and which bids belong in a comparison is worth testing without a database.
 */

/** `tender_packages_status_check`. */
export type PackageStatus = 'draft' | 'issued' | 'closed' | 'awarded' | 'cancelled';

/** `tender_bids_status_check`. */
export type BidStatus = 'invited' | 'received' | 'declined' | 'withdrawn';

export const PACKAGE_STATUSES: PackageStatus[] = ['draft', 'issued', 'closed', 'awarded', 'cancelled'];
export const BID_STATUSES: BidStatus[] = ['invited', 'received', 'declined', 'withdrawn'];

/** Packages still going through the tender process — what a buyer is chasing. */
export const PACKAGE_LIVE_STATUSES: PackageStatus[] = ['draft', 'issued', 'closed'];

/**
 * Whether a bid belongs in the comparison.
 *
 * Only `received`. An INVITED bid has no prices, so including it would put empty columns beside
 * real ones and make a total look like a bid of zero; a DECLINED or WITHDRAWN bid is not on offer
 * at all. `award_tender_package` refuses anything that is not received, and this is the mirror of
 * that check — a comparison that offered an unawardable bid as the cheapest would be pointing at
 * a price nobody can accept.
 */
export const isBidComparable = (s: BidStatus): boolean => s === 'received';
