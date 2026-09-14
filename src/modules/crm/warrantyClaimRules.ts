/**
 * Warranty and callbacks: three money outcomes that were booked identically as "a job" (#437).
 *
 * Our fitter cracked it → attributable internal cost. The tap failed → recoverable from the
 * supplier. The customer changed their mind → chargeable. Import-free so the predicates can be
 * tested without a client.
 */

export type ClaimCause = 'workmanship' | 'product_failure' | 'customer_change' | 'undetermined';

export type MoneyOutcome =
  | 'internal_rework' | 'supplier_claim' | 'chargeable' | 'undetermined' | 'unclassified';

export type CallbackWindow =
  | 'service_callback' | 'installation_callback' | 'outside_window' | 'undatable';

export type ClaimStatus = 'reported' | 'assigned' | 'scheduled' | 'resolved' | 'rejected';

export type Urgency = 'low' | 'normal' | 'high' | 'emergency';

export type ReworkRateStatus = 'ok' | 'partly_unattributed' | 'not_measurable';

export interface WarrantyClaim {
  id: string;
  reference: string | null;
  description: string;
  reported_on: string;
  installed_on: string | null;
  serviced_on: string | null;
  urgency: Urgency;
  cause: ClaimCause | null;
  status: ClaimStatus;
  order_item_id: string | null;
  stock_pool_id: string | null;
  installer_employee_id: string | null;
  trade_partner_company_id: string | null;
  rework_hours: number | null;
  chargeable_amount: number | null;
  supplier_claim_id: string | null;
}

export interface ClaimPosition {
  claim_id: string;
  status: ClaimStatus;
  cause: ClaimCause | null;
  money_outcome: MoneyOutcome;
  callback_window: CallbackWindow;
  photos: { failure: number; installation: number; receipt: number };
  missing: string[];
  ready: boolean;
  reason: string;
  legal_basis: string;
}

export interface ReworkRow {
  installer_employee_id: string;
  name: string;
  claims: number;
  workmanship_claims: number;
  rework_hours: number;
  chargeable_claims: number;
  supplier_claims: number;
}

export interface ReworkRate {
  from: string;
  to: string;
  status: ReworkRateStatus;
  unattributed_workmanship_claims: number;
  reason: string;
  rows: ReworkRow[];
}

export interface TaskGate {
  allowed: boolean;
  code: 'ok' | 'mandatory_open' | 'not_found';
  mandatory_tasks: number;
  open_without_reason: number;
  skipped_with_reason: number;
  reason: string;
}

export const CAUSE_LABEL: Record<ClaimCause, string> = {
  workmanship: 'Our workmanship',
  product_failure: 'The product failed',
  customer_change: 'The customer changed their mind',
  undetermined: 'Undetermined',
};

export const OUTCOME_LABEL: Record<MoneyOutcome, string> = {
  internal_rework: 'Internal rework — our cost',
  supplier_claim: 'Recoverable from the supplier',
  chargeable: 'Chargeable to the customer',
  undetermined: 'Undetermined — the cost stays ours',
  unclassified: 'Nobody has decided',
};

export const WINDOW_LABEL: Record<CallbackWindow, string> = {
  service_callback: 'Within 30 days of the service call',
  installation_callback: 'Within a year of the installation',
  outside_window: 'Outside the callback window',
  undatable: 'No install or service date, so no window',
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  low: 'Low', normal: 'Normal', high: 'High', emergency: 'Emergency',
};

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  reported: 'Reported', assigned: 'Assigned', scheduled: 'Scheduled',
  resolved: 'Resolved', rejected: 'Rejected',
};

/**
 * An undecided cause is NOT internal rework. Defaulting it that way writes off every supplier
 * recovery in the pile, which is the single most expensive reading of this object.
 */
export const causeIsDecided = (c: ClaimCause | null | undefined): boolean => !!c;

export const outcomeIsUnknown = (p: ClaimPosition | null): boolean =>
  !!p && (p.money_outcome === 'unclassified' || p.money_outcome === 'undetermined');

export const claimNeedsWork = (p: ClaimPosition | null): boolean =>
  !!p && (!p.ready || outcomeIsUnknown(p));

/** A supplier claim without the order line, the batch and the photographs is an anecdote. */
export const supplierPackIsComplete = (p: ClaimPosition | null): boolean =>
  !!p && p.money_outcome === 'supplier_claim' && p.missing.length === 0;

/** Two windows, not one: 30 days from a service call, a year from an installation. */
export const SERVICE_CALLBACK_DAYS = 30;
export const INSTALLATION_CALLBACK_DAYS = 365;

export const isInsideWindow = (w: CallbackWindow): boolean =>
  w === 'service_callback' || w === 'installation_callback';

/** A rate over claims nobody attributed is lower than the real one, and never zero. */
export const reworkRateIsTrustworthy = (r: ReworkRate | null): boolean =>
  !!r && r.status === 'ok';

/** Joblogic's rule. The "or a reason" clause is the whole design. */
export const taskGateBlocks = (g: TaskGate | null): boolean => !!g && !g.allowed;

export const REASON_IS_AN_ANSWER =
  'A mandatory step can be skipped by SAYING WHY. A checklist you can skip in silence is '
  + 'decoration; one that demands a reason is evidence.';

export type CertificationState = 'valid' | 'expiring' | 'expired' | 'no_expiry';

export interface WorkerCertification {
  id: string;
  employee_id: string | null;
  company_id: string | null;
  kind: string;
  reference: string | null;
  issued_on: string | null;
  expires_on: string | null;
  remind_days_before: number;
}

export const CERTIFICATION_STATE_LABEL: Record<CertificationState, string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  no_expiry: 'No expiry recorded',
};

/**
 * A certificate with no expiry date is NOT valid forever — it is one nobody dated, and the two
 * have to look different or the list reads as clean while an ενημερότητα quietly lapses.
 */
export const certificationState = (
  c: Pick<WorkerCertification, 'expires_on' | 'remind_days_before'>,
  today: string,
): CertificationState => {
  if (!c.expires_on) return 'no_expiry';
  if (c.expires_on < today) return 'expired';
  const warn = new Date(`${c.expires_on}T00:00:00Z`);
  warn.setUTCDate(warn.getUTCDate() - (c.remind_days_before ?? 30));
  return today >= warn.toISOString().slice(0, 10) ? 'expiring' : 'valid';
};

export const RETROSPECTIVE_ATTACH =
  'A claim raised six months later still attaches to the job it came from. That is the only way '
  + 'the rework rate stays true.';
