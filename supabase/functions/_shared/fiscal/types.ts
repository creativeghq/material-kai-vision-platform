// Country-neutral fiscal connector abstraction (C3: per-capability selection).
// A FiscalConnector implements one or more capabilities; a workspace binds each
// capability to a connector independently (workspace_fiscal_bindings).

export type FiscalCapability =
  | 'legal_invoice'
  | 'pre_invoice_notice'
  | 'pdf_render'
  | 'tax_submission'
  | 'numbering'
  | 'payment_reconciliation';

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

export interface FiscalLine {
  lineNumber: number;
  code?: string;
  description: string;
  quantity: number;
  measurementUnitLabel?: string;
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
  // type 7=card, 8=IRIS carry the EFT-POS terminal id + NSP for the Law 5155 signature.
  paymentMethods?: { type: number; amount: number; info?: string; terminalId?: string; posNspId?: number }[];
  summary: {
    totalNetValue: number;
    totalVatAmount: number;
    totalGrossValue: number;
    totalWithheldAmount?: number;
    incomeClassificationType?: string;
    incomeClassificationCategory?: string;
  };
  documentLabel?: string;
  documentComments?: string;
  logoId?: string;
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
