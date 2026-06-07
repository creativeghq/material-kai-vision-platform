// deno-lint-ignore-file no-explicit-any
// Renders a customer-facing legal invoice/receipt PDF (A4) with full myDATA fields:
// issuer + establishment, customer, line items, VAT breakdown, totals, the MARK and a
// scannable QR. The field-label language is per-invoice (invoices.doc_language 'el'|'en').
//
// NOTE ON GREEK STRINGS: the label dictionary below intentionally contains Greek. This is
// a legal tax document (παραστατικό) the customer/accountant files — NOT the app UI. The
// English-only-UI rule applies to the interface, not to this generated document; the user
// explicitly asked for a per-invoice GR/EN choice. A Unicode font is embedded so Greek
// glyphs (and Greek customer names/addresses, regardless of language) render correctly.
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import qrcode from 'qrcode-generator';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';

const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts/ttf/DejaVuSans.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts/ttf/DejaVuSans-Bold.ttf',
};
let _fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;
async function loadFonts() {
  if (_fontCache) return _fontCache;
  const [r, b] = await Promise.all([fetch(FONT_URLS.regular), fetch(FONT_URLS.bold)]);
  if (!r.ok || !b.ok) throw new Error('failed to load PDF fonts');
  _fontCache = { regular: new Uint8Array(await r.arrayBuffer()), bold: new Uint8Array(await b.arrayBuffer()) };
  return _fontCache;
}

type Lang = 'el' | 'en';
const LABELS: Record<Lang, Record<string, string>> = {
  el: {
    invoice: 'ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ', service: 'ΤΙΜΟΛΟΓΙΟ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ',
    receipt: 'ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ', creditNote: 'ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ', deliveryNote: 'ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ',
    issuer: 'ΕΚΔΟΤΗΣ', customer: 'ΠΕΛΑΤΗΣ', vatNo: 'ΑΦΜ', taxOffice: 'ΔΟΥ', profession: 'Δραστηριότητα',
    phone: 'Τηλ.', email: 'Email', establishment: 'Εγκατάσταση',
    number: 'Αριθμός', series: 'Σειρά', date: 'Ημερομηνία', due: 'Λήξη',
    descr: 'Περιγραφή', qty: 'Ποσ.', unit: 'Μ.Μ.', unitPrice: 'Τιμή Μον.', net: 'Καθαρή Αξία',
    vatPct: 'ΦΠΑ%', vatAmt: 'Αξία ΦΠΑ', lineTotal: 'Σύνολο',
    vatAnalysis: 'Ανάλυση ΦΠΑ', subtotalNet: 'Καθαρή Αξία', totalVat: 'Σύνολο ΦΠΑ',
    withheld: 'Παρακρατήσεις', total: 'Πληρωτέο Ποσό',
    fees: 'Τέλη', stamp: 'Χαρτόσημο', otherTaxes: 'Λοιποί Φόροι', deductions: 'Κρατήσεις',
    digitalFee: 'Ψηφιακό Τέλος Συναλλαγής', related: 'Σχετ. Παραστατικό',
    paymentMethod: 'Τρόπος Πληρωμής', bank: 'Τραπεζικός Λογαριασμός', registry: 'ΓΕΜΗ', website: 'Ιστότοπος',
    mark: 'ΜΑΡΚ', uid: 'UID', verify: 'Σαρώστε για επαλήθευση στο myDATA',
    movement: 'ΣΤΟΙΧΕΙΑ ΔΙΑΚΙΝΗΣΗΣ', loadingPlace: 'Τόπος φόρτωσης', deliveryPlace: 'Τόπος παράδοσης',
    vehicle: 'Όχημα', purpose: 'Σκοπός', notes: 'Σημειώσεις', page: 'Σελίδα', of: 'από',
  },
  en: {
    invoice: 'SALES INVOICE', service: 'SERVICE INVOICE',
    receipt: 'RETAIL RECEIPT', creditNote: 'CREDIT NOTE', deliveryNote: 'DELIVERY NOTE',
    issuer: 'ISSUER', customer: 'CUSTOMER', vatNo: 'VAT No.', taxOffice: 'Tax office', profession: 'Activity',
    phone: 'Tel.', email: 'Email', establishment: 'Establishment',
    number: 'Number', series: 'Series', date: 'Date', due: 'Due',
    descr: 'Description', qty: 'Qty', unit: 'Unit', unitPrice: 'Unit price', net: 'Net',
    vatPct: 'VAT%', vatAmt: 'VAT', lineTotal: 'Total',
    vatAnalysis: 'VAT analysis', subtotalNet: 'Net total', totalVat: 'Total VAT',
    withheld: 'Withholding', total: 'Amount due',
    fees: 'Fees', stamp: 'Stamp duty', otherTaxes: 'Other taxes', deductions: 'Deductions',
    digitalFee: 'Digital transaction fee', related: 'Related doc',
    paymentMethod: 'Payment method', bank: 'Bank account', registry: 'Reg. no.', website: 'Website',
    mark: 'MARK', uid: 'UID', verify: 'Scan to verify on myDATA',
    movement: 'TRANSPORT DETAILS', loadingPlace: 'Loading place', deliveryPlace: 'Delivery place',
    vehicle: 'Vehicle', purpose: 'Purpose', notes: 'Notes', page: 'Page', of: 'of',
  },
};

