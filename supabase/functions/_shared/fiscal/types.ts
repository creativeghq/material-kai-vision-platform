// Country-neutral fiscal connector abstraction (C3: per-capability selection).
// A FiscalConnector implements one or more capabilities; a workspace binds each
// capability to a connector independently (workspace_fiscal_bindings).

// One source (#391) — the generated mirror.
export { FISCAL_CAPABILITIES, isFiscalCapability } from './fiscalVocabulary.generated.ts';
export type { FiscalCapability } from './fiscalVocabulary.generated.ts';
// Also imported: a re-export does not bind the name locally.
import type { FiscalCapability } from './fiscalVocabulary.generated.ts';

export interface FiscalAddress {
  street?: string;
  number?: string;
  postalCode?: string;
  city?: string;
  country?: string;
}

export interface FiscalParty {
  vatNumber: string;
  country: string; // ISO 3166-1 alpha-2, e.g. 'GR'
  branch: number; // 0 = headquarters
  name?: string;
  profession?: string;
  taxOffice?: string;
  address?: FiscalAddress;
  phone?: string;
  /** Emitted for the ISSUER only. The counterpart's address is deliberately withheld from the
   *  provider so it cannot auto-email the customer a second copy of the invoice — we own that
   *  channel. See the counterpart block in `novus.ts`. */
  email?: string;
  /** our internal counterpart code (#0001 etc.) */
  code?: string;
}

/** Our synthetic "no real product name" fallbacks. A line whose description is empty or
 *  equals one of these is treated as UNNAMED — we skip variant-folding it and REFUSE to
 *  transmit it (a legal document must carry the real item name). `'credit'` is deliberately
 *  NOT here: an amount-only credit note legitimately has a single reason-labelled line.
 *  Caveat: a line a human literally names "Item" is a false positive — the transmission
 *  error names the offending line so the fix (rename it) is obvious. */
export const UNNAMED_LINE_SENTINELS = new Set(['', '(line item)', 'item']);
export function isUnnamedLineName(desc: string | null | undefined): boolean {
  return UNNAMED_LINE_SENTINELS.has(String(desc ?? '').trim().toLowerCase());
}

/**
 * Units that exist in our catalogue but have NO AADE `measurement_unit` code.
 *
 * `mydata_reference` category `measurement_unit` holds exactly six codes (pieces, kg, litres,
 * metres, m², m³). Everything below is a packaging or labour unit we let operators pick because
 * it is how the trade actually talks — a tile order is placed in boxes and pallets — and it must
 * be converted to a coded unit before a line reaches myDATA. `src/lib/units.ts` says so in the
 * comment on `mydataCode: null`; nothing enforced it, so 'pallet' could be transmitted verbatim
 * as the measurement unit of an AADE-registered legal document.
 *
 * **Twin of the `mydataCode === null` entries in [src/lib/units.ts](../../../../src/lib/units.ts).**
 * An edge function cannot import from `src/`, so the set is restated here and held equal by
 * [tests/unit/fiscalUnitParity.test.ts](../../../../tests/unit/fiscalUnitParity.test.ts) — the same
 * arrangement `escapeHtml` uses across its three runtimes, and for the same reason: the last time
 * a value like this was hand-copied without a test, the copies drifted.
 *
 * Deliberately an explicit set rather than "anything not in the coded six": historical rows carry
 * aliases ('sqm', 'm²', 'τεμ', 'item') that normalise to a coded unit, and blocking those would
 * refuse transmissions that are perfectly valid today.
 */
export const UNCODED_MYDATA_UNITS = new Set([
  'box', 'pallet', 'set', 'hour', 'day', 'job', 'point', 'room', 'bath',
]);

/** True when this unit cannot be transmitted to myDATA as-is and needs converting first. */
export function isUncodedMydataUnit(unit: string | null | undefined): boolean {
  return UNCODED_MYDATA_UNITS.has(String(unit ?? '').trim().toLowerCase());
}

/**
 * AADE `measurement_unit` code → our canonical unit key.
 *
 * The inverse of the `mydataCode` field on `src/lib/units.ts`, and the OTHER direction of the
 * same twin: `UNCODED_MYDATA_UNITS` above stops an uncoded unit going OUT to AADE, this stops us
 * ignoring a coded unit coming IN. myDATA states the unit on the line it delivers, so on an
 * inbound document this code IS the unit — `src/lib/units.ts` says so in as many words ("never
 * infer the unit from a product description instead") and the intake queue writer inferred it
 * anyway, from a Haiku reading of the description, for every line it has ever queued. Measured
 * 2026-08-20: 2,022 of 3,643 inbound lines carry the code; 82 queued rows ended up as a
 * fractional quantity of `pcs`, which is not a thing that can be in a warehouse.
 *
 * **Twin of the `mydataCode` values in [src/lib/units.ts](../../../../src/lib/units.ts)**, held
 * equal by [tests/unit/fiscalUnitParity.test.ts](../../../../tests/unit/fiscalUnitParity.test.ts).
 * An edge function cannot import from `src/`; a hand-copied map with no test is how the six unit
 * lists that preceded `units.ts` drifted apart.
 */
