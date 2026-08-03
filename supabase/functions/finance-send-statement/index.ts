// deno-lint-ignore-file no-explicit-any
import type { DbClient } from '../_shared/supabase-client.ts';
import { jsonResponse as json } from '../_shared/http.ts';
import { formatMoneyLocalized } from '../_shared/money.ts';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
// @pdf-lib/fontkit's published types declare no default export, so `import fontkit from`
// failed to typecheck (TS1192) even though esm.sh's interop makes it work at runtime.
// Resolve the namespace and prefer its default if present — correct either way, and it
// does not change which object reaches registerFontkit.
import * as fontkitNs from '@pdf-lib/fontkit';
const fontkit = (fontkitNs as unknown as { default?: unknown }).default ?? fontkitNs;
import { encodeBase64 as base64Encode } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { escapeHtml } from '../_shared/html.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { chargeCronWorkspace } from '../_shared/cron-billing.ts';
import { getStripe } from '../_shared/stripe-clients.ts';

// Sales/Finance — render and email a party (customer or supplier) running ledger
// statement (Καρτέλα) PDF.
// The PDF is a full account ledger for a date range: header (issuer + recipient
// identity, period, currency), an opening-balance carry-forward line (Προηγούμενα
// Σύνολα), one row per transaction with debit/credit + progressive (running)
// debit/credit totals + running balance, and a totals/closing-balance footer.
// Mailed via the platform email-api edge function.
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
    payByBank: 'Πληρωμή με τραπεζική κατάθεση', bankName: 'Τράπεζα', bankRef: 'Αρ. λογαριασμού',
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
    payByBank: 'Pay by bank transfer', bankName: 'Bank', bankRef: 'Account',
  },
};

// Customer-facing payment accounts — read from the SAME single source invoices use:
// the treasury accounts flagged "Show on invoice" (finance_bank_accounts). Mirrors
// finance-invoice-pdf so statements and invoices always agree. One line per account.
async function loadInvoiceBankAccounts(
  supabase: DbClient, workspaceId: string,
): Promise<Array<{ name: string; kind: string; iban: string | null; account_ref: string | null }>> {
  const { data } = await supabase.from('finance_bank_accounts')
    .select('name, kind, iban, account_ref')
    .eq('workspace_id', workspaceId).eq('is_active', true).eq('show_on_invoice', true)
    .order('sort_order', { ascending: true });
  return (data ?? []) as Array<{ name: string; kind: string; iban: string | null; account_ref: string | null }>;
}

function paymentAccountLines(accts: Array<{ name: string; kind: string; iban: string | null; account_ref: string | null }>): string[] {
  const lines: string[] = [];
  for (const a of accts) {
    const detail = a.kind === 'bank'
      ? [a.name, a.iban ? `IBAN ${a.iban}` : ''].filter(Boolean).join('  ·  ')
      : [a.name, a.account_ref ?? a.iban ?? ''].filter(Boolean).join('  ·  ');
    if (detail) lines.push(detail);
  }
  return lines;
}

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


const fmtMoney = (value: number, currency = 'EUR', lang: Lang = 'el') =>
  formatMoneyLocalized(value, currency, lang);

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
  supabase: DbClient, workspaceId: string, side: Side, partyType: 'company' | 'contact', partyId: string,
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

async function fetchPartyDetails(supabase: DbClient, partyType: 'company' | 'contact', partyId: string): Promise<any> {
  const table = partyType === 'company' ? 'crm_companies' : 'crm_contacts';
  const { data } = await supabase.from(table).select('*').eq('id', partyId).maybeSingle();
  return data ?? {};
}

interface BuildOpts { party: any; details: any; settings: any; ledger: LedgerData; side: Side; from: string; to: string; lang: Lang; backdrop: any; logo?: Uint8Array | null; footer?: Uint8Array | null; payment?: string[] }

