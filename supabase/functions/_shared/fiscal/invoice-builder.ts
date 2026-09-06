// Build a normalized FiscalInvoiceInput from our DB rows:
//   issuer      <- finance_settings.business_* (per workspace)
//   counterpart <- invoices.customer_company_id | customer_contact_id (CRM party, C5)
//   lines       <- invoice_items (invoice-level vat_rate applied per line)
// myDATA type / income-classification use sensible defaults that the caller can
// override (they are business-activity specific and become a per-workspace config later).

import type { FiscalInvoiceInput, FiscalLine, FiscalParty } from './types.ts';
import { isUnnamedLineName } from './types.ts';
import {
  movePurposeLabel,
  isMydataMovePurpose,
  mydataIncomeClassificationType,
  mydataIncomeClassificationCategory,
} from './fiscalVocabulary.generated.ts';
import { resolveContactBillingSource } from '../crm/party-inheritance.ts';
import { normalizeVat } from '../crm/vatNormalize.generated.ts';

/**
 * Fail loudly before a fiscal document is built from an unconfirmed line-item read.
 *
 * All three builders below used to destructure `{ data: items }` WITHOUT `error` and
 * then do `(items ?? []).map(...)`. `supabase-js` returns `{data: null, error}` rather
 * than throwing, so any failure — RLS, a renamed column, a transport blip — silently
 * became "this document has no lines": totalNet 0, totalVat 0. `finance-issue-invoice`
 * then TRANSMITTED that to AADE/myDATA as a legally-binding zero-value document.
 *
 * A read we didn't confirm must never become a legal filing. A genuine invoice /
 * credit note / delivery note also cannot have zero lines, so an empty list is treated
 * as a hard error rather than a valid document.
 */
function assertFiscalLines(items: unknown, err: unknown, subject: string): void {
  if (err) {
    const msg = (err as { message?: string })?.message ?? String(err);
    throw new Error(`refusing to build ${subject}: line-item read failed (${msg})`);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error(`refusing to build ${subject}: it has no line items`);
  }
}

/**
 * Fold a line's variant selections (color / size / free-form attributes) into the
 * transmitted product name so the myDATA line + the provider-rendered legal document read
 * "Base name — Red, 60×60" instead of just the base product name. No-op when the line
 * carries no variant data, when a token is already present in the base name, or when the
 * base is itself an unnamed placeholder (appending "Red" to "(line item)" helps no one —
 * the transmission guard should still catch it). Result is capped so line names stay sane.
 */
function composeLineDescription(
  base: string,
  opts: { color?: unknown; size?: unknown; attributes?: unknown },
): string {
  if (isUnnamedLineName(base)) return base;
  const parts: string[] = [];
  const push = (v: unknown) => {
    const s = v == null ? '' : String(v).trim();
    if (s) parts.push(s);
  };
  push(opts.color);
  push(opts.size);
  if (opts.attributes && typeof opts.attributes === 'object' && !Array.isArray(opts.attributes)) {
    for (const [k, v] of Object.entries(opts.attributes as Record<string, unknown>)) {
      const val = v == null ? '' : String(v).trim();
      if (val) push(`${k}: ${val}`);
    }
  }
  if (!parts.length) return base;
  // Drop variant tokens already spelled out in the base name (case-insensitive) so we don't
  // print "Tile Red — Red".
  const lowerBase = base.toLowerCase();
  const extra = parts.filter((p) => !lowerBase.includes(p.toLowerCase()));
  if (!extra.length) return base;
  const composed = `${base} — ${extra.join(', ')}`;
  return composed.length > 300 ? composed.slice(0, 297) + '…' : composed;
}

export interface FiscalOverrides {
  invoiceType?: string;
  series?: string;
  aa?: string;
  incomeClassificationType?: string;
  incomeClassificationCategory?: string;
  documentLabel?: string;
  /** Law 5155 — card(7)/IRIS(8) receipt on a registered EFT-POS terminal. When present,
   *  the payment method is forced to this type with the terminal id + NSP so Novus returns a
   *  provider signature (skipSignature=false) instead of transmitting straight to AADE. */
  posPayment?: { type: number; terminalId: string; posNspId: number };
}

/**
 * Third parties on a movement, read off the document's `correlated_entities` jsonb.
 *
 * Stored jsonb is untrusted input, so this builds an ALLOWLISTED shape rather than spreading
 * the column into the envelope (invariant 8). An entry with no VAT number identifies nobody
 * and is dropped rather than transmitted blank.
 */
