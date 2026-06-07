// Build a normalized FiscalInvoiceInput from our DB rows:
//   issuer      <- finance_settings.business_* (per workspace)
//   counterpart <- invoices.customer_company_id | customer_contact_id (CRM party, C5)
//   lines       <- invoice_items (invoice-level vat_rate applied per line)
// myDATA type / income-classification use sensible defaults that the caller can
// override (they are business-activity specific and become a per-workspace config later).

import type { FiscalInvoiceInput, FiscalLine, FiscalParty } from './types.ts';

export interface FiscalOverrides {
  invoiceType?: string;
  series?: string;
  aa?: string;
  incomeClassificationType?: string;
  incomeClassificationCategory?: string;
  documentLabel?: string;
}

/** myDATA VAT category from a percentage (1=24, 2=13, 3=6, 4=17/9 reduced-island, 7=0%). */
function vatCategory(pct: number): number {
  if (pct >= 24) return 1;
  if (pct >= 13) return 2;
  if (pct >= 6) return 3;
  if (pct > 0) return 4;
  return 7;
}

/** Inverse: the VAT percent myDATA expects for each category. 8 = without-VAT/exempt → 0. */
const VAT_PCT_BY_CATEGORY: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function partyFromCrm(c: any): FiscalParty {
  const name = c.name ?? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  return {
    vatNumber: c.vat_number ?? '',
    country: c.country_code ?? 'GR',
    branch: 0,
    name,
    profession: c.profession ?? undefined,
    taxOffice: c.tax_office ?? undefined,
    address: {
      street: c.street ?? c.address ?? '',
      number: c.street_number ?? '',
      postalCode: c.postal_code ?? '',
      city: c.city ?? '',
      country: c.country_code ?? 'GR',
    },
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
  };
}