// Load the workspace's finance logo (generation-images bucket, public) → bytes.
async function loadLogo(supabase: DbClient, path: string | null | undefined): Promise<Uint8Array | null> {
  if (!path) return null;
  try {
    const { data } = supabase.storage.from('generation-images').getPublicUrl(path);
    if (!data?.publicUrl) return null;
    return await loadBackdrop(data.publicUrl);
  } catch { return null; }
}

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
  let logoImg: any = null;
  if (opts.logo) {
    try { logoImg = await pdf.embedPng(opts.logo); }
    catch { try { logoImg = await pdf.embedJpg(opts.logo); } catch { /* ignore */ } }
  }

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  const drawBackdrop = (p: PDFPage) => { if (backdrop) p.drawImage(backdrop, { x: 0, y: 0, width: PAGE_W, height: PAGE_H }); };
  drawBackdrop(page);
  let y = PAGE_H - MARGIN;

  // Workspace logo, top-left, on the first page (max 130×34, aspect-preserved).
  if (logoImg) {
    const lh = 34; const lw = Math.min((logoImg.width / logoImg.height) * lh, 130);
    page.drawImage(logoImg, { x: MARGIN, y: PAGE_H - MARGIN - lh, width: lw, height: lh });
  }

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

  // Payment-accounts block (an alternative to card payment) — one account per line,
  // from the same source as invoices.
  const lines = opts.payment ?? [];
  if (lines.length > 0) {
    const boxH = 16 + lines.length * 12 + 6;
    if (y < MARGIN + boxH + 6) newPage();
    y -= 6;
    page.drawRectangle({ x: MARGIN, y: y - (boxH - 12), width: PAGE_W - 2 * MARGIN, height: boxH, color: rgb(0.96, 0.96, 0.98) });
    text(L.payByBank, MARGIN + 8, y - 2, 9, bold, COLOR_ACCENT);
    let by = y - 16;
    for (const line of lines) { text(line, MARGIN + 8, by, 8.5, font, COLOR_DARK); by -= 12; }
    y -= boxH + 6;
  }

  if (y < MARGIN + 20) newPage();
  text(L.footer, MARGIN, y, 8, font, COLOR_GRAY);

  // Back-cover / footer template — a full A4 page appended at the end (same convention
  // as quote back covers). Optional.
  if (opts.footer) {
    let footerImg: any = null;
    try { footerImg = await pdf.embedPng(opts.footer); }
    catch { try { footerImg = await pdf.embedJpg(opts.footer); } catch { /* ignore */ } }
    if (footerImg) {
      const fp = pdf.addPage([PAGE_W, PAGE_H]);
      fp.drawImage(footerImg, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    }
  }

  const bytes = await pdf.save();
  return { bytes, pages: pdf.getPageCount() };
}

