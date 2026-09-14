/**
 * Proof of delivery and goods-receipt inspection, with no I/O (#424, #440).
 *
 * IMPORT-FREE on purpose. One idea carries both: the FAILURE is as first-class an outcome as the
 * success. A short delivery must be a reported fact, never a silently reduced quantity — and a
 * rejected receipt exists to produce a supplier claim, not to be absorbed.
 */

export type DeliveryOutcome = 'delivered' | 'short' | 'refused' | 'damaged' | 'failed' | 'partial';

export const DELIVERY_OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  delivered: 'Delivered in full',
  short: 'Short delivery',
  refused: 'Refused on site',
  damaged: 'Damaged on arrival',
  failed: 'Could not deliver',
  partial: 'Part delivered',
};

export type Disposition =
  | 'breakage'
  | 'wrong_item'
  | 'quality'
  | 'shortage'
  | 'returned_saleable';

/**
 * Klipboard is the only vendor naming BREAKAGE as a disposition distinct from returned-saleable,
 * and on a tile container breakage is the normal case rather than an exception.
 */
export const DISPOSITION_LABEL: Record<Disposition, string> = {
  breakage: 'Breakage',
  wrong_item: 'Wrong item',
  quality: 'Quality',
  shortage: 'Short shipped',
  returned_saleable: 'Returned saleable',
};

export type ClaimResolution = 'refund' | 'replacement' | 'write_off';

export const CLAIM_RESOLUTION_LABEL: Record<ClaimResolution, string> = {
  refund: 'Supplier credits it',
  replacement: 'Supplier replaces it',
  write_off: 'We absorb it',
};

export interface DeliveryProof {
  id: string;
  outcome: DeliveryOutcome;
  recipient_name: string | null;
  delivered_at: string;
  signature_path: string | null;
  notes: string | null;
}

export interface ReceiptInspection {
  id: string;
  received_quantity: number | null;
  accepted_quantity: number | null;
  rejected_quantity: number | null;
  disposition: Disposition | null;
  inspected_at: string;
  notes: string | null;
}

/**
 * Did the delivery fall short of what was promised?
 *
 * Every outcome but `delivered` is a dispute waiting to happen, and each is a different
 * conversation — which is why they are separate values rather than one `failed` flag.
 */
export function deliveryFellShort(o: DeliveryOutcome): boolean {
  return o !== 'delivered';
}

/**
 * Does this outcome need a photograph before it is worth anything?
 *
 * A successful delivery is evidenced by the signature. A short or damaged one is evidenced by the
 * picture, and a note written afterwards is not the same thing.
 */
export function outcomeNeedsPhoto(o: DeliveryOutcome): boolean {
  return deliveryFellShort(o);
}

/**
 * Is this inspection the start of a claim?
 *
 * Anything rejected is. Absorbing it silently is how a supplier's quality problem becomes our
 * margin problem, with no row anywhere being wrong.
 */
export function inspectionStartsClaim(i: Pick<ReceiptInspection, 'rejected_quantity'>): boolean {
  return (i.rejected_quantity ?? 0) > 0;
}

/**
 * The quantities have to add up, and an unstated one is NOT zero.
 *
 * Returns null when the split cannot be checked — a receipt with no accepted figure is not a
 * receipt that accepted nothing.
 */
export function quantitiesAgree(i: ReceiptInspection): boolean | null {
  const { received_quantity: r, accepted_quantity: a, rejected_quantity: x } = i;
  if (r == null || a == null || x == null) return null;
  return Math.abs(r - (a + x)) < 0.0001;
}