function correlatedEntitiesFrom(raw: unknown): FiscalInvoiceInput['header']['otherCorrelatedEntities'] {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out = raw.flatMap((e: any) => {
    const vatNumber = String(e?.vatNumber ?? e?.vat_number ?? '').trim();
    if (!vatNumber) return [];
    const a = e?.address ?? {};
    const address = [a.street, a.number, a.postalCode ?? a.postal_code, a.city].some((v: unknown) => String(v ?? '').trim())
      ? {
          street: String(a.street ?? ''), number: String(a.number ?? ''),
          postalCode: String(a.postalCode ?? a.postal_code ?? ''), city: String(a.city ?? ''),
        }
      : undefined;
    return [{
      vatNumber,
      country: String(e?.country ?? e?.country_code ?? 'GR'),
      branch: Number(e?.branch ?? e?.branch_code ?? 0) || 0,
      ...(e?.name ? { name: String(e.name) } : {}),
      ...(address ? { address } : {}),
    }];
  });
  return out.length ? out : undefined;
}

/**
 * The stated purpose of a movement, or a refusal.
 *
 * Both movement builders used to read `move_purpose ? parseInt(...) || 1 : 1`, so an unset or
 * unparseable purpose became **1 = Πώληση**. A movement document filed as a sale when it was a
 * transfer, a return or a repair is a valid document making a false statement, and the code is
 * the field an audit reads first. Refusing is recoverable; a wrong purpose on a registered
 * document is not — the same reasoning as the unnamed-line and uncoded-unit guards in
 * `novus.ts`.
 */
function assertMovePurpose(raw: unknown, subject: string): number {
  const n = parseInt(String(raw ?? ''), 10);
  if (!isMydataMovePurpose(n)) {
    throw new Error(
      `Refusing to transmit ${subject}: it carries no valid myDATA move purpose ` +
        `(got ${JSON.stringify(raw)}). Set the purpose — use 19 "Other transfers" with a title ` +
        `when the table has no exact match — before transmitting.`,
    );
  }
  return n;
}

/** Inverse: the VAT percent myDATA expects for each category. 8 = without-VAT/exempt → 0. */
const VAT_PCT_BY_CATEGORY: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };

/**
 * myDATA VAT category from a percentage. The mapping is EXACT per the AADE table —
 * 24→1, 13→2, 6→3, and the reduced-island rates 17→4, 9→5, 4→6, 0→7 — and is the inverse
 * of VAT_PCT_BY_CATEGORY above. (The previous `>=` ladder mislabelled 17/9/4 as 2/3/4 and
 * could never emit categories 5/6, producing a category↔percent pair myDATA rejects.)
 */
const VAT_PCT_TO_CATEGORY: Record<number, number> = { 24: 1, 13: 2, 6: 3, 17: 4, 9: 5, 4: 6, 0: 7 };
function vatCategory(pct: number): number {
  const r = Math.round(pct);
  const exact = VAT_PCT_TO_CATEGORY[r];
  if (exact !== undefined) return exact;
  // Non-standard rate — fall back to the nearest standard band so we never emit a
  // category whose declared percent contradicts the line's actual rate.
  if (r <= 0) return 7;
  if (r >= 24) return 1;
  if (r >= 13) return 2;
  if (r >= 9) return 5;
  if (r >= 6) return 3;
  if (r >= 4) return 6;
  return 4;
}

import { round2 } from '../money.ts';

