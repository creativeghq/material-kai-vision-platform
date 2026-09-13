/**
 * ΨΔΑ Phase Β1 — the movement lifecycle (#407), mandatory 12/10/2026.
 *
 * Every constant here is transcribed from AADE's own `DeliveryNote_v2.0.2.pdf` §7.1–7.4 and
 * `TransportTypes-v2.0.2.xsd`. Three of them are traps a reasonable implementation gets wrong,
 * and each is silent: a wrong status code is a valid integer, a wrong event name is a valid
 * string, and reading the wrong MARK key yields no MARK and no error.
 */
import { describe, it, expect } from 'vitest';
import {
  MYDATA_DELIVERY_STATUSES,
  MYDATA_DELIVERY_EVENT_TYPES,
  MYDATA_DELIVERY_EVENT_METHODS,
  MYDATA_DELIVERY_OUTCOMES,
  MYDATA_TRANSPORT_TYPES,
  MYDATA_PACKAGING_TYPES,
  MYDATA_MOVEMENT_PARTY_ROLES,
} from '@/services/fiscal/fiscalVocabulary';
// Import-free rules + the vocabulary: no Supabase client needed to pin what AADE says.
import { nextEventsFor } from '@/modules/finance/deliveryLifecycleRules';

describe('AADE §7.1 — InvoiceDeliveryStatus', () => {
  it('has no code 6', () => {
    // The single most likely silent error in this table: 1..9 with a hole. A range check, or a
    // map indexed by position, invents a status AADE never defined.
    const codes = MYDATA_DELIVERY_STATUSES.map((s) => s.code);
    expect(codes).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
    expect(codes).not.toContain(6);
  });

  it('no status label is reachable for a code AADE never defined', () => {
    expect(MYDATA_DELIVERY_STATUSES.find((s) => s.code === 6)).toBeUndefined();
    expect(MYDATA_DELIVERY_STATUSES.find((s) => s.code === 8)?.en).toBe('Completed');
  });
});

describe('AADE §7.2 — the event name is not the method name', () => {
  it('declares exactly the five event types', () => {
    expect([...MYDATA_DELIVERY_EVENT_TYPES].sort()).toEqual([
      'ConfirmOutcome', 'ConfirmReturn', 'RegisterTransfer', 'RegisterTransferReturn', 'Rejection',
    ]);
  });

  it('ConfirmDeliveryOutcome records ConfirmOutcome, not its own name', () => {
    // Binding the METHOD name as the event would file a type AADE does not recognise.
    expect(MYDATA_DELIVERY_EVENT_METHODS.ConfirmOutcome.method).toBe('ConfirmDeliveryOutcome');
    expect(MYDATA_DELIVERY_EVENT_METHODS.ConfirmReturn.method).toBe('ConfirmDeliveryReturn');
    expect(MYDATA_DELIVERY_EVENT_TYPES).not.toContain('ConfirmDeliveryOutcome');
  });

  it('every event knows which field its MARK arrives in, and they are all different', () => {
    // AADE returns the event MARK under a per-method key. §3.2.1 remark 3 still calls the first
    // `transportMark`, the name v2.0.1 renamed to `transferMark` — reading it yields nothing.
    const fields = Object.values(MYDATA_DELIVERY_EVENT_METHODS).map((m) => m.markField);
    expect(new Set(fields)).toEqual(new Set([
      'transferMark', 'deliveryOutcomeMark', 'rejectMark', 'deliveryReturnMark',
    ]));
    expect(fields).not.toContain('transportMark');
    for (const t of MYDATA_DELIVERY_EVENT_TYPES) {
      expect(MYDATA_DELIVERY_EVENT_METHODS[t], `${t} has no method binding`).toBeTruthy();
    }
  });
});

describe('AADE §7.3 / §7.4 — the code tables', () => {
  it('transportType runs 1-7 and 7 means no vehicle at all', () => {
    expect(MYDATA_TRANSPORT_TYPES.map((t) => t.code)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(MYDATA_TRANSPORT_TYPES.find((t) => t.code === 7)?.el).toBe('Άνευ');
  });

  it('packagingType is unchanged at 1-6', () => {
    expect(MYDATA_PACKAGING_TYPES.map((p) => p.code)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('the outcome vocabulary is exactly FULL / PARTIAL / NONE', () => {
    expect([...MYDATA_DELIVERY_OUTCOMES]).toEqual(['FULL', 'PARTIAL', 'NONE']);
  });

  it('Phase Β activates five party roles', () => {
    // Α.1123/2024 Παράρτημα marks all five `όχι` in Phase Α and `ναι` in Phase Β. For a
    // distributor using third-party hauliers that is five parties, not a flag.
    expect(MYDATA_MOVEMENT_PARTY_ROLES.map((r) => r.key)).toEqual([
      'sender', 'sender_third', 'carrier', 'recipient', 'recipient_third',
    ]);
  });
});

describe('what may happen next follows AADE, not convenience', () => {
  const life = (over: Partial<Parameters<typeof nextEventsFor>[0]> = {}) => ({
    delivery_note_id: 'x', status_code: 1, completed_at: null, carrier_partial: false,
    carrier_failed: false, non_obligated_recipient: false, events_pending_transmission: 0,
    ...over,
  });

  it('a registered movement can only be started', () => {
    expect(nextEventsFor(life({ status_code: 1 }))).toEqual(['RegisterTransfer']);
  });

  it('after a carrier PARTIAL the recipient cannot confirm — only the return leg is offered', () => {
    // §3.2.2 remark 4. Offering Confirm here would be a control whose only outcome is a refusal.
    expect(nextEventsFor(life({ status_code: 5, carrier_partial: true }))).toEqual(['RegisterTransfer']);
    expect(nextEventsFor(life({ status_code: 5, carrier_partial: false })))
      .toEqual(['ConfirmOutcome', 'Rejection']);
  });

  it('a completed movement offers nothing', () => {
    expect(nextEventsFor(life({ status_code: 8 }))).toEqual([]);
  });

  it('a return in transit can be transhipped again or confirmed by the issuer', () => {
    expect(nextEventsFor(life({ status_code: 9 }))).toEqual(['RegisterTransfer', 'ConfirmReturn']);
  });
});