export const MYDATA_UNIT_BY_CODE: Record<number, string> = {
  1: 'pcs', 2: 'kg', 3: 'lt', 4: 'm', 5: 'm2', 6: 'm3',
};

/** The unit AADE stated on a line, or null when the document omitted it. */
// `code` is typed to include `string` because that is what AADE actually sends: the myDATA
// payload carries it as XML/JSON text, so an empty element arrives as '' rather than null.
// Narrowing this to `number` makes the `=== ''` guard a type error and, worse, drops the
// only signal that the document omitted the unit.
export function unitFromMydataCode(code: number | string | null | undefined): string | null {
  if (code == null || code === '') return null;
  const n = Number(code);
  return Number.isFinite(n) ? (MYDATA_UNIT_BY_CODE[n] ?? null) : null;
}

export interface FiscalLine {
  lineNumber: number;
  code?: string;
  description: string;
  quantity: number;
  measurementUnitLabel?: string;
  /**
   * Customs facts, snapshotted on the document line — never re-read from the product.
   * A reissued or reprinted invoice must keep saying what it said, and the EU republishes the
   * nomenclature monthly. A cross-border commercial invoice is expected to carry the commodity
   * code per line; origin is what decides preference and anti-dumping.
   */
  commodityCode?: string;
  countryOfOrigin?: string;
  unitPrice: number;
  netValue: number;
  discountValue?: number;
  /** myDATA VAT category 1..8 (1=24%, 2=13%, 3=6%, 7=0%, 8=exempt …) */
  vatCategory: number;
  vatPercent: number;
  vatAmount: number;
  /** myDATA income classification, e.g. E3_561_001 / category1_1 */
  incomeClassificationType?: string;
  incomeClassificationCategory?: string;
  /** myDATA VAT exemption category (1..31) — required when vatCategory is 7 (0%). */
  vatExemptionCategory?: number;
  /** Per-line taxes (Novus invoiceDetails). Amounts in document currency. */
  withheldAmount?: number;
  withheldCategory?: number;
  feesAmount?: number;
  feesCategory?: number;
  stampDutyAmount?: number;
  stampDutyCategory?: number;
  otherTaxesAmount?: number;
  otherTaxesCategory?: number;
  deductionsAmount?: number;
  lineComments?: string;
  /**
   * myDATA `invoiceDetailType` (Appendix Par.11 "Remarks") — which kind of line this is:
   * 1 = third-party sales clearance, 2 = fee from third-party sales. A 1.5 document
   * ("Clearance of Sales on Behalf of Third Parties – Fees from Sales on Behalf of Third
   * Parties") carries both kinds at once, and this is what tells them apart.
   *
   * The Novus dev doc (p.9) glosses this as "self-billing remark" — a loose rendering of
   * «Επισήμανση Αυτοτιμολόγησης» — but the two values above are its ONLY allowed values, so
   * it belongs to the sale-on-behalf-of-third-parties family, NOT to self-billing
   * (αυτοτιμολόγηση). Self-billing is the header flag `header.selfPricing`. See issue #278.
   */
  invoiceDetailType?: number;
}

export interface FiscalInvoiceInput {
  issuer: FiscalParty;
  counterpart: FiscalParty;
  header: {
    series: string;
    aa: string;
    issueDate: string; // YYYY-MM-DD
    invoiceType: string; // myDATA type code, e.g. '1.1', '2.1', '11.1', '5.1' (credit note), '9.3' (delivery note)
    currency: string; // 'EUR'
    vatPaymentSuspension?: boolean;
    selfPricing?: boolean;
    exchangeRate?: number;
    // ── Movement / delivery-note fields (myDATA 9.3) — present only for transport docs ──
    dispatchDate?: string;   // YYYY-MM-DD
    dispatchTime?: string;   // HH:MM:SS
    vehicleNumber?: string;
    movePurpose?: number;    // 1=sale, 2=sale-on-behalf, 3=sampling, 4=exhibition, 5=return, 6=inter-premises, 7=consignment
    movePurposeLabel?: string;
    loadingAddress?: { street: string; number: string; postalCode: string; city: string };
    deliveryAddress?: { street: string; number: string; postalCode: string; city: string };
  };
  /** myDATA MARK(s) of the invoice(s) this document corrects — required for a 5.1 credit note. */
  correlatedInvoices?: number[];
  /** B2G (public-sector) extras — emitted as `providerB2gAdditionalInvoiceDetails`
   *  on the same SendInvoices envelope. Present only when the invoice is_b2g. */
  b2g?: {
    contractReference?: string;
    buyerReference?: string;
    buyerLegalRegistrationIdentifier?: string;
    partyName?: string;
    dueDate?: string; // YYYY-MM-DD
    budget?: { type?: number; identifier?: string };
    buyerIdentifiers?: { buyerIdentifier: string }[];
    deliveryDetails?: { street?: string; city?: string; postalCode?: string };
  };
  lines: FiscalLine[];
  /** myDATA payment method (AADE table 8.12 — `MYDATA_PAYMENT_CODE` in the payment
   *  vocabulary is the one place those integers are named). 7 = POS / e-POS and 8 = IRIS
   *  carry the EFT-POS terminal id + NSP for the Law 5155 signature. */
  paymentMethods?: { type: number; amount: number; info?: string; terminalId?: string; posNspId?: number }[];
  summary: {
    totalNetValue: number;
    totalVatAmount: number;
    totalGrossValue: number;
    // The four below were read out of `summary` by the connector through an `as any` cast,
    // so nothing checked that a builder actually supplied them — and the credit-note builder
    // supplied none of the five. Declared, so omitting one is now a type error at the reader.
    totalWithheldAmount?: number;
    totalFeesAmount?: number;
    totalStampDutyAmount?: number;
    totalOtherTaxesAmount?: number;
    totalDeductionsAmount?: number;
    incomeClassificationType?: string;
    incomeClassificationCategory?: string;
  };
  documentLabel?: string;
  documentComments?: string;
  /** Presentation language of the PROVIDER's rendered PDF. Inert while we serve our own
   *  document; defaults to English (never 'el') rather than being pinned in the connector. */
  documentLanguageCode?: string;
}

