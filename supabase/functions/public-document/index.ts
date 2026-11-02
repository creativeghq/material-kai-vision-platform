// deno-lint-ignore-file no-explicit-any
/**
 * The customer's online copy of a document (#527): a token resolves to ONE invoice, credit note,
 * delivery note or order, and the response carries an ALLOWLISTED projection of the inputs
 * `buildInvoiceRenderData` reads. Rows never pass through whole — `finance_settings` holds
 * per-workspace credentials and `order_items` holds cost. Guarded by publicDocumentAllowlist.test.ts.
 */
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { recordPageEvent } from '../_shared/document-events.ts';

export const DOC_FIELDS = [
  'id', 'status', 'doc_language', 'currency', 'activity_kad', 'self_billed_supplier_company_id',
  'payment_method_code', 'payment_method_info', 'document_type', 'internal_number', 'legal_number',
  'series', 'issued_at', 'due_at', 'related_document', 'vat_rate', 'cash_discount_pct',
  'total_fees_amount', 'total_stamp_duty_amount', 'total_other_taxes_amount', 'digital_transaction_fee',
  'total_deductions_amount', 'total_withheld_amount', 'tax_payable_delta', 'total', 'amount_paid',
  'amount_due', 'has_shipping', 'ship_from', 'ship_to', 'ship_from_street', 'ship_from_number',
  'ship_from_postal', 'ship_from_city', 'ship_to_street', 'ship_to_number', 'ship_to_postal',
  'ship_to_city', 'transport_date', 'vehicle_number', 'move_purpose', 'other_move_purpose_title',
  'logo_mode', 'exchange_rate', 'fx_rate_to_base', 'print_terms', 'notes', 'info_box',
  'vat_payment_suspension', 'fiscal_mark', 'fiscal_uid', 'print_online_code', 'fiscal_qr_url',
  'fiscal_aade_qr_url', 'template_id', 'template_colors',
] as const;

export const ITEM_FIELDS = [
  'description', 'discounted_price', 'line_comments', 'line_total', 'measurement_unit_code',
  'net_value', 'other_taxes_amount', 'quantity', 'selected_color', 'selected_size', 'sku', 'unit',
  'unit_price', 'vat_amount', 'vat_category', 'vat_exemption_category', 'vat_percent',
] as const;

export const SETTINGS_FIELDS = [
  'base_currency', 'business_address', 'business_address_en', 'business_amp', 'business_city',
  'business_city_en', 'business_email', 'business_gemi', 'business_name', 'business_name_en',
  'business_phone', 'business_postal_code', 'business_profession', 'business_profession_en',
  'business_street_number', 'business_tax_office', 'business_tax_office_en', 'business_vat',
  'business_website', 'default_invoice_notes', 'main_activity', 'invoice_template_id',
  'invoice_template_colors',
] as const;

export const PARTY_FIELDS = [
  'name', 'first_name', 'last_name', 'billing_name', 'billing_vat', 'billing_tax_office',
  'billing_street', 'billing_street_number', 'billing_postal_code', 'billing_city',
  'billing_country_code', 'vat_number', 'tax_office', 'profession', 'street', 'street_number',
  'postal_code', 'city', 'country_code', 'address', 'email', 'phone', 'mobile',
] as const;

export const ADDRESS_UNIT_FIELDS = [
  'name', 'branch_number', 'street', 'address', 'street_number', 'postal_code', 'city', 'country_code',
] as const;

export const BRANCH_FIELDS = ['address', 'branch_code', 'city', 'name', 'postal_code', 'street_number'] as const;

type Kind = 'invoice' | 'credit_note' | 'delivery_note' | 'sales_order' | 'purchase_order';

function pick(row: any, fields: readonly string[]): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const f of fields) if (row[f] !== undefined) out[f] = row[f];
  return out;
}

async function partyRow(db: any, companyId: string | null, contactId: string | null) {
  if (companyId) {
    const { data } = await db.from('crm_companies').select('*').eq('id', companyId).maybeSingle();
    return data;
  }
  if (contactId) {
    const { data } = await db.from('crm_contacts').select('*').eq('id', contactId).maybeSingle();
    return data;
  }
  return null;
}

