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
  lines: FiscalLine[];
  paymentMethods?: { type: number; amount: number }[];
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

export type FiscalSubmissionStatus = 'accepted' | 'offline' | 'rejected' | 'error';

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
}