function docTitle(documentType: string | null, L: Record<string, string>): string {
  switch (documentType) {
    case '2.1': case '2.2': case '2.3': case '2.4': return L.service;
    case '11.1': case '11.2': case '11.3': case '11.4': case '11.5': return L.receipt;
    case '5.1': case '5.2': return L.creditNote;
    case '9.3': return L.deliveryNote;
    default: return L.invoice;
  }
}

const A4 = { w: 595.28, h: 841.89 };
const M = 40;
const INK = rgb(0.12, 0.12, 0.12);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.82, 0.82, 0.82);
const HEADBG = rgb(0.95, 0.93, 0.95);

function fmtMoney(n: any, currency: string, lang: Lang): string {
  const v = Number(n ?? 0);
  const s = new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const sym = currency === 'EUR' ? '€' : currency;
  return `${s} ${sym}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner', 'finance'] });
  if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let kind: 'invoice' | 'credit_note' | 'delivery_note' = 'invoice';
  let docId = '';
  let regenerate = false;
  try {
    const body = await req.json();
    regenerate = !!body.regenerate;
    if (body.credit_note_id) { kind = 'credit_note'; docId = body.credit_note_id; }
    else if (body.delivery_note_id) { kind = 'delivery_note'; docId = body.delivery_note_id; }
    else if (body.invoice_id) { kind = 'invoice'; docId = body.invoice_id; }
    else return json({ error: 'invoice_id, credit_note_id or delivery_note_id is required' }, 400);
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  const TABLE = kind === 'credit_note' ? 'credit_notes' : kind === 'delivery_note' ? 'delivery_notes' : 'invoices';
  const OUT = kind === 'credit_note' ? 'credit-note-output' : kind === 'delivery_note' ? 'delivery-note-output' : 'invoice-output';
  const PREFIX = kind === 'credit_note' ? 'cn' : kind === 'delivery_note' ? 'dn' : 'inv';

  const { data: row } = await supabase.from(TABLE).select('*').eq('id', docId).single();
  if (!row) return json({ error: `${kind} not found` }, 404);

  if (!regenerate && row.pdf_storage_path && row.pdf_generation_status === 'completed') {
    const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(row.pdf_storage_path, 60 * 60 * 24 * 7);
    return json({ ok: true, pdf_url: signed?.signedUrl, pdf_storage_path: row.pdf_storage_path, cached: true });
  }

  try {
    await supabase.from(TABLE).update({ pdf_generation_status: 'generating' }).eq('id', docId);

    // Normalize each document kind into the shape buildPdf expects.
    let inv: any = row;
    let items: any[] = [];
    if (kind === 'invoice') {
      const { data } = await supabase.from('invoice_items').select('*').eq('invoice_id', docId).order('added_at');
      items = data ?? [];
    } else if (kind === 'credit_note') {
      const [{ data: cnItems }, { data: srcInv }] = await Promise.all([
        supabase.from('credit_note_items').select('*').eq('credit_note_id', docId).order('created_at'),
        row.invoice_id ? supabase.from('invoices').select('customer_company_id, customer_contact_id, vat_rate').eq('id', row.invoice_id).maybeSingle() : Promise.resolve({ data: null } as any),
      ]);
      items = cnItems ?? [];
      inv = {
        ...row, internal_number: row.credit_note_number, vat_rate: srcInv?.vat_rate ?? 24,
        customer_company_id: srcInv?.customer_company_id ?? null, customer_contact_id: srcInv?.customer_contact_id ?? null,
        related_document: row.correlated_mark ?? null, notes: row.reason ?? null,
      };
    } else {
      const { data } = await supabase.from('delivery_note_items').select('*').eq('delivery_note_id', docId).order('created_at');
      items = (data ?? []).map((it: any) => ({ ...it, unit_price: 0, net_value: 0, line_total: 0, vat_category: 8 }));
      inv = {
        ...row, internal_number: row.delivery_note_number, document_type: '9.3', total: 0, currency: 'EUR',
        has_shipping: true, vat_rate: 0,
      };
    }

    const { data: fs } = await supabase.from('finance_settings').select('*').eq('workspace_id', inv.workspace_id).maybeSingle();

    let customer: any = null;
    if (inv.customer_company_id) {
      const { data } = await supabase.from('crm_companies').select('*').eq('id', inv.customer_company_id).maybeSingle();
      customer = data;
    } else if (inv.customer_contact_id) {
      const { data } = await supabase.from('crm_contacts').select('*').eq('id', inv.customer_contact_id).maybeSingle();
      customer = data;
    }
    let branch: any = null;
    if (Number(inv.branch_code ?? 0) > 0) {
      const { data } = await supabase.from('finance_branches').select('*').eq('workspace_id', inv.workspace_id).eq('branch_code', inv.branch_code).maybeSingle();
      branch = data;
    }

    // Business logo (generation-images/business-logos/…) — embedded in the header.
    let logo: Uint8Array | null = null;
    if (fs?.business_logo_path) {
      try {
        const { data: lf } = await supabase.storage.from('generation-images').download(fs.business_logo_path);
        if (lf) logo = new Uint8Array(await lf.arrayBuffer());
      } catch { /* logo optional */ }
    }

    const lang: Lang = inv.doc_language === 'en' ? 'en' : 'el';
    const pdfBytes = await buildPdf({ inv, items, fs, customer, branch, lang, logo });

    const path = `${OUT}/${docId}/${PREFIX}-${docId}.pdf`;
    const { error: upErr } = await supabase.storage.from('pdf-documents').upload(path, pdfBytes, { upsert: true, contentType: 'application/pdf' });
    if (upErr) throw upErr;

    await supabase.from(TABLE).update({
      pdf_storage_path: path, pdf_generation_status: 'completed', pdf_generated_at: new Date().toISOString(),
    }).eq('id', docId);

    const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(path, 60 * 60 * 24 * 7);
    return json({ ok: true, pdf_url: signed?.signedUrl, pdf_storage_path: path });
  } catch (err: any) {
    await supabase.from(TABLE).update({ pdf_generation_status: 'failed' }).eq('id', docId);
    return json({ ok: false, error: err?.message ?? 'pdf generation failed' }, 500);
  }
});

async function buildPdf(d: { inv: any; items: any[]; fs: any; customer: any; branch: any; lang: Lang; logo?: Uint8Array | null }): Promise<Uint8Array> {
  const { inv, items, fs, customer, branch, lang, logo } = d;
  const L = LABELS[lang];
  const currency = inv.currency ?? 'EUR';
  const money = (n: any) => fmtMoney(n, currency, lang);

  const fonts = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  let page = pdf.addPage([A4.w, A4.h]);
  let y = A4.h - M;
  const right = A4.w - M;

  const text = (s: any, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(String(s ?? ''), { x, y: yy, size, font: f, color });
  const textR = (s: any, xRight: number, yy: number, size: number, f: PDFFont = font, color = INK) => {
    const str = String(s ?? '');
    page.drawText(str, { x: xRight - f.widthOfTextAtSize(str, size), y: yy, size, font: f, color });
  };
  const wrap = (s: string, f: PDFFont, size: number, maxW: number): string[] => {
    const words = String(s ?? '').split(/\s+/);
    const lines: string[] = []; let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  };

  // ── Header: logo + issuer (left) + document title (right) ──
  if (logo && inv.logo_mode !== 'none') {
    try {
      const img = await (async () => { try { return await pdf.embedPng(logo); } catch { return await pdf.embedJpg(logo); } })();
      const maxW = 120, maxH = 46;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      page.drawImage(img, { x: M, y: y - img.height * scale + 6, width: img.width * scale, height: img.height * scale });
      y -= img.height * scale - 6;
    } catch { /* logo optional */ }
  }
  const issuerName = fs?.business_name || '';
  text(issuerName, M, y - 4, 16, bold);
  textR(docTitle(inv.document_type, L), right, y - 2, 18, bold, rgb(0.48, 0.12, 0.36));
  y -= 22;
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
  ].filter(Boolean);
  for (const l of issuerLines) { text(l, M, y, 8.5, font, MUTED); y -= 11; }

  // Document meta (right column, under the title)
  let my = A4.h - M - 26;
  const metaRows: [string, string][] = [
    [L.number, String(inv.internal_number ?? inv.legal_number ?? '')],
    inv.series ? [L.series, String(inv.series)] : ['', ''],
    [L.date, inv.issued_at ? new Date(inv.issued_at).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB') : ''],
    inv.due_at ? [L.due, String(inv.due_at)] : ['', ''],
    inv.related_document ? [L.related, String(inv.related_document)] : ['', ''],
  ].filter((r) => r[0]) as [string, string][];
  for (const [k, v] of metaRows) {
    textR(k, right - 90, my, 8.5, font, MUTED);
    textR(v, right, my, 9, bold);
    my -= 12;
  }

  y = Math.min(y, my) - 6;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.7, color: LINE });
  y -= 16;

  // ── Customer block ──
  text(L.customer, M, y, 9, bold, MUTED);
  y -= 13;
  const custName = customer ? (customer.name || [customer.first_name, customer.last_name].filter(Boolean).join(' ')) : '—';
  text(custName, M, y, 11, bold);
  y -= 13;
  const custLines = customer ? [
    [customer.street ?? customer.address, customer.street_number].filter(Boolean).join(' '),
    [customer.postal_code, customer.city].filter(Boolean).join(' '),
    customer.vat_number ? `${L.vatNo}: ${customer.vat_number}` : '',
    customer.tax_office ? `${L.taxOffice}: ${customer.tax_office}` : '',
  ].filter(Boolean) : [];
  for (const l of custLines) { text(l, M, y, 8.5, font, MUTED); y -= 11; }
  y -= 8;

  // ── Items table ──
  const cols = { descr: M, qty: 300, unit: 340, price: 390, net: 450, vatp: 500, total: right };
  const drawHead = () => {
    page.drawRectangle({ x: M, y: y - 3, width: right - M, height: 16, color: HEADBG });
    text(L.descr, cols.descr + 2, y, 8, bold);
    textR(L.qty, cols.qty + 28, y, 8, bold);
    text(L.unit, cols.unit, y, 8, bold);
    textR(L.unitPrice, cols.price + 52, y, 8, bold);
    textR(L.net, cols.net + 42, y, 8, bold);
    textR(L.vatPct, cols.vatp + 22, y, 8, bold);
    textR(L.lineTotal, cols.total, y, 8, bold);
    y -= 18;
  };
  const newPage = () => { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M; };
  drawHead();

  const vatByRate: Record<string, { net: number; vat: number }> = {};
  let totNet = 0, totVat = 0;
  // myDATA VAT category → percent (used when a line carries an explicit category).
  const VAT_PCT_BY_CAT: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };
  const UNIT_LABEL: Record<number, string> = { 1: 'pcs', 2: 'kg', 3: 'lt', 4: 'm', 5: 'm²', 6: 'm³' };
  for (const it of items) {
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

    const dLines = wrap(it.description ?? 'Item', font, 8.5, cols.qty - cols.descr - 10);
    const detail = [[it.selected_color, it.selected_size].filter(Boolean).join(' / '), it.line_comments].filter(Boolean).join(' — ');
    const rowH = Math.max(13, dLines.length * 10 + (detail ? 10 : 0) + 3);
    if (y - rowH < M + 150) { newPage(); drawHead(); }
    let ly = y;
    for (const dl of dLines) { text(dl, cols.descr + 2, ly, 8.5); ly -= 10; }
    if (detail) { text(detail, cols.descr + 2, ly, 7.5, font, MUTED); ly -= 10; }
    const unitLabel = it.unit ?? (it.measurement_unit_code != null ? UNIT_LABEL[Number(it.measurement_unit_code)] : '') ?? '';
    textR(qty, cols.qty + 28, y, 8.5);
    text(unitLabel, cols.unit, y, 8.5);
    textR(money(it.unit_price ?? 0), cols.price + 52, y, 8.5);
    textR(money(net), cols.net + 42, y, 8.5);
    textR(`${pct}%`, cols.vatp + 22, y, 8.5);
    textR(money(net + vat), cols.total, y, 8.5);
    y -= rowH;
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.4, color: LINE });
  }

  // ── Totals + VAT analysis ──
  if (y < M + 170) newPage();
  y -= 14;
  // VAT analysis (left)
  let vy = y;
  text(L.vatAnalysis, M, vy, 8, bold, MUTED); vy -= 12;
  for (const [pct, agg] of Object.entries(vatByRate)) {
    text(`${L.net} ${pct}%: ${money(agg.net)}   ${L.vatAmt}: ${money(agg.vat)}`, M, vy, 8, font, MUTED);
    vy -= 11;
  }

  // Totals (right box)
  const withheld = Number(inv.total_withheld_amount ?? 0);
  const grand = Number(inv.total ?? totNet + totVat - withheld);
  const boxX = right - 220;
  const row = (k: string, v: string, b = false) => {
    textR(k, right - 110, y, b ? 10 : 9, b ? bold : font, b ? INK : MUTED);
    textR(v, right, y, b ? 11 : 9.5, b ? bold : font);
    y -= b ? 16 : 13;
  };
  const fees = Number(inv.total_fees_amount ?? 0), stamp = Number(inv.total_stamp_duty_amount ?? 0);
  const otherTax = Number(inv.total_other_taxes_amount ?? 0), deductions = Number(inv.total_deductions_amount ?? 0);
  row(L.subtotalNet, money(totNet));
  row(L.totalVat, money(totVat));
  const digitalFee = Number(inv.digital_transaction_fee ?? 0);
  if (fees > 0) row(L.fees, money(fees));
  if (stamp > 0) row(L.stamp, money(stamp));
  if (otherTax > 0) row(L.otherTaxes, money(otherTax));
  if (digitalFee > 0) row(L.digitalFee, money(digitalFee));
  if (deductions > 0) row(L.deductions, `- ${money(deductions)}`);
  if (withheld > 0) row(L.withheld, `- ${money(withheld)}`);
  page.drawLine({ start: { x: boxX, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.7, color: LINE });
  y -= 4;
  row(L.total, money(grand), true);
  y = Math.min(y, vy) - 6;

  // ── Payment method + bank details ──
  const PAY_LABELS: Record<number, string> = { 1: 'Cash', 2: 'Check', 3: 'On credit', 4: 'Web banking', 5: 'POS / e-POS', 6: 'IRIS', 7: 'Domestic account', 8: 'Foreign account' };
  const payBits: string[] = [];
  if (inv.payment_method_code) payBits.push(`${L.paymentMethod}: ${PAY_LABELS[Number(inv.payment_method_code)] ?? inv.payment_method_code}`);
  if (inv.payment_method_info) payBits.push(String(inv.payment_method_info));
  const bank = [fs?.bank_name, fs?.bank_iban ? `IBAN ${fs.bank_iban}` : '', fs?.bank_bic ? `BIC ${fs.bank_bic}` : '', fs?.bank_beneficiary].filter(Boolean).join('  ·  ');
  if (payBits.length || bank) {
    if (y < M + 110) newPage();
    for (const pb of payBits) { text(pb, M, y, 8.5, font, MUTED); y -= 11; }
    if (bank) { text(`${L.bank}: ${bank}`, M, y, 8.5, font, MUTED); y -= 11; }
    y -= 4;
  }

  // ── Movement block (9.3 / invoice-with-shipping) ──
  if (inv.has_shipping) {
    if (y < M + 120) newPage();
    page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.5, color: LINE }); y -= 14;
    text(L.movement, M, y, 9, bold, MUTED); y -= 13;
    const mv = [
      inv.ship_from ? `${L.loadingPlace}: ${inv.ship_from}` : '',
      inv.ship_to ? `${L.deliveryPlace}: ${inv.ship_to}` : '',
      inv.vehicle_number ? `${L.vehicle}: ${inv.vehicle_number}` : '',
      inv.move_purpose ? `${L.purpose}: ${inv.move_purpose}` : '',
    ].filter(Boolean);
    for (const m of mv) { text(m, M, y, 8.5, font, MUTED); y -= 11; }
    y -= 4;
  }

  // ── Notes / terms (gated by print_terms) + info box ──
  if (inv.print_terms !== false && inv.notes) {
    if (y < M + 90) newPage();
    text(L.notes, M, y, 8, bold, MUTED); y -= 12;
    for (const nl of wrap(inv.notes, font, 8.5, right - M - 130)) { text(nl, M, y, 8.5, font, MUTED); y -= 11; }
    y -= 2;
  }
  if (inv.info_box) {
    if (y < M + 80) newPage();
    for (const nl of wrap(inv.info_box, font, 8, right - M - 130)) { text(nl, M, y, 8, font, MUTED); y -= 10; }
  }

  // ── MARK + QR (bottom of the last page; QR gated by print_online_code) ──
  if (inv.fiscal_mark) {
    const qy = Math.max(M + 90, 120);
    text(L.mark, M, qy + 28, 8, bold, MUTED);
    text(String(inv.fiscal_mark), M, qy + 16, 10, bold);
    if (inv.fiscal_uid) { text(`${L.uid}: ${inv.fiscal_uid}`, M, qy + 4, 8, font, MUTED); }
    if (inv.fiscal_qr_url && inv.print_online_code !== false) {
      drawQr(page, String(inv.fiscal_qr_url), right - 90, qy - 10, 86);
      textR(L.verify, right, qy - 22, 7, font, MUTED);
    }
  }

  // ── Footer page numbers ──
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawText(`${L.page} ${i + 1} ${L.of} ${pages.length}`, {
      x: A4.w / 2 - 30, y: 24, size: 7, font, color: MUTED,
    });
  });

  return await pdf.save();
}

// Draw a QR code (from a URL) as filled squares — no image dependency.
function drawQr(page: PDFPage, data: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  const count = qr.getModuleCount();
  const cell = size / count;
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        page.drawRectangle({ x: x + c * cell, y: y + size - (r + 1) * cell, width: cell, height: cell, color: rgb(0, 0, 0) });
      }
    }
  }
}
