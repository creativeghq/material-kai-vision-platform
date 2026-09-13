/**
 * ΨΔΑ Phase Β — the route that carries an event, and the code every line needs (#407).
 *
 * The recording side is built: four operations, one row per leg, each with its own MARK. What is
 * left is the two things code cannot decide alone — which route files them, and the commodity
 * classification Β2 asks for. Import-free so the predicates can be tested without a client.
 */

export type PsdaRouteStatus =
  | 'routed' | 'provider_unconfirmed' | 'credentials_missing' | 'undecided';

export type PsdaRoute = 'provider' | 'direct_mydata';

export type CnCoverageStatus =
  | 'ready' | 'copyable_from_product' | 'classification_needed' | 'no_movements';

export interface PsdaRoutePosition {
  status: PsdaRouteStatus;
  route: PsdaRoute | null;
  confirmed_on: string | null;
  mandatory_from: string;
  untransmitted_events: number;
  offline_events_pending: number;
  reason: string;
  note: string;
}

export interface CnCoverage {
  from: string;
  to: string;
  mandatory_from: string;
  lines: number;
  with_cn_code: number;
  suppressed: number;
  classifiable_from_product: number;
  unclassified: number;
  status: CnCoverageStatus;
  reason: string;
  legal_basis: string;
}

export const ROUTE_STATUS_LABEL: Record<PsdaRouteStatus, string> = {
  routed: 'A route is on file',
  provider_unconfirmed: 'Provider route unconfirmed',
  credentials_missing: 'Direct route, no credential',
  undecided: 'No route decided',
};

export const ROUTE_LABEL: Record<PsdaRoute, string> = {
  provider: 'Through the certified provider',
  direct_mydata: 'Direct to myDATA as an ERP developer',
};

export const CN_STATUS_LABEL: Record<CnCoverageStatus, string> = {
  ready: 'Every line can state a CN code',
  copyable_from_product: 'Codes exist on the products, not on the lines',
  classification_needed: 'Lines with no commodity code anywhere',
  no_movements: 'No movements to measure',
};

/**
 * Recording an event works whatever the route is, which is precisely why an undecided route is
 * invisible: the ledger looks complete either way and nothing has been filed.
 */
export const routeNeedsDecision = (p: PsdaRoutePosition | null): boolean =>
  !!p && p.status !== 'routed';

export const eventsAreStranded = (p: PsdaRoutePosition | null): boolean =>
  !!p && p.untransmitted_events > 0;

export const cnNeedsWork = (c: CnCoverage | null): boolean =>
  !!c && (c.status === 'classification_needed' || c.status === 'copyable_from_product');

/** Phase Β1 — φόρτωση, μεταφόρτωση, παραλαβή, ποσοτικός και ποιοτικός έλεγχος. */
export const PHASE_B1_FROM = '2026-10-12';
/** Phase Β2 — Ενιαία Κωδικοποίηση Ειδών, a CN code on every movement line. */
export const PHASE_B2_FROM = '2027-01-01';

export const PENALTY_IS_PER_AUDIT =
  'The penalty is €5.000 / €10.000 ανά φορολογικό έλεγχο — per audit, not per document (άρθρο 57 '
  + 'ν.5104/2024), so the exposure does not scale with how few movements went unfiled.';

export const DATE_MOVES_LATE =
  'Α.1094/29.04.2026 moved a deadline one day before it fell. Re-check the AADE decisions index in '
  + 'the first week of October rather than treating 12/10 as settled.';

/**
 * A line born from a classified product is stamped at insert. `copyable_from_product` therefore
 * catches the historic rows — lines created before their product was classified — not new ones.
 */
export const COPYABLE_IS_HISTORIC =
  'A line created from an already-classified product is stamped as it is written. Lines that are '
  + 'copyable but not copied are older than their product’s classification.';

/** The one place the Β2 suppression is legitimate, and it must carry its reason. */
export const SUPPRESSION_BASIS = 'Α.1123 άρθρο 7 §9 — defence-classified goods only';

/**
 * The CN is the first eight digits of the TARIC we already classify against. A second, separately
 * entered code would be a second answer to one question.
 */
export const cnFromTaric = (taric: string | null | undefined): string | null => {
  const digits = (taric ?? '').replace(/[^0-9]/g, '');
  return digits.length >= 8 ? digits.slice(0, 8) : null;
};
