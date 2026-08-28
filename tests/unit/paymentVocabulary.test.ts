import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  PAYMENT_METHODS, PAYMENT_PROVIDER_SLUGS, isPaymentMethod, isPaymentProviderSlug,
} from '@/modules/finance/paymentVocabulary';
import { FISCAL_CAPABILITIES, isFiscalCapability } from '@/services/fiscal/fiscalVocabulary';
import { RING_VALUES, ringRank, isTechRadarRing } from '@/services/techRadar/techRadarVocabulary';
import {
  PROBE_STATUSES, AUTHORITATIVE_PROBE_STATUSES, isProbeStatus,
} from '@/services/generation/probeVocabulary';
import {
  INQUIRY_STATUSES, COMMISSION_PARTY_TYPES, BOOKING_CHANNELS, SYNCABLE_CHANNELS,
} from '@/modules/real-estate/realEstateVocabulary';
import { APP_STAGES, APP_STAGES_IN_FUNNEL, DOC_TYPES } from '@/modules/hr/hrVocabulary';
import { PAGE_WATCH_CATEGORIES } from '@/services/pageWatch/pageWatchVocabulary';

/**
 * The final #391 batch, pinned to the constraints and enums that enforce it.
 *
 * Same contract as the rest of the set: the expected values are `pg_constraint` /
 * `pg_enum` text quoted VERBATIM, not a tidy array, because a pin you hand-edit alongside
 * the thing it pins can only ever catch inconsistency — never incorrectness.
 */

const ROOT = join(__dirname, '..', '..');

/** `pg_get_constraintdef` / `pg_enum` output, 2026-08-27. Verbatim. */
const DB = {
  method:
    "CHECK (((method IS NULL) OR (method = ANY (ARRAY['bank_transfer'::text, 'cash'::text, 'card'::text, 'iris'::text, 'check'::text, 'other'::text]))))",
  provider:
    "CHECK ((provider = ANY (ARRAY['revolut'::text, 'stripe'::text, 'viva'::text])))",
  capability:
    "CHECK ((capability = ANY (ARRAY['legal_invoice'::text, 'pre_invoice_notice'::text, 'pdf_render'::text, 'tax_submission'::text, 'numbering'::text, 'payment_reconciliation'::text])))",
  probe:
    "CHECK (((last_probe_status IS NULL) OR (last_probe_status = ANY (ARRAY['ok'::text, 'credit_exhausted'::text, 'not_found'::text, 'schema_rejected'::text, 'auth_failed'::text, 'error'::text, 'timeout'::text]))))",
  inquiry:
    "CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'viewing_booked'::text, 'closed'::text, 'spam'::text])))",
  party:
    "CHECK ((party_type = ANY (ARRAY['listing_agent'::text, 'buyer_agent'::text, 'house'::text, 'referral'::text, 'external'::text])))",
  bookingChannel:
    "CHECK ((channel = ANY (ARRAY['direct'::text, 'airbnb'::text, 'booking_com'::text, 'vrbo'::text, 'other'::text])))",
  linkChannel:
    "CHECK ((channel = ANY (ARRAY['airbnb'::text, 'booking_com'::text, 'vrbo'::text, 'other'::text])))",
  appStage:
    "CHECK ((stage = ANY (ARRAY['applied'::text, 'screening'::text, 'interview'::text, 'offer'::text, 'hired'::text, 'rejected'::text])))",
  hrDocType:
    "CHECK ((doc_type = ANY (ARRAY['contract'::text, 'id'::text, 'certificate'::text, 'payslip'::text, 'review'::text, 'other'::text])))",
  watchCategory:
    "CHECK ((category = ANY (ARRAY['supplier_terms'::text, 'regulatory'::text, 'partner_docs'::text, 'competitor'::text, 'other'::text])))",
  /** `tech_radar_ring`, in `enumsortorder`. */
  ringEnum: "'adopt', 'trial', 'assess', 'hold'",
};

const literals = (s: string) => [...s.matchAll(/'([^':]+)'/g)].map((m) => m[1]);

