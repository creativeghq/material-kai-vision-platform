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
import { isUncodedMydataUnit, isUnnamedLineName, mydataUnitCode } from './types.ts';
import { mydataPaymentLabel } from '../paymentVocabulary.generated.ts';

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

  // Refuse to transmit a legal document whose line carries no real product name — one of our
  // synthetic fallbacks ('(line item)' / 'Item') or an empty description. Better to block with
  // an actionable error than to file "Item" as the item name on an AADE-registered document.
  const unnamed = lines.filter((l) => isUnnamedLineName(l.description)).map((l) => l.lineNumber);
  if (unnamed.length) {
    throw new Error(
      `Refusing to transmit to myDATA: line(s) ${unnamed.join(', ')} have no product name ` +
        `(placeholder). Set a real description on each line before transmitting.`,
    );
  }

  // Refuse to transmit a packaging or labour unit as the line's measurement unit. AADE codes
  // exactly six (pieces, kg, litres, metres, m², m³); 'box' / 'pallet' / 'hour' have no code, and
  // the platform's own UoM ladder exists to restate them — `convert_to_base_unit(product, qty,
  // unit)` is the one conversion entry point. Sending the label verbatim would file a legal
  // document whose stated unit AADE does not recognise. Blocking is recoverable; a wrong unit on
  // a registered document is not.
  const uncoded = lines
    .filter((l) => isUncodedMydataUnit(l.measurementUnitLabel))
    .map((l) => `${l.lineNumber} (${l.measurementUnitLabel})`);
  if (uncoded.length) {
    throw new Error(
      `Refusing to transmit to myDATA: line(s) ${uncoded.join(', ')} use a unit with no AADE ` +
        `measurement_unit code. Restate the quantity in pieces, kg, litres, metres, m² or m³ ` +
        `before transmitting.`,
    );
  }

  // A MOVEMENT DOCUMENT NEEDS REAL ADDRESSES. myDATA requires a complete loading and delivery
  // address the moment a document carries transport details, and the builders reach them through
  // a fallback chain (per-note fields → sub-unit → issuer/counterpart) whose last step is `''`.
  // So a customer with no address on file produced a 9.3 with a blank delivery point — and the
  // counterpart block below fills a missing postcode with '0' and a missing city with 'NONE',
  // which is worse than blank: it is a plausible-looking placeholder on a registered document.
  // Blocking is recoverable; a movement filed to nowhere is not.
  if (header.movePurpose != null) {
    const incomplete = ([['loading', header.loadingAddress], ['delivery', header.deliveryAddress]] as const)
      .filter(([, a]) => !a || !String(a.street ?? '').trim() || !String(a.city ?? '').trim() || !String(a.postalCode ?? '').trim())
      .map(([which]) => which);
    if (incomplete.length) {
      throw new Error(
        `Refusing to transmit a movement document: the ${incomplete.join(' and ')} address ` +
          `${incomplete.length > 1 ? 'are' : 'is'} incomplete. myDATA needs a street, postal code ` +
          `and city at both ends — fill them in on the document (or on the party it defaults to) ` +
          `before transmitting.`,
      );
    }
  }

  // A MOVEMENT DOCUMENT (9.3) IS A DIFFERENT ENVELOPE, NOT AN INVOICE WITH ZERO TOTALS.
  // AADE refuses it outright unless four things differ from every value-bearing type — verified
  // against the sandbox 2026-09-06 (#319), where our 9.3 came back with all of these at once:
  //   205 "Payment Methods is forbidden for this invoice type"
  //   205 "Currency is forbidden for this invoice type"
  //   230 "itemDescr / measurementUnit … is mandatory for invoice detail 1"
  //   204 "issuer Name / issuer address / Counterpart Name is mandatory for this invoice type"
  // and its classification is `category3` (Transport) with NO classificationType, not the income
  // pair a sale carries. So no delivery note has ever been accepted — which is also why the
  // offline sweep had nothing to find for one.
  const isMovement = header.movePurpose != null;

  // AN INTERNAL TRANSFER MOVES YOUR OWN GOODS BETWEEN YOUR OWN PREMISES, so AADE requires the
  // counterpart to BE the issuer — "Issuer must be same with counterpart", error 286. The
  // platform lets an operator pick Ενδοδιακίνηση (8) on a delivery note addressed to a customer,
  // and the counterpart is resolved from that customer, so the combination is reachable from the
  // UI and comes back as a bare 286 nobody can act on. Name it instead: either the purpose is
  // wrong or the recipient is.
  if (isMovement && header.movePurpose === 8 && counterpart.vatNumber !== issuer.vatNumber) {
    throw new Error(
      `Refusing to transmit a movement document: purpose 8 (Ενδοδιακίνηση / internal transfer) ` +
        `moves goods between the issuer's own establishments, so myDATA requires the recipient to ` +
        `be the issuer — this note is addressed to ${counterpart.vatNumber || 'a party with no VAT number'}. Either pick the ` +
        `purpose that describes the movement (1 Sale, 5 Return, 14 Storage by third parties …) ` +
        `or address the note to your own VAT number and set the delivery branch.`,
    );
  }

  // The numeric unit code is mandatory on a movement line and we must not guess it.
  const unresolvedUnits = isMovement
    ? lines.filter((l) => mydataUnitCode(l.measurementUnitLabel) == null)
        .map((l) => `${l.lineNumber} (${l.measurementUnitLabel ?? 'no unit'})`)
    : [];
  if (unresolvedUnits.length) {
    throw new Error(
      `Refusing to transmit a movement document: line(s) ${unresolvedUnits.join(', ')} have no ` +
        `AADE measurement_unit code. myDATA requires the numeric unit on every movement line — ` +
        `restate the quantity in pieces, kg, litres, metres, m² or m³ before transmitting.`,
    );
  }

  const invoiceDetails = lines.map((l) => ({
    lineNumber: l.lineNumber,
    // Movement-only, both mandatory there and absent from every other type's template.
    ...(isMovement
      ? { itemDescr: l.description, measurementUnit: mydataUnitCode(l.measurementUnitLabel) }
      : {}),
    lineCode: l.code ?? undefined,
    quantity: l.quantity,
    measurementUnitLabel: l.measurementUnitLabel ?? 'ΤΜΧ',
    // 1.5 third-party-sales clearance: 1 = clearance line, 2 = commission-fee line.
    // Emitted whenever it is set rather than silently dropped off-type — a line kind the
    // operator recorded must either reach myDATA or be rejected loudly, never vanish.
    ...(l.invoiceDetailType ? { invoiceDetailType: l.invoiceDetailType } : {}),
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
    // A movement classifies as Transport (`category3`) and carries NO classificationType —
    // an income type on a zero-valued transport line is error 331.
    incomeClassification: isMovement
      ? [{ classificationCategory: 'category3', amount: 0 }]
      : l.incomeClassificationType
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

  // The payment methods actually transmitted — resolved ONCE, because the printed label below
  // has to name the method that is really on the envelope. The fallback is 5 (on credit), so a
  // document with no recorded payment says "On credit" rather than naming a method nobody chose.
  const paymentMethods = input.paymentMethods?.length
    ? input.paymentMethods
    : [{ type: 5, amount: summary.totalGrossValue }];
  const docLang = input.documentLanguageCode ?? 'EN';
  const paymentLabel =
    input.paymentMethodLabel ??
    mydataPaymentLabel(paymentMethods[0].type, docLang.toUpperCase() === 'EL' ? 'el' : 'en');

  // THE SUMMARY CLASSIFICATION IS DERIVED FROM THE LINES, NEVER RESTATED.
  // AADE cross-checks the two: the summary must carry one entry per distinct
  // (classificationType, classificationCategory) present on the lines, each holding the SUM of
  // those lines' net values. Emitting a single entry for the whole net value — which is what
  // this did — is accepted only while every line happens to share one classification, and is
  // rejected outright the moment two differ:
  //   311 Classification with type … not found in invoice summary
  //   312 Sum of classifications … not matching with related total in invoice summary
  //   321 Classifications included in the invoice rows and in the invoice summary do not match
  // That is exactly the case the builder's own per-product classification feature produces
  // (`mydata_income_classification_type` on a product), so the feature could never transmit.
  // Verified against the sandbox 2026-09-06 (issue #319).
  const byClassification = new Map<string, { classificationType: string; classificationCategory: string; amount: number }>();
  for (const l of lines) {
    if (!l.incomeClassificationType) continue;
    const category = l.incomeClassificationCategory ?? 'category1_1';
    const key = `${l.incomeClassificationType}|${category}`;
    const acc = byClassification.get(key);
    if (acc) acc.amount += l.netValue;
    else byClassification.set(key, { classificationType: l.incomeClassificationType, classificationCategory: category, amount: l.netValue });
  }
  const summaryClassification = isMovement
    ? [{ classificationCategory: 'category3', amount: 0 }]
    : byClassification.size
    ? [...byClassification.values()].map((c) => ({ ...c, amount: Math.round(c.amount * 100) / 100 }))
    : summary.incomeClassificationType
      // No line said anything — fall back to the document-level pair. Never both: a summary
      // that repeats a total the lines already account for is the 312 rejection.
      ? [{
          classificationType: summary.incomeClassificationType,
          classificationCategory: summary.incomeClassificationCategory ?? 'category1_1',
          amount: summary.totalNetValue,
        }]
      : undefined;

  return {
    invoice: [
      {
        issuer: {
          vatNumber: issuer.vatNumber,
          country: issuer.country,
          branch: issuer.branch ?? 0,
          // Mandatory on a movement document (204), absent from every other type's template.
          ...(isMovement
            ? {
                name: issuer.name ?? '',
                address: {
                  street: issuer.address?.street ?? '',
                  number: issuer.address?.number ?? '',
                  postalCode: issuer.address?.postalCode ?? '',
                  city: issuer.address?.city ?? '',
                },
              }
            : {}),
        },
        // A retail document (11.x) deliberately has NO counterpart block — that is what makes it
        // retail. A MOVEMENT document always has one, because AADE requires the recipient's name
        // on it (204) and goods are always going TO somebody: a delivery note to a private
        // customer has no VAT number, and gating the whole block on one filed it to nobody.
        counterpart: (counterpart.vatNumber || isMovement)
          ? {
              vatNumber: counterpart.vatNumber,
              country: counterpart.country,
              branch: counterpart.branch ?? 0,
              // Mandatory on a movement document (204).
              ...(isMovement ? { name: counterpart.name ?? '' } : {}),
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
          // 205 "Currency is forbidden for this invoice type" — a movement carries no value,
          // so it carries no currency either.
          ...(isMovement ? {} : { currency: header.currency }),
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
                  // The ISSUER's establishments. Both were hardcoded 0 while
                  // `finance_branches.branch_code` existed, so an Ενδοδιακίνηση between two of
                  // the operator's own premises was filed as headquarters → headquarters.
                  startShippingBranch: header.loadingBranch ?? 0,
                  completeShippingBranch: header.deliveryBranch ?? 0,
                  // Third parties on the movement (drop-ship: goods leaving a supplier's
                  // warehouse for our customer). Omitted entirely when there are none, so the
                  // envelope is byte-identical to before for an ordinary movement — the same
                  // arrangement as the B2G block.
                  ...(header.otherCorrelatedEntities?.length
                    ? { otherCorrelatedEntities: header.otherCorrelatedEntities }
                    : {}),
                },
                movePurpose: header.movePurpose,
                ...(header.movePurposeLabel ? { movePurposeLabel: header.movePurposeLabel } : {}),
                // AADE requires the free-text name when the purpose is 19 (Λοιπές Διακινήσεις).
                ...(header.otherMovePurposeTitle ? { otherMovePurposeTitle: header.otherMovePurposeTitle } : {}),
              }
            : {}),
        },
        // 205 "Payment Methods is forbidden for this invoice type" — nothing is paid on a
        // movement, and the `[{type:5}]` fallback below was inventing one for every 9.3.
        ...(isMovement ? {} : { paymentMethods: paymentMethods.map((pm: any) => ({
          type: pm.type, amount: pm.amount,
          ...(pm.info ? { paymentMethodInfo: pm.info } : {}),
          // Law 5155 — card(7)/IRIS(8) carry the EFT-POS terminal + NSP for the signature.
          ...(pm.terminalId ? { terminalId: pm.terminalId } : {}),
          ...(pm.posNspId != null ? { posNspId: pm.posNspId } : {}),
        })) }),
        invoiceDetails,
        // ── Novus's PDF-RENDERING block — NOT tax data ────────────────────────────────
        // Everything above (issuer/counterpart VAT, header, details, summary) is what AADE
        // registers and what earns the MARK. This block only feeds the letterhead of the PDF
        // *Novus* draws. We do not use that PDF: we render our own and stamp the returned MARK
        // + QR onto it, and `invoiceUrl` (Novus's rendered copy) is deliberately never served.
        // The issuer sub-block is mandatory per the Provider docs, so the envelope stays — but
        // nothing render-only that has a side effect belongs in it.
        providerAdditionalInvoiceDetails: {
          issuer: {
            name: issuer.name ?? '',
            profession: issuer.profession ?? '',
            taxoffice: issuer.taxOffice ?? '',
            ...addr(issuer),
            phone: issuer.phone ?? '',
            // The TENANT's own address — safe to send, and part of the mandatory issuer block.
            email: issuer.email ?? '',
          },
          counterpart: {
            code: counterpart.code ?? '',
            name: counterpart.name ?? '',
            profession: counterpart.profession ?? '',
            taxoffice: counterpart.taxOffice ?? '',
            ...addr(counterpart),
            phone: counterpart.phone ?? '',
            // NO `email`. Deliberate: handing Novus the CUSTOMER's address inside the block
            // whose job is producing and delivering Novus's document is what would let the
            // provider auto-email them. We own the customer-facing channel (our PDF, our
            // template, sent through Flows so admins can pause/edit/retarget it), so the
            // customer must never receive a second invoice from a second sender. Omitting it
            // costs a display field on a PDF nobody is served; sending it risks a duplicate.
          },
          additionalDetails: {
            // Greek legal document-type names — correct for a Greek fiscal document, and
            // overridable per call.
            documentLabel: input.documentLabel ?? 'Τιμολόγιο Πώλησης',
            // Was hardcoded 'EL'. Inert while we serve our own PDF, but a buried Greek
            // language pin is exactly the thing that gets copied into somewhere that DOES
            // render — so it is explicit now, and defaults to English per the platform rule
            // that no language field defaults to 'el'.
            documentLanguageCode: docLang,
            documentSizeCode: 0,
            documentComments: input.documentComments ?? '',
            // MANDATORY. Novus rejects the whole request with HTTP 400 + a problem+json
            // `errors` map when this is absent — "The PaymentMethodInvoiceLabel field is
            // required." It is the PRINTED name of the payment method, so it is derived from
            // the transmitted code through `MYDATA_PAYMENT_CODE`'s own label table rather than
            // being written out here: a second hand-kept map of those eight names is exactly
            // the drift that filed "On credit" as Cash (see `paymentVocabulary.ts`).
            paymentMethodInvoiceLabel: paymentLabel,
          },
        },
        // B2G (public sector) — same envelope, extra block. Omitted entirely for
        // ordinary B2B/B2C so the request shape is unchanged when not B2G.
        ...(input.b2g
          ? {
              providerB2gAdditionalInvoiceDetails: {
                ...(input.b2g.contractReference ? { contractReference: input.b2g.contractReference } : {}),
                ...(input.b2g.buyerReference ? { buyerReference: input.b2g.buyerReference } : {}),
                ...(input.b2g.buyerLegalRegistrationIdentifier ? { buyerLegalRegistrationidentifier: input.b2g.buyerLegalRegistrationIdentifier } : {}),
                ...(input.b2g.partyName ? { partyName: input.b2g.partyName } : {}),
                ...(input.b2g.dueDate ? { dueDate: input.b2g.dueDate } : {}),
                ...(input.b2g.budget?.identifier
                  ? { budget: { type: input.b2g.budget.type ?? 1, identifier: input.b2g.budget.identifier } }
                  : {}),
                ...(input.b2g.buyerIdentifiers?.length ? { buyerIdentifiers: input.b2g.buyerIdentifiers } : {}),
                ...(input.b2g.deliveryDetails && (input.b2g.deliveryDetails.street || input.b2g.deliveryDetails.city)
                  ? { deliveryDetails: input.b2g.deliveryDetails }
                  : {}),
              },
            }
          : {}),
        invoiceSummary: {
          totalNetValue: summary.totalNetValue,
          totalVatAmount: summary.totalVatAmount,
          totalWithheldAmount: summary.totalWithheldAmount ?? 0,
          totalFeesAmount: summary.totalFeesAmount ?? 0,
          totalStampDutyAmount: summary.totalStampDutyAmount ?? 0,
          totalOtherTaxesAmount: summary.totalOtherTaxesAmount ?? 0,
          totalDeductionsAmount: summary.totalDeductionsAmount ?? 0,
          totalGrossValue: summary.totalGrossValue,
          incomeClassification: summaryClassification,
        },
      },
    ],
  };
}