function partyFromCrm(c: any): FiscalParty {
  // A party may be invoiced under a SEPARATE billing identity (different
  // legal entity / ΑΦΜ / address than the contact card). When any billing_* field
  // is set we prefer it for the myDATA counterpart; otherwise fall back to the
  // party's own identity. This keeps the CRM "separate billing identity" non-inert.
  const hasBilling = !!(c.billing_vat || c.billing_name || c.billing_street || c.billing_city);
  const name = (hasBilling && c.billing_name)
    || c.name
    || `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
  const country = (hasBilling && c.billing_country_code) || c.country_code || 'GR';
  return {
    vatNumber: fiscalVatNumber((hasBilling && c.billing_vat) || c.vat_number, country),
    country,
    branch: 0,
    name,
    profession: c.profession ?? undefined,
    taxOffice: (hasBilling && c.billing_tax_office) || c.tax_office || undefined,
    address: {
      street: (hasBilling && c.billing_street) || c.street || c.address || '',
      number: (hasBilling && c.billing_street_number) || c.street_number || '',
      postalCode: (hasBilling && c.billing_postal_code) || c.postal_code || '',
      city: (hasBilling && c.billing_city) || c.city || '',
      country,
    },
    email: c.email ?? undefined,
    phone: c.phone ?? undefined,
  };
}

/**
 * Resolve the counterparty for a fiscal document (#328).
 *
 * Prefers the snapshot frozen onto the document at issue over the live CRM row. An issued
 * invoice must keep saying who it was addressed to: without this, renaming a customer silently
 * rewrites every past document, and a reprint shows today's identity rather than the one the
 * document was issued under. It is also what lets a disabled workspace's retained documents keep
 * rendering after their customers are re-homed to the operator — the CRM row is then in another
 * workspace and RLS would hand back nothing.
 *
 * Note it re-uses `partyFromCrm` rather than reading the snapshot with its own field logic. The
 * snapshot deliberately stores the same raw field names, so the billing-identity precedence
 * rules exist in exactly one place and cannot drift between "live" and "frozen" documents.
 *
 * Falls back to the live row when there is no snapshot: drafts have not been issued yet, and
 * documents that predate this column never got one.
 */
async function resolveCounterparty(
  supabase: any,
  doc: { counterparty_snapshot?: { row?: unknown } | null; customer_company_id?: string | null; customer_contact_id?: string | null },
): Promise<FiscalParty> {
  // The snapshot already holds the RESOLVED billing source — `capture_counterparty_snapshot`
  // walks an attached contact up to its primary company exactly as resolveContactBillingSource
  // does — so it goes straight into partyFromCrm with no second resolution step.
  const snapshot = doc.counterparty_snapshot?.row;
  if (snapshot) return partyFromCrm(snapshot);

  if (doc.customer_company_id) {
    const { data: c } = await supabase.from('crm_companies').select('*').eq('id', doc.customer_company_id).single();
    if (c) return partyFromCrm(c);
  } else if (doc.customer_contact_id) {
    const { data: c } = await supabase.from('crm_contacts').select('*').eq('id', doc.customer_contact_id).single();
    // A contact attached to a company is invoiced under the company's billing/VAT identity —
    // a person who belongs to a business has no separate commercial identity.
    if (c) return partyFromCrm(await resolveContactBillingSource(supabase, c));
  }
  return { vatNumber: '', country: 'GR', branch: 0 };
}

/**
 * If a sub-unit (branch / establishment) address was chosen on the document, re-address the
 * counterpart to that unit instead of the party's main address, carrying its ΑΑΔΕ branch
 * number. No-op when unitId is null/empty. Returns the (possibly) updated party.
 */
async function loadAddressUnit(supabase: any, unitId: string | null | undefined): Promise<any | null> {
  if (!unitId) return null;
  const { data } = await supabase.from('crm_address_units').select('*').eq('id', unitId).maybeSingle();
  return data ?? null;
}

async function applyCounterpartAddressUnit(
  supabase: any,
  counterpart: FiscalParty,
  unitId: string | null | undefined,
): Promise<FiscalParty> {
  const u = await loadAddressUnit(supabase, unitId);
  if (!u) return counterpart;
  return {
    ...counterpart,
    branch: Number(u.branch_number ?? counterpart.branch ?? 0),
    address: {
      street: u.street ?? u.address ?? '',
      number: u.street_number ?? '',
      postalCode: u.postal_code ?? '',
      city: u.city ?? '',
      country: u.country_code ?? counterpart.country ?? 'GR',
    },
  };
}

/**
 * The VAT number as myDATA wants it: the national number ALONE, because the envelope states the
 * country separately (`issuer.country` / `counterpart.country`).
 *
 * `finance_settings.business_vat` and `crm_companies.vat_number` are free text and Greek
 * businesses write the same number three ways — `802349569`, `EL802349569`, `GR 800 370 260`.
 * The operator workspace stores the EL form, and it was passed to the provider VERBATIM, which
 * answers **HTTP 401** "You don't have the authority to transmit for this vat numbers": the
 * authorization list holds the bare AFM, so the prefixed spelling matches nothing. Every
 * transmission from that workspace failed at the door, and it read as a permissions problem with
 * the account rather than as a stray two letters. Verified against the sandbox 2026-09-06 (#319):
 * `EL802349569` → 401, `802349569` → the document.
 *
 * `normalizeVat` is the platform-wide rule for this and already handles the Greek pair while
 * KEEPING a real foreign prefix (`DE…` and `FR…` are different taxpayers). A foreign prefix that
 * merely repeats the party's own declared country is dropped here too, for the same reason the
 * Greek one is: it is the country field said twice.
 */
function fiscalVatNumber(vat: string | null | undefined, country?: string | null): string {
  const normalized = normalizeVat(vat) ?? '';
  const cc = String(country ?? '').trim().toUpperCase();
  if (cc.length === 2 && normalized.toUpperCase().startsWith(cc) && /[0-9]/.test(normalized.charAt(2))) {
    return normalized.slice(2);
  }
  return normalized;
}

export async function buildInvoiceInputFromDb(
  supabase: any,
  invoiceId: string,
  overrides: FiscalOverrides = {},
): Promise<FiscalInvoiceInput> {
  const { data: inv, error: invErr } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
  if (invErr || !inv) throw new Error(`invoice ${invoiceId} not found`);

  const [{ data: items, error: itemsErr }, { data: fs }] = await Promise.all([
    supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('added_at'),
    supabase.from('finance_settings').select('*').eq('workspace_id', inv.workspace_id).maybeSingle(),
  ]);
  // FISCAL SAFETY: the header above throws on error, but this read used to drop `error`
  // and fall through to `(items ?? [])` — so a failed/RLS-blocked invoice_items read
  // produced lines=[], totalNet=0, totalVat=0, and finance-issue-invoice TRANSMITTED A
  // LEGALLY-BINDING ZERO-VALUE DOCUMENT to AADE/myDATA. Never let a transmission be
  // built from a read we didn't confirm. A real invoice also cannot have zero lines.
  assertFiscalLines(items, itemsErr, `invoice ${invoiceId}`);

  const issuer: FiscalParty = {
    vatNumber: fiscalVatNumber(fs?.business_vat, fs?.business_country_code ?? 'GR'),
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

  let counterpart: FiscalParty = await resolveCounterparty(supabase, inv);
  counterpart = await applyCounterpartAddressUnit(supabase, counterpart, inv.customer_address_unit_id);

  const rate = Number(inv.vat_rate ?? fs?.default_vat_rate ?? 24);
  const cat = vatCategory(rate);

  // Pull per-product myDATA defaults for income classification + vat category.
  const productIds = [...new Set((items ?? []).map((it: any) => it.product_id).filter(Boolean))];
  const prodMap: Record<string, any> = {};
  if (productIds.length) {
    const { data: prods } = await supabase
      .from('products')
      .select('id, mydata_vat_category, mydata_income_classification_type, mydata_income_classification_category, mydata_income_classification_type_retail, mydata_income_classification_category_retail')
      .in('id', productIds);
    for (const p of prods ?? []) prodMap[p.id] = p;
  }

  // The SAME product is classified differently wholesale vs retail (E3_561_001 vs
  // E3_561_003). Document family 11.x is retail; everything else is wholesale. Without this
  // split a shop transmitting retail receipts files every sale under the wholesale code.
  const docTypeForClassification = String(
    overrides.invoiceType ?? inv.document_type ?? (counterpart.vatNumber ? '1.1' : '11.1'),
  );
  const isRetailDoc = docTypeForClassification.startsWith('11.');

  // The document-level fallback for a line that carries no classification of its own — DERIVED
  // from the document type, because AADE validates the pair against it. It was a flat
  // ('E3_561_001','category1_1'), which is the wholesale-goods pair and is REFUSED off 11.x
  // (error 313) and off 2.x (error 331) — so every retail receipt and every service invoice was
  // rejected at the provider while the wholesale invoice beside it succeeded. See
  // `mydataIncomeClassificationType` for the codes and the sandbox evidence (#319).
  //
  // The workspace default still applies where it can be right: it is the operator's choice of
  // WHICH wholesale-goods classification to use (E3_561_005 for an intra-community seller, say),
  // so it is honoured only on the families whose derived answer is that baseline pair. It cannot
  // override the derivation for retail or services, because AADE would refuse the result.
  const derivedIncType = mydataIncomeClassificationType(docTypeForClassification);
  const derivedIncCat = mydataIncomeClassificationCategory(docTypeForClassification);
  const incType = overrides.incomeClassificationType
    ?? (derivedIncType === 'E3_561_001' ? (fs?.default_income_classification_type ?? derivedIncType) : derivedIncType);
  const incCat = overrides.incomeClassificationCategory
    ?? (derivedIncCat === 'category1_1' ? (fs?.default_income_classification_category ?? derivedIncCat) : derivedIncCat);
  const productIncomeType = (p: any) => (isRetailDoc
    ? (p?.mydata_income_classification_type_retail ?? p?.mydata_income_classification_type)
    : p?.mydata_income_classification_type);
  const productIncomeCategory = (p: any) => (isRetailDoc
    ? (p?.mydata_income_classification_category_retail ?? p?.mydata_income_classification_category)
    : p?.mydata_income_classification_category);

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
      // Fold the chosen variant (color / size / attributes) into the transmitted name so the
      // myDATA line + legal PDF disambiguate "Tile X — Red, 60×60" instead of just "Tile X".
      description: composeLineDescription(it.description ?? 'Item', {
        color: it.selected_color,
        size: it.selected_size,
        attributes: it.selected_attributes,
      }),
      quantity: Number(it.quantity ?? 1),
      measurementUnitLabel: it.unit ?? 'ΤΜΧ',
      // Commodity code AS SNAPSHOTTED on the line, never re-read from the product: a reissued or
      // reprinted invoice must keep saying what it said, and the nomenclature moves monthly.
      // Cross-border commercial invoices are expected to carry it per line.
      commodityCode: it.taric_code ?? undefined,
      countryOfOrigin: it.country_of_origin ?? undefined,
      unitPrice: Number(it.unit_price ?? 0),
      netValue: net,
      vatCategory: lineCat,
      vatPercent: linePct,
      vatAmount: vat,
      vatExemptionCategory: it.vat_exemption_category ?? undefined,
      withheldAmount: Number(it.withheld_amount ?? 0) || undefined,
      withheldCategory: it.withheld_category ?? undefined,
      feesAmount: Number(it.fees_amount ?? 0) || undefined,
      feesCategory: it.fees_category ?? undefined,
      stampDutyAmount: Number(it.stamp_duty_amount ?? 0) || undefined,
      stampDutyCategory: it.stamp_duty_category ?? undefined,
      otherTaxesAmount: Number(it.other_taxes_amount ?? 0) || undefined,
      otherTaxesCategory: it.other_taxes_category ?? undefined,
      deductionsAmount: Number(it.deductions_amount ?? 0) || undefined,
      lineComments: it.line_comments ?? undefined,
      // 1.5 clearance-of-third-party-sales line kind (1 = clearance, 2 = commission fee).
      invoiceDetailType: Number(it.invoice_detail_type ?? 0) || undefined,
      incomeClassificationType: it.income_classification_type ?? productIncomeType(prod) ?? incType,
      incomeClassificationCategory: it.income_classification_category ?? productIncomeCategory(prod) ?? incCat,
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

  // Digital transaction fee (Ψηφιακό Τέλος Συναλλαγής) rides in the other-taxes bucket for myDATA.
  const digitalFee = Number(inv.digital_transaction_fee ?? 0);
  const otherTaxesTotal = Number(inv.total_other_taxes_amount ?? 0) + digitalFee;
  const grossTotal = round2(totalGross + Number(inv.total_fees_amount ?? 0) + Number(inv.total_stamp_duty_amount ?? 0) + otherTaxesTotal - Number(inv.total_withheld_amount ?? 0) - Number(inv.total_deductions_amount ?? 0));

  // Combined invoice + delivery note (Τιμολόγιο – Δελτίο Αποστολής): emit the movement
  // block so myDATA receives the transport details, same shape as a standalone 9.3.
  const movement = inv.has_shipping
    ? (() => {
        // NO DEFAULT. `move_purpose ? ... : 1` filed every movement nobody classified as a
        // SALE — a valid code, silently wrong, and the one purpose an auditor reads hardest.
        const mp = assertMovePurpose(inv.move_purpose, `invoice ${invoiceId}`);
        return {
          dispatchDate: inv.transport_date ? String(inv.transport_date).slice(0, 10) : issueDate,
          dispatchTime: inv.transport_time || undefined,
          vehicleNumber: inv.vehicle_number || undefined,
          movePurpose: mp,
          movePurposeLabel: movePurposeLabel(mp),
          ...(inv.other_move_purpose_title ? { otherMovePurposeTitle: String(inv.other_move_purpose_title) } : {}),
          // Goods leave the establishment that ISSUED the document unless told otherwise; they
          // arrive at one of ours only on an internal transfer, so that end stays unset by
          // default rather than guessing the issuing branch at both ends.
          loadingBranch: inv.ship_from_branch_code ?? Number(inv.branch_code ?? 0) ?? 0,
          ...(inv.ship_to_branch_code != null ? { deliveryBranch: Number(inv.ship_to_branch_code) } : {}),
          ...(correlatedEntitiesFrom(inv.correlated_entities) ? { otherCorrelatedEntities: correlatedEntitiesFrom(inv.correlated_entities) } : {}),
          loadingAddress: {
            street: inv.ship_from || issuer.address?.street || '',
            number: issuer.address?.number ?? '', postalCode: issuer.address?.postalCode ?? '', city: issuer.address?.city ?? '',
          },
          deliveryAddress: {
            street: inv.ship_to || counterpart.address?.street || '',
            number: counterpart.address?.number ?? '', postalCode: counterpart.address?.postalCode ?? '', city: counterpart.address?.city ?? '',
          },
        };
      })()
    : null;

  // B2G (public sector). The operator-entered b2g_details ride alongside the
  // standard envelope; delivery falls back to the counterpart address when unset.
  const b2gRaw = inv.is_b2g ? (inv.b2g_details ?? {}) : null;
  const b2g = b2gRaw
    ? {
        contractReference: b2gRaw.contractReference || undefined,
        buyerReference: b2gRaw.buyerReference || undefined,
        buyerLegalRegistrationIdentifier: b2gRaw.buyerLegalRegistrationIdentifier || counterpart.vatNumber || undefined,
        partyName: b2gRaw.partyName || counterpart.name || undefined,
        dueDate: b2gRaw.dueDate || undefined,
        ...(b2gRaw.budgetIdentifier
          ? { budget: { type: Number(b2gRaw.budgetType ?? 1) || 1, identifier: String(b2gRaw.budgetIdentifier) } }
          : {}),
        ...(b2gRaw.buyerIdentifier
          ? { buyerIdentifiers: [{ buyerIdentifier: String(b2gRaw.buyerIdentifier) }] }
          : {}),
        deliveryDetails: {
          street: b2gRaw.deliveryStreet || counterpart.address?.street || '',
          city: b2gRaw.deliveryCity || counterpart.address?.city || '',
          postalCode: b2gRaw.deliveryPostalCode || counterpart.address?.postalCode || '',
        },
      }
    : undefined;

  return {
    issuer,
    counterpart,
    header: {
      series, aa, issueDate, invoiceType, currency: inv.currency ?? 'EUR',
      vatPaymentSuspension: !!inv.vat_payment_suspension,
      selfPricing: !!inv.self_pricing,
      exchangeRate: inv.exchange_rate ?? undefined,
      ...(movement ?? {}),
    },
    ...(b2g ? { b2g } : {}),
    // Payment method captured on the invoice (myDATA requires at least one).
    // A POS/IRIS override wins — it carries the EFT-POS terminal + NSP for the signature.
    paymentMethods: overrides.posPayment
      ? [{ type: overrides.posPayment.type, amount: grossTotal, terminalId: overrides.posPayment.terminalId, posNspId: overrides.posPayment.posNspId } as any]
      : inv.payment_method_code
      ? [{ type: Number(inv.payment_method_code), amount: grossTotal, ...(inv.payment_method_info ? { info: inv.payment_method_info } : {}) } as any]
      : undefined,
    lines,
    summary: {
      totalNetValue: totalNet,
      totalVatAmount: totalVat,
      totalGrossValue: grossTotal,
      totalWithheldAmount: Number(inv.total_withheld_amount ?? 0),
      totalFeesAmount: Number(inv.total_fees_amount ?? 0),
      totalStampDutyAmount: Number(inv.total_stamp_duty_amount ?? 0),
      totalOtherTaxesAmount: otherTaxesTotal,
      totalDeductionsAmount: Number(inv.total_deductions_amount ?? 0),
      incomeClassificationType: incType,
      incomeClassificationCategory: incCat,
    } as any,
    documentLabel: overrides.documentLabel,
    documentComments: inv.notes ?? undefined,
    // The operator already chose this per invoice (invoices.doc_language, defaulted from
    // finance_settings.default_doc_language) and our own PDF honours it. Feed the same choice to
    // the provider instead of a constant, so the two can never disagree about what language the
    // document is in.
    documentLanguageCode: String(inv.doc_language ?? 'en').toUpperCase(),
  };
}

/**
 * Build a credit-note FiscalInvoiceInput from a credit_notes row. The issuer is the
 * workspace; the counterpart + correlated MARK come from the original invoice. Lines come
 * from credit_note_items.
 *
 * THE TYPE FOLLOWS THE DOCUMENT BEING CORRECTED. A retail receipt (11.x) is reversed by
 * **11.4** (Πιστωτικό Στοιχείο Λιανικής); only a wholesale invoice takes 5.1 (correlated,
 * when the original carries a MARK) or 5.2. Filing a 5.x against an 11.x is a mis-typed
 * document at AADE, and it was all this could produce — while `buildInvoiceInputFromDb`
 * emits 11.1 for every counterparty with no VAT number, which is every register and
 * storefront sale. `issue_credit_note` stamps the same type at creation; this recomputes it
 * so a row written before that fix still transmits correctly.
 */
export async function buildCreditNoteInputFromDb(
  supabase: any,
  creditNoteId: string,
  overrides: FiscalOverrides = {},
): Promise<FiscalInvoiceInput> {
  const { data: cn, error: cnErr } = await supabase.from('credit_notes').select('*').eq('id', creditNoteId).single();
  if (cnErr || !cn) throw new Error(`credit note ${creditNoteId} not found`);

  const [{ data: items, error: itemsErr }, { data: inv }, { data: fs }] = await Promise.all([
    supabase.from('credit_note_items').select('*').eq('credit_note_id', creditNoteId).order('created_at'),
    supabase.from('invoices').select('*').eq('id', cn.invoice_id).single(),
    supabase.from('finance_settings').select('*').eq('workspace_id', cn.workspace_id).maybeSingle(),
  ]);
  if (!inv) throw new Error(`source invoice for credit note ${creditNoteId} not found`);
  assertFiscalLines(items, itemsErr, `credit note ${creditNoteId}`);

  const issuer: FiscalParty = {
    vatNumber: fiscalVatNumber(fs?.business_vat, fs?.business_country_code ?? 'GR'),
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

  // From the CORRECTED INVOICE, snapshot included: a credit note must name the same party the
  // document it corrects named. Reading the credit note's own customer refs (or today's CRM)
  // could address the correction to someone the original invoice never mentioned.
  let counterpart: FiscalParty = await resolveCounterparty(supabase, inv);
  // Credit note inherits the corrected invoice's chosen sub-unit address.
  counterpart = await applyCounterpartAddressUnit(supabase, counterpart, inv.customer_address_unit_id);

  const creditDocType = String(
    overrides.invoiceType ?? cn.document_type
      ?? (String(inv.document_type ?? '').startsWith('11.') ? '11.4' : (cn.correlated_mark ?? inv.fiscal_mark ? '5.1' : '5.2')),
  );
  const isRetailCredit = creditDocType.startsWith('11.');
  // Income classification is INHERITED per line from the invoice line being credited
  // (`issue_credit_note` copies it), so the retail/wholesale split the invoice made — product
  // retail codes included — carries over without being re-derived here. These are only the
  // fallback for a whole-amount credit that has no source line.
  // Same derivation as the invoice path, keyed on the CREDIT note's own type: an 11.4 reverses
  // a retail receipt and must classify as retail, and the flat wholesale pair was refused there
  // for exactly the reason it was refused on 11.1.
  const derivedCnType = mydataIncomeClassificationType(creditDocType);
  const derivedCnCat = mydataIncomeClassificationCategory(creditDocType);
  const defaultIncType = derivedCnType === 'E3_561_001'
    ? (fs?.default_income_classification_type ?? derivedCnType)
    : derivedCnType;
  const defaultIncCat = derivedCnCat === 'category1_1'
    ? (fs?.default_income_classification_category ?? derivedCnCat)
    : derivedCnCat;

  const lines: FiscalLine[] = (items ?? []).map((it: any, i: number) => {
    const net = round2(Number(it.net_value ?? 0));
    // Category ↔ percent, same precedence as the invoice line: an explicit category wins and
    // the percent is derived from it, so a 0% line cannot be transmitted at the invoice rate.
    const explicitCat = it.vat_category ?? null;
    const lineCat = explicitCat != null && VAT_PCT_BY_CATEGORY[Number(explicitCat)] !== undefined
      ? Number(explicitCat)
      : vatCategory(Number(it.vat_percent ?? inv.vat_rate ?? 24));
    const linePct = VAT_PCT_BY_CATEGORY[lineCat] ?? Number(it.vat_percent ?? inv.vat_rate ?? 24);
    return {
      lineNumber: i + 1,
      code: it.sku ?? undefined,
      description: it.description ?? 'Credit',
      quantity: Number(it.quantity ?? 1),
      measurementUnitLabel: it.unit ?? 'ΤΜΧ',
      // Commodity code AS SNAPSHOTTED on the line, never re-read from the product: a reissued or
      // reprinted invoice must keep saying what it said, and the nomenclature moves monthly.
      // Cross-border commercial invoices are expected to carry it per line.
      commodityCode: it.taric_code ?? undefined,
      countryOfOrigin: it.country_of_origin ?? undefined,
      unitPrice: Number(it.unit_price ?? 0),
      netValue: net,
      vatCategory: lineCat,
      vatPercent: linePct,
      vatAmount: round2((net * linePct) / 100),
      // Carry the exemption reason on 0%/exempt lines — myDATA rejects a cat-7/8 line
      // without it (mirrors the main-invoice line mapping above). The column this reads did
      // not exist until 2026-08-29: the mapping was here, the fact never arrived, and the
      // omission is invisible because the envelope simply drops an undefined field.
      vatExemptionCategory: it.vat_exemption_category ?? undefined,
      // Per-line taxes, PRO-RATED onto the credited share by `issue_credit_note`. Without
      // these a reversal of a services invoice restates net + VAT and silently forgets the
      // 20% withholding the original declared.
      withheldAmount: Number(it.withheld_amount ?? 0) || undefined,
      withheldCategory: it.withheld_category ?? undefined,
      feesAmount: Number(it.fees_amount ?? 0) || undefined,
      feesCategory: it.fees_category ?? undefined,
      stampDutyAmount: Number(it.stamp_duty_amount ?? 0) || undefined,
      stampDutyCategory: it.stamp_duty_category ?? undefined,
      otherTaxesAmount: Number(it.other_taxes_amount ?? 0) || undefined,
      otherTaxesCategory: it.other_taxes_category ?? undefined,
      deductionsAmount: Number(it.deductions_amount ?? 0) || undefined,
      incomeClassificationType: it.income_classification_type ?? defaultIncType,
      incomeClassificationCategory: it.income_classification_category ?? defaultIncCat,
    };
  });

  const totalNet = round2(lines.reduce((s, l) => s + l.netValue, 0));
  const totalVat = round2(lines.reduce((s, l) => s + l.vatAmount, 0));
  // The per-line tax totals are SUMMED FROM THE LINES TRANSMITTED, not read from a second
  // stored copy on `credit_notes` — the invoice reads header columns because it has them, and
  // a cached total on a document whose lines are already the source would need its own drift
  // check to be worth anything. Same rule as the printed document: what the reader can add up
  // must add up.
  const sumLines = (pick: (l: FiscalLine) => number | undefined) =>
    round2(lines.reduce((acc, l) => acc + (pick(l) ?? 0), 0));
  const correlatedMark = cn.correlated_mark ?? inv.fiscal_mark ?? null;
  const isCorrelated = !!correlatedMark;

  return {
    issuer,
    counterpart,
    header: {
      series: overrides.series ?? (cn.series || fs?.invoice_number_prefix || 'A'),
      aa: overrides.aa ?? String(cn.series_number ?? cn.credit_note_number ?? ''),
      issueDate: String(cn.issued_at ?? cn.created_at ?? new Date().toISOString()).slice(0, 10),
      invoiceType: creditDocType,
      currency: cn.currency ?? inv.currency ?? 'EUR',
    },
    correlatedInvoices: isCorrelated ? [Number(correlatedMark)] : undefined,
    lines,
    summary: {
      totalNetValue: totalNet,
      totalVatAmount: totalVat,
      totalWithheldAmount: sumLines((l) => l.withheldAmount),
      totalFeesAmount: sumLines((l) => l.feesAmount),
      totalStampDutyAmount: sumLines((l) => l.stampDutyAmount),
      totalOtherTaxesAmount: sumLines((l) => l.otherTaxesAmount),
      totalDeductionsAmount: sumLines((l) => l.deductionsAmount),
      // The same formula the invoice path uses, over the same summed lines. It was net + VAT,
      // which contradicted the five component totals declared immediately above it: a credit note
      // reversing a line with withholding transmitted a gross nobody could reconstruct from its
      // own rows. A credit note is the invoice it corrects, in reverse — including this sum.
      totalGrossValue: round2(
        totalNet + totalVat
        + sumLines((l) => l.feesAmount)
        + sumLines((l) => l.stampDutyAmount)
        + sumLines((l) => l.otherTaxesAmount)
        - sumLines((l) => l.withheldAmount)
        - sumLines((l) => l.deductionsAmount),
      ),
      incomeClassificationType: defaultIncType,
      incomeClassificationCategory: defaultIncCat,
    },
    // A retail credit note is not a "Πιστωτικό Τιμολόγιο" — AADE names 11.4 differently, and
    // the label is what the customer's copy prints.
    documentLabel: overrides.documentLabel
      ?? (isRetailCredit ? 'Πιστωτικό Στοιχείο Λιανικής' : 'Πιστωτικό Τιμολόγιο'),
    documentComments: cn.reason ?? undefined,
    // Follows the invoice it corrects — the two are read side by side.
    documentLanguageCode: String(inv.doc_language ?? 'en').toUpperCase(),
  };
}

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

  const [{ data: items, error: itemsErr }, { data: fs }] = await Promise.all([
    supabase.from('delivery_note_items').select('*').eq('delivery_note_id', deliveryNoteId).order('created_at'),
    supabase.from('finance_settings').select('*').eq('workspace_id', dn.workspace_id).maybeSingle(),
  ]);
  assertFiscalLines(items, itemsErr, `delivery note ${deliveryNoteId}`);

  const issuer: FiscalParty = {
    vatNumber: fiscalVatNumber(fs?.business_vat, fs?.business_country_code ?? 'GR'),
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

  // A delivery note carries its OWN customer refs (it can precede any invoice), so it gets its
  // own snapshot rather than inheriting one.
  const counterpart: FiscalParty = await resolveCounterparty(supabase, dn);

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

  const movePurpose = assertMovePurpose(dn.move_purpose, `delivery note ${deliveryNoteId}`);
  // Optional sub-units chosen as the loading / delivery point.
  const [fromUnit, toUnit] = await Promise.all([
    loadAddressUnit(supabase, dn.ship_from_address_unit_id),
    loadAddressUnit(supabase, dn.ship_to_address_unit_id),
  ]);
  // Precedence: per-note structured fields → legacy free-text street → chosen sub-unit →
  // issuer/counterpart main address.
  const loadingAddress = {
    street: dn.ship_from_street || dn.ship_from || fromUnit?.street || fromUnit?.address || issuer.address?.street || '',
    number: dn.ship_from_number || fromUnit?.street_number || issuer.address?.number || '',
    postalCode: dn.ship_from_postal || fromUnit?.postal_code || issuer.address?.postalCode || '',
    city: dn.ship_from_city || fromUnit?.city || issuer.address?.city || '',
  };
  const deliveryAddress = {
    street: dn.ship_to_street || dn.ship_to || toUnit?.street || toUnit?.address || counterpart.address?.street || '',
    number: dn.ship_to_number || toUnit?.street_number || counterpart.address?.number || '',
    postalCode: dn.ship_to_postal || toUnit?.postal_code || counterpart.address?.postalCode || '',
    city: dn.ship_to_city || toUnit?.city || counterpart.address?.city || '',
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
      movePurposeLabel: movePurposeLabel(movePurpose),
      ...(dn.other_move_purpose_title ? { otherMovePurposeTitle: String(dn.other_move_purpose_title) } : {}),
      loadingBranch: dn.ship_from_branch_code ?? Number(dn.branch_code ?? 0) ?? 0,
      ...(dn.ship_to_branch_code != null ? { deliveryBranch: Number(dn.ship_to_branch_code) } : {}),
      ...(correlatedEntitiesFrom(dn.correlated_entities) ? { otherCorrelatedEntities: correlatedEntitiesFrom(dn.correlated_entities) } : {}),
      loadingAddress,
      deliveryAddress,
    },
    lines,
    summary: { totalNetValue: 0, totalVatAmount: 0, totalGrossValue: 0 },
    documentLabel: overrides.documentLabel ?? 'Δελτίο Αποστολής',
    documentComments: dn.notes ?? undefined,
    // Delivery notes carry no per-document language, so they follow the workspace default.
    documentLanguageCode: String(fs?.default_doc_language ?? 'en').toUpperCase(),
  };
}
