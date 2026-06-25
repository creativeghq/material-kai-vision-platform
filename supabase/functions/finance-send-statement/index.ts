// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

// Sales/Finance — render and email a party (customer or supplier) running ledger
// statement (Καρτέλα) PDF.
//
// The PDF is a full account ledger for a date range: header (issuer + recipient
// identity, period, currency), an opening-balance carry-forward line (Προηγούμενα
// Σύνολα), one row per transaction with debit/credit + progressive (running)
// debit/credit totals + running balance, and a totals/closing-balance footer.
// Mailed via the platform email-api edge function.
//
// Two modes:
//   • Single (default): { party_type, party_id, email?, dry_run?, side?, from?, to?, lang? }
//     — user/role auth, scoped to the party's workspace.
//   • Cron batch: { mode:'cron_batch' } with header x-cron-secret — iterates every
//     workspace whose finance_settings.auto_statement_enabled is on and whose schedule
//     is due, and emails each eligible party their statement. Off by default.

const PAGE_W = 595.28; // A4 portrait
const PAGE_H = 841.89;
const MARGIN = 40;
const COLOR_DARK = rgb(0.1, 0.1, 0.18);
const COLOR_GRAY = rgb(0.42, 0.42, 0.42);
const COLOR_RED = rgb(0.78, 0.18, 0.18);
const COLOR_ACCENT = rgb(0.55, 0.27, 0.45);
const COLOR_LINE = rgb(0.75, 0.75, 0.78);

type Lang = 'el' | 'en';
type Side = 'customer' | 'supplier';

const LABELS: Record<Lang, Record<string, string>> = {
  el: {
    titleCustomer: 'Καρτέλα Πελάτη', titleSupplier: 'Καρτέλα Προμηθευτή',
    period: 'Περίοδος', from: 'Από', to: 'Έως', issuer: 'Εκδότης', recipient: 'Στοιχεία',
    vatNo: 'ΑΦΜ', taxOffice: 'ΔΟΥ', phone: 'Τηλέφωνο', email: 'Email', currency: 'Νόμισμα',
    date: 'Ημ/νία', type: 'Τύπος', document: 'Παραστατικό',
    debit: 'Χρέωση', credit: 'Πίστωση', progrDebit: 'Προοδ. Χρέωση', progrCredit: 'Προοδ. Πίστωση', balance: 'Υπόλοιπο',
    prevTotals: 'Προηγούμενα Σύνολα', totals: 'Σύνολα', closing: 'Υπόλοιπο',
    owesUs: 'Χρεωστικό υπόλοιπο (οφείλει)', weOwe: 'Πιστωτικό υπόλοιπο (οφείλουμε)',
    payByCard: 'Πληρωμή με κάρτα', noTx: 'Καμία κίνηση στην περίοδο.',
    kind_invoice: 'Τιμολόγιο', kind_credit_note: 'Πιστωτικό', kind_payment: 'Είσπραξη/Πληρωμή',
    kind_supplier_bill: 'Τιμολόγιο προμηθευτή', kind_supplier_credit_note: 'Πιστωτικό προμηθευτή',
    statementDate: 'Ημ/νία έκδοσης', footer: 'Παρακαλούμε απαντήστε σε αυτό το email για οποιαδήποτε διευκρίνιση.',
  },
  en: {
    titleCustomer: 'Customer Statement', titleSupplier: 'Supplier Statement',
    period: 'Period', from: 'From', to: 'To', issuer: 'From', recipient: 'To',
    vatNo: 'VAT', taxOffice: 'Tax office', phone: 'Phone', email: 'Email', currency: 'Currency',
    date: 'Date', type: 'Type', document: 'Document',
    debit: 'Debit', credit: 'Credit', progrDebit: 'Progr. debit', progrCredit: 'Progr. credit', balance: 'Balance',
    prevTotals: 'Opening balance', totals: 'Totals', closing: 'Closing balance',
    owesUs: 'Outstanding (owes us)', weOwe: 'Credit balance (we owe)',
    payByCard: 'Pay by card', noTx: 'No transactions in this period.',
    kind_invoice: 'Invoice', kind_credit_note: 'Credit note', kind_payment: 'Payment',
    kind_supplier_bill: 'Supplier bill', kind_supplier_credit_note: 'Supplier credit note',
    statementDate: 'Statement date', footer: 'Please reply to this email with any questions or to confirm settlement.',
  },
};