async function resolveToken(db: any, token: string) {
  const [inv, cn, dn, ord] = await Promise.all([
    db.from('invoices').select('id, workspace_id, status, pay_token_expires_at').eq('pay_token', token).maybeSingle(),
    db.from('credit_notes').select('id, workspace_id, status, share_token_expires_at').eq('share_token', token).maybeSingle(),
    db.from('delivery_notes').select('id, workspace_id, status, share_token_expires_at').eq('share_token', token).maybeSingle(),
    db.from('orders').select('id, workspace_id, status, order_type, share_token_expires_at').eq('share_token', token).maybeSingle(),
  ]);
  const expired = (at: string | null) => !!at && new Date(at).getTime() < Date.now();
  if (inv.data) return { kind: 'invoice' as Kind, row: inv.data, expired: expired(inv.data.pay_token_expires_at) };
  if (cn.data) return { kind: 'credit_note' as Kind, row: cn.data, expired: expired(cn.data.share_token_expires_at) };
  if (dn.data) return { kind: 'delivery_note' as Kind, row: dn.data, expired: expired(dn.data.share_token_expires_at) };
  if (ord.data) {
    return {
      kind: (ord.data.order_type === 'purchase' ? 'purchase_order' : 'sales_order') as Kind,
      row: ord.data, expired: expired(ord.data.share_token_expires_at),
    };
  }
  return null;
}

const SUBMISSION_TABLE: Partial<Record<Kind, string>> = {
  invoice: 'invoices', credit_note: 'credit_notes', delivery_note: 'delivery_notes',
};