export async function buildInvoiceInputFromDb(
  supabase: any,
  invoiceId: string,
  overrides: FiscalOverrides = {},
): Promise<FiscalInvoiceInput> {
  const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
  if (invErr || !inv) throw new Error(`invoice ${invoiceId} not found`);

  const [{ data: items }, { data: fs }] = await Promise.all([
    supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('added_at'),
    supabase.from('finance_settings').select('*').eq('workspace_id', inv.workspace_id).maybeSingle(),
  ]);

  const issuer: FiscalParty = {
    vatNumber: fs?.business_vat ?? '',
    country: fs?.business_country_code ?? 'GR',
    branch: Number(inv.branch_code ?? 0), // myDATA establishment number this invoice was issued under
    name: fs?.business_name ?? '',
    profession: fs?.business_profession ?? undefined,
    taxOffice: fs?.business_tax_office ?? undefined,
    address: {
      street: fs?.business_address ?? '',
      number: fs?.business_street_number ?? '',
      postalCode: fs?.business_postal_code ?? '',
      city: fs?.business_city ?? '',
      country: fs?.business_country_code ?? 'GR',
    },
    phone: fs?.business_phone ?? undefined,
    email: fs?.business_email ?? undefined,
  };

  let counterpart: FiscalParty = { vatNumber: '', country: 'GR', branch: 0 };
  if (inv.customer_company_id) {
    const { data: c } = await supabase.from('crm_companies').select('*').eq('id', inv.customer_company_id).single();
    if (c) counterpart = partyFromCrm(c);
  } else if (inv.customer_contact_id) {
    const { data: c } = await supabase.from('crm_contacts').select('*').eq('id', inv.customer_contact_id).single();
    if (c) counterpart = partyFromCrm(c);
  }

  const rate = Number(inv.vat_rate ?? fs?.default_vat_rate ?? 24);
  const cat = vatCategory(rate);
  const incType = overrides.incomeClassificationType ?? fs?.default_income_classification_type ?? 'E3_561_001';
  const incCat = overrides.incomeClassificationCategory ?? fs?.default_income_classification_category ?? 'category1_1';

  // Pull per-product myDATA defaults (#178) for income classification + vat category.
  const productIds = [...new Set((items ?? []).map((it: any) => it.product_id).filter(Boolean))];
  const prodMap: Record<string, any> = {};
  if (productIds.length) {
    const { data: prods } = await supabase
      .from('products')
      .select('id, mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category')
      .in('id', productIds);
    for (const p of prods ?? []) prodMap[p.id] = p;
  }

  const lines: FiscalLine[] = (items ?? []).map((it: any, i: number) => {
    const prod = it.product_id ? prodMap[it.product_id] : null;
    const net = round2(Number(it.net_value ?? it.line_total ?? Number(it.unit_price ?? 0) * Number(it.quantity ?? 1)));
    // Keep category ↔ percent ↔ amount mutually consistent or myDATA rejects the line.
    // If the line/product carries an explicit VAT category, the percent is derived from it
    // (not the invoice rate); otherwise fall back to the invoice rate and derive the category.
    const explicitCat = it.vat_category ?? prod?.mydata_vat_category ?? null;
    let lineCat: number;
    let linePct: number;
    if (explicitCat != null && VAT_PCT_BY_CATEGORY[Number(explicitCat)] !== undefined) {
      lineCat = Number(explicitCat);
      linePct = VAT_PCT_BY_CATEGORY[lineCat];
    } else {
      lineCat = cat;
      linePct = rate;
    }
    // Recompute VAT deterministically from net × percent — don't trust a possibly-drifted
    // stored vat_amount (rounding drift here is the #1 myDATA ValidationError cause).
    const vat = round2((net * linePct) / 100);
    return {
      lineNumber: i + 1,
      code: it.sku ?? undefined,
      description: it.description ?? 'Item',
      quantity: Number(it.quantity ?? 1),
      measurementUnitLabel: it.unit ?? 'ΤΜΧ',
      unitPrice: Number(it.unit_price ?? 0),
      netValue: net,
      vatCategory: lineCat,
      vatPercent: linePct,
      vatAmount: vat,
      incomeClassificationType: it.income_classification_type ?? prod?.mydata_income_classification_type ?? incType,
      incomeClassificationCategory: it.income_classification_category ?? prod?.mydata_income_classification_category ?? incCat,
    };
  });

  const totalNet = round2(lines.reduce((s, l) => s + l.netValue, 0));
  const totalVat = round2(lines.reduce((s, l) => s + l.vatAmount, 0));
  const totalGross = round2(totalNet + totalVat);

  const invoiceType = overrides.invoiceType ?? inv.document_type ?? (counterpart.vatNumber ? '1.1' : '11.1');
  // Prefer the per-branch series + counter resolved at creation (document_series);
  // fall back to the workspace prefix / internal number for pre-series invoices.
  const series = overrides.series ?? (inv.series || fs?.invoice_number_prefix || 'A');
  const aa = overrides.aa ?? String(inv.series_number ?? inv.legal_number ?? inv.internal_number ?? '');
  const issueDate = String(inv.issued_at ?? inv.created_at ?? new Date().toISOString()).slice(0, 10);

  return {
    issuer,
    counterpart,
    header: { series, aa, issueDate, invoiceType, currency: inv.currency ?? 'EUR' },
    lines,
    summary: {
      totalNetValue: totalNet,
      totalVatAmount: totalVat,
      totalGrossValue: round2(totalGross + Number(inv.total_fees_amount ?? 0) + Number(inv.total_stamp_duty_amount ?? 0) + Number(inv.total_other_taxes_amount ?? 0) - Number(inv.total_withheld_amount ?? 0) - Number(inv.total_deductions_amount ?? 0)),
      totalWithheldAmount: Number(inv.total_withheld_amount ?? 0),
      incomeClassificationType: incType,
      incomeClassificationCategory: incCat,
    },
    documentLabel: overrides.documentLabel,
    documentComments: inv.notes ?? undefined,
  };
}

/**
 * Build a myDATA 5.1 credit-note FiscalInvoiceInput from a credit_notes row. The
 * issuer is the workspace; the counterpart + correlated MARK come from the original
 * invoice. Lines come from credit_note_items. Type 5.1 (correlated) when the original
 * carries a fiscal_mark, else 5.2.
 */
