/**
 * The project-request value-sets, written ONCE.
 *
 * IMPORT-FREE on purpose, like `snagVocabulary` and `drawingVocabulary`: `projectRequestsService`
 * pulls in the Supabase client, which throws at module load without env vars, so anything living
 * beside it can only be tested by mocking a database. Which kinds face the client and which
 * verdicts close a submittal are decisions worth testing directly.
 *
 * `projectRequestsService` re-exports all of this, so existing imports keep working.
 */

export type RequestTargetType = 'project' | 'moodboard' | 'client_view' | 'room' | 'sheet' | 'product';

/** `project_requests_kind_check`. */
export type RequestKind =
  | 'question' | 'change_request' | 'approval_request' | 'info_request'
  | 'rfi' | 'submittal';

/** `project_requests_status_check`. */
export type RequestStatus = 'open' | 'answered' | 'resolved' | 'wont_do';

/** `project_requests_review_check`. A submittal's verdict — what may be installed. */
export type ReviewDecision = 'approved' | 'approved_as_noted' | 'revise_and_resubmit' | 'rejected';

export const REQUEST_KINDS: RequestKind[] = [
  'question', 'change_request', 'approval_request', 'info_request', 'rfi', 'submittal',
];

export const REQUEST_STATUSES: RequestStatus[] = ['open', 'answered', 'resolved', 'wont_do'];

/** Statuses that mean the request no longer needs a reply. Mirrors the SQL trigger. */
export const REQUEST_CLOSED_STATUSES: RequestStatus[] = ['resolved', 'wont_do'];

export const REVIEW_DECISIONS: ReviewDecision[] = [
  'approved', 'approved_as_noted', 'revise_and_resubmit', 'rejected',
];

/**
 * The kinds that face the DESIGN TEAM rather than the client, and are therefore numbered.
 *
 * The distinction is not cosmetic. A question is a conversation with the customer; an RFI is a
 * question about a problem in the architect's information, and a commitment somebody can be late
 * on — which is why it carries a reference and a due date. The two must never share a numbering
 * sequence: RFI-004 has to mean the same thing to everyone reading the register, including the
 * architect who never logs in here.
 */
export const TEAM_FACING_KINDS: RequestKind[] = ['rfi', 'submittal'];

export const isTeamFacing = (k: RequestKind): boolean => TEAM_FACING_KINDS.includes(k);

/**
 * Verdicts that END a submittal. `revise_and_resubmit` deliberately is NOT one: it is the state
 * their competitor's pitch is about ("nothing stays at Status B for months"), and a register that
 * treated it as closed would lose exactly the submittals worth chasing.
 */
export const CLOSING_REVIEW_DECISIONS: ReviewDecision[] = ['approved', 'approved_as_noted', 'rejected'];
