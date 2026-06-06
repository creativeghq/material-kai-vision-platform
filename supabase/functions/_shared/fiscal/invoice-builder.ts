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
    branch: 0,
    name: fs?.business_name ?? '',
    taxOffice: fs?.business_tax_office ?? undefined,
    address: {
      street: fs?.business_address ?? '',
      number: '',
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
  const incType = overrides.incomeClassificationType ?? 'E3_561_001';
  const incCat = overrides.incomeClassificationCategory ?? 'category1_1';

  const lines: FiscalLine[] = (items ?? []).map((it: any, i: number) => {
    const net = round2(Number(it.line_total ?? Number(it.unit_price ?? 0) * Number(it.quantity ?? 1)));
    const vat = round2((net * rate) / 100);
    return {
      lineNumber: i + 1,
      code: it.sku ?? undefined,
      description: it.description ?? 'Item',
      quantity: Number(it.quantity ?? 1),
      measurementUnitLabel: it.unit ?? 'ΤΜΧ',
      unitPrice: Number(it.unit_price ?? 0),
      netValue: net,
      vatCategory: cat,
      vatPercent: rate,
      vatAmount: vat,
      incomeClassificationType: incType,
      incomeClassificationCategory: incCat,
    };
  });

  const totalNet = round2(lines.reduce((s, l) => s + l.netValue, 0));
  const totalVat = round2(lines.reduce((s, l) => s + l.vatAmount, 0));
  const totalGross = round2(totalNet + totalVat);

  const invoiceType = overrides.invoiceType ?? (counterpart.vatNumber ? '1.1' : '11.1');
  const series = overrides.series ?? (fs?.invoice_number_prefix || 'A');
  const aa = overrides.aa ?? String(inv.internal_number ?? '');
  const issueDate = String(inv.issued_at ?? inv.created_at ?? new Date().toISOString()).slice(0, 10);

  return {
    issuer,
    counterpart,
    header: { series, aa, issueDate, invoiceType, currency: inv.currency ?? 'EUR' },
    lines,
    summary: {
      totalNetValue: totalNet,
      totalVatAmount: totalVat,
      totalGrossValue: totalGross,
      incomeClassificationType: incType,
      incomeClassificationCategory: incCat,
    },
    documentLabel: overrides.documentLabel,
    documentComments: inv.notes ?? undefined,
  };
}