async function loadDocument(db: any, kind: Kind, id: string) {
  let doc: any;
  let items: any[] = [];
  let documentTaxes: any[] = [];
  let companyId: string | null = null;
  let contactId: string | null = null;
  let related: { label: string; number: string | null } | null = null;

  if (kind === 'invoice') {
    const { data: row } = await db.from('invoices').select('*').eq('id', id).single();
    const [{ data: it }, { data: dt, error: dtErr }] = await Promise.all([
      db.from('invoice_items').select(ITEM_FIELDS.join(',')).eq('invoice_id', id).order('added_at'),
      db.from('invoice_taxes').select('tax_type, tax_category, tax_amount, reduces_payable, label')
        .eq('invoice_id', id).order('sort_order'),
    ]);
    if (dtErr) throw new Error(`could not read document-level taxes: ${dtErr.message}`);
    doc = row; items = it ?? []; documentTaxes = dt ?? [];
    companyId = row.customer_company_id; contactId = row.customer_contact_id;
  } else if (kind === 'credit_note') {
    const { data: row } = await db.from('credit_notes').select('*').eq('id', id).single();
    const [{ data: it }, { data: src }, { data: dt, error: dtErr }] = await Promise.all([
      db.from('credit_note_items').select(ITEM_FIELDS.filter((f) => !['discounted_price', 'line_comments', 'measurement_unit_code', 'selected_color', 'selected_size'].includes(f)).join(','))
        .eq('credit_note_id', id).order('created_at'),
      row.invoice_id
        ? db.from('invoices').select('customer_company_id, customer_contact_id, vat_rate, counterparty_snapshot, doc_language, internal_number, legal_number')
          .eq('id', row.invoice_id).maybeSingle()
        : Promise.resolve({ data: null }),
      db.from('credit_note_taxes').select('tax_type, tax_category, tax_amount, reduces_payable, label')
        .eq('credit_note_id', id).order('sort_order'),
    ]);
    if (dtErr) throw new Error(`could not read document-level taxes: ${dtErr.message}`);
    items = it ?? []; documentTaxes = dt ?? [];
    doc = {
      ...row, internal_number: row.credit_note_number, vat_rate: src?.vat_rate ?? 24,
      counterparty_snapshot: src?.counterparty_snapshot ?? null, doc_language: src?.doc_language ?? null,
      related_document: row.correlated_mark ?? null, notes: row.reason ?? null,
      amount_paid: 0, amount_due: 0,
    };
    companyId = src?.customer_company_id ?? null; contactId = src?.customer_contact_id ?? null;
    if (src) related = { label: 'invoice', number: src.legal_number ?? src.internal_number ?? null };
  } else if (kind === 'delivery_note') {
    const { data: row } = await db.from('delivery_notes').select('*').eq('id', id).single();
    const { data: it } = await db.from('delivery_note_items').select('description, sku, quantity, unit')
      .eq('delivery_note_id', id).order('created_at');
    items = (it ?? []).map((x: any) => ({ ...x, unit_price: 0, net_value: 0, line_total: 0, vat_category: 8 }));
    doc = {
      ...row, internal_number: row.delivery_note_number,
      document_type: row.mydata_document_type ?? (row.kind === 'receipt' ? '10.2' : '9.3'),
      total: 0, currency: 'EUR', has_shipping: true, vat_rate: 0, amount_paid: 0, amount_due: 0,
    };
    companyId = row.customer_company_id; contactId = row.customer_contact_id;
    if (row.invoice_id) {
      const { data: inv } = await db.from('invoices').select('internal_number, legal_number').eq('id', row.invoice_id).maybeSingle();
      if (inv) related = { label: 'invoice', number: inv.legal_number ?? inv.internal_number ?? null };
    }
  } else {
    const { data: row } = await db.from('orders').select('*').eq('id', id).single();
    // A purchase line shows the price WE pay the supplier; a sales line never shows cost.
    const isPo = kind === 'purchase_order';
    const { data: it } = await db.from('order_items')
      .select(`description, quantity, unit_price, ${isPo ? 'unit_cost, ' : ''}vat_category, vat_percent, net_value, vat_amount, line_total, measurement_unit_code, selected_size, selected_color, vat_exemption_category`)
      .eq('order_id', id).order('sort_order');
    items = (it ?? []).map((x: any) => {
      const { unit_cost, ...rest } = x;
      return isPo && unit_cost != null ? { ...rest, unit_price: unit_cost } : rest;
    });
    doc = {
      ...row, internal_number: row.order_number, issued_at: row.created_at, document_type: null,
      amount_paid: 0, amount_due: Number(row.total ?? 0),
    };
    companyId = isPo ? row.supplier_company_id : row.customer_company_id;
    contactId = isPo ? row.supplier_contact_id : row.customer_contact_id;
  }

  const ws = doc.workspace_id as string;
  const [{ data: fs }, { data: hr }, customer] = await Promise.all([
    db.from('finance_settings').select([...SETTINGS_FIELDS, 'business_logo_path', 'invoice_show_pay_link'].join(','))
      .eq('workspace_id', ws).maybeSingle(),
    db.from('hr_settings').select('timezone').eq('workspace_id', ws).maybeSingle(),
    partyRow(db, companyId, contactId),
  ]);

  let bankAccounts: any[] = [];
  if (kind === 'invoice' || kind === 'sales_order') {
    const { data } = await db.from('finance_bank_accounts').select('name, kind, iban, account_ref')
      .eq('workspace_id', ws).eq('is_active', true).eq('show_on_invoice', true).order('sort_order');
    bankAccounts = data ?? [];
  }

  let selfBillSupplier: any = null;
  if (doc.self_billed_supplier_company_id) {
    selfBillSupplier = await partyRow(db, doc.self_billed_supplier_company_id, null);
  }
  let addressUnit: any = null;
  if (doc.customer_address_unit_id) {
    const { data } = await db.from('crm_address_units').select(ADDRESS_UNIT_FIELDS.join(','))
      .eq('id', doc.customer_address_unit_id).maybeSingle();
    addressUnit = data;
  }
  let branch: any = null;
  if (Number(doc.branch_code ?? 0) > 0) {
    const { data } = await db.from('finance_branches').select(BRANCH_FIELDS.join(','))
      .eq('workspace_id', ws).eq('branch_code', doc.branch_code).maybeSingle();
    branch = data;
  }
  let order: any = null;
  if (doc.order_id && kind !== 'sales_order' && kind !== 'purchase_order') {
    const { data } = await db.from('orders').select('order_number, notes').eq('id', doc.order_id).maybeSingle();
    order = data;
  }

  let authCode: string | null = null;
  let providerAttribution: string | null = null;
  const subTable = SUBMISSION_TABLE[kind];
  if (doc.fiscal_mark && subTable) {
    const { data: sub } = await db.from('fiscal_submissions').select('authentication_code, connector_slug')
      .eq('document_table', subTable).eq('document_id', id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    authCode = sub?.authentication_code ?? null;
    const slug = doc.fiscal_connector_slug ?? sub?.connector_slug ?? null;
    if (slug) {
      const { data: conn } = await db.from('fiscal_connectors').select('legal_display_name, legal_website')
        .eq('slug', slug).maybeSingle();
      if (conn?.legal_display_name) providerAttribution = [conn.legal_display_name, conn.legal_website].filter(Boolean).join(' | ');
    }
  }

  let posPayments: any[] = [];
  if (kind === 'invoice') {
    const { data } = await db.from('pos_signatures')
      .select('transaction_id, signature_token, payment_amount, tip_amount, final_payment_type, payment_type, terminal_id')
      .eq('invoice_id', id).eq('status', 'completed').order('completed_at', { ascending: true });
    posPayments = data ?? [];
  }

  let logoUrl: string | null = null;
  if (fs?.business_logo_path && !doc.self_billed_supplier_company_id) {
    const { data } = await db.storage.from('generation-images').createSignedUrl(fs.business_logo_path, 60 * 60);
    logoUrl = data?.signedUrl ?? null;
  }

  return {
    kind,
    document: pick(doc, DOC_FIELDS),
    counterparty_snapshot: doc.counterparty_snapshot?.row ? { row: pick(doc.counterparty_snapshot.row, PARTY_FIELDS) } : null,
    items: items.map((x) => pick(x, ITEM_FIELDS)),
    document_taxes: documentTaxes,
    settings: pick(fs, SETTINGS_FIELDS),
    customer: pick(customer, PARTY_FIELDS),
    self_bill_supplier: pick(selfBillSupplier, PARTY_FIELDS),
    address_unit: pick(addressUnit, ADDRESS_UNIT_FIELDS),
    branch: pick(branch, BRANCH_FIELDS),
    order: order ? { order_number: order.order_number ?? null, notes: order.notes ?? null } : null,
    bank_accounts: bankAccounts,
    auth_code: authCode,
    provider_attribution: providerAttribution,
    pos_payments: posPayments,
    timezone: hr?.timezone ?? null,
    logo_url: logoUrl,
    related,
    pdf_available: kind === 'invoice' || kind === 'credit_note' || kind === 'delivery_note',
    show_pay_link: fs?.invoice_show_pay_link !== false,
  };
}

Deno.serve(withApiLogging('public-document', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  let body: { token?: string; pdf?: boolean };
  try { body = await req.json(); } catch { throw new HttpError(400, 'invalid body'); }
  const token = String(body.token ?? '').trim();
  if (!/^[0-9a-f]{32,64}$/.test(token)) throw new HttpError(404, 'This link is not valid.');

  await bootstrapForFunction();
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const hit = await resolveToken(db, token);
  if (!hit) throw new HttpError(404, 'This link is not valid.');
  if (hit.expired) throw new HttpError(410, 'This link has expired. Ask the sender for a new one.');
  if (hit.kind !== 'invoice' && hit.row.status === 'draft') throw new HttpError(404, 'This link is not valid.');

  const entityType = hit.kind === 'sales_order' || hit.kind === 'purchase_order' ? 'order' : hit.kind;

  if (body.pdf) {
    const idKey = hit.kind === 'invoice' ? 'invoice_id' : hit.kind === 'credit_note' ? 'credit_note_id'
      : hit.kind === 'delivery_note' ? 'delivery_note_id' : null;
    if (!idKey) throw new HttpError(400, 'This document has no PDF. Use Print instead.');
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/finance-invoice-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify({ [idKey]: hit.row.id }),
    });
    const out = await res.json().catch(() => null) as { pdf_url?: string; error?: string } | null;
    if (!res.ok || !out?.pdf_url) return json({ error: out?.error ?? 'The PDF could not be produced right now.' }, 502);
    recordPageEvent(db, req, 'downloaded', {
      entityType, entityId: hit.row.id, workspaceId: hit.row.workspace_id, metadata: { surface: 'document_link' },
    }).catch(() => {});
    return json({ ok: true, pdf_url: out.pdf_url });
  }

  const payload = await loadDocument(db, hit.kind, hit.row.id);
  recordPageEvent(db, req, 'viewed', {
    entityType, entityId: hit.row.id, workspaceId: hit.row.workspace_id, metadata: { surface: 'document_link' },
  }).catch(() => {});
  return json({ ok: true, ...payload });
}));