describe('#391 — the final batch matches its constraints', () => {
  const cases: Array<[string, readonly string[], string]> = [
    ['payment method', PAYMENT_METHODS, DB.method],
    ['payment provider slug', PAYMENT_PROVIDER_SLUGS, DB.provider],
    ['fiscal capability', FISCAL_CAPABILITIES, DB.capability],
    ['probe status', PROBE_STATUSES, DB.probe],
    ['inquiry status', INQUIRY_STATUSES, DB.inquiry],
    ['commission party type', COMMISSION_PARTY_TYPES, DB.party],
    ['booking channel', BOOKING_CHANNELS, DB.bookingChannel],
    ['syncable channel', SYNCABLE_CHANNELS, DB.linkChannel],
    ['application stage', APP_STAGES, DB.appStage],
    ['HR document type', DOC_TYPES, DB.hrDocType],
    ['page-watch category', PAGE_WATCH_CATEGORIES, DB.watchCategory],
    ['tech radar ring', RING_VALUES, DB.ringEnum],
  ];

  for (const [label, values, constraint] of cases) {
    it(label, () => {
      expect([...values].sort()).toEqual(literals(constraint).sort());
    });
  }

  it('the literal extractor reads something', () => {
    expect(literals(DB.method)).toHaveLength(6);
    expect(literals('CHECK ((x = ANY (ARRAY[])))')).toEqual([]);
  });

  it('every guard narrows', () => {
    for (const v of PAYMENT_METHODS) expect(isPaymentMethod(v)).toBe(true);
    for (const v of PAYMENT_PROVIDER_SLUGS) expect(isPaymentProviderSlug(v)).toBe(true);
    for (const v of FISCAL_CAPABILITIES) expect(isFiscalCapability(v)).toBe(true);
    for (const v of PROBE_STATUSES) expect(isProbeStatus(v)).toBe(true);
    for (const v of RING_VALUES) expect(isTechRadarRing(v)).toBe(true);
    expect(isPaymentMethod('paypal')).toBe(false);
    expect(isPaymentProviderSlug('paypal')).toBe(false);
    expect(isFiscalCapability('einvoice')).toBe(false);
    expect(isProbeStatus('unknown')).toBe(false);
    expect(isTechRadarRing('adopt_later')).toBe(false);
  });

  it('a nullable column does not put NULL in the set', () => {
    // `payments.method` and `generation_models.last_probe_status` both read
    // `IS NULL OR ...`. "Not recorded" and "never probed" are legitimate states and are
    // NOT members; adding them would make the source disagree with the constraint.
    expect(isPaymentMethod(null)).toBe(false);
    expect(isProbeStatus(null)).toBe(false);
  });
});

describe('#391 — derived subsets stay derived', () => {
  it('the syncable channels are the bookings set minus `direct`', () => {
    // TWO constraints, deliberately different: you cannot sync an iCal feed for a booking
    // somebody phoned in. Deriving rather than retyping means a sixth channel joins both.
    expect(SYNCABLE_CHANNELS).not.toContain('direct');
    expect(BOOKING_CHANNELS).toContain('direct');
    for (const c of SYNCABLE_CHANNELS) expect(BOOKING_CHANNELS as readonly string[]).toContain(c);
    expect(SYNCABLE_CHANNELS.length).toBe(BOOKING_CHANNELS.length - 1);
  });

  it('the recruitment funnel is the stages minus the `rejected` off-ramp', () => {
    expect(APP_STAGES_IN_FUNNEL).not.toContain('rejected');
    for (const s of APP_STAGES_IN_FUNNEL) expect(APP_STAGES as readonly string[]).toContain(s);
  });

  it('the authoritative probe statuses are a real subset', () => {
    // `error`/`timeout` mean "we could not tell" and must not flip a model's availability
    // on their own; `schema_rejected` is a real answer about OUR request, not the model.
    for (const s of AUTHORITATIVE_PROBE_STATUSES) {
      expect(PROBE_STATUSES as readonly string[]).toContain(s);
    }
    expect(AUTHORITATIVE_PROBE_STATUSES).not.toContain('error');
    expect(AUTHORITATIVE_PROBE_STATUSES).not.toContain('timeout');
    expect(AUTHORITATIVE_PROBE_STATUSES).not.toContain('schema_rejected');
  });
});

describe('#391 — the radar ring order is the vocabulary, not a parallel list', () => {
  it('ringRank follows RING_VALUES and sorts an unknown ring last', () => {
    RING_VALUES.forEach((r, i) => expect(ringRank(r)).toBe(i));
    // A finding reaches the card as tool-result JSON before anything writes it to the
    // enum column, so the model can still hand us a ring that does not exist.
    expect(ringRank('speculate')).toBe(RING_VALUES.length);
    expect(ringRank(undefined)).toBe(RING_VALUES.length);
  });

  it('the card no longer carries its own copy of the order', () => {
    // `RING_ORDER` and the `order:` field inside `RING_META` were two hand-written copies
    // of the same sequence living eight lines apart. Both are gone; this fails if either
    // comes back.
    const src = stripComments(
      readFileSync(join(ROOT, 'src/components/features/ai/TechRadarFindingsCard.tsx'), 'utf8'),
    );
    expect(src).not.toMatch(/RING_ORDER/);
    expect(src).not.toMatch(/order:\s*\d/);
    expect(src).toContain('ringRank');
  });
});

describe('#391 — `priority_level` was a false positive, not a missed unification', () => {
  it('the heat-pump glazing exposure is NOT the priority vocabulary', () => {
    // The sweep matched `GlazingExposure = 'low' | 'normal' | 'high'` against the
    // `priority_level` Postgres enum on its three literals alone. They share nothing else:
    // one is how much glass a room has, the other is how urgent a task is — and
    // `priority_level` turned out to be typed on ZERO columns, so it enforced nothing
    // anywhere and was dropped. Unifying on a literal match is exactly the
    // signature-matching mistake #391 warns against; this case is here so nobody retries it.
    const src = stripComments(
      readFileSync(join(ROOT, 'src/lib/calculators/heatPumpSizing.ts'), 'utf8'),
    );
    expect(src).toContain("export type GlazingExposure = 'low' | 'normal' | 'high';");
    // Not `/priority/i`: the file legitimately says "priority switching" about hot-water
    // cylinders, which is plumbing and has nothing to do with the enum.
    expect(src).not.toContain('priority_level');
    expect(src).not.toMatch(/from '@\/services\/.*[Vv]ocabulary'/);
  });
});
