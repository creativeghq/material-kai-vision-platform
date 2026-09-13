/**
 * ΨΔΑ Phase Β1 lifecycle rules (#407) — what a movement's state means and what may happen next.
 *
 * IMPORT-FREE by contract, like `workflows/wizardState.ts`: these rules are read by the service,
 * by the UI and by the guard test, and a module that drags in the Supabase client cannot be
 * tested without one. The SQL `delivery_note_lifecycle` derives the state; this decides what to
 * offer on top of it, and the two must agree — AADE refuses the rest.
 */

/** AADE §7.1 `InvoiceDeliveryStatus`. There is no code 6. */
export const DELIVERY_STATUS_REGISTERED = 1;
export const DELIVERY_STATUS_CANCELLED = 2;
export const DELIVERY_STATUS_IN_TRANSIT = 3;
export const DELIVERY_STATUS_REJECTED = 4;
export const DELIVERY_STATUS_DELIVERED_BY_CARRIER = 5;
export const DELIVERY_STATUS_FAILED = 7;
export const DELIVERY_STATUS_COMPLETED = 8;
export const DELIVERY_STATUS_IN_TRANSIT_RETURN = 9;

export type DeliveryEventTypeName =
  'RegisterTransfer' | 'ConfirmOutcome' | 'Rejection' | 'ConfirmReturn' | 'RegisterTransferReturn';

export interface DeliveryLifecycleState {
  status_code: number;
  carrier_partial: boolean;
  carrier_failed: boolean;
  non_obligated_recipient: boolean;
  events_pending_transmission: number;
}

/**
 * Which legs are legitimately offerable next.
 *
 * Offering one AADE will refuse is a control whose only outcome is an error, and on a driver's
 * phone at a gate that is worse than offering nothing.
 */
export function nextEventsFor(life: DeliveryLifecycleState | null): DeliveryEventTypeName[] {
  if (!life) return [];
  switch (life.status_code) {
    case DELIVERY_STATUS_REGISTERED:
      return ['RegisterTransfer'];
    case DELIVERY_STATUS_IN_TRANSIT:
      return ['RegisterTransfer', 'ConfirmOutcome', 'Rejection'];
    case DELIVERY_STATUS_DELIVERED_BY_CARRIER:
      // §3.2.2 remark 4: once the carrier has declared a partial delivery the recipient cannot
      // confirm over it — the only way on is the carrier's return leg.
      return life.carrier_partial ? ['RegisterTransfer'] : ['ConfirmOutcome', 'Rejection'];
    case DELIVERY_STATUS_REJECTED:
    case DELIVERY_STATUS_FAILED:
      return ['RegisterTransfer'];
    case DELIVERY_STATUS_IN_TRANSIT_RETURN:
      return ['RegisterTransfer', 'ConfirmReturn'];
    default:
      // Completed and Cancelled are ends. So is any status AADE adds that we do not know yet —
      // offering a leg against a state we cannot interpret is a guess with a penalty attached.
      return [];
  }
}

/**
 * Is this movement finished, as far as the ministry is concerned?
 *
 * Deliberately NOT the same question as "the goods arrived": legs recorded under the offline rule
 * and never transmitted leave an obligation open on a movement that looks done locally.
 */
export function movementIsFiled(life: DeliveryLifecycleState | null): boolean {
  if (!life) return false;
  const closed = life.status_code === DELIVERY_STATUS_COMPLETED
    || life.status_code === DELIVERY_STATUS_CANCELLED;
  return closed && life.events_pending_transmission === 0;
}
