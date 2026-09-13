/**
 * POS interconnection, and the declaration that falls on whoever builds the ERP (#448).
 *
 * Two obligations with one shape: each is invisible until an audit, and each has a state that
 * looks like compliance and is not. Import-free so the predicates can be tested without a client.
 */

export type InterconnectionStatus = 'unknown' | 'not_required' | 'required' | 'breach';

export type TerminalVerdict = 'interconnected' | 'must_interconnect' | 'out_of_scope';

export type InterconnectionRoute = 'a1098' | 'a1155';

export type DeclarationStatus = 'undetermined' | 'overdue' | 'pending' | 'filed';

export type SignatureVerdict =
  | 'matched' | 'awaiting' | 'expiring_soon' | 'expired_unmatched' | 'cancelled' | 'expired';

export type SignatureQueueStatus =
  | 'none' | 'clean' | 'expiring_soon' | 'unflagged' | 'expired_unmatched';

export type PaymentGateCode = 'ok' | 'not_issued' | 'not_transmitted' | 'no_document';

export type WholesaleCardStatus =
  | 'not_wholesale' | 'not_card' | 'route_unknown' | 'correlated' | 'receipt_missing' | 'no_document';

export interface TerminalRow {
  id: string;
  label: string | null;
  terminal_id: string;
  nsp_name: string | null;
  pos_model: string | null;
  route: InterconnectionRoute | null;
  is_interconnected: boolean;
  handles_retail: boolean;
  handles_wholesale: boolean;
  supports_iris: boolean;
  matching_window_hours: number;
  verdict: TerminalVerdict;
}

export interface InterconnectionPosition {
  status: InterconnectionStatus;
  reason: string;
  terminals: number;
  retail_terminals: number;
  mixed_terminals: number;
  not_interconnected: number;
  legal_basis: string;
  penalty: string;
  rows: TerminalRow[];
}

export interface DeclarationModel {
  nsp_name: string;
  pos_model: string;
  tested_on: string | null;
}

export interface DeclarationRow {
  id: string;
  software_name: string;
  software_version: string;
  first_released_on: string | null;
  testing_completed_on: string | null;
  filed_with_aade_on: string | null;
  aade_reference: string | null;
  covers_iris: boolean;
  models: DeclarationModel[];
}

export interface DeclarationPosition {
  status: DeclarationStatus;
  reason: string;
  versions: number;
  filed: number;
  overdue: number;
  without_iris: number;
  legal_basis: string;
  rows: DeclarationRow[];
}

export interface SignatureRow {
  id: string;
  invoice_id: string | null;
  terminal_id: string | null;
  amount: number | null;
  is_deferred: boolean;
  window_hours: number;
  hours_remaining: number;
  verdict: SignatureVerdict;
  must_flag_under_issuance: boolean;
}

export interface SignatureQueue {
  status: SignatureQueueStatus;
  reason: string;
  total: number;
  awaiting: number;
  expiring_soon: number;
  expired_unmatched: number;
  unflagged_under_issuance: number;
  rows: SignatureRow[];
}

export interface PaymentGate {
  allowed: boolean;
  issued?: boolean;
  transmitted?: boolean;
  under_issuance?: boolean;
  code: PaymentGateCode;
  reason: string;
  legal_basis?: string;
}

export interface WholesaleCardPosition {
  status: WholesaleCardStatus;
  receipt_invoice_id: string | null;
  route: InterconnectionRoute | null;
  pol_1220_code?: number;
  mydata_type?: string;
  reason: string;
}

export const INTERCONNECTION_LABEL: Record<InterconnectionStatus, string> = {
  unknown: 'Not yet answerable',
  not_required: 'No duty',
  required: 'Interconnection required',
  breach: 'Taking payments on a terminal that is not interconnected',
};

export const TERMINAL_VERDICT_LABEL: Record<TerminalVerdict, string> = {
  interconnected: 'Interconnected',
  must_interconnect: 'Must be interconnected',
  out_of_scope: 'Out of scope (wholesale only)',
};

export const ROUTE_LABEL: Record<InterconnectionRoute, string> = {
  a1098: 'Α.1098 — the ΦΗΜ talks to the terminal',
  a1155: 'Α.1155 — the ERP tunnels Α.1098 through itself',
};

export const DECLARATION_LABEL: Record<DeclarationStatus, string> = {
  undetermined: 'Nothing declared',
  overdue: 'Released and not filed',
  pending: 'Recorded, not yet filed',
  filed: 'Filed with AADE',
};

export const SIGNATURE_VERDICT_LABEL: Record<SignatureVerdict, string> = {
  matched: 'Matched',
  awaiting: 'Awaiting the payment',
  expiring_soon: 'Inside the last quarter of its window',
  expired_unmatched: 'Past its window, unmatched',
  cancelled: 'Cancelled',
  expired: 'Expired',
};

/** Only `not_required` is a clean answer. `unknown` is an unanswered question wearing its clothes. */
export const interconnectionNeedsAttention = (p: InterconnectionPosition | null): boolean =>
  !!p && p.status !== 'not_required';

export const interconnectionIsBreach = (p: InterconnectionPosition | null): boolean =>
  !!p && p.status === 'breach';

export const declarationNeedsAttention = (p: DeclarationPosition | null): boolean =>
  !!p && p.status !== 'filed';

/**
 * The window is 60 hours, and 2 for εστίαση (Α.1160/2025). It is not a preference — an unmatched
 * signature auto-rejects at the end of it whatever we do here.
 */
export const MATCHING_WINDOW_HOURS = { standard: 60, food_service: 2 } as const;

export const signatureQueueNeedsAttention = (q: SignatureQueue | null): boolean =>
  !!q && (q.status === 'expired_unmatched' || q.status === 'unflagged' || q.status === 'expiring_soon');

/**
 * A simultaneous transaction whose signature is still unmatched must be transmitted flagged
 * «Υπό Έκδοση». A deferred one has nothing to flag: the document is already filed and the token is
 * bound to its MARK.
 */
export const needsUnderIssuanceFlag = (r: SignatureRow): boolean =>
  r.must_flag_under_issuance && !r.is_deferred;

/** Α.1155 art. 1 §6 — «τα Μέσα Πληρωμών δεν επιτρέπεται να λειτουργούν αυτόνομα». */
export const paymentIsBlocked = (g: PaymentGate | null): boolean => !!g && !g.allowed;

export const AUTONOMY_RULE =
  'A payment terminal may not run on its own: the document must be issued AND have reached myDATA '
  + 'before the card transaction completes.';

/**
 * Wholesale settled by card takes ΠΟΛ.1220 code 355 → myDATA 8.4, correlated to the invoice
 * afterwards. The Α.1098 workaround (retail receipt, then a credit note, then the invoice) is a
 * DIFFERENT mechanic; running both files two documents for one sale.
 */
export const EFTPOS_PREPAYMENT_CODE = 355;
export const EFTPOS_RECEIPT_TYPE = '8.4';

export const wholesaleReceiptMissing = (p: WholesaleCardPosition | null): boolean =>
  !!p && (p.status === 'receipt_missing' || p.status === 'route_unknown');

/**
 * The branch number is SHA-1 hashed into the myDATA document UID under ISO-8859-7, so a wrong one
 * does not produce a correctable reporting error — it produces a DIFFERENT DOCUMENT IDENTITY.
 */
export const BRANCH_IS_IDENTITY =
  'The establishment code is part of the document identity, not metadata: it is hashed into the '
  + 'myDATA UID under ISO-8859-7, so a wrong branch yields a different document rather than a '
  + 'correctable error.';
