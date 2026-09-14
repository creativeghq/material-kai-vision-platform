/**
 * "Available" is the largest homogeneous pool, not a sum (#420).
 *
 * IMPORT-FREE on purpose: the derivation lives in SQL and the service that fetches it pulls in the
 * Supabase client. What the answer MEANS has no dependencies, and it is the half worth guarding —
 * a platform that adds three tones together produces an optimistic number on every quote, and a
 * wrong number is a valid number.
 */

export type HomogeneousStatus =
  | 'ok'
  | 'split_across_pools'
  | 'only_opened_packs'
  | 'no_pools'
  | 'not_found';

export interface HomogeneousAvailability {
  status: HomogeneousStatus;
  pool_id?: string;
  lot?: string;
  tone?: string;
  calibre?: string;
  grade?: string;
  packaging?: string;
  largest_pool_free?: number;
  total_free?: number;
  pools?: number;
  opened_free?: number;
  requested?: number | null;
  shortfall?: number | null;
  reason: string;
}

/**
 * Would filling this line mix lots or tones?
 *
 * The one question the quote has to answer, and the one a SKU-level sum cannot: mixing shows
 * especially after grouting, so the trade orders the whole job and its overage from one run.
 */
export function wouldMixPools(a: HomogeneousAvailability | null): boolean {
  return a?.status === 'split_across_pools' || a?.status === 'only_opened_packs';
}

/**
 * How the cube axes read on one line.
 *
 * Blank axes are dropped rather than shown as empty: an unlabelled box is not "lot -", it is a box
 * nobody recorded a lot for, and padding it out invents a distinction.
 */
export function describePool(a: HomogeneousAvailability | null): string {
  if (!a) return '';
  const parts: string[] = [];
  if (a.lot) parts.push(`lot ${a.lot}`);
  if (a.tone) parts.push(`tone ${a.tone}`);
  if (a.calibre) parts.push(`calibre ${a.calibre}`);
  if (a.grade) parts.push(`grade ${a.grade}`);
  return parts.join(' · ');
}

/**
 * What a line may honestly promise.
 *
 * The largest single pool, and never the total — which is the whole point. `null` means we could
 * not decide, which is not the same as nothing being available.
 */
export function promisableQuantity(a: HomogeneousAvailability | null): number | null {
  if (!a) return null;
  if (a.status === 'not_found') return null;
  if (a.status === 'no_pools') return 0;
  return a.largest_pool_free ?? null;
}
