/**
 * What a putaway suggestion and a stocktake freeze MEAN, with no I/O (#428).
 *
 * IMPORT-FREE on purpose. The load-bearing idea is small: a suggestion with no stated rule is a
 * dropdown with extra steps, and a count with no freeze blames the counter for the sales made
 * while they were counting.
 */

export type PutawayStatus = 'suggested' | 'no_rule' | 'rule_points_nowhere' | 'not_found';

export interface PutawaySuggestion {
  status: PutawayStatus;
  location_id?: string;
  location_code?: string;
  location_kind?: LocationKind;
  barcode?: string | null;
  path?: string | null;
  rule_id?: string;
  basis?: 'fixed' | 'capacity' | 'dimensions' | 'velocity';
  reason: string;
}

export type LocationKind = 'bin' | 'bulk' | 'pick_face' | 'staging' | 'quarantine' | 'van';

export const LOCATION_KIND_LABEL: Record<LocationKind, string> = {
  bin: 'Bin',
  bulk: 'Bulk',
  pick_face: 'Pick face',
  staging: 'Staging',
  quarantine: 'Quarantine',
  van: 'Van',
};

export type CountDriftStatus = 'clean' | 'moved' | 'not_frozen' | 'not_found';

export interface CountDrift {
  status: CountDriftStatus;
  frozen_at?: string;
  lines?: number;
  movements_since_freeze?: number;
  reason: string;
}

/**
 * Is this a real direction, or a gap dressed as one?
 *
 * Only `suggested` directs anything. The other two mean nobody has said where this goes, and
 * choosing a bin by hand is not putaway — the next receipt will land somewhere else.
 */
export function putawayDirects(s: PutawaySuggestion | null): boolean {
  return s?.status === 'suggested';
}

/**
 * Can the putaway be scan-verified?
 *
 * A location barcode is distinct from an item barcode on purpose: scanning a bin and scanning a
 * product are different questions, and a putaway confirmed by neither is a putaway on trust.
 */
export function putawayIsScannable(s: PutawaySuggestion | null): boolean {
  return putawayDirects(s) && !!s?.barcode;
}

/**
 * Should the count be frozen before anybody starts counting?
 *
 * Odoo applies counts against LIVE on-hand, so a sale during the count turns a correct count into
 * a variance. The freeze is the difference between a reconciliation and an accusation.
 */
export function countNeedsFreezing(d: CountDrift | null): boolean {
  return d?.status === 'not_frozen';
}

/** Movements landed after the freeze and have to be reconciled rather than blamed. */
export function countHasDrifted(d: CountDrift | null): boolean {
  return d?.status === 'moved';
}
