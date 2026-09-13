/**
 * ΨΔΑ Phase Β1 — the movement lifecycle (#407), mandatory 12/10/2026.
 *
 * AADE mints a MARK per EVENT, so the lifecycle is a ledger of legs (`delivery_note_events`), not
 * columns on the movement. The STATE is derived from those legs by `delivery_note_lifecycle`;
 * nothing here recomputes it, because a cached status would be a second answer to "where is this
 * load" and the two would drift.
 *
 * Penalty is €5.000/€10.000 **ανά φορολογικό έλεγχο** — per audit, not per document.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  MYDATA_DELIVERY_STATUSES, MYDATA_DELIVERY_EVENT_TYPES, MYDATA_DELIVERY_OUTCOMES,
} from '@/services/fiscal/fiscalVocabulary';
// The state RULES are import-free so the UI, this service and the guard test read one answer
// without needing a database client.
export {
  nextEventsFor, movementIsFiled,
  type DeliveryLifecycleState, type DeliveryEventTypeName,
} from '@/modules/finance/deliveryLifecycleRules';

export type DeliveryEventType = (typeof MYDATA_DELIVERY_EVENT_TYPES)[number];
export type DeliveryOutcome = (typeof MYDATA_DELIVERY_OUTCOMES)[number];
export type MovementPartyRole =
  'sender' | 'sender_third' | 'carrier' | 'recipient' | 'recipient_third';

/** One PackagingDetailType row — a COUNT of packages, never a price (AADE §7.3). */
export interface MovementPackaging {
  packagingType: number;
  quantity: number;
  otherPackagingTypeTitle?: string | null;
}

export interface DeliveryEventDetails {
  actor_vat?: string | null;
  /** RegisterTransfer (TransportDetailType). */
  vehicle_number?: string | null;
  transport_type?: number | string | null;
  carrier_vat_number?: string | null;
  /** The «Ρ» plate of the trailer, when there is one. */
  p_number?: string | null;
  location_longitude?: number | string | null;
  location_latitude?: number | string | null;
  /** ConfirmOutcome. */
  delivered_without_recipient?: boolean | null;
  /** Rejection. */
  rejection_reason?: string | null;
}

export interface DeliveryLifecycle {
  delivery_note_id: string;
  /** AADE §7.1. **There is no 6** — a range check of 1..9 invents a status. */
  status_code: number;
  completed_at: string | null;
  carrier_partial: boolean;
  carrier_failed: boolean;
  non_obligated_recipient: boolean;
  /**
   * Legs recorded and not yet filed. Surfaced rather than hidden: the offline rule makes the
   * degraded WRITE compliant, never the never-transmitting.
   */
  events_pending_transmission: number;
}

export interface DeliveryEventRow {
  id: string;
  event_type: DeliveryEventType;
  event_timestamp: string;
  actor_vat: string | null;
  actor_role: MovementPartyRole | null;
  mark: string | null;
  vehicle_number: string | null;
  transport_type: number | null;
  carrier_vat_number: string | null;
  outcome: DeliveryOutcome | null;
  delivered_without_recipient: boolean | null;
  rejection_reason: string | null;
  packaging: MovementPackaging[];
  transmitted_at: string | null;
  transmission_error: string | null;
  issued_offline: boolean;
}

export const deliveryLifecycleService = {
  /** The derived state. One answer, shared by every surface that asks where a load is. */
  async lifecycle(deliveryNoteId: string): Promise<DeliveryLifecycle> {
    const { data, error } = await supabase.rpc('delivery_note_lifecycle' as never, {
      p_note: deliveryNoteId,
    } as never);
    if (error) throw error;
    return data as unknown as DeliveryLifecycle;
  },

  /** The legs themselves, oldest first — the audit trail Phase Β1 exists to produce. */
  async events(deliveryNoteId: string): Promise<DeliveryEventRow[]> {
    const { data, error } = await supabase
      .from('delivery_note_events')
      .select('*')
      .eq('delivery_note_id', deliveryNoteId)
      .order('event_timestamp', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as DeliveryEventRow[];
  },

  /**
   * Record one leg.
   *
   * `issuedOffline` is the Α.1123 marker: on a loss of connection the movement proceeds
   * «χωρίς να διακόπτεται η συναλλαγή, με διακριτή ένδειξη» and the leg is transmitted later.
   * Refusing to write would be the non-compliant behaviour, not the careful one.
   */
  async record(input: {
    deliveryNoteId: string;
    eventType: DeliveryEventType;
    actorRole?: MovementPartyRole;
    outcome?: DeliveryOutcome;
    details?: DeliveryEventDetails;
    packaging?: MovementPackaging[];
    eventTimestamp?: string;
    issuedOffline?: boolean;
  }): Promise<{ event_id: string; lifecycle: DeliveryLifecycle }> {
    const { data, error } = await supabase.rpc('record_delivery_event' as never, {
      p_note: input.deliveryNoteId,
      p_event_type: input.eventType,
      p_actor_role: input.actorRole ?? null,
      p_outcome: input.outcome ?? null,
      p_details: (input.details ?? {}) as never,
      p_packaging: (input.packaging ?? []) as never,
      p_event_timestamp: input.eventTimestamp ?? null,
      p_issued_offline: input.issuedOffline ?? false,
    } as never);
    if (error) throw error;
    return data as unknown as { event_id: string; lifecycle: DeliveryLifecycle };
  },

  /** The five Phase Β parties on a movement, carriers in transhipment order. */
  async parties(deliveryNoteId: string) {
    const { data, error } = await supabase
      .from('delivery_note_parties')
      .select('*')
      .eq('delivery_note_id', deliveryNoteId)
      .order('role')
      .order('sequence');
    if (error) throw error;
    return data ?? [];
  },
};

/** The status as a word, from the one table. Never an array index — AADE has no code 6. */
export function movementStatusLabel(code: number | null | undefined, lang: 'el' | 'en' = 'en'): string {
  const row = MYDATA_DELIVERY_STATUSES.find((s) => s.code === Number(code));
  return row ? row[lang] : '—';
}
