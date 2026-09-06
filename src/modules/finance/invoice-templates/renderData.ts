// Single source of truth for WHICH invoice fields appear and how totals/VAT are computed.
// The pdf-lib generator mirrors this exact logic so HTML preview and PDF stay in lockstep.
import {
  INVOICE_LABELS, invoiceDocTitle, mydataPaymentLabel,
  VAT_PCT_BY_CAT, UNIT_LABEL_BY_CODE, type Lang,
} from './labels';
import type {
  InvoiceRenderData, InvoiceLineRow, VatAnalysisRow, TotalsExtraRow, VatExemptionNote,
} from './types';
import { resolvePrintedCounterparty, applyAddressUnit, partyAddressLines } from './counterparty';
import { normalizeVat } from '@/services/crm/vatNormalize';
import { round2 as r2 } from '@/utils/decimal';
import { vatOf } from '@/modules/finance/lib/vatMath';
import { mydataExemptionLabel } from '@/lib/mydataExemptionCategories';
import { movePurposeLabel, MYDATA_MOVE_PURPOSE_OTHER } from '@/services/fiscal/fiscalVocabulary';

export interface BuildRenderInput {
  invoice: Record<string, any>;
  items: Record<string, any>[];
  /** finance_settings row (issuer identity + bank accounts). */
  settings: Record<string, any> | null;
  /** crm_companies | crm_contacts row, or null. Used ONLY when the document carries no
   *  `counterparty_snapshot` — an issued document prints the identity frozen at issue. */
  customer: Record<string, any> | null;
  /** crm_address_units row when invoice.customer_address_unit_id is set — the sub-unit the
   *  goods go to, which is also the branch number transmitted to myDATA. */
  addressUnit?: Record<string, any> | null;
  /** fiscal_submissions.authentication_code for this document, when it has been transmitted. */
  authCode?: string | null;
  /** "Novus Conceptus | https://timologisi.online" — the provider that CARRIED this document,
   *  from `fiscal_connectors.legal_display_name`/`legal_website`. Mandatory on the printed
   *  document under the provider's own rules, and therefore mandatory on the preview too: this
   *  module exists so the two cannot say different things. */
  providerAttribution?: string | null;
  /** Completed Law-5155 provider signatures for this document. The Unique Payment Identity and
   *  the signature that unlocked the charge must appear on the paper, for each amount separately. */
  posPayments?: Array<{
    transaction_id: string | null;
    signature_token: string | null;
    payment_amount: number | null;
    final_payment_type: number | null;
    payment_type: number | null;
    terminal_id: string | null;
  }>;
  /** finance_branches row when invoice.branch_code > 0. */
  branch?: Record<string, any> | null;
  /** Linked order (orders row) when invoice.order_id is set — for the order number + note. */
  order?: Record<string, any> | null;
  /** Public/signed URL for the business logo, if available. */
  logoUrl?: string | null;
  /** Treasury accounts flagged "Show on invoice" — the single source of printed bank
   *  details (finance_bank_accounts). When omitted, no bank lines are shown. */
  bankAccounts?: Array<{ name: string; kind: string; iban: string | null; account_ref: string | null }>;
  /** Carry-forward balance BEFORE this document (from get_customer_prior_balance). */
  priorBalance?: number | null;
  /** Hosted /pay/{token} URL (reused from invoice.pay_token; not minted in preview). */
  payUrl?: string | null;
}

export function formatInvoiceMoney(value: any, currency: string, lang: Lang): string {
  const v = Number(value ?? 0);
  const s = new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(v);
  const sym = currency === 'EUR' ? '€' : currency;
  return `${s} ${sym}`;
}