export async function buildCreditNoteInputFromDb(
  supabase: any,
  creditNoteId: string,
  overrides: FiscalOverrides = {},
): Promise<FiscalInvoiceInput> {
  const { data: cn, error: cnErr } = await supabase.from('credit_notes').select('*').eq('id', creditNoteId).single();
  if (cnErr || !cn) throw new Error(`credit note ${creditNoteId} not found`);

  const [{ data: items }, { data: inv }, { data: fs }] = await Promise.all([
    supabase.from('credit_note_items').select('*').eq('credit_note_id', creditNoteId).order('created_at'),
    supabase.from('invoices').select('*').eq('id', cn.invoice_id).single(),
    supabase.from('finance_settings').select('*').eq('workspace_id', cn.workspace_id).maybeSingle(),
  ]);
  if (!inv) throw new Error(`source invoice for credit note ${creditNoteId} not found`);

  const issuer: FiscalParty = {
    vatNumber: fs?.business_vat ?? '',
    country: fs?.business_country_code ?? 'GR',
    branch: Number(inv.branch_code ?? 0), // same establishment as the corrected invoice
    name: fs?.business_name ?? '',
    profession: fs?.business_profession ?? undefined,
    taxOffice: fs?.business_tax_office ?? undefined,
    address: {
      street: fs?.business_address ?? '', number: fs?.business_street_number ?? '',
      postalCode: fs?.business_postal_code ?? '', city: fs?.business_city ?? '',
      country: fs?.business_country_code ?? 'GR',
    },
    phone: fs?.business_phone ?? undefined,
    email: fs?.business_email ?? undefined,
  };

  let counterpart: FiscalParty = { vatNumber: '', country: 'GR', branch: 0 };
  if (inv.customer_company_id) {
    const { data: c } = await supabase.from('crm_companies').select('*').eq('id', inv.customer_company_id).single();
    if (c) counterpart = partyFromCrm(c);
  } else if (inv.customer_contact_id) {
    const { data: c } = await supabase.from('crm_contacts').select('*').eq('id', inv.customer_contact_id).single();
    if (c) counterpart = partyFromCrm(c);
  }

  const lines: FiscalLine[] = (items ?? []).map((it: any, i: number) => {
    const net = round2(Number(it.net_value ?? 0));
    const linePct = Number(it.vat_percent ?? inv.vat_rate ?? 24);
    const lineCat = it.vat_category ?? vatCategory(linePct);
    return {
      lineNumber: i + 1,
      code: it.sku ?? undefined,
      description: it.description ?? 'Credit',
      quantity: Number(it.quantity ?? 1),
      measurementUnitLabel: it.unit ?? 'ΤΜΧ',
      unitPrice: Number(it.unit_price ?? 0),
      netValue: net,
      vatCategory: lineCat,
      vatPercent: linePct,
      vatAmount: round2((net * linePct) / 100),
      incomeClassificationType: it.income_classification_type ?? fs?.default_income_classification_type ?? 'E3_561_001',
      incomeClassificationCategory: it.income_classification_category ?? fs?.default_income_classification_category ?? 'category1_1',
    };
  });

  const totalNet = round2(lines.reduce((s, l) => s + l.netValue, 0));
  const totalVat = round2(lines.reduce((s, l) => s + l.vatAmount, 0));
  const correlatedMark = cn.correlated_mark ?? inv.fiscal_mark ?? null;
  const isCorrelated = !!correlatedMark;

  return {
    issuer,
    counterpart,
    header: {
      series: overrides.series ?? (cn.series || fs?.invoice_number_prefix || 'A'),
      aa: overrides.aa ?? String(cn.series_number ?? cn.credit_note_number ?? ''),
      issueDate: String(cn.issued_at ?? cn.created_at ?? new Date().toISOString()).slice(0, 10),
      invoiceType: overrides.invoiceType ?? cn.document_type ?? (isCorrelated ? '5.1' : '5.2'),
      currency: cn.currency ?? inv.currency ?? 'EUR',
    },
    correlatedInvoices: isCorrelated ? [Number(correlatedMark)] : undefined,
    lines,
    summary: {
      totalNetValue: totalNet,
      totalVatAmount: totalVat,
      totalGrossValue: round2(totalNet + totalVat),
      incomeClassificationType: fs?.default_income_classification_type ?? 'E3_561_001',
      incomeClassificationCategory: fs?.default_income_classification_category ?? 'category1_1',
    },
    documentLabel: overrides.documentLabel ?? 'Πιστωτικό Τιμολόγιο',
    documentComments: cn.reason ?? undefined,
  };
}

const MOVE_PURPOSE_LABELS: Record<number, string> = {
  1: 'SALES', 2: 'SALES_ON_BEHALF', 3: 'SAMPLING', 4: 'EXHIBITION',
  5: 'RETURN', 6: 'INTER_BRANCH', 7: 'CONSIGNMENT',
};

/**
 * Build a myDATA 9.3 delivery-note (movement document) FiscalInvoiceInput from a
 * `delivery_notes` row + items. Movement docs carry no value — lines are netValue 0,
 * VAT category 8 (without VAT), no income classification. Transport details (vehicle,
 * dispatch date/time, loading/delivery address, move purpose) ride in the header.
 * Loading address defaults to the issuer's premises, delivery to the counterpart's;
 * the free-text ship_from/ship_to overrides the street line when set.
 */
