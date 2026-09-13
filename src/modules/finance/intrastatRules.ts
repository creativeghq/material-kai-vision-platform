/**
 * Whether we are obliged to file INTRASTAT at all (#451).
 *
 * The declaration lines existed; the obligation did not. An empty return is then ambiguous between
 * "nothing to declare" and "nobody ever checked whether we must declare", which are different
 * facts. Import-free so the predicates can be tested without a client.
 */

export type IntrastatFlow = 'arrival' | 'dispatch';

export type IntrastatStatus = 'not_obliged' | 'approaching' | 'obliged_from' | 'threshold_unknown';

export interface IntrastatMonth {
  month: string;
  value: number;
  cumulative: number;
}

export interface IntrastatFlowVerdict {
  flow: IntrastatFlow;
  year: number;
  total?: number;
  threshold?: number | null;
  percent_of_threshold?: number | null;
  obliged_from?: string | null;
  status: IntrastatStatus;
  reason: string;
  monthly?: IntrastatMonth[];
}

export interface IntrastatObligation {
  arrival?: IntrastatFlowVerdict;
  dispatch?: IntrastatFlowVerdict;
  note?: string;
}

export const INTRASTAT_STATUS_LABEL: Record<IntrastatStatus, string> = {
  not_obliged: 'Not obliged',
  approaching: 'Approaching the threshold',
  obliged_from: 'Obliged — monthly',
  threshold_unknown: 'Obligation unknown',
};

export const FLOW_LABEL: Record<IntrastatFlow, string> = {
  arrival: 'Arrivals (purchases in)',
  dispatch: 'Dispatches (sales out)',
};

/**
 * `threshold_unknown` is the one that matters most: it is the state in which an empty return looks
 * like compliance. It is not a bare absence of data — it is an unanswered question.
 */
export const obligationIsUnknown = (v: IntrastatFlowVerdict | null | undefined): boolean =>
  !!v && v.status === 'threshold_unknown';

/**
 * The obligation starts the MONTH the threshold is crossed, so the useful alert is the one before
 * the crossing, not the one after it.
 */
export const intrastatNeedsAttention = (v: IntrastatFlowVerdict | null | undefined): boolean =>
  !!v && (v.status === 'threshold_unknown' || v.status === 'approaching' || v.status === 'obliged_from');

export const isObliged = (v: IntrastatFlowVerdict | null | undefined): boolean =>
  !!v && v.status === 'obliged_from';

/**
 * Offered as a PREFILL on the form and written only when an operator presses save. A migration
 * that seeded these would make an unconfirmed figure indistinguishable from a confirmed one, and
 * the whole point of the table is that it can tell them apart.
 */
export const SUGGESTED_THRESHOLD: Record<IntrastatFlow, number> = {
  arrival: 250000,
  dispatch: 90000,
};

export const THRESHOLD_SOURCE_NOTE =
  'Greek thresholds as published for 2026 — confirm with the accountant before relying on them.';

/** Φ5 and the ανακεφαλαιωτικός πίνακας run on their own schedules; neither is this return. */
export const RELATED_OBLIGATIONS = [
  'Ανακεφαλαιωτικός πίνακας (VIES) — separate schedule, replaced by per-transaction reporting from 1 July 2030 under ViDA.',
  'Φ5 (Α.1222/2020) — not abolished, due on the 26th of the month, with a call-off-stock section.',
];