// Open Sans (full Greek + Latin + Cyrillic) — the platform-wide typeface. Greek
// customer names/labels would throw under pdf-lib's WinAnsi standard fonts, so embed
// the Unicode TTF. SemiBold is the document "bold" (the app's heaviest weight).
const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/gh/googlefonts/opensans@main/fonts/ttf/OpenSans-Regular.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/googlefonts/opensans@main/fonts/ttf/OpenSans-SemiBold.ttf',
};
let _fontCache: { regular: Uint8Array; bold: Uint8Array } | null = null;
async function loadFonts() {
  if (_fontCache) return _fontCache;
  const [r, b] = await Promise.all([fetch(FONT_URLS.regular), fetch(FONT_URLS.bold)]);
  if (!r.ok || !b.ok) throw new Error('failed to load PDF fonts');
  _fontCache = { regular: new Uint8Array(await r.arrayBuffer()), bold: new Uint8Array(await b.arrayBuffer()) };
  return _fontCache;
}

function json(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function fmtMoney(value: number, currency = 'EUR', lang: Lang = 'el'): string {
  const locale = lang === 'el' ? 'el-GR' : 'en-IE';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(value || 0);
}

function fmtDate(d: string | null, lang: Lang = 'el'): string {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB');
}

async function loadBackdrop(url: string): Promise<Uint8Array | null> {
  try { const r = await fetch(url); if (!r.ok) return null; return new Uint8Array(await r.arrayBuffer()); } catch { return null; }
}

interface LedgerEntry { date: string | null; kind: string; doc: string | null; debit: number; credit: number; currency: string | null }
interface LedgerData { opening: number; rows: LedgerEntry[]; currency: string }

// Build the chronological debit/credit ledger for a party + the opening balance
// carried forward from before `from`. Runs under the service role (RLS bypassed),
// scoped explicitly by workspace_id + party so there is no cross-tenant leak.
async function loadLedger(
  supabase: SupabaseClient, workspaceId: string, side: Side, partyType: 'company' | 'contact', partyId: string,
  from: string, to: string, baseCurrency: string,
): Promise<LedgerData> {
  const all: LedgerEntry[] = [];
  const compCol = partyType === 'company';

  if (side === 'customer') {
    const invQ = supabase.from('invoices')
      .select('id, issued_at, internal_number, total, currency, status')
      .eq('workspace_id', workspaceId)
      .eq(compCol ? 'customer_company_id' : 'customer_contact_id', partyId);
    const { data: invs } = await invQ;
    const invoices = (invs ?? []).filter((i: any) => i.status !== 'draft' && i.status !== 'void');
    for (const i of invoices) all.push({ date: i.issued_at, kind: 'invoice', doc: i.internal_number, debit: Number(i.total || 0), credit: 0, currency: i.currency });

    const invoiceIds = invoices.map((i: any) => i.id);
    if (invoiceIds.length > 0) {
      const { data: cns } = await supabase.from('credit_notes')
        .select('issued_at, credit_note_number, total, currency, status, invoice_id')
        .eq('workspace_id', workspaceId).in('invoice_id', invoiceIds);
      for (const c of (cns ?? [])) {
        if ((c.status ?? 'issued') === 'void') continue;
        all.push({ date: c.issued_at, kind: 'credit_note', doc: c.credit_note_number, debit: 0, credit: Number(c.total || 0), currency: c.currency });
      }
    }

    const { data: pays } = await supabase.from('payments')
      .select('paid_at, reference, amount, currency, direction')
      .eq('workspace_id', workspaceId).eq('direction', 'in')
      .eq(compCol ? 'counterparty_company_id' : 'counterparty_contact_id', partyId);
    for (const p of (pays ?? [])) all.push({ date: p.paid_at, kind: 'payment', doc: p.reference, debit: 0, credit: Number(p.amount || 0), currency: p.currency });
  } else {
    const { data: bills } = await supabase.from('supplier_bills')
      .select('issued_at, supplier_bill_number, total, currency, status')
      .eq('workspace_id', workspaceId)
      .eq(compCol ? 'supplier_company_id' : 'supplier_contact_id', partyId);
    for (const b of (bills ?? [])) {
      if (b.status === 'void') continue;
      all.push({ date: b.issued_at, kind: 'supplier_bill', doc: b.supplier_bill_number, debit: 0, credit: Number(b.total || 0), currency: b.currency });
    }

    const { data: scns } = await supabase.from('supplier_credit_notes')
      .select('issued_at, supplier_credit_note_number, total, currency, status')
      .eq('workspace_id', workspaceId)
      .eq(compCol ? 'supplier_company_id' : 'supplier_contact_id', partyId);
    for (const s of (scns ?? [])) {
      if (s.status === 'void') continue;
      all.push({ date: s.issued_at, kind: 'supplier_credit_note', doc: s.supplier_credit_note_number, debit: Number(s.total || 0), credit: 0, currency: s.currency });
    }

    const { data: pays } = await supabase.from('payments')
      .select('paid_at, reference, amount, currency, direction')
      .eq('workspace_id', workspaceId).eq('direction', 'out')
      .eq(compCol ? 'counterparty_company_id' : 'counterparty_contact_id', partyId);
    for (const p of (pays ?? [])) all.push({ date: p.paid_at, kind: 'payment', doc: p.reference, debit: Number(p.amount || 0), credit: 0, currency: p.currency });
  }

  const fromD = from, toD = to;
  const dateOf = (e: LedgerEntry) => (e.date ? e.date.slice(0, 10) : null);
  let opening = 0;
  const rows: LedgerEntry[] = [];
  for (const e of all) {
    const d = dateOf(e);
    if (d && d < fromD) opening += e.debit - e.credit;
    else if (d && d >= fromD && d <= toD) rows.push(e);
    else if (!d) rows.push(e); // undated entries surface in-period rather than vanish
  }
  rows.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const currency = all.find((e) => e.currency)?.currency ?? baseCurrency ?? 'EUR';
  return { opening, rows, currency };
}

async function fetchPartyDetails(supabase: SupabaseClient, partyType: 'company' | 'contact', partyId: string): Promise<any> {
  const table = partyType === 'company' ? 'crm_companies' : 'crm_contacts';
  const { data } = await supabase.from(table).select('*').eq('id', partyId).maybeSingle();
  return data ?? {};
}

interface BuildOpts { party: any; details: any; settings: any; ledger: LedgerData; side: Side; from: string; to: string; lang: Lang; backdrop: any }

async function buildStatementPdf(opts: BuildOpts): Promise<{ bytes: Uint8Array; pages: number }> {
  const { party, details, settings, ledger, side, from, to, lang } = opts;
  const L = LABELS[lang];
  const cur = ledger.currency;
  const money = (n: number) => fmtMoney(n, cur, lang);

  const fonts = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });

  let backdrop: any = null;
  if (opts.backdrop) {
    try { backdrop = await pdf.embedPng(opts.backdrop); }
    catch { try { backdrop = await pdf.embedJpg(opts.backdrop); } catch { /* ignore */ } }
  }

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  const drawBackdrop = (p: PDFPage) => { if (backdrop) p.drawImage(backdrop, { x: 0, y: 0, width: PAGE_W, height: PAGE_H }); };
  drawBackdrop(page);
  let y = PAGE_H - MARGIN;

  const text = (s: any, x: number, yy: number, size: number, f: PDFFont = font, color = COLOR_DARK) =>
    page.drawText(String(s ?? ''), { x, y: yy, size, font: f, color });
  const textR = (s: any, xRight: number, yy: number, size: number, f: PDFFont = font, color = COLOR_DARK) => {
    const str = String(s ?? '');
    page.drawText(str, { x: xRight - f.widthOfTextAtSize(str, size), y: yy, size, font: f, color });
  };
  const textC = (s: string, cx: number, yy: number, size: number, f: PDFFont = font, color = COLOR_DARK) => {
    page.drawText(s, { x: cx - f.widthOfTextAtSize(s, size) / 2, y: yy, size, font: f, color });
  };

  // Title + period
  const title = side === 'customer' ? L.titleCustomer : L.titleSupplier;
  textC(title, PAGE_W / 2, y - 6, 18, bold, COLOR_DARK);
  y -= 26;
  textC(`${L.from} ${fmtDate(from, lang)}  ${L.to} ${fmtDate(to, lang)}`, PAGE_W / 2, y, 10, font, COLOR_GRAY);
  y -= 24;

  // Two identity columns: issuer (left) + recipient (right)
  const colTopY = y;
  const issuerLines = [
    settings.business_name,
    [settings.business_address || settings.business_street_number ? [settings.business_address, settings.business_street_number].filter(Boolean).join(' ') : null].filter(Boolean).join(''),
    [settings.business_postal_code, settings.business_city].filter(Boolean).join(' '),
    settings.business_vat ? `${L.vatNo}: ${settings.business_vat}` : '',
    settings.business_tax_office ? `${L.taxOffice}: ${settings.business_tax_office}` : '',
    settings.business_phone || settings.contact_phone || '',
    settings.business_email || settings.contact_email || '',
  ].filter((l) => l && String(l).trim());

  const recName = party.display_name ?? details.name ?? [details.first_name, details.last_name].filter(Boolean).join(' ');
  const recAddr1 = [details.street, details.street_number].filter(Boolean).join(' ') || details.address || '';
  const recAddr2 = [details.postal_code, details.city].filter(Boolean).join(' ');
  const recipientLines = [
    recName,
    recAddr1, recAddr2,
    details.vat_number ? `${L.vatNo}: ${details.vat_number}` : '',
    details.tax_office ? `${L.taxOffice}: ${details.tax_office}` : '',
    details.phone ? `${L.phone}: ${details.phone}` : '',
    party.email ? `${L.email}: ${party.email}` : '',
  ].filter((l) => l && String(l).trim());

  text(L.issuer, MARGIN, colTopY, 9, bold, COLOR_ACCENT);
  let ly = colTopY - 13;
  for (const line of issuerLines) { text(line, MARGIN, ly, 8.5, font, COLOR_GRAY); ly -= 11; }

  const rx = PAGE_W / 2 + 10;
  text(L.recipient, rx, colTopY, 9, bold, COLOR_ACCENT);
  let ry = colTopY - 13;
  text(recName, rx, ry, 9.5, bold, COLOR_DARK); ry -= 12;
  for (const line of recipientLines.slice(1)) { text(line, rx, ry, 8.5, font, COLOR_GRAY); ry -= 11; }

  y = Math.min(ly, ry) - 8;
  text(`${L.currency}: ${cur}   ·   ${L.statementDate}: ${fmtDate(new Date().toISOString(), lang)}`, MARGIN, y, 8.5, font, COLOR_GRAY);
  y -= 16;

  // Ledger table -----------------------------------------------------------
  // [Date, Type, Document, Debit, Credit, Progr.Debit, Progr.Credit, Balance]
  const usable = PAGE_W - 2 * MARGIN; // ~515
  const W = [52, 78, 85, 60, 60, 60, 60, usable - (52 + 78 + 85 + 60 + 60 + 60 + 60)];
  const xAt = (i: number) => MARGIN + W.slice(0, i).reduce((a, b) => a + b, 0);
  const xEnd = (i: number) => xAt(i) + W[i];
  const SIZE = 7.5;
  const ROW_H = 13;

  const drawHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - 2, width: usable, height: 14, color: rgb(0.94, 0.94, 0.96) });
    text(L.date, xAt(0) + 2, y + 1, SIZE, bold);
    text(L.type, xAt(1) + 2, y + 1, SIZE, bold);
    text(L.document, xAt(2) + 2, y + 1, SIZE, bold);
    textR(L.debit, xEnd(3) - 2, y + 1, SIZE, bold);
    textR(L.credit, xEnd(4) - 2, y + 1, SIZE, bold);
    textR(L.progrDebit, xEnd(5) - 2, y + 1, SIZE, bold);
    textR(L.progrCredit, xEnd(6) - 2, y + 1, SIZE, bold);
    textR(L.balance, xEnd(7) - 2, y + 1, SIZE, bold);
    y -= 16;
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    drawBackdrop(page);
    y = PAGE_H - MARGIN;
    drawHeader();
  };

  const truncate = (s: string, f: PDFFont, size: number, maxW: number) => {
    let str = String(s ?? '');
    while (str.length > 1 && f.widthOfTextAtSize(str, size) > maxW) str = str.slice(0, -1);
    return str;
  };

  drawHeader();

  // Opening balance line (Προηγούμενα Σύνολα)
  let progrDebit = 0, progrCredit = 0;
  let balance = ledger.opening;
  text(L.prevTotals, xAt(0) + 2, y, SIZE, bold, COLOR_GRAY);
  textR(money(balance), xEnd(7) - 2, y, SIZE, bold, COLOR_GRAY);
  y -= ROW_H;

  if (ledger.rows.length === 0) {
    text(L.noTx, xAt(0) + 2, y, SIZE, font, COLOR_GRAY);
    y -= ROW_H;
  }

  for (const r of ledger.rows) {
    if (y < MARGIN + 60) newPage();
    progrDebit += r.debit;
    progrCredit += r.credit;
    balance = ledger.opening + progrDebit - progrCredit;
    text(fmtDate(r.date, lang), xAt(0) + 2, y, SIZE);
    text(truncate(L[`kind_${r.kind}`] ?? r.kind, font, SIZE, W[1] - 4), xAt(1) + 2, y, SIZE);
    text(truncate(r.doc ?? '—', font, SIZE, W[2] - 4), xAt(2) + 2, y, SIZE);
    textR(r.debit ? money(r.debit) : '', xEnd(3) - 2, y, SIZE);
    textR(r.credit ? money(r.credit) : '', xEnd(4) - 2, y, SIZE);
    textR(money(progrDebit), xEnd(5) - 2, y, SIZE, font, COLOR_GRAY);
    textR(money(progrCredit), xEnd(6) - 2, y, SIZE, font, COLOR_GRAY);
    textR(money(balance), xEnd(7) - 2, y, SIZE, bold, balance > 0 ? COLOR_DARK : COLOR_ACCENT);
    y -= ROW_H;
  }

  // Totals row (Σύνολα)
  if (y < MARGIN + 40) newPage();
  y -= 2;
  page.drawLine({ start: { x: MARGIN, y: y + 9 }, end: { x: PAGE_W - MARGIN, y: y + 9 }, thickness: 0.7, color: COLOR_LINE });
  text(L.totals, xAt(0) + 2, y, SIZE, bold);
  textR(money(progrDebit), xEnd(3) - 2, y, SIZE, bold);
  textR(money(progrCredit), xEnd(4) - 2, y, SIZE, bold);
  textR(money(progrDebit), xEnd(5) - 2, y, SIZE, bold);
  textR(money(progrCredit), xEnd(6) - 2, y, SIZE, bold);
  textR(money(balance), xEnd(7) - 2, y, SIZE, bold);
  y -= 22;

  // Closing-balance callout
  const owes = side === 'customer' ? balance > 0 : balance < 0;
  const closingLabel = owes
    ? (side === 'customer' ? L.owesUs : L.weOwe)
    : (side === 'customer' ? L.weOwe : L.owesUs);
  text(`${L.closing}: ${closingLabel}`, MARGIN, y, 9, font, COLOR_GRAY);
  textR(money(Math.abs(balance)), PAGE_W - MARGIN, y, 12, bold, owes && side === 'customer' ? COLOR_RED : COLOR_DARK);
  y -= 24;

  if (y < MARGIN + 20) newPage();
  text(L.footer, MARGIN, y, 8, font, COLOR_GRAY);

  const bytes = await pdf.save();
  return { bytes, pages: pdf.getPageCount() };
}