export async function buildDeliveryNoteInputFromDb(
  supabase: any,
  deliveryNoteId: string,
  overrides: FiscalOverrides = {},
): Promise<FiscalInvoiceInput> {
  const { data: dn, error: dnErr } = await supabase.from('delivery_notes').select('*').eq('id', deliveryNoteId).single();
  if (dnErr || !dn) throw new Error(`delivery note ${deliveryNoteId} not found`);

  const [{ data: items }, { data: fs }] = await Promise.all([
    supabase.from('delivery_note_items').select('*').eq('delivery_note_id', deliveryNoteId).order('created_at'),
    supabase.from('finance_settings').select('*').eq('workspace_id', dn.workspace_id).maybeSingle(),
  ]);

  const issuer: FiscalParty = {
    vatNumber: fs?.business_vat ?? '',
    country: fs?.business_country_code ?? 'GR',
    branch: Number(dn.branch_code ?? 0),
    name: fs?.business_name ?? '',
    profession: fs?.business_profession ?? undefined,
    taxOffice: fs?.business_tax_office ?? undefined,
    address: {
      street: fs?.business_address ?? '', number: fs?.business_street_number ?? '',
      postalCode: fs?.business_postal_code ?? '', city: fs?.business_city ?? '',
      country: fs?.business_country_code ?? 'GR',
    },
    phone: fs?.business_phone ?? undefined,
    email: fs?.business_email ?? undefined,
  };

  let counterpart: FiscalParty = { vatNumber: '', country: 'GR', branch: 0 };
  if (dn.customer_company_id) {
    const { data: c } = await supabase.from('crm_companies').select('*').eq('id', dn.customer_company_id).single();
    if (c) counterpart = partyFromCrm(c);
  } else if (dn.customer_contact_id) {
    const { data: c } = await supabase.from('crm_contacts').select('*').eq('id', dn.customer_contact_id).single();
    if (c) counterpart = partyFromCrm(c);
  }

  const lines: FiscalLine[] = (items ?? []).map((it: any, i: number) => ({
    lineNumber: i + 1,
    code: it.sku ?? undefined,
    description: it.description ?? 'Item',
    quantity: Number(it.quantity ?? 1),
    measurementUnitLabel: it.unit ?? 'ΤΜΧ',
    unitPrice: 0,
    netValue: 0,
    vatCategory: 8, // without VAT — movement doc carries no value
    vatPercent: 0,
    vatAmount: 0,
  }));

  const movePurpose = dn.move_purpose ? parseInt(String(dn.move_purpose), 10) || 1 : 1;
  // Per-note structured fields win; fall back to issuer/counterpart address parts, with
  // the legacy free-text ship_from/ship_to as the street line.
  const loadingAddress = {
    street: dn.ship_from_street || dn.ship_from || issuer.address?.street || '',
    number: dn.ship_from_number || issuer.address?.number || '',
    postalCode: dn.ship_from_postal || issuer.address?.postalCode || '',
    city: dn.ship_from_city || issuer.address?.city || '',
  };
  const deliveryAddress = {
    street: dn.ship_to_street || dn.ship_to || counterpart.address?.street || '',
    number: dn.ship_to_number || counterpart.address?.number || '',
    postalCode: dn.ship_to_postal || counterpart.address?.postalCode || '',
    city: dn.ship_to_city || counterpart.address?.city || '',
  };
  const issueDate = String(dn.issued_at ?? dn.created_at ?? new Date().toISOString()).slice(0, 10);

  return {
    issuer,
    counterpart,
    header: {
      series: overrides.series ?? (dn.series || fs?.invoice_number_prefix || 'A'),
      aa: overrides.aa ?? String(dn.series_number ?? dn.delivery_note_number ?? ''),
      issueDate,
      invoiceType: overrides.invoiceType ?? '9.3',
      currency: 'EUR',
      dispatchDate: dn.transport_date ? String(dn.transport_date).slice(0, 10) : issueDate,
      dispatchTime: dn.transport_time || undefined,
      vehicleNumber: dn.vehicle_number || undefined,
      movePurpose,
      movePurposeLabel: MOVE_PURPOSE_LABELS[movePurpose],
      loadingAddress,
      deliveryAddress,
    },
    lines,
    summary: { totalNetValue: 0, totalVatAmount: 0, totalGrossValue: 0 },
    documentLabel: overrides.documentLabel ?? 'Δελτίο Αποστολής',
    documentComments: dn.notes ?? undefined,
  };
}