export type FiscalSubmissionStatus = 'accepted' | 'offline' | 'rejected' | 'error' | 'awaiting_payment';

/** Law 5155/2023 provider signature returned when skipSignature=false + paymentType 7/8.
 *  The `token` (HEX/BASE64 per posNspId) + `data` are handed to the bank/NSP terminal API to
 *  unlock the POS charge; the doc is NOT yet on AADE — CompletionPosInvoices finalizes it. */
export interface ProviderSignature {
  invoiceUid: string;
  token: string;
  data: string;
  createdDate?: string;
  expiryDate?: string;
  isExpired?: boolean;
  paymentBalance?: number;
  issuerVatNumber?: string;
}

export interface FiscalSubmissionResult {
  status: FiscalSubmissionStatus;
  mark?: string;
  uid?: string;
  authenticationCode?: string;
  qrUrl?: string;
  invoiceUrl?: string;
  providerCredits?: number;
  isOffline: boolean;
  /** 5XX/transient — the caller should resend with transmissionFailure=1 */
  transmissionFailure?: boolean;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
  /** Present when status='awaiting_payment' (skipSignature=false + card/IRIS): the Law-5155
   *  signature(s) to hand to the POS terminal; complete via completePosInvoice afterwards. */
  providerSignature?: ProviderSignature[];
}

/** Result of completing a POS/IRIS card payment (CompletionPosInvoices). */
export interface PosCompletionResult {
  ok: boolean;
  mark?: string;
  finalPaymentType?: number; // 7=card, 8=IRIS — the bank's final type
  errorMessage?: string;
  raw?: unknown;
}

export interface FiscalConnectorContext {
  baseUrl: string;
  apiKey: string;
  isSandbox: boolean;
}

export interface FiscalConnector {
  slug: string;
  capabilities: FiscalCapability[];
  /** Issue/transmit a legal invoice (or pre-invoice notice). */
  submitInvoice(
    input: FiscalInvoiceInput,
    ctx: FiscalConnectorContext,
    opts?: { skipSignature?: boolean; transmissionFailure?: boolean },
  ): Promise<FiscalSubmissionResult>;
  /** Resolve the final MARK for an invoice that came back Offline (AADE was down). */
  fetchTransmitted?(
    query: { invoiceMark?: string; aa?: string; issuerVatNumber?: string },
    ctx: FiscalConnectorContext,
  ): Promise<FiscalSubmissionResult>;
  /** Law 5155 — after the POS terminal charge succeeds, finalize the held card/IRIS invoice
   *  (CompletionPosInvoices) → transmits to AADE → returns MARK. */
  completePosInvoice?(
    input: { signatureToken: string; transactionId: string; paymentAmount: number; paymentType?: number; tipAmount?: number },
    ctx: FiscalConnectorContext,
  ): Promise<PosCompletionResult>;
  /** Law 5155 deferred flow — request a signature for an already-issued (on-credit) invoice. */
  askSignatureForOldInvoice?(
    input: { invoiceMark?: string; invoiceUid?: string },
    ctx: FiscalConnectorContext,
  ): Promise<ProviderSignature>;
  completeOldInvoicePosPayment?(
    input: { signatureToken: string; transactionId: string; paymentAmount: number; paymentType?: number; tipAmount?: number },
    ctx: FiscalConnectorContext,
  ): Promise<PosCompletionResult>;
}
