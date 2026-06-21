// Single source of truth for WHICH invoice fields appear and how totals/VAT are computed.
// The pdf-lib generator mirrors this exact logic so HTML preview and PDF stay in lockstep.
import {
  INVOICE_LABELS, invoiceDocTitle, PAYMENT_METHOD_LABELS,
  VAT_PCT_BY_CAT, UNIT_LABEL_BY_CODE, type Lang,
} from './labels';
import type { InvoiceRenderData, InvoiceLineRow, VatAnalysisRow, TotalsExtraRow } from './types';

export interface BuildRenderInput {
  invoice: Record<string, any>;
  items: Record<string, any>[];
  /** finance_settings row (issuer identity + bank accounts). */
  settings: Record<string, any> | null;
  /** crm_companies | crm_contacts row, or null. */
  customer: Record<string, any> | null;
  /** finance_branches row when invoice.branch_code > 0. */
  branch?: Record<string, any> | null;
  /** Public/signed URL for the business logo, if available. */
  logoUrl?: string | null;
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
  const { invoice: inv, items, settings: fs, customer, branch, logoUrl } = input;
  // English is the default; Greek only when explicitly chosen (until translations launch).
  const lang: Lang = inv.doc_language === 'el' ? 'el' : 'en';
  const L = INVOICE_LABELS[lang];
  const currency = inv.currency ?? 'EUR';