// Mint (or reuse) public pay tokens for a customer's open invoices so the email
// body can link directly to card payment. Customer side only.
async function buildPayLinks(supabase: DbClient, workspaceId: string, partyType: 'company' | 'contact', partyId: string, publicAppUrl: string) {
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
  supabase: DbClient, party: any, settings: any,
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
  let footerImg: Uint8Array | null = null;
  if (settings.statement_template_footer_path) {
    const { data: fData } = await supabase.storage.from('quote-templates').createSignedUrl(settings.statement_template_footer_path, 60);
    if (fData?.signedUrl) footerImg = await loadBackdrop(fData.signedUrl);
  }
  const logo = await loadLogo(supabase, settings.business_logo_path);
  const payment = paymentAccountLines(await loadInvoiceBankAccounts(supabase, party.workspace_id));

  const { bytes } = await buildStatementPdf({ party, details, settings, ledger, side: opts.side, from: opts.from, to: opts.to, lang: opts.lang, backdrop, logo, footer: footerImg, payment });

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

  // Pay-by-card links (customer side): a durable "Pay balance" link for the whole
  // outstanding total + per-invoice links.
  let payBalanceHtml = '';
  let payLinksHtml = '';
  if (opts.side === 'customer') {
    const outstanding = Number(party.receivable_outstanding || 0);
    if (outstanding > 0) {
      const shareRow = await getOrCreateShareRow(supabase, party, 'customer', null);
      const balanceUrl = await ensureBalancePaymentLink(
        supabase, party.workspace_id, partyType, party.party_id, outstanding, ledger.currency, shareRow,
        `${opts.publicAppUrl}/statement/${shareRow.token}`,
      );
      if (balanceUrl) {
        payBalanceHtml = `<div style="margin:20px 0;text-align:center;">
          <a href="${balanceUrl}" style="background:#883366;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;display:inline-block;">
            Pay balance ${fmtMoney(outstanding, ledger.currency, opts.lang)}</a>
        </div>`;
      }
    }
    const { open, links } = await buildPayLinks(supabase, party.workspace_id, partyType, party.party_id, opts.publicAppUrl);
    if (open.length > 0) {
      payLinksHtml = `<table style="width:100%;border-collapse:collapse;margin:16px 0;"><thead><tr style="background:#f3f3f3;">
        <th style="text-align:left;padding:8px;font-size:12px;">Invoice</th>
        <th style="text-align:right;padding:8px;font-size:12px;">Due</th>
        <th style="text-align:right;padding:8px;font-size:12px;">Pay by card</th></tr></thead><tbody>
        ${open.map((i: any) => `<tr>
          <td style="padding:8px;font-family:monospace;font-size:12px;">${esc(i.internal_number)}</td>
          <td style="padding:8px;text-align:right;font-size:12px;">${fmtMoney(Number(i.amount_due || 0), i.currency, opts.lang)}</td>
          <td style="padding:8px;text-align:right;">${links.get(i.id) ? `<a href="${links.get(i.id)}" style="background:#883366;color:white;padding:6px 12px;border-radius:6px;text-decoration:none;font-size:12px;">Pay now</a>` : '—'}</td>
        </tr>`).join('')}</tbody></table>`;
    }
  }

  const subject = settings.statement_email_subject ?? 'Your account statement';
  const bodyText = settings.statement_email_body ?? `Please find your account statement attached. Closing balance: ${fmtMoney(closing, ledger.currency, opts.lang)}.`;
  // Escape party name + the tenant-configured statement body before
  // interpolating into HTML (escape first, THEN turn newlines into <br>).
  const esc = escapeHtml; // shared canonical escaper (was an identical local copy)
  // Logo header (public URL — generation-images bucket is public-read).
  let logoHtml = '';
  if (settings.business_logo_path) {
    const { data: pub } = supabase.storage.from('generation-images').getPublicUrl(settings.business_logo_path);
    if (pub?.publicUrl) logoHtml = `<div style="margin-bottom:16px;"><img src="${pub.publicUrl}" alt="${esc(settings.business_name)}" style="max-height:48px;max-width:180px;"></div>`;
  }
  // Payment-accounts block (alternative to card) — reuse the lines built for the PDF.
  let bankHtml = '';
  if (payment.length > 0) {
    const L = LABELS[opts.lang];
    const rowsHtml = payment.map((l) => esc(l)).join('<br>');
    bankHtml = `<div style="margin:14px 0;padding:12px 14px;background:#f4f4f7;border-radius:8px;font-size:13px;line-height:1.55;">
      <strong>${esc(L.payByBank)}</strong><br>${rowsHtml}</div>`;
  }
  const html = `<div style="font-family:'Open Sans',Arial,sans-serif;max-width:600px;">
      ${logoHtml}
      <p>${esc(party.display_name)},</p>
      <p>${esc(bodyText).replace(/\n/g, '<br>')}</p>
      ${payBalanceHtml}
      ${payLinksHtml}
      ${bankHtml}
      <p><a href="${pdfUrl}">Download full PDF statement</a> (also attached)</p>
      <p style="color:#666;font-size:12px;margin-top:32px;">Generated on ${fmtDate(new Date().toISOString(), opts.lang)}. Pay links expire after 90 days.</p>
    </div>`;

  // Attach the PDF so it travels with the email (not just a link).
  const pdfBase64 = base64Encode(bytes);
  const attachmentName = `statement-${(party.display_name ?? 'account').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.pdf`;

  const { data: dispatch, error: dispatchErr } = await supabase.functions.invoke('email-api', {
    // Tenant business mail (statement to the tenant's customer/supplier) → must send from the
    // workspace's own BYOK Resend, never the shared platform domain. requireWorkspaceSender makes
    // email-api 503 (code=workspace_sender_required) until BYOK is configured; root workspace exempt.
    body: { action: 'send', to: targetEmail, subject, html, emailType: 'transactional', attachments: [{ filename: attachmentName, content: pdfBase64 }], tags: { feature: 'finance_statement', party_type: partyType, party_id: party.party_id }, workspace_id: party.workspace_id, requireWorkspaceSender: true },
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

async function runCronBatch(supabase: DbClient, publicAppUrl: string): Promise<any> {
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
    let wsOutOfCredits = false; // stop this workspace's run once the owner runs out (all parties bill the same owner)

    // Opt-out sets
    const [{ data: optCompanies }, { data: optContacts }] = await Promise.all([
      supabase.from('crm_companies').select('id').eq('workspace_id', wsId).eq('finance_statement_opt_out', true),
      supabase.from('crm_contacts').select('id').eq('workspace_id', wsId).eq('finance_statement_opt_out', true),
    ]);
    const optedOut = new Set([...(optCompanies ?? []).map((r: any) => r.id), ...(optContacts ?? []).map((r: any) => r.id)]);

    for (const side of sides) {
      if (wsOutOfCredits) break;
      const { data: parties } = await supabase.from('vw_finance_parties')
        .select('*').eq('workspace_id', wsId).eq(side === 'customer' ? 'is_customer' : 'is_supplier', true);
      for (const party of (parties ?? [])) {
        if (!party.email) { skipped++; continue; }
        if (optedOut.has(party.party_id)) { skipped++; continue; }
        const outstanding = Math.abs(Number(side === 'customer' ? party.receivable_outstanding : party.payable_outstanding) || 0);
        if (onlyOutstanding && outstanding <= minBal) { skipped++; continue; }
        // Meter one unit per statement actually sent. Out of credits → stop this workspace's run
        // (resumes next scheduled window once funded).
        const gate = await chargeCronWorkspace(supabase, wsId, 'finance-auto-statement', { description: 'Auto customer/supplier statement' });
        if (!gate.allowed) { wsOutOfCredits = true; break; }
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

// Mint (or reuse) a durable Stripe Payment Link for a customer's whole outstanding
// balance. Routed to the workspace's connected account (Connect destination charge),
// same as the per-invoice flow. The PaymentIntent carries type='statement_payment'
// metadata so the webhook allocates it oldest-invoice-first. Cached on the share row
// while the amount is unchanged. Returns null when no balance / no Stripe / on error.
async function ensureBalancePaymentLink(
  supabase: DbClient, workspaceId: string, partyType: 'company' | 'contact', partyId: string,
  outstanding: number, currency: string, share: any | null, redirectUrl: string,
): Promise<string | null> {
  if (!(outstanding > 0)) return null;
  const stripe = getStripe();
  if (!stripe) return null;

  const amountCents = Math.round(outstanding * 100);
  // Reuse the cached link while the balance is unchanged.
  if (share?.payment_link_url && Math.round(Number(share.payment_link_amount || 0) * 100) === amountCents
    && String(share.payment_link_currency || '').toUpperCase() === currency.toUpperCase()) {
    return share.payment_link_url;
  }

  try {
    const { data: destAcct } = await supabase.rpc('get_workspace_payout_account', { p_workspace_id: workspaceId });
    const price = await stripe.prices.create({
      currency: currency.toLowerCase(),
      unit_amount: amountCents,
      product_data: { name: 'Account balance' },
    });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      // Single-use: deactivate after the first successful payment so a stale emailed
      // link can't double-charge once the balance is already settled.
      restrictions: { completed_sessions: { limit: 1 } },
      ...(destAcct ? { transfer_data: { destination: destAcct as string } } : {}),
      payment_intent_data: {
        metadata: { type: 'statement_payment', workspace_id: workspaceId, party_type: partyType, party_id: partyId, side: 'customer' },
      },
      metadata: { type: 'statement_payment', workspace_id: workspaceId, party_type: partyType, party_id: partyId },
      after_completion: { type: 'redirect', redirect: { url: `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}paid=1` } },
    });
    if (share?.id) {
      await supabase.from('finance_statement_shares').update({
        payment_link_id: link.id, payment_link_url: link.url,
        payment_link_amount: outstanding, payment_link_currency: currency.toUpperCase(),
      }).eq('id', share.id);
    }
    return link.url ?? null;
  } catch (e) {
    console.error('ensureBalancePaymentLink failed', (e as any)?.message);
    return null;
  }
}

// --- Public statement share (points 4/5) ---------------------------------
// A workspace user mints a stable token per party; the recipient unlocks
// /statement/{token} with their VAT + email. Everything reuses the ledger / pay-link
// / PDF helpers above so there's one statement code path.

const randToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20))).map((b) => b.toString(16).padStart(2, '0')).join('');

const digitsOnly = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const normEmail = (v: unknown) => String(v ?? '').trim().toLowerCase();

// Find-or-create the active share row for a party (full row).
async function getOrCreateShareRow(supabase: DbClient, party: any, side: Side, userId: string | null): Promise<any> {
  const sel = () => supabase.from('finance_statement_shares').select('*')
    .eq('workspace_id', party.workspace_id).eq('party_type', party.party_type)
    .eq('party_id', party.party_id).eq('is_active', true).maybeSingle();
  const { data: existing } = await sel();
  if (existing) return existing;
  const { data: inserted, error } = await supabase.from('finance_statement_shares').insert({
    token: randToken(), workspace_id: party.workspace_id, party_type: party.party_type,
    party_id: party.party_id, side, created_by: userId,
  }).select('*').maybeSingle();
  if (inserted) return inserted;
  const { data: again } = await sel(); // unique-index race → the winner
  if (again) return again;
  throw new Error(error?.message ?? 'could not create share');
}

// Mint (or reuse) the active share row for a party. Auth already verified by caller.
async function mintShare(
  supabase: DbClient, party: any, side: Side, userId: string | null, publicAppUrl: string,
) {
  const row = await getOrCreateShareRow(supabase, party, side, userId);
  return { token: row.token as string, url: `${publicAppUrl}/statement/${row.token}` };
}

// Resolve a share token + VAT/email → the recipient's ledger. Generic errors so a
// wrong VAT/email can't be distinguished from a bad token (no enumeration).
async function resolveShareView(
  supabase: DbClient, body: any, publicAppUrl: string,
): Promise<{ status: number; payload: any }> {
  const token = String(body.token ?? '');
  const GENERIC = { status: 401, payload: { ok: false, error: 'The VAT number or email does not match our records.' } };
  const LOCKED = { status: 423, payload: { ok: false, error: 'This link is locked after too many failed attempts. Please ask us to re-send it.' } };
  const MAX_ATTEMPTS = 10;
  if (!token) return { status: 400, payload: { ok: false, error: 'Missing link token.' } };

  const { data: share } = await supabase.from('finance_statement_shares')
    .select('*').eq('token', token).maybeSingle();
  if (!share || !share.is_active) return GENERIC;
  if (share.expires_at && new Date(share.expires_at) < new Date()) return GENERIC;

  const partyType = share.party_type as 'company' | 'contact';
  const details = await fetchPartyDetails(supabase, partyType, share.party_id);
  const onFileEmail = normEmail(details.email);
  const onFileVat = digitsOnly(details.vat_number);
  const inEmail = normEmail(body.email);
  const inVat = digitsOnly(body.vat);

  // Email must always match. VAT must match too when the party has one on file
  // (companies always do; individual contacts may not). On mismatch, count the failed
  // attempt and lock the link after MAX_ATTEMPTS (brute-force backstop, no infra needed).
  const emailOk = !!onFileEmail && inEmail === onFileEmail;
  const vatOk = !onFileVat || inVat === onFileVat;
  if (!emailOk || !vatOk) {
    const attempts = (share.failed_attempts ?? 0) + 1;
    const patch: any = { failed_attempts: attempts };
    if (attempts >= MAX_ATTEMPTS) patch.is_active = false;
    await supabase.from('finance_statement_shares').update(patch).eq('id', share.id);
    return attempts >= MAX_ATTEMPTS ? LOCKED : GENERIC;
  }

  const { data: party } = await supabase.from('vw_finance_parties').select('*')
    .eq('party_type', partyType).eq('party_id', share.party_id).maybeSingle();
  if (!party) return GENERIC;

  const { data: settingsRow } = await supabase.from('finance_settings').select('*').eq('workspace_id', share.workspace_id).maybeSingle();
  const settings = settingsRow ?? {};
  // Consistency with the email path: a workspace with statements turned off has no live links.
  if (settingsRow && settingsRow.statements_enabled === false) {
    return { status: 403, payload: { ok: false, error: 'Statements are currently unavailable. Please contact us.' } };
  }
  const side: Side = (share.side === 'supplier') ? 'supplier' : 'customer';
  const lang = langForSettings(settings, body.lang);
  const range = defaultRange();
  const from = (typeof body.from === 'string' && body.from) || range.from;
  const to = (typeof body.to === 'string' && body.to) || range.to;

  const ledger = await loadLedger(supabase, share.workspace_id, side, partyType, share.party_id, from, to, (settings as any).base_currency ?? 'EUR');
  let progrDebit = 0, progrCredit = 0;
  const rows = ledger.rows.map((r) => {
    progrDebit += r.debit; progrCredit += r.credit;
    return { date: r.date, kind: r.kind, doc: r.doc, debit: r.debit, credit: r.credit, balance: ledger.opening + progrDebit - progrCredit };
  });
  const closing = ledger.opening + progrDebit - progrCredit;

  // Open invoices → each links to the existing /pay/{token} Stripe flow, plus a single
  // "pay the whole balance" Payment Link (customer side only).
  let invoices: any[] = [];
  let paymentLinkUrl: string | null = null;
  const outstanding = Number(party.receivable_outstanding || 0);
  if (side === 'customer') {
    const { open, links } = await buildPayLinks(supabase, share.workspace_id, partyType, share.party_id, publicAppUrl);
    invoices = open.map((i: any) => ({
      internal_number: i.internal_number, amount_due: Number(i.amount_due || 0),
      currency: i.currency ?? ledger.currency, pay_url: links.get(i.id) ?? null,
    }));
    paymentLinkUrl = await ensureBalancePaymentLink(
      supabase, share.workspace_id, partyType, share.party_id, outstanding, ledger.currency, share,
      `${publicAppUrl}/statement/${share.token}`,
    );
  }

  // Branding + identity for the page to render a PDF-like statement.
  const set = settings as any;
  const logoUrl = set.business_logo_path
    ? (supabase.storage.from('generation-images').getPublicUrl(set.business_logo_path).data?.publicUrl ?? null) : null;
  let backgroundUrl: string | null = null;
  let logoBytes: Uint8Array | null = null;
  if (set.statement_template_cover_path) {
    const { data: bg } = await supabase.storage.from('quote-templates').createSignedUrl(set.statement_template_cover_path, 60 * 30);
    backgroundUrl = bg?.signedUrl ?? null;
  }
  if (logoUrl) logoBytes = await loadLogo(supabase, set.business_logo_path);

  const backdrop = backgroundUrl ? await loadBackdrop(backgroundUrl) : null;
  let footerImg: Uint8Array | null = null;
  if (set.statement_template_footer_path) {
    const { data: fData } = await supabase.storage.from('quote-templates').createSignedUrl(set.statement_template_footer_path, 60 * 30);
    if (fData?.signedUrl) footerImg = await loadBackdrop(fData.signedUrl);
  }
  const payment = paymentAccountLines(await loadInvoiceBankAccounts(supabase, share.workspace_id));

  const L = LABELS[lang];
  const owes = side === 'customer' ? closing > 0 : closing < 0;
  const closingLabel = owes
    ? (side === 'customer' ? L.owesUs : L.weOwe)
    : (side === 'customer' ? L.weOwe : L.owesUs);

  const issuer = {
    name: set.business_name ?? null,
    address: [set.business_address, set.business_street_number].filter(Boolean).join(' ') || null,
    city: [set.business_postal_code, set.business_city].filter(Boolean).join(' ') || null,
    vat: set.business_vat ?? null,
    tax_office: set.business_tax_office ?? null,
    phone: set.business_phone ?? set.contact_phone ?? null,
    email: set.business_email ?? set.contact_email ?? null,
  };
  const recipient = {
    name: party.display_name ?? details.name ?? null,
    address: [details.street, details.street_number].filter(Boolean).join(' ') || details.address || null,
    city: [details.postal_code, details.city].filter(Boolean).join(' ') || null,
    vat: details.vat_number ?? null,
    tax_office: details.tax_office ?? null,
    email: party.email ?? details.email ?? null,
  };

  // Best-effort PDF for a download button; the on-page statement is the primary view.
  let pdfUrl: string | null = null;
  try {
    const { bytes } = await buildStatementPdf({ party, details, settings, ledger, side, from, to, lang, backdrop, logo: logoBytes, footer: footerImg, payment });
    const objectPath = `statements/${share.workspace_id}/${partyType}-${share.party_id}-share.pdf`;
    await supabase.storage.from('pdf-documents').upload(objectPath, bytes, { contentType: 'application/pdf', upsert: true });
    const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(objectPath, 60 * 60 * 24 * 7);
    pdfUrl = signed?.signedUrl ?? null;
  } catch (e) { console.error('share PDF gen failed', (e as any)?.message); }

  // Successful unlock → reset the failed-attempt counter + bump view stats.
  await supabase.from('finance_statement_shares')
    .update({ view_count: (share.view_count ?? 0) + 1, last_viewed_at: new Date().toISOString(), failed_attempts: 0 })
    .eq('id', share.id);

  return {
    status: 200,
    payload: {
      ok: true,
      party_name: party.display_name,
      side, currency: ledger.currency, lang,
      from, to, opening: ledger.opening, closing,
      closing_label: closingLabel, owes, outstanding,
      rows, invoices, pdf_url: pdfUrl,
      payment_link_url: paymentLinkUrl,
      logo_url: logoUrl, background_url: backgroundUrl,
      business_name: set.business_name ?? null,
      issuer, recipient,
      bank_transfer: payment.length > 0 ? { label: L.payByBank, lines: payment } : null,
      title: side === 'customer' ? L.titleCustomer : L.titleSupplier,
    },
  };
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

    // ---- Public statement view (no auth; gated by VAT + email) ----
    if (body.mode === 'share_view') {
      await bootstrapForFunction(); // resolve STRIPE_SECRET_KEY for the balance Payment Link
      const { status, payload } = await resolveShareView(supabase, body, publicAppUrl);
      return json(payload, status);
    }

    // ---- Single party + share-mint modes (user/role auth) ----
    const auth = await authenticate(req, {
      requireUser: true,
      allowedRoles: ['admin', 'super_admin', 'owner', 'finance', 'sales'],
    });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    // ---- Mint / rotate a public share link for a party ----
    if (body.mode === 'share_mint' || body.mode === 'share_rotate') {
      const pt = body.party_type as 'company' | 'contact';
      if (!pt || !body.party_id) return json({ error: 'party_type and party_id are required' }, 400);
      const { data: party, error: pErr } = await supabase.from('vw_finance_parties').select('*')
        .eq('party_type', pt).eq('party_id', body.party_id).maybeSingle();
      if (pErr || !party) return json({ error: 'Party not found' }, 404);
      if (!(await userCanAccessWorkspace(supabase, auth.userId, party.workspace_id))) {
        return json({ error: 'Not authorized for this party' }, 403);
      }
      const { data: mintSettings } = await supabase.from('finance_settings').select('statements_enabled').eq('workspace_id', party.workspace_id).maybeSingle();
      if (mintSettings && mintSettings.statements_enabled === false) {
        return json({ error: 'Statements are disabled in finance settings.' }, 409);
      }
      const side: Side = (body.side === 'supplier') ? 'supplier' : (party.is_customer ? 'customer' : party.is_supplier ? 'supplier' : 'customer');
      // Rotate: deactivate any existing active link first so the old URL dies.
      if (body.mode === 'share_rotate') {
        await supabase.from('finance_statement_shares')
          .update({ is_active: false })
          .eq('workspace_id', party.workspace_id).eq('party_type', pt).eq('party_id', body.party_id).eq('is_active', true);
      }
      const res = await mintShare(supabase, party, side, auth.userId, publicAppUrl);
      return json({ ok: true, rotated: body.mode === 'share_rotate', ...res });
    }

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