export function buildInvoiceRenderData(input: BuildRenderInput): InvoiceRenderData {
  const {
    invoice: inv, items, settings: fs, customer, addressUnit, authCode, branch, order,
    logoUrl, bankAccounts, priorBalance, payUrl, providerAttribution, posPayments,
  } = input;
  // English is the default; Greek only when explicitly chosen (until translations launch).
  const lang: Lang = inv.doc_language === 'el' ? 'el' : 'en';
  const L = INVOICE_LABELS[lang];
  const currency = inv.currency ?? 'EUR';

  // ── Issuer ── bilingual: prefer *_en identity fields on an English document.
  const en = lang === 'en';
  const bizName = (en ? (fs?.business_name_en || fs?.business_name) : fs?.business_name) || '';
  const bizAddress = en ? (fs?.business_address_en || fs?.business_address) : fs?.business_address;
  const bizCity = en ? (fs?.business_city_en || fs?.business_city) : fs?.business_city;
  const bizTaxOffice = en ? (fs?.business_tax_office_en || fs?.business_tax_office) : fs?.business_tax_office;
  const bizProfession = en ? (fs?.business_profession_en || fs?.business_profession) : fs?.business_profession;
  const issuerLines = [
    [bizAddress, fs?.business_street_number].filter(Boolean).join(' '),
    [fs?.business_postal_code, bizCity].filter(Boolean).join(' '),
    fs?.business_vat ? `${L.vatNo}: ${fs.business_vat}` : '',
    bizTaxOffice ? `${L.taxOffice}: ${bizTaxOffice}` : '',
    // ONE activity line. `business_profession` is the ΑΑΔΕ "Δραστηριότητα" and wins; the coarse
    // `main_activity` picklist stands in only for a workspace that never filled the free-text
    // field. Printing both gave the document two lines labelled "Activity", which reads as an
    // error rather than as extra detail.
    bizProfession || fs?.main_activity ? `${L.profession}: ${bizProfession || fs?.main_activity}` : '',
    [fs?.business_phone ? `${L.phone} ${fs.business_phone}` : '', fs?.business_email || ''].filter(Boolean).join('  ·  '),
    fs?.business_website ? `${L.website}: ${fs.business_website}` : '',
    fs?.business_gemi ? `${L.registry}: ${fs.business_gemi}` : '',
    branch ? `${L.establishment} #${branch.branch_code}: ${[branch.name, branch.address, branch.street_number, branch.postal_code, branch.city].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean) as string[];

  // ── Customer ──
  // The BILLING party, resolved exactly as the myDATA envelope resolves it: the identity frozen
  // onto the document at issue wins over the live CRM row, and a separate billing identity wins
  // over the party's own. Printing the live row is how the paper and the transmission drift.
  const billToRaw = resolvePrintedCounterparty(inv.counterparty_snapshot?.row ?? null, customer);
  // The VAT number is normalized to the spelling the ENVELOPE carries. `partyFromCrm` strips the
  // Greek EL/GR prefix before transmitting (the provider 401s on the prefixed form), and this
  // file's contract is that the printed document says what the transmitted one says
  // (CLAUDE.md §1c). It is applied here rather than inside `resolvePrintedCounterparty` because
  // that module is a byte-mirrored source and has to stay import-free.
  const billTo = billToRaw ? { ...billToRaw, vatNumber: normalizeVat(billToRaw.vatNumber) } : null;
  const custName = billTo?.name || '—';
  const custLines = billTo ? partyAddressLines(billTo, L) : [];

  // ── Delivery party ── the goods go to the chosen sub-unit; shown only when it actually
  // differs from the billing address, so an ordinary invoice does not grow an empty panel.
  const deliveryParty = billTo && addressUnit ? applyAddressUnit(billTo, addressUnit) : null;
  const delivery = deliveryParty
    ? { name: addressUnit?.name || undefined, lines: partyAddressLines(deliveryParty, L, { compact: true }) }
    : null;

  // Payment method is resolved before the meta block because a Greek παραστατικό carries it
  // in the header band, not only down beside the bank details.
  const paymentMethodLabel = inv.payment_method_code
    ? mydataPaymentLabel(inv.payment_method_code, lang)
    : undefined;

  // ── Meta (right column) ──
  const locale = lang === 'el' ? 'el-GR' : 'en-GB';
  const meta: { label: string; value: string }[] = [];
  // The myDATA document-type code (1.1, 2.1, 11.2 …) is what an auditor matches against the
  // transmitted envelope; the title alone does not identify it.
  if (inv.document_type) meta.push({ label: L.docType, value: String(inv.document_type) });
  meta.push({ label: L.number, value: String(inv.internal_number ?? inv.legal_number ?? '') });
  if (inv.series) meta.push({ label: L.series, value: String(inv.series) });
  if (inv.issued_at) {
    const d = new Date(inv.issued_at);
    meta.push({ label: L.date, value: d.toLocaleDateString(locale) });
    // Issue TIME is part of the record for a document numbered sequentially by date — two
    // invoices on the same day are ordered by it. It was already stored and never printed.
    meta.push({ label: L.time, value: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) });
  }
  if (order?.order_number) meta.push({ label: L.order, value: String(order.order_number) });
  if (inv.due_at) meta.push({ label: L.due, value: String(inv.due_at) });
  if (paymentMethodLabel) meta.push({ label: L.paymentMethod, value: paymentMethodLabel });
  if (inv.related_document) meta.push({ label: L.correlated, value: String(inv.related_document) });

  // ── Line items + VAT analysis ──
  const vatByRate: Record<string, { net: number; vat: number }> = {};
  const exemptionCodes: number[] = [];
  let totNet = 0;
  let totOtherTaxes = 0;
  const rows: InvoiceLineRow[] = (items ?? []).map((it) => {
    const qty = Number(it.quantity ?? 1);
    const net = Number(it.net_value ?? it.line_total ?? Number(it.unit_price ?? 0) * qty);
    const pct = it.vat_category != null && VAT_PCT_BY_CAT[Number(it.vat_category)] !== undefined
      ? VAT_PCT_BY_CAT[Number(it.vat_category)]
      : Number(it.vat_percent ?? inv.vat_rate ?? 0);
    const vat = it.vat_amount != null ? Number(it.vat_amount) : vatOf(net, pct);
    totNet += net;
    const key = String(pct);
    vatByRate[key] = vatByRate[key] || { net: 0, vat: 0 };
    vatByRate[key].net += net; vatByRate[key].vat += vat;
    const detail = [
      [it.selected_color, it.selected_size].filter(Boolean).join(' / '),
      it.line_comments,
    ].filter(Boolean).join(' — ');
    const unit = it.unit ?? (it.measurement_unit_code != null ? UNIT_LABEL_BY_CODE[Number(it.measurement_unit_code)] : '') ?? '';
    // `discounted_price` holds a discount AMOUNT on an invoice line (`net = qty × price − disc`),
    // NOT a discounted unit price the way the identically-named quote column does. Without this
    // column on the document a discounted line reads as "2 × 100.00 → Net 150.00", which is a
    // valid number that nothing can flag — the customer just sees arithmetic that does not work.
    const discount = Number(it.discounted_price ?? 0) || 0;
    const otherTaxes = Number(it.other_taxes_amount ?? 0) || 0;
    totOtherTaxes += otherTaxes;
    // The exemption ground is a legal requirement on any 0%/exempt line, and we already store
    // and transmit it. Collected here so identical grounds share one footnote marker.
    const exemptionCode = pct === 0 && it.vat_exemption_category != null
      ? (Number(it.vat_exemption_category) || null)
      : null;
    if (exemptionCode && !exemptionCodes.includes(exemptionCode)) exemptionCodes.push(exemptionCode);
    return {
      description: it.description ?? 'Item',
      detail: detail || undefined,
      sku: it.sku || undefined,
      qty, unit: unit || '',
      unitPrice: Number(it.unit_price ?? 0),
      discount,
      net, vatPct: pct, vatAmount: vat, otherTaxes, exemptionCode,
      lineTotal: r2(net + vat + otherTaxes),
    };
  });

  // Footnote markers: (1), (2)… in first-cited order, so a line points at its own ground.
  const vatExemptions: VatExemptionNote[] = exemptionCodes.map((code, i) => ({
    marker: `(${i + 1})`,
    code,
    label: mydataExemptionLabel(code, lang) ?? String(code),
  }));
  // paid-upfront (cash) discount is order-level; line items + per-rate VAT are PRE-discount
  // (the discount is not distributed to lines), so multiply by the cash factor to get the
  // post-discount taxable figures. "Price" = pre-discount net; "Price after Discount" = taxable.
  const cashPct = Number(inv.cash_discount_pct ?? 0);
  const cashFactor = cashPct > 0 && cashPct < 100 ? 1 - cashPct / 100 : 1;
  // The per-rate ΑΝΑΛΥΣΗ ΦΠΑ table is computed FIRST, and the printed totals are then the sum of
  // its printed rows.
  //
  // It used to be the other way round: each row rounded `agg.vat * cashFactor` and the total
  // separately rounded a `totVat` running sum (deleted with this comment's fix — the VAT total is
  // now ONLY ever `vatAfter` below). Rounding N values and rounding their sum are not the
  // same operation, so the legally-required VAT-analysis block could add up to 3.70 beside a VAT
  // total printed as 3.71 — on the same document, in Greek, where the table exists precisely so a
  // reader can verify the total. Deriving the total from the rows makes that impossible rather than
  // unlikely. (audit #271 item 6)
  //
  // The pre-discount convention above is deliberate and UNCHANGED: lines and per-rate rows are
  // pre-discount figures scaled by cashFactor at render, so Σ rows ≠ invoices.subtotal_net when
  // cash_discount_pct > 0 — by design, not by drift.
  const vatAnalysis: VatAnalysisRow[] = Object.entries(vatByRate)
    .map(([pct, agg]) => {
      const net = r2(agg.net * cashFactor);
      const vat = r2(agg.vat * cashFactor);
      // `total` is derived from the two PRINTED figures, never re-derived from the raw
      // aggregates, for the same reason the VAT total is the sum of the printed rows: the
      // table exists so a reader can add it up, and it must add up.
      return { pct: Number(pct), net, vat, total: r2(net + vat) };
    })
    .sort((a, b) => b.pct - a.pct);

  const priceNet = r2(totNet);
  const netAfter = r2(vatAnalysis.reduce((s, v) => s + v.net, 0));
  const cashDisc = r2(priceNet - netAfter);
  const vatAfter = r2(vatAnalysis.reduce((s, v) => s + v.vat, 0));

  // ── Totals ──
  const fees = Number(inv.total_fees_amount ?? 0);
  const stamp = Number(inv.total_stamp_duty_amount ?? 0);
  // Header total when the document carries one, else the sum of the per-line amounts — a line
  // can carry `other_taxes_amount` on a document whose header total was never stamped.
  const otherTax = Number(inv.total_other_taxes_amount ?? 0) || r2(totOtherTaxes);
  const digitalFee = Number(inv.digital_transaction_fee ?? 0);
  const deductions = Number(inv.total_deductions_amount ?? 0);
  const withheld = Number(inv.total_withheld_amount ?? 0);
  const grand = Number(inv.total ?? (netAfter + vatAfter + fees + stamp + otherTax + digitalFee - withheld - deductions));
  const extras: TotalsExtraRow[] = [];
  if (fees > 0) extras.push({ label: L.fees, value: fees });
  if (stamp > 0) extras.push({ label: L.stamp, value: stamp });
  if (otherTax > 0) extras.push({ label: L.otherTaxes, value: otherTax });
  if (digitalFee > 0) extras.push({ label: L.digitalFee, value: digitalFee });
  if (deductions > 0) extras.push({ label: L.deductions, value: deductions, negative: true });
  if (withheld > 0) extras.push({ label: L.withheld, value: withheld, negative: true });

  // ── Payment + bank accounts (treasury accounts flagged "Show on invoice" only) ──
  const accounts: string[] = [];
  for (const a of bankAccounts ?? []) {
    const detail = a.kind === 'bank'
      ? [a.name, a.iban ? `IBAN ${a.iban}` : ''].filter(Boolean).join('  ·  ')
      : [a.name, a.account_ref ?? a.iban ?? ''].filter(Boolean).join('  ·  ');
    if (detail) accounts.push(detail);
  }

  // ── Shipping / movement ──
  let shipping: { rows: string[] } | null = null;
  if (inv.has_shipping) {
    const sr = [
      inv.ship_from ? `${L.loadingPlace}: ${inv.ship_from}` : '',
      inv.ship_to ? `${L.deliveryPlace}: ${inv.ship_to}` : '',
      inv.vehicle_number ? `${L.vehicle}: ${inv.vehicle_number}` : '',
      // The NAME, not the bare code. "Purpose: 7" tells the reader of a movement document
      // nothing; the driver and the inspector holding it need the words.
      // The name, plus the free text behind code 19 — twin of movePurposeLine() in the PDF edge
      // function. Purpose 19 is transmitted WITH `otherMovePurposeTitle`; printing only the
      // generic label made the paper say less than the envelope.
      inv.move_purpose
        ? `${L.purpose}: ${movePurposeLabel(inv.move_purpose, lang)}${
          Number(inv.move_purpose) === MYDATA_MOVE_PURPOSE_OTHER && String(inv.other_move_purpose_title ?? '').trim()
            ? ` — ${String(inv.other_move_purpose_title).trim()}`
            : ''
        }`
        : '',
    ].filter(Boolean) as string[];
    if (sr.length) shipping = { rows: sr };
  }

  return {
    lang, currency,
    title: invoiceDocTitle(inv.document_type, L, inv.status),
    isPreInvoice: invoiceDocTitle(inv.document_type, L, inv.status) === L.preInvoice,
    labels: L,
    issuer: { name: bizName, lines: issuerLines, logoUrl: inv.logo_mode === 'none' ? null : (logoUrl ?? null) },
    customer: { name: custName, lines: custLines },
    meta,
    items: rows,
    vatAnalysis,
    vatExemptions,
    totals: {
      subtotalNet: priceNet, discount: cashDisc, priceAfterDiscount: netAfter,
      totalVat: vatAfter, extras, grand,
      amountPaid: Number(inv.amount_paid ?? 0), amountDue: Number(inv.amount_due ?? grand),
    },
    payment: {
      method: paymentMethodLabel,
      info: inv.payment_method_info || undefined,
      accounts,
    },
    shipping,
    delivery,
    // Only meaningful on a foreign-currency document: the reader needs the rate the figures
    // were converted at. Stored on every invoice and never printed until now.
    fx: (() => {
      const rate = Number(inv.exchange_rate ?? inv.fx_rate_to_base ?? 0);
      const base = fs?.base_currency ?? 'EUR';
      return currency !== base && rate > 0 ? { rate, base } : null;
    })(),
    // Effective notes: invoice notes, else the workspace default footer.
    notes: inv.print_terms !== false ? (inv.notes || fs?.default_invoice_notes || null) : null,
    orderNotes: order?.notes || null,
    infoBox: inv.info_box || null,
    vatSuspended: !!inv.vat_payment_suspension,
    priorBalance: (typeof priorBalance === 'number' && Math.abs(priorBalance) >= 0.01) ? priorBalance : null,
    payUrl: payUrl ?? null,
    fiscal: inv.fiscal_mark ? {
      mark: String(inv.fiscal_mark),
      uid: inv.fiscal_uid || undefined,
      // The AADE authentication code is issued alongside the MARK and is what a reader uses
      // to verify the document off-line. Stored on `fiscal_submissions` since day one.
      authCode: authCode ?? null,
      qrUrl: inv.print_online_code !== false ? (inv.fiscal_qr_url || null) : null,
      transmittedVia: providerAttribution ?? null,
    } : null,
    /** Card / IRIS payments completed against a provider signature. Empty for everything else. */
    posPayments: (posPayments ?? []).map((pmt) => ({
      transactionId: pmt.transaction_id ?? null,
      signature: pmt.signature_token ?? null,
      amount: pmt.payment_amount ?? null,
      methodCode: pmt.final_payment_type ?? pmt.payment_type ?? null,
      terminalId: pmt.terminal_id ?? null,
    })),
  };
}