  // ── Issuer ──
  const issuerLines = [
    [fs?.business_address, fs?.business_street_number].filter(Boolean).join(' '),
    [fs?.business_postal_code, fs?.business_city].filter(Boolean).join(' '),
    fs?.business_vat ? `${L.vatNo}: ${fs.business_vat}` : '',
    fs?.business_tax_office ? `${L.taxOffice}: ${fs.business_tax_office}` : '',
    fs?.business_profession ? `${L.profession}: ${fs.business_profession}` : '',
    [fs?.business_phone ? `${L.phone} ${fs.business_phone}` : '', fs?.business_email || ''].filter(Boolean).join('  ·  '),
    fs?.business_website ? `${L.website}: ${fs.business_website}` : '',
    fs?.business_gemh ? `${L.registry}: ${fs.business_gemh}` : '',
    branch ? `${L.establishment} #${branch.branch_code}: ${[branch.name, branch.address, branch.street_number, branch.postal_code, branch.city].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean) as string[];

  // ── Customer ──
  const custName = customer
    ? (customer.name || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '—')
    : '—';
  const custLines = customer ? ([
    [customer.street ?? customer.address, customer.street_number].filter(Boolean).join(' '),
    [customer.postal_code, customer.city].filter(Boolean).join(' '),
    customer.vat_number ? `${L.vatNo}: ${customer.vat_number}` : '',
    customer.tax_office ? `${L.taxOffice}: ${customer.tax_office}` : '',
    [customer.phone ? `${L.phone} ${customer.phone}` : '', customer.email || ''].filter(Boolean).join('  ·  '),
  ].filter(Boolean) as string[]) : [];

  // ── Meta (right column) ──
  const meta: { label: string; value: string }[] = [];
  meta.push({ label: L.number, value: String(inv.internal_number ?? inv.legal_number ?? '') });
  if (inv.series) meta.push({ label: L.series, value: String(inv.series) });
  if (inv.issued_at) meta.push({ label: L.date, value: new Date(inv.issued_at).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB') });
  if (inv.due_at) meta.push({ label: L.due, value: String(inv.due_at) });
  if (inv.related_document) meta.push({ label: L.related, value: String(inv.related_document) });

  // ── Line items + VAT analysis ──
  const vatByRate: Record<string, { net: number; vat: number }> = {};
  let totNet = 0, totVat = 0;
  const rows: InvoiceLineRow[] = (items ?? []).map((it) => {
    const qty = Number(it.quantity ?? 1);
    const net = Number(it.net_value ?? it.line_total ?? Number(it.unit_price ?? 0) * qty);
    const pct = it.vat_category != null && VAT_PCT_BY_CAT[Number(it.vat_category)] !== undefined
      ? VAT_PCT_BY_CAT[Number(it.vat_category)]
      : Number(it.vat_percent ?? inv.vat_rate ?? 0);
    const vat = Number(it.vat_amount ?? (net * pct) / 100);
    totNet += net; totVat += vat;
    const key = String(pct);
    vatByRate[key] = vatByRate[key] || { net: 0, vat: 0 };
    vatByRate[key].net += net; vatByRate[key].vat += vat;
    const detail = [
      [it.selected_color, it.selected_size].filter(Boolean).join(' / '),
      it.line_comments,
    ].filter(Boolean).join(' — ');
    const unit = it.unit ?? (it.measurement_unit_code != null ? UNIT_LABEL_BY_CODE[Number(it.measurement_unit_code)] : '') ?? '';
    return {
      description: it.description ?? 'Item',
      detail: detail || undefined,
      sku: it.sku || undefined,
      qty, unit: unit || '',
      unitPrice: Number(it.unit_price ?? 0),
      net, vatPct: pct, vatAmount: vat, lineTotal: net + vat,
    };
  });
  const vatAnalysis: VatAnalysisRow[] = Object.entries(vatByRate)
    .map(([pct, agg]) => ({ pct: Number(pct), net: agg.net, vat: agg.vat }))
    .sort((a, b) => b.pct - a.pct);

  // ── Totals ──
  const fees = Number(inv.total_fees_amount ?? 0);
  const stamp = Number(inv.total_stamp_duty_amount ?? 0);
  const otherTax = Number(inv.total_other_taxes_amount ?? 0);
  const digitalFee = Number(inv.digital_transaction_fee ?? 0);
  const deductions = Number(inv.total_deductions_amount ?? 0);
  const withheld = Number(inv.total_withheld_amount ?? 0);
  const grand = Number(inv.total ?? (totNet + totVat - withheld));
  const extras: TotalsExtraRow[] = [];
  if (fees > 0) extras.push({ label: L.fees, value: fees });
  if (stamp > 0) extras.push({ label: L.stamp, value: stamp });
  if (otherTax > 0) extras.push({ label: L.otherTaxes, value: otherTax });
  if (digitalFee > 0) extras.push({ label: L.digitalFee, value: digitalFee });
  if (deductions > 0) extras.push({ label: L.deductions, value: deductions, negative: true });
  if (withheld > 0) extras.push({ label: L.withheld, value: withheld, negative: true });

  // #227 — paid-upfront (cash) discount: show the pre-discount subtotal + a discount line.
  // Display-only — the stored/reported subtotal_net stays the post-discount taxable base.
  const cashPct = Number(inv.cash_discount_pct ?? 0);
  let displaySubtotalNet = totNet;
  if (cashPct > 0 && cashPct < 100) {
    const preNet = totNet / (1 - cashPct / 100);
    const cashDisc = Math.round((preNet - totNet) * 100) / 100;
    displaySubtotalNet = Math.round(preNet * 100) / 100;
    extras.unshift({ label: `Paid upfront (−${cashPct}%)`, value: cashDisc, negative: true });
  }

  // ── Payment + bank accounts ──
  const accounts: string[] = [];
  const arr: any[] = Array.isArray(fs?.bank_accounts) ? fs.bank_accounts : [];
  if (arr.length > 0) {
    for (const a of arr) {
      let detail = '';
      if (a?.type === 'bank') {
        detail = [a.bank_name, a.iban ? `IBAN ${a.iban}` : '', a.bic ? `BIC ${a.bic}` : '', a.beneficiary].filter(Boolean).join('  ·  ');
      } else if (a?.type === 'paypal') {
        detail = ['PayPal', a.paypal_email, a.url].filter(Boolean).join('  ·  ');
      } else {
        detail = [a.url, a.notes].filter(Boolean).join('  ·  ');
      }
      if (detail) accounts.push(a?.label ? `${a.label}: ${detail}` : detail);
    }
  } else {
    const legacy = [fs?.bank_name, fs?.bank_iban ? `IBAN ${fs.bank_iban}` : '', fs?.bank_bic ? `BIC ${fs.bank_bic}` : '', fs?.bank_beneficiary].filter(Boolean).join('  ·  ');
    if (legacy) accounts.push(legacy);
  }

  // ── Shipping / movement ──
  let shipping: { rows: string[] } | null = null;
  if (inv.has_shipping) {
    const sr = [
      inv.ship_from ? `${L.loadingPlace}: ${inv.ship_from}` : '',
      inv.ship_to ? `${L.deliveryPlace}: ${inv.ship_to}` : '',
      inv.vehicle_number ? `${L.vehicle}: ${inv.vehicle_number}` : '',
      inv.move_purpose ? `${L.purpose}: ${inv.move_purpose}` : '',
    ].filter(Boolean) as string[];
    if (sr.length) shipping = { rows: sr };
  }

  return {
    lang, currency,
    title: invoiceDocTitle(inv.document_type, L),
    labels: L,
    issuer: { name: fs?.business_name || '', lines: issuerLines, logoUrl: inv.logo_mode === 'none' ? null : (logoUrl ?? null) },
    customer: { name: custName, lines: custLines },
    meta,
    items: rows,
    vatAnalysis,
    totals: {
      subtotalNet: displaySubtotalNet, totalVat: totVat, extras, grand,
      amountPaid: Number(inv.amount_paid ?? 0), amountDue: Number(inv.amount_due ?? grand),
    },
    payment: {
      method: inv.payment_method_code ? (PAYMENT_METHOD_LABELS[Number(inv.payment_method_code)] ?? String(inv.payment_method_code)) : undefined,
      info: inv.payment_method_info || undefined,
      accounts,
    },
    shipping,
    notes: inv.print_terms !== false ? (inv.notes || null) : null,
    infoBox: inv.info_box || null,
    fiscal: inv.fiscal_mark ? {
      mark: String(inv.fiscal_mark),
      uid: inv.fiscal_uid || undefined,
      qrUrl: inv.print_online_code !== false ? (inv.fiscal_qr_url || null) : null,
    } : null,
  };
}