// Mint (or reuse) public pay tokens for a customer's open invoices so the email
// body can link directly to card payment. Customer side only.
async function buildPayLinks(supabase: SupabaseClient, workspaceId: string, partyType: 'company' | 'contact', partyId: string, publicAppUrl: string) {
  const q = supabase.from('invoices')
    .select('id, internal_number, amount_due, currency, status, pay_token, pay_token_expires_at')
    .eq('workspace_id', workspaceId)
    .eq(partyType === 'company' ? 'customer_company_id' : 'customer_contact_id', partyId);
  const { data } = await q;
  const open = (data ?? []).filter((i: any) => Number(i.amount_due || 0) > 0 && i.status !== 'void' && i.status !== 'credit_noted');
  const links = new Map<string, string>();
  for (const inv of open) {
    if (inv.pay_token && (!inv.pay_token_expires_at || new Date(inv.pay_token_expires_at) > new Date())) {
      links.set(inv.id, `${publicAppUrl}/pay/${inv.pay_token}`); continue;
    }
    const token = Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, '0')).join('');
    const expires = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();
    const { error } = await supabase.from('invoices').update({ pay_token: token, pay_token_expires_at: expires }).eq('id', inv.id);
    if (!error) links.set(inv.id, `${publicAppUrl}/pay/${token}`);
  }
  return { open, links };
}