function firstError(entry: any): { code?: string; message?: string } {
  const err = entry?.errors?.[0]?.error?.[0];
  return { code: err?.code, message: err?.message };
}

/**
 * A 4xx from Novus is NOT the `{ errors: [{ error: [...] }] }` shape a processed request uses —
 * it is ASP.NET's RFC-9110 problem+json, `{ title, status, errors: { "<field>": ["<why>"] } }`.
 * `firstError` cannot read that, so every rejected-at-the-door request reported itself as the
 * uselessly opaque `HttpError / HttpError`. That is what a missing mandatory field looked like
 * to an operator: no field name, no reason, nothing to act on.
 */
function problemDetail(body: any): string | undefined {
  const errs = body?.errors;
  // A third shape, and the one that matters most for multi-tenancy: an authorization refusal
  // answers `{ "errors": [ "You don't have the authority to send for this vat numbers …" ] }` —
  // a bare array of STRINGS, neither the per-document list nor problem+json. That is what a
  // tenant transmitting under an unauthorized issuer VAT gets, and it reported as 'HttpError'.
  if (Array.isArray(errs) && errs.length && typeof errs[0] === 'string') {
    return errs.join('; ');
  }
  if (errs && !Array.isArray(errs) && typeof errs === 'object') {
    const parts = Object.entries(errs).map(([field, msgs]) =>
      `${field}: ${Array.isArray(msgs) ? msgs.join(' ') : String(msgs)}`,
    );
    if (parts.length) return `${body?.title ?? 'Request rejected'} — ${parts.join('; ')}`;
  }
  return typeof body?.title === 'string' ? body.title : undefined;
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
      // ERROR 228 IS NOT A REFUSAL — IT IS THE PROVIDER TELLING US THE DOCUMENT IS ALREADY FILED,
      // AND NAMING ITS MARK.
      //
      // The provider dedupes on a UID derived from issuer + series + AA (verified 2026-09-06,
      // #319: resending with a DIFFERENT total produced the same UID and the same 228). So the
      // dangerous case is not the double-send — it is the send whose RESPONSE WAS LOST. The first
      // call reached AADE, no `fiscal_submissions` row was written because the response never
      // came back, the operator retries, and 228 came back as a plain rejection: credits
      // refunded, `fiscal_status='rejected'`, while the document sits registered at AADE with a
      // MARK nobody recorded. That is the "create-then-stamp pair" failure in CLAUDE.md wearing
      // the provider's clothes.
      //
      // The MARK is surfaced separately rather than returned as `accepted`, because the same 228
      // is ALSO what a numbering collision looks like — two different documents sharing a
      // series+AA. Adopting the MARK blindly would stamp one invoice with another's.
      //
      // NOTHING CONSUMES THIS YET. Adopting it safely means fetching the filed document and
      // confirming it is really ours (series + AA + totals) before writing the MARK down, and
      // that branch is not built — so today a 228 still lands in the plain `rejected` path and
      // the operator has to reconcile by hand. Tracked on #319.
      // The MARK alone is the recovery handle; the authentication code is a bonus, so it is
      // matched optionally rather than being required for the branch to fire at all.
      const dupMessage = String(firstError(entry).message ?? '');
      const dup = /MARK:\s*(\d+)/i.exec(dupMessage);
      const dupAuth = /AUTHENTICATION_CODE:\s*([0-9A-F]+)/i.exec(dupMessage);
      if (String(firstError(entry).code) === '228' && dup) {
        return {
          status: 'rejected',
          isOffline: false,
          errorCode: '228',
          errorMessage: firstError(entry).message,
          duplicateOf: { mark: dup[1], authenticationCode: dupAuth?.[1] },
          raw: entry,
        };
      }
      // XMLSyntaxError | ValidationError | TechnicalError | HttpError.
      // A processed request carries the per-document error list; a request refused at the door
      // (4xx) carries problem+json instead, and reporting that as bare 'HttpError' told the
      // operator nothing about which field the provider actually objected to.
      const { code: ec, message } = firstError(entry);
      const detail = message ?? problemDetail(entry);
      return { status: 'rejected', isOffline: false, errorCode: ec ?? code, errorMessage: detail ?? code, raw: entry };
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

  // RequestTransmittedDocs — the ONLY way an offline-queued document ever gets its final MARK.
  //
  // Two things about this endpoint are not like SendInvoices, and getting either wrong makes the
  // whole offline-recovery path silently dead (verified against the sandbox 2026-09-06, #319):
  //
  //  1. `issuedFrom` + `issuedTo` are MANDATORY. Without them the provider answers HTTP 400
  //     problem+json, never a document — so every poll failed, for every document, always.
  //  2. It answers `{ providerTransmittedDocs: [ … ] }` — NOT the `{ response: [ … ] }` envelope
  //     SendInvoices uses, and each entry is `{ uid, mark, authenticationCode, … }` with NO
  //     `statusCode`. Feeding that to `interpret()` fell through to the default branch and
  //     reported `rejected`, so a perfectly healthy queued document read as refused by AADE.
  //
  // Both failures produce a *plausible* verdict, which is why nothing raised: the cron ran, the
  // call "succeeded", and `finance.paid_draft_never_issued`-style probes saw a rejection rather
  // than a stall. Since #193 that verdict also flips `fiscal_status` to 'rejected' after the 6h
  // grace — i.e. it would have condemned documents AADE had accepted.
  //
  // NOT FINDING THE DOCUMENT IS NOT A REJECTION. An empty list means "not transmitted yet",
  // which is `offline`, so the caller keeps waiting instead of burning a live document.
  async fetchTransmitted(query, ctx) {
    const qs = new URLSearchParams();
    if (query.invoiceMark) qs.set('invoiceMark', query.invoiceMark);
    if (query.aa) qs.set('aa', query.aa);
    if (query.uid) qs.set('uid', query.uid);
    if (query.issuerVatNumber) qs.set('issuerVatNumber', query.issuerVatNumber);
    // Required by the provider. Default to a window wide enough to cover any document still in
    // the offline queue (the provider must transmit within 1 day of issue; 30 days is the
    // sandbox retention) rather than leaving them unset, which is a hard 400.
    //
    // The window is deliberately generous at BOTH ends rather than precise. There is no
    // workspace business timezone (CLAUDE.md §1b), so a date computed here is a UTC date while
    // the document's `issueDate` is the operator's calendar day: a "today" upper bound drops a
    // document issued in the Athens evening, and the cron then reports it as still offline. A
    // day of slack past today costs nothing — the results are filtered by identifier below — and
    // removes the whole class of off-by-one-day misses.
    const dayMs = 86_400_000;
    const now = Date.now();
    const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
    qs.set('issuedFrom', query.issuedFrom ?? isoDay(now - 60 * dayMs));
    qs.set('issuedTo', query.issuedTo ?? isoDay(now + dayMs));
    const url = `${ctx.baseUrl}/api/v1/Provider/RequestTransmittedDocs?${qs.toString()}`;
    try {
      const res = await fetch(url, { method: 'GET', headers: { 'API-KEY': ctx.apiKey, 'content-type': 'application/json' } });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // A malformed query is OUR bug, not a verdict on the document — report it as an error
        // so the caller retries rather than as a rejection it would act on.
        return { status: 'error', isOffline: false, transmissionFailure: res.status >= 500, errorMessage: problemDetail(body) ?? `Novus ${res.status}`, raw: body };
      }
      const docs = Array.isArray(body?.providerTransmittedDocs) ? body.providerTransmittedDocs : [];

      // THE ANSWER MUST BE ABOUT THE DOCUMENT WE ASKED ABOUT.
      // `issuerVatNumber` + a date window is a legitimate query on its own, and it returns
      // EVERYTHING that workspace transmitted in the window. Taking the first row with a MARK
      // would hand the recovery cron an unrelated invoice's legal number to stamp onto this one
      // — the same hazard the 228 branch above refuses to take, and worse because it is silent.
      // So a row only counts when it matches an identifier we actually sent.
      const wanted = (d: any) => (
        (query.uid && String(d?.uid ?? '') === query.uid) ||
        (query.invoiceMark && String(d?.mark ?? '') === query.invoiceMark) ||
        (query.aa && String(d?.invoiceHeader?.aa ?? '') === query.aa)
      );
      const discriminated = Boolean(query.uid || query.invoiceMark || query.aa);
      if (!discriminated) {
        // Nothing to match on. Reporting `offline` keeps the document queued; reporting a MARK
        // would be a guess, and a guessed legal number is not recoverable.
        return { status: 'offline', isOffline: true, uid: query.uid, raw: body };
      }
      const matches = docs.filter(wanted);
      const doc = matches.find((d: any) => d?.mark && String(d.mark) !== '0') ?? matches[0];
      const mark = doc?.mark && String(doc.mark) !== '0' ? String(doc.mark) : undefined;
      if (!mark) {
        return { status: 'offline', isOffline: true, uid: doc?.uid ?? query.uid, raw: body };
      }
      return {
        status: 'accepted',
        isOffline: false,
        mark,
        uid: doc?.uid ?? undefined,
        authenticationCode: doc?.authenticationCode ?? undefined,
        invoiceUrl: doc?.pdfUrl ?? undefined,
        providerCredits: typeof doc?.cost === 'number' ? doc.cost : parseCredits(doc?.cost),
        raw: body,
      };
    } catch (e) {
      return { status: 'error', isOffline: false, transmissionFailure: true, errorMessage: String(e) };
    }
  },

  // POST /CancelDeliveryNote — REST v2.3. Verified against the sandbox 2026-09-06 (#319):
  // returns `statusCode:"Success"` with a `cancellationMark` and costs 0.25 credits.
  //
  // THE PROVIDER'S OWN DUPLICATE GUARD IS RACY — DO NOT RELY ON IT. Sending the same MARK twice
  // usually answers 251 "Invoice with MARK … has already been cancelled", but a fast retry got
  // Success BOTH times: a second cancellationMark was minted and 0.25 credits billed again.
  // Both outcomes observed against the sandbox on 2026-09-06 (#319) with the same code, which is
  // the worst kind of guard — it works while you are testing it. So the "one thing, and a retry
  // must not do it twice" rule is enforced at OUR end: claim the note (`where
  // fiscal_cancellation_mark is null`) before calling, and never re-send once a mark is stored.
  // See `finance-issue-invoice`.
  async cancelDeliveryNote(input, ctx) {
    try {
      const res = await fetch(`${ctx.baseUrl}/api/v1/Provider/CancelDeliveryNote`, {
        method: 'POST',
        headers: { 'API-KEY': ctx.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ mark: String(input.invoiceMark), entityVatNumber: input.issuerVatNumber }),
      });
      const body = await res.json().catch(() => null);
      const entry = body?.response?.[0] ?? body;
      const cancellationMark = entry?.cancellationMark && entry.cancellationMark !== 0
        ? String(entry.cancellationMark)
        : undefined;
      const ok = res.ok && entry?.statusCode === 'Success' && !!cancellationMark;
      if (ok) {
        return { ok, cancellationMark, providerCredits: parseCredits(entry?.credits), raw: body };
      }
      const { code, message } = firstError(entry);
      return {
        ok: false,
        errorCode: code ?? entry?.statusCode ?? String(res.status),
        errorMessage: message ?? problemDetail(body) ?? entry?.statusCode ?? `HTTP ${res.status}`,
        raw: body,
      };
    } catch (e) {
      return { ok: false, errorMessage: String(e) };
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
