// Novus Provider (myDATA/AADE) connector — REST API v2.3.
// Docs: src/modules/myaade/NovusProvider/. Base URLs:
//   sandbox    https://provider-dev.timologisi.online
//   production https://provider.timologisi.online
// Auth header: `API-KEY: {key}`. HTTP is ALWAYS 200 on a processed request —
// branch on response[].statusCode (Success | Offline | XMLSyntaxError |
// ValidationError | TechnicalError). 5XX = transient → resend transmissionFailure=1.

import type {
  FiscalConnector,
  FiscalConnectorContext,
  FiscalInvoiceInput,
  FiscalSubmissionResult,
} from './types.ts';

export const NOVUS_SANDBOX_BASE = 'https://provider-dev.timologisi.online';
export const NOVUS_PRODUCTION_BASE = 'https://provider.timologisi.online';

/** "1,00" → 1.0 (Novus reports credits with a comma decimal separator). */
function parseCredits(v: unknown): number | undefined {
  if (typeof v !== 'string') return typeof v === 'number' ? v : undefined;
  const n = Number(v.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Map our normalized invoice into the Novus `{ invoice: [ … ] }` request body. */
export function buildNovusPayload(input: FiscalInvoiceInput): Record<string, unknown> {
  const { issuer, counterpart, header, lines, summary } = input;

  const invoiceDetails = lines.map((l) => ({
    lineNumber: l.lineNumber,
    lineCode: l.code ?? undefined,
    quantity: l.quantity,
    measurementUnitLabel: l.measurementUnitLabel ?? 'ΤΜΧ',
    lineUnitPrice: l.unitPrice,
    totalNetPriceBeforeDiscount: l.netValue + (l.discountValue ?? 0),
    totalDiscountValue: l.discountValue ?? 0,
    netValue: l.netValue,
    vatCategory: l.vatCategory,
    vatCategoryPercent: l.vatPercent,
    vatAmount: l.vatAmount,
    // 0% VAT lines must carry the exemption reason or myDATA rejects them.
    ...(l.vatExemptionCategory ? { vatExemptionCategory: l.vatExemptionCategory } : {}),
    // Per-line taxes (only emitted when non-zero).
    ...(l.withheldAmount ? { withheldAmount: l.withheldAmount, ...(l.withheldCategory ? { withheldPercentCategory: l.withheldCategory } : {}) } : {}),
    ...(l.feesAmount ? { feesAmount: l.feesAmount, ...(l.feesCategory ? { feesPercentCategory: l.feesCategory } : {}) } : {}),
    ...(l.stampDutyAmount ? { stampDutyAmount: l.stampDutyAmount, ...(l.stampDutyCategory ? { stampDutyPercentCategory: l.stampDutyCategory } : {}) } : {}),
    ...(l.otherTaxesAmount ? { otherTaxesAmount: l.otherTaxesAmount, ...(l.otherTaxesCategory ? { otherTaxesPercentCategory: l.otherTaxesCategory } : {}) } : {}),
    ...(l.deductionsAmount ? { deductionsAmount: l.deductionsAmount } : {}),
    ...(l.lineComments ? { lineComments: l.lineComments } : {}),
    lineDescription: l.description,
    incomeClassification: l.incomeClassificationType
      ? [
          {
            classificationType: l.incomeClassificationType,
            classificationCategory: l.incomeClassificationCategory ?? 'category1_1',
            amount: l.netValue,
          },
        ]
      : undefined,
  }));

  const addr = (p: typeof issuer) => ({
    addressStreet: p.address?.street ?? '',
    addressNumber: p.address?.number ?? '',
    addressPostalCode: p.address?.postalCode ?? '',
    addressCity: p.address?.city ?? '',
    addressCountry: p.address?.country ?? p.country ?? '',
  });

  return {
    invoice: [
      {
        issuer: { vatNumber: issuer.vatNumber, country: issuer.country, branch: issuer.branch ?? 0 },
        counterpart: counterpart.vatNumber
          ? {
              vatNumber: counterpart.vatNumber,
              country: counterpart.country,
              branch: counterpart.branch ?? 0,
              address: {
                street: counterpart.address?.street ?? '',
                number: counterpart.address?.number ?? '',
                postalCode: counterpart.address?.postalCode ?? '0',
                city: counterpart.address?.city ?? 'NONE',
              },
            }
          : undefined, // retail (11.x) — no counterpart VAT
        invoiceHeader: {
          series: header.series,
          aa: header.aa,
          issueDate: header.issueDate,
          invoiceType: header.invoiceType,
          currency: header.currency,
          ...(header.vatPaymentSuspension != null ? { vatPaymentSuspension: header.vatPaymentSuspension } : {}),
          ...(header.selfPricing ? { selfPricing: true } : {}),
          ...(header.exchangeRate ? { exchangeRate: header.exchangeRate } : {}),
          // 5.1 credit note: reference the original invoice MARK(s) being corrected.
          ...(input.correlatedInvoices?.length
            ? { correlatedInvoices: input.correlatedInvoices }
            : {}),
          // 9.3 delivery note: transport / movement block.
          ...(header.movePurpose != null
            ? {
                vatPaymentSuspension: false,
                dispatchDate: header.dispatchDate ?? header.issueDate,
                ...(header.dispatchTime ? { dispatchTime: header.dispatchTime } : {}),
                ...(header.vehicleNumber ? { vehicleNumber: header.vehicleNumber } : {}),
                otherDeliveryNoteHeader: {
                  ...(header.loadingAddress ? { loadingAddress: header.loadingAddress } : {}),
                  ...(header.deliveryAddress ? { deliveryAddress: header.deliveryAddress } : {}),
                  startShippingBranch: 0,
                  completeShippingBranch: 0,
                },
                movePurpose: header.movePurpose,
                ...(header.movePurposeLabel ? { movePurposeLabel: header.movePurposeLabel } : {}),
              }
            : {}),
        },
        paymentMethods: input.paymentMethods?.length
          ? input.paymentMethods.map((pm: any) => ({
              type: pm.type, amount: pm.amount,
              ...(pm.info ? { paymentMethodInfo: pm.info } : {}),
              // Law 5155 — card(7)/IRIS(8) carry the EFT-POS terminal + NSP for the signature.
              ...(pm.terminalId ? { terminalId: pm.terminalId } : {}),
              ...(pm.posNspId != null ? { posNspId: pm.posNspId } : {}),
            }))
          : [{ type: 5, amount: summary.totalGrossValue }],
        invoiceDetails,
        providerAdditionalInvoiceDetails: {
          issuer: {
            name: issuer.name ?? '',
            profession: issuer.profession ?? '',
            taxoffice: issuer.taxOffice ?? '',
            ...addr(issuer),
            phone: issuer.phone ?? '',
            email: issuer.email ?? '',
          },
          counterpart: {
            code: counterpart.code ?? '',
            name: counterpart.name ?? '',
            profession: counterpart.profession ?? '',
            taxoffice: counterpart.taxOffice ?? '',
            ...addr(counterpart),
            phone: counterpart.phone ?? '',
            email: counterpart.email ?? '',
          },
          additionalDetails: {
            documentLabel: input.documentLabel ?? 'Τιμολόγιο Πώλησης',
            documentLanguageCode: 'EL',
            documentSizeCode: 0,
            documentComments: input.documentComments ?? '',
            logoId: input.logoId ?? undefined,
          },
        },
        invoiceSummary: {
          totalNetValue: summary.totalNetValue,
          totalVatAmount: summary.totalVatAmount,
          totalWithheldAmount: summary.totalWithheldAmount ?? 0,
          totalFeesAmount: (summary as any).totalFeesAmount ?? 0,
          totalStampDutyAmount: (summary as any).totalStampDutyAmount ?? 0,
          totalOtherTaxesAmount: (summary as any).totalOtherTaxesAmount ?? 0,
          totalDeductionsAmount: (summary as any).totalDeductionsAmount ?? 0,
          totalGrossValue: summary.totalGrossValue,
          incomeClassification: summary.incomeClassificationType
            ? [
                {
                  classificationType: summary.incomeClassificationType,
                  classificationCategory: summary.incomeClassificationCategory ?? 'category1_1',
                  amount: summary.totalNetValue,
                },
              ]
            : undefined,
        },
      },
    ],
  };
}

function firstError(entry: any): { code?: string; message?: string } {
  const err = entry?.errors?.[0]?.error?.[0];
  return { code: err?.code, message: err?.message };
}

/** Normalize a Novus `response[0]` entry into our FiscalSubmissionResult. */
function interpret(entry: any, httpStatus: number): FiscalSubmissionResult {
  if (httpStatus >= 500) {
    return { status: 'error', isOffline: false, transmissionFailure: true, errorMessage: `Novus ${httpStatus}`, raw: entry };
  }
  const code: string = entry?.statusCode ?? (httpStatus >= 400 ? 'HttpError' : 'Unknown');
  const markRaw = entry?.invoiceMark;
  const mark = markRaw && markRaw !== 0 ? String(markRaw) : undefined;

  switch (code) {
    case 'Success':
      return {
        status: 'accepted',
        isOffline: false,
        mark,
        uid: entry?.invoiceUid ?? undefined,
        authenticationCode: entry?.authenticationCode ?? undefined,
        qrUrl: entry?.qrUrl ?? undefined,
        invoiceUrl: entry?.invoiceUrl ?? undefined,
        providerCredits: parseCredits(entry?.credits),
        raw: entry,
      };
    case 'Offline':
      // AADE was down; provider will transmit later. No final MARK yet — poll
      // RequestTransmittedDocs by invoiceUid/aa to backfill it.
      return {
        status: 'offline',
        isOffline: true,
        uid: entry?.invoiceUid ?? undefined,
        qrUrl: entry?.qrUrl ?? undefined,
        invoiceUrl: entry?.invoiceUrl ?? undefined,
        providerCredits: parseCredits(entry?.credits),
        raw: entry,
      };
    default: {
      // XMLSyntaxError | ValidationError | TechnicalError | HttpError
      const { code: ec, message } = firstError(entry);
      return { status: 'rejected', isOffline: false, errorCode: ec ?? code, errorMessage: message ?? code, raw: entry };
    }
  }
}

export const novusConnector: FiscalConnector = {
  slug: 'novus',
  capabilities: ['legal_invoice', 'pre_invoice_notice', 'tax_submission', 'pdf_render'],

  async submitInvoice(input, ctx, opts) {
    // Novus defaults skipSignature=true (no provider signature). To get the Law-5155 signature
    // for a card/IRIS payment on a connected POS, the caller must explicitly request signing
    // (opts.skipSignature === false). Send the value explicitly either way.
    const skip = opts?.skipSignature === false ? 'false' : 'true';
    const url = `${ctx.baseUrl}/api/v1/Provider/SendInvoices?skipSignature=${skip}`;
    const payload = buildNovusPayload(input) as any;
    if (opts?.transmissionFailure) {
      // resend marker for the 5XX recovery path
      (payload.invoice[0] as any).transmissionFailure = 1;
    }
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'API-KEY': ctx.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return { status: 'error', isOffline: false, transmissionFailure: true, errorMessage: String(e) };
    }
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      return { status: 'error', isOffline: false, transmissionFailure: res.status >= 500, errorMessage: `Non-JSON response (${res.status})` };
    }
    const entry = body?.response?.[0] ?? body;

    // skipSignature=false + card/IRIS → the doc is HELD (not yet on AADE) and a provider
    // signature is returned. Surface it so the POS terminal can be charged, then completePosInvoice.
    const sigBlocks = body?.providerSignature ?? entry?.providerSignature;
    if (Array.isArray(sigBlocks) && sigBlocks.length) {
      const providerSignature = sigBlocks.flatMap((b: any) =>
        (b.signatures ?? [b]).map((s: any) => ({
          invoiceUid: b.invoiceUid ?? entry?.invoiceUid ?? '',
          token: s.token, data: s.data,
          createdDate: s.createdDate, expiryDate: s.expiryDate, isExpired: s.isExpired,
          paymentBalance: s.paymentBalance, issuerVatNumber: s.issuerVatNumber,
        })),
      );
      return { status: 'awaiting_payment', isOffline: false, uid: entry?.invoiceUid ?? undefined, providerSignature, raw: body };
    }
    return interpret(entry, res.status);
  },

  async fetchTransmitted(query, ctx) {
    const qs = new URLSearchParams();
    if (query.invoiceMark) qs.set('invoiceMark', query.invoiceMark);
    if (query.aa) qs.set('aa', query.aa);
    if (query.issuerVatNumber) qs.set('issuerVatNumber', query.issuerVatNumber);
    const url = `${ctx.baseUrl}/api/v1/Provider/RequestTransmittedDocs?${qs.toString()}`;
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'API-KEY': ctx.apiKey, 'content-type': 'application/json' } });
      const body = await res.json();
      const entry = Array.isArray(body?.response) ? body.response[0] : body;
      return interpret(entry, res.status);
    } catch (e) {
      return { status: 'error', isOffline: false, transmissionFailure: true, errorMessage: String(e) };
    }
  },

  // Law 5155 — after the POS terminal charge, finalize the held card/IRIS invoice → AADE → MARK.
  async completePosInvoice(input, ctx) {
    try {
      const res = await fetch(`${ctx.baseUrl}/api/v1/Provider/CompletionPosInvoices`, {
        method: 'POST',
        headers: { 'API-KEY': ctx.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          signatureToken: input.signatureToken,
          transactionId: input.transactionId,
          paymentAmount: input.paymentAmount,
          ...(input.paymentType != null ? { paymentType: input.paymentType } : {}),
          tipAmount: input.tipAmount ?? 0,
        }),
      });
      const body = await res.json().catch(() => null);
      const entry = body?.response?.[0] ?? body;
      const mark = entry?.invoiceMark && entry.invoiceMark !== 0 ? String(entry.invoiceMark) : undefined;
      const ok = res.ok && (entry?.statusCode === 'Success' || !!mark);
      // If the bank returned a final paymentType use it, else default 7 (card) per the spec.
      const finalPaymentType = entry?.paymentType ?? input.paymentType ?? 7;
      return { ok, mark, finalPaymentType, errorMessage: ok ? undefined : (firstError(entry).message ?? `HTTP ${res.status}`), raw: body };
    } catch (e) {
      return { ok: false, errorMessage: String(e) };
    }
  },

  // Deferred flow — request a signature for an already-issued (on-credit) invoice.
  async askSignatureForOldInvoice(input, ctx) {
    const res = await fetch(`${ctx.baseUrl}/api/v1/Provider/AskSignatureForOldInvoice`, {
      method: 'POST',
      headers: { 'API-KEY': ctx.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ invoiceMark: input.invoiceMark, invoiceUid: input.invoiceUid }),
    });
    const body = await res.json().catch(() => ({}));
    const s = body?.providerSignature?.[0]?.signatures?.[0] ?? body;
    return {
      invoiceUid: input.invoiceUid ?? body?.providerSignature?.[0]?.invoiceUid ?? '',
      token: s?.token, data: s?.data, createdDate: s?.createdDate, expiryDate: s?.expiryDate,
      isExpired: s?.isExpired, paymentBalance: s?.paymentBalance, issuerVatNumber: s?.issuerVatNumber,
    };
  },

  async completeOldInvoicePosPayment(input, ctx) {
    try {
      const res = await fetch(`${ctx.baseUrl}/api/v1/Provider/CompletionAskSignatureForOldInvoice`, {
        method: 'POST',
        headers: { 'API-KEY': ctx.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          signatureToken: input.signatureToken,
          transactionId: input.transactionId,
          paymentAmount: input.paymentAmount,
          ...(input.paymentType != null ? { paymentType: input.paymentType } : {}),
          tipAmount: input.tipAmount ?? 0,
        }),
      });
      const body = await res.json().catch(() => null);
      const entry = body?.response?.[0] ?? body;
      return { ok: res.ok, finalPaymentType: entry?.paymentType ?? input.paymentType ?? 7, raw: body };
    } catch (e) {
      return { ok: false, errorMessage: String(e) };
    }
  },
};

export function novusBaseUrl(isSandbox: boolean): string {
  return isSandbox ? NOVUS_SANDBOX_BASE : NOVUS_PRODUCTION_BASE;
}
