/**
 * Five smaller vertical gaps (#442).
 *
 * A forward contract nobody tracks, a cut whose offcut vanishes, a hold with no expiry, a supplier
 * nobody scores, and a price file that can quietly rename a product. Import-free so the predicates
 * can be tested without a client.
 */

export type BlanketStatus =
  | 'open' | 'fully_drawn' | 'over_released' | 'expired_undrawn' | 'cancelled' | 'no_lines' | 'not_found';

export type HoldVerdict = 'active' | 'expiring' | 'lapsed' | 'released' | 'converted' | 'expired';

export type HoldStatus = 'clean' | 'expiring' | 'lapsed' | 'none';

export type ProcessingStatus = 'planned' | 'sent' | 'in_progress' | 'returned' | 'cancelled';

export type SupplierStanding = 'good' | 'watch' | 'poor' | 'unscored';

export type ScorecardStatus = 'ok' | 'weights_incomplete' | 'nothing_to_score';

export interface BlanketLine {
  line_id: string;
  description: string;
  committed: number;
  unit: string | null;
  unit_price: number | null;
  released: number;
  delivered: number;
  remaining: number;
  ceiling: number;
  over_released: boolean;
}

export interface BlanketPosition {
  blanket_order_id: string;
  reference: string | null;
  status: BlanketStatus;
  reason: string;
  allowance_percent: number;
  committed_value: number;
  remaining_value: number;
  rows: BlanketLine[];
}

export interface HoldRow {
  hold_id: string;
  held_for: string;
  quantity: number;
  unit: string | null;
  created_on: string;
  expires_on: string;
  days_left: number;
  lot: string | null;
  tone: string | null;
  calibre: string | null;
  verdict: HoldVerdict;
}

export interface HoldPosition {
  status: HoldStatus;
  reason: string;
  active: number;
  expiring: number;
  lapsed: number;
  rows: HoldRow[];
}

export interface ScorecardRow {
  supplier_company_id: string;
  name: string;
  lines: number;
  datable_lines: number;
  on_time_percent: number | null;
  received: number;
  rejected: number;
  quality_percent: number | null;
  standing: SupplierStanding;
  unmeasured_reason: string | null;
}

export interface Scorecard {
  from: string;
  to: string;
  weights_total: number;
  status: ScorecardStatus;
  reason: string;
  rows: ScorecardRow[];
}

export interface PriceUpdateResult {
  updated: number;
  unmatched: number;
  rejected: { row: Record<string, unknown>; reason: string }[];
  reason: string;
}

export const BLANKET_LABEL: Record<BlanketStatus, string> = {
  open: 'Open and drawing down',
  fully_drawn: 'Fully drawn',
  over_released: 'Released beyond the commitment',
  expired_undrawn: 'Window closed with quantity undrawn',
  cancelled: 'Cancelled',
  no_lines: 'No lines',
  not_found: 'No such contract',
};

export const HOLD_VERDICT_LABEL: Record<HoldVerdict, string> = {
  active: 'Held',
  expiring: 'Expiring this week',
  lapsed: 'Past its date',
  released: 'Released',
  converted: 'Converted to an order',
  expired: 'Expired',
};

export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  planned: 'Planned',
  sent: 'Sent to the outworker',
  in_progress: 'Being worked',
  returned: 'Returned',
  cancelled: 'Cancelled',
};

export const STANDING_LABEL: Record<SupplierStanding, string> = {
  good: 'Good',
  watch: 'Watch',
  poor: 'Poor',
  unscored: 'Nobody has measured them',
};

/** Trade tolerates a little over. The allowance is where "a little" stops being a judgement. */
export const releaseIsOverCommitment = (l: BlanketLine): boolean => l.over_released;

export const blanketNeedsAttention = (p: BlanketPosition | null): boolean =>
  !!p && (p.status === 'over_released' || p.status === 'expired_undrawn');

/**
 * `qty_reserved` as an integer is CORRECT and says nothing. A reservation that never converts
 * occupies six figures of stock and nothing raises, because the number is right.
 */
export const holdNeedsAttention = (p: HoldPosition | null): boolean =>
  !!p && (p.status === 'lapsed' || p.status === 'expiring');

export const holdIsLapsed = (r: HoldRow): boolean => r.verdict === 'lapsed';

export const EXPIRY_IS_MANDATORY =
  'A hold carries who it is for and when it lapses. Both Stone Profits and VISCO record exactly '
  + 'that, independently — which is usually a sign it is load-bearing.';

export const NOTHING_AUTO_RELEASES =
  'A lapsed hold is a conversation with a customer. Nothing here frees it: releasing it unattended '
  + 'sells goods somebody is still expecting.';

/** An offcut is stock again. Writing a usable remnant off is inventory thrown away on paper. */
export const jobYieldsOffcut = (
  j: { offcut_quantity: number | null; offcut_pool_id: string | null },
): boolean => (j.offcut_quantity ?? 0) > 0 && !!j.offcut_pool_id;

export const OUTWORKER_IS_A_PLACE =
  'Material at an outworker is ours, at somebody else’s premises, and not sold — conto lavoro '
  + 'esterno. It is a third place stock sits, alongside the van and the showroom.';

/** Unscored is its own answer: nobody has measured them, which is not a bad score. */
export const supplierIsUnscored = (r: ScorecardRow): boolean => r.standing === 'unscored';

export const scorecardIsReadable = (s: Scorecard | null): boolean =>
  !!s && s.status === 'ok';

export const weightsAreComplete = (s: Scorecard | null): boolean =>
  !!s && s.weights_total === 100;

/**
 * BMEcat's T_UPDATE_PRICES carries ONLY price fields — "it is not possible to transmit any other
 * changes". Worth copying whether or not we ever speak BMEcat.
 */
export const PRICE_UPDATE_FIELDS = ['supplier_sku', 'cost', 'currency', 'valid_until'] as const;

export const priceRowIsClean = (row: Record<string, unknown>): boolean =>
  Object.keys(row).every((k) => (PRICE_UPDATE_FIELDS as readonly string[]).includes(k));

export const PRICE_ONLY_DISCIPLINE =
  'A price update may not carry a product change. A file that can quietly rename an article or '
  + 'change its pack size is how a catalogue drifts without anybody deciding to.';

/** Established by search, and it changes what is worth building: Greece is not an ETIM country. */
export const ETIM_NOTE =
  'Greece has no ETIM organisation, but Italy, Spain and Portugal do — so our suppliers may already '
  + 'publish ETIM/BMEcat that no Greek merchant expects to receive. There is no Confindustria '
  + 'Ceramica interchange standard; the de-facto answer is per-manufacturer price files.';
