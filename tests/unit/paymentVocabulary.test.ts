import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  PAYMENT_METHODS, PAYMENT_PROVIDER_SLUGS, isPaymentMethod, isPaymentProviderSlug,
  MYDATA_PAYMENT_CODE, MYDATA_PAYMENT_METHOD_LABELS, MYDATA_PAYMENT_CODE_BY_LEDGER_METHOD,
  mydataPaymentLabel,
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


/**
 * AADE Appendix table 8.12 — the payment method a fiscal envelope transmits.
 *
 * Two DIFFERENT numberings of the same eight entries were live at once. The register, the
 * storefront and the fiscal envelope used AADE's; the `mydata_reference` seed behind the
 * manual invoice picker and the three maps that PRINT the result used it rotated by two, so
 * "3 — On credit" in the dialog transmitted **Cash** and a POS receipt (7) printed as
 * "Domestic account". Both halves were internally consistent and every value involved is a
 * valid integer 1–8, so nothing could raise. Found by reading another vendor's public API
 * docs on 2026-08-29, not by anything we own — hence this.
 */
describe("myDATA payment methods are AADE table 8.12, in AADE's order", () => {
  /** `select code, description from mydata_reference where category='payment_method'`, 2026-08-29. Verbatim. */
  const SEED: [number, string][] = [
    [1, 'Domestic Payments Account Number'],
    [2, 'Foreign Payments Account Number'],
    [3, 'Cash'],
    [4, 'Cheque'],
    [5, 'On credit'],
    [6, 'Web Banking'],
    [7, 'POS / e-POS'],
    [8, 'IRIS Direct Payments'],
  ];

  it('the named codes ARE the table', () => {
    expect(MYDATA_PAYMENT_CODE).toEqual({
      domestic_account: 1, foreign_account: 2, cash: 3, cheque: 4,
      on_credit: 5, web_banking: 6, pos: 7, iris: 8,
    });
  });

  it('every seeded reference row has a label under the same code', () => {
    // The seed is what the picker OFFERS and this map is what the document PRINTS. They
    // disagreeing is precisely the defect: an operator picks one method and reads another.
    for (const [code, seeded] of SEED) {
      const label = MYDATA_PAYMENT_METHOD_LABELS[code];
      expect(label, `no label for code ${code}`).toBeTruthy();
      // Not byte-equal — AADE's own wording is longer than a table cell wants — but the same
      // method: the first word of the seeded description has to appear in the printed one.
      expect(label.en.toLowerCase()).toContain(seeded.split(' ')[0].toLowerCase());
    }
    expect(Object.keys(MYDATA_PAYMENT_METHOD_LABELS)).toHaveLength(SEED.length);
  });

  it('the three codes that carry money on a Law 5155 terminal are the AADE ones', () => {
    // Pinned individually because these are the ones the rotation moved, and the ones a
    // register writes: cash 3, POS 7, IRIS 8.
    expect(MYDATA_PAYMENT_CODE.cash).toBe(3);
    expect(MYDATA_PAYMENT_CODE.pos).toBe(7);
    expect(MYDATA_PAYMENT_CODE.iris).toBe(8);
    expect(mydataPaymentLabel(7)).toBe('POS / e-POS');
    expect(mydataPaymentLabel(8)).toBe('IRIS');
    // The rotated table's readings of the same integers. If either comes back, so did the bug.
    expect(mydataPaymentLabel(7)).not.toBe('Domestic account');
    expect(mydataPaymentLabel(6)).not.toBe('IRIS');
  });

  it('an unknown code reads as itself rather than as some other method', () => {
    expect(mydataPaymentLabel(99)).toBe('99');
    expect(mydataPaymentLabel(null)).toBe('');
  });

  it('every ledger method resolves, and `other` refuses to guess', () => {
    for (const m of PAYMENT_METHODS) {
      expect(MYDATA_PAYMENT_CODE_BY_LEDGER_METHOD).toHaveProperty(m);
    }
    // AADE has no "other". Mapping it to the nearest code would file a method nobody chose.
    expect(MYDATA_PAYMENT_CODE_BY_LEDGER_METHOD.other).toBeNull();
    expect(MYDATA_PAYMENT_CODE_BY_LEDGER_METHOD.iris).toBe(MYDATA_PAYMENT_CODE.iris);
    expect(MYDATA_PAYMENT_CODE_BY_LEDGER_METHOD.card).toBe(MYDATA_PAYMENT_CODE.pos);
  });

  it('no file keeps its own copy of the code table', () => {
    // The five that did: two frontend maps, the edge PDF, the register and the storefront.
    // A `Record<number, string>` of payment names is the shape that drifted; a bare integer
    // literal at a call site is how it drifted back the first time.
    const FILES = [
      'src/modules/finance/invoice-templates/labels.ts',
      'src/modules/finance/invoice-templates/renderData.ts',
      'src/pages/Admin/InvoiceDetailPage.tsx',
      'src/modules/finance/pages/PosPage.tsx',
      'supabase/functions/finance-invoice-pdf/index.ts',
      'supabase/functions/finance-storefront/index.ts',
    ];
    for (const f of FILES) {
      const src = stripComments(readFileSync(join(ROOT, f), 'utf8'));
      expect(src, `${f} spells out the table again`).not.toMatch(/1:\s*'Cash'/);
      expect(src, `${f} spells out the table again`).not.toMatch(/6:\s*'IRIS'/);
      expect(src, `${f} spells out the table again`).not.toMatch(/7:\s*'Domestic/);
      expect(src, `${f} writes a bare payment_method_code integer`)
        .not.toMatch(/payment_method_code:\s*\d/);
    }
  });
});