interface SendResult { ok: boolean; email_sent_to: string | null; pdf_url: string | null; rows: number; closing_balance: number; error?: string; note?: string }

// Render + (optionally) email one party's statement. Shared by single + cron modes.
async function sendOneStatement(
  supabase: SupabaseClient, party: any, settings: any,
  opts: { side: Side; from: string; to: string; lang: Lang; email?: string; dryRun?: boolean; publicAppUrl: string },
): Promise<SendResult> {
  const partyType = party.party_type as 'company' | 'contact';
  const details = await fetchPartyDetails(supabase, partyType, party.party_id);
  const ledger = await loadLedger(supabase, party.workspace_id, opts.side, partyType, party.party_id, opts.from, opts.to, settings.base_currency ?? 'EUR');

  let backdrop: Uint8Array | null = null;
  if (settings.statement_template_cover_path) {
    const { data: urlData } = await supabase.storage.from('quote-templates').createSignedUrl(settings.statement_template_cover_path, 60);
    if (urlData?.signedUrl) backdrop = await loadBackdrop(urlData.signedUrl);
  }

  const { bytes } = await buildStatementPdf({ party, details, settings, ledger, side: opts.side, from: opts.from, to: opts.to, lang: opts.lang, backdrop });

  const objectPath = `statements/${party.workspace_id}/${partyType}-${party.party_id}-${Date.now()}.pdf`;
  const { error: upErr } = await supabase.storage.from('pdf-documents').upload(objectPath, bytes, { contentType: 'application/pdf', upsert: false });
  if (upErr) return { ok: false, email_sent_to: null, pdf_url: null, rows: ledger.rows.length, closing_balance: 0, error: `Storage upload failed: ${upErr.message}` };
  const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(objectPath, 60 * 60 * 24 * 7);
  const pdfUrl = signed?.signedUrl ?? null;

  // Recompute closing for the response
  let prDebit = 0, prCredit = 0;
  for (const r of ledger.rows) { prDebit += r.debit; prCredit += r.credit; }
  const closing = ledger.opening + prDebit - prCredit;

  const targetEmail = opts.email ?? party.email;
  if (!targetEmail) return { ok: true, email_sent_to: null, pdf_url: pdfUrl, rows: ledger.rows.length, closing_balance: closing, note: 'No email on file; PDF generated but not sent.' };
  if (opts.dryRun) return { ok: true, email_sent_to: null, pdf_url: pdfUrl, rows: ledger.rows.length, closing_balance: closing, note: 'dry_run: PDF generated, not emailed.' };

  // Pay-by-card links (customer side, open invoices)
  let payLinksHtml = '';
  if (opts.side === 'customer') {
    const { open, links } = await buildPayLinks(supabase, party.workspace_id, partyType, party.party_id, opts.publicAppUrl);
    if (open.length > 0) {
      payLinksHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><thead><tr style="background:#f3f3f3;">
        <th style="text-align:left;padding:8px;font-size:12px;">Invoice</th>
        <th style="text-align:right;padding:8px;font-size:12px;">Due</th>
        <th style="text-align:right;padding:8px;font-size:12px;">Pay by card</th></tr></thead><tbody>
        ${open.map((i: any) => `<tr>
          <td style="padding:8px;font-family:monospace;font-size:12px;">${i.internal_number}</td>
          <td style="padding:8px;text-align:right;font-size:12px;">${fmtMoney(Number(i.amount_due || 0), i.currency, opts.lang)}</td>
          <td style="padding:8px;text-align:right;">${links.get(i.id) ? `<a href="${links.get(i.id)}" style="background:#883366;color:white;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:12px;">Pay now</a>` : '—'}</td>
        </tr>`).join('')}</tbody></table>`;
    }
  }

  const subject = settings.statement_email_subject ?? 'Your account statement';
  const bodyText = settings.statement_email_body ?? `Please find your account statement attached. Closing balance: ${fmtMoney(closing, ledger.currency, opts.lang)}.`;
  const html = `<div style="font-family:'Open Sans',Arial,sans-serif;max-width:600px;">
      <p>${party.display_name ?? ''},</p>
      <p>${String(bodyText).replace(/\n/g, '<br>')}</p>
      ${payLinksHtml}
      <p><a href="${pdfUrl}">Download full PDF statement</a></p>
      <p style="color:#666;font-size:12px;margin-top:32px;">Generated on ${fmtDate(new Date().toISOString(), opts.lang)}. Pay links expire after 90 days.</p>
    </div>`;

  const { data: dispatch, error: dispatchErr } = await supabase.functions.invoke('email-api', {
    body: { action: 'send', to: targetEmail, subject, html, emailType: 'transactional', tags: { feature: 'finance_statement', party_type: partyType, party_id: party.party_id }, workspace_id: party.workspace_id },
  });
  if (dispatchErr || !(dispatch as any)?.success) {
    return { ok: false, email_sent_to: null, pdf_url: pdfUrl, rows: ledger.rows.length, closing_balance: closing, error: dispatchErr?.message ?? (dispatch as any)?.error ?? 'email send failed' };
  }
  return { ok: true, email_sent_to: targetEmail, pdf_url: pdfUrl, rows: ledger.rows.length, closing_balance: closing };
}

function defaultRange(): { from: string; to: string } {
  const year = new Date().getUTCFullYear();
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}
function langForSettings(settings: any, override?: string): Lang {
  if (override === 'el' || override === 'en') return override;
  const cc = String(settings?.business_country_code ?? '').toUpperCase();
  return cc === 'GR' || cc === 'EL' ? 'el' : 'en';
}

// --- Cron batch: is a workspace's auto-statement schedule due right now? -------
function isScheduleDue(settings: any, now: Date): boolean {
  if (Number(settings.auto_statement_hour_utc ?? 7) !== now.getUTCHours()) return false;
  const last = settings.auto_statement_last_run_at ? new Date(settings.auto_statement_last_run_at) : null;
  if (last && now.getTime() - last.getTime() < 23 * 3600 * 1000) return false; // de-dupe within the day
  const freq = settings.auto_statement_frequency ?? 'monthly';
  if (freq === 'every_n_days') {
    const n = Math.max(1, Number(settings.auto_statement_interval_days ?? 30));
    if (!last) return true;
    return now.getTime() - last.getTime() >= n * 24 * 3600 * 1000;
  }
  if (freq === 'weekly') return now.getUTCDay() === Number(settings.auto_statement_day_of_week ?? 1);
  // monthly — clamp to the last day of short months
  const dom = Number(settings.auto_statement_day_of_month ?? 1);
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return now.getUTCDate() === Math.min(dom, lastDay);
}

async function runCronBatch(supabase: SupabaseClient, publicAppUrl: string): Promise<any> {
  const now = new Date();
  const { data: wsSettings } = await supabase.from('finance_settings')
    .select('*').eq('auto_statement_enabled', true).eq('statements_enabled', true);
  const summary: any[] = [];

  for (const settings of (wsSettings ?? [])) {
    if (!isScheduleDue(settings, now)) continue;
    const wsId = settings.workspace_id;
    const sides: Side[] = settings.auto_statement_side === 'both' ? ['customer', 'supplier'] : [settings.auto_statement_side === 'supplier' ? 'supplier' : 'customer'];
    const minBal = Number(settings.auto_statement_min_balance ?? 0);
    const onlyOutstanding = settings.auto_statement_only_outstanding !== false;
    const range = defaultRange();
    const lang = langForSettings(settings);
    let sent = 0, skipped = 0, failed = 0;

    // Opt-out sets
    const [{ data: optCompanies }, { data: optContacts }] = await Promise.all([
      supabase.from('crm_companies').select('id').eq('workspace_id', wsId).eq('finance_statement_opt_out', true),
      supabase.from('crm_contacts').select('id').eq('workspace_id', wsId).eq('finance_statement_opt_out', true),
    ]);
    const optedOut = new Set([...(optCompanies ?? []).map((r: any) => r.id), ...(optContacts ?? []).map((r: any) => r.id)]);

    for (const side of sides) {
      const { data: parties } = await supabase.from('vw_finance_parties')
        .select('*').eq('workspace_id', wsId).eq(side === 'customer' ? 'is_customer' : 'is_supplier', true);
      for (const party of (parties ?? [])) {
        if (!party.email) { skipped++; continue; }
        if (optedOut.has(party.party_id)) { skipped++; continue; }
        const outstanding = Math.abs(Number(side === 'customer' ? party.receivable_outstanding : party.payable_outstanding) || 0);
        if (onlyOutstanding && outstanding <= minBal) { skipped++; continue; }
        try {
          const res = await sendOneStatement(supabase, party, settings, { side, from: range.from, to: range.to, lang, publicAppUrl });
          if (res.ok && res.email_sent_to) sent++; else if (res.ok) skipped++; else failed++;
        } catch (e: any) { failed++; console.error('cron statement failed', party.party_id, e?.message); }
      }
    }

    await supabase.from('finance_settings').update({ auto_statement_last_run_at: now.toISOString() }).eq('workspace_id', wsId);
    summary.push({ workspace_id: wsId, sent, skipped, failed });
  }
  return { ok: true, mode: 'cron_batch', processed_workspaces: summary.length, summary };
}

Deno.serve(withApiLogging('finance-send-statement', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const publicAppUrl = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');

    // ---- Cron batch mode (x-cron-secret) ----
    if (body.mode === 'cron_batch') {
      await bootstrapForFunction();
      const cronSecret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
      if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'unauthorized' }, 401);
      const result = await runCronBatch(supabase, publicAppUrl);
      return json(result);
    }

    // ---- Single party mode (user/role auth) ----
    const auth = await authenticate(req, {
      requireUser: true,
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance', 'sales'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const partyType = (body.party_type as 'company' | 'contact');
    if (!partyType || !body.party_id) return json({ error: 'party_type and party_id are required' }, 400);

    const { data: party, error: partyErr } = await supabase
      .from('vw_finance_parties').select('*')
      .eq('party_type', partyType).eq('party_id', body.party_id).maybeSingle();
    if (partyErr || !party) return json({ error: `Party not found: ${partyErr?.message ?? body.party_id}` }, 404);

    if (!(await userCanAccessWorkspace(supabase, auth.userId, party.workspace_id))) {
      return json({ error: 'Not authorized for this customer' }, 403);
    }

    const { data: settings } = await supabase.from('finance_settings').select('*').eq('workspace_id', party.workspace_id).maybeSingle();
    if (!settings?.statements_enabled) return json({ error: 'Statement sending is disabled in finance settings.' }, 409);

    const side: Side = (body.side === 'customer' || body.side === 'supplier')
      ? body.side
      : (party.is_customer ? 'customer' : party.is_supplier ? 'supplier' : 'customer');
    const range = defaultRange();
    const from = (typeof body.from === 'string' && body.from) || range.from;
    const to = (typeof body.to === 'string' && body.to) || range.to;
    const lang = langForSettings(settings, body.lang);

    const res = await sendOneStatement(supabase, party, settings, { side, from, to, lang, email: body.email, dryRun: body.dry_run, publicAppUrl });
    // Keep the legacy response keys the frontend reads (email_sent_to, pdf_url) + new ones.
    return json({ ...res, lines: res.rows, total_outstanding: res.closing_balance });
  } catch (err: any) {
    console.error('finance-send-statement error', err);
    return json({ error: err?.message ?? 'Internal error' }, 500);
  }
}));
