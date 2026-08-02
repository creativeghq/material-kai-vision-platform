// deno-lint-ignore-file no-explicit-any
// Renders a customer-facing legal invoice/receipt PDF (A4) with full myDATA fields:
// issuer + establishment, customer, line items, VAT breakdown, totals, the MARK and a
// scannable QR. The field-label language is per-invoice (invoices.doc_language 'el'|'en').
// NOTE ON GREEK STRINGS: the label dictionary below intentionally contains Greek. This is
// a legal tax document (παραστατικό) the customer/accountant files — NOT the app UI. The
// English-only-UI rule applies to the interface, not to this generated document; the user
// explicitly asked for a per-invoice GR/EN choice. A Unicode font is embedded so Greek
// glyphs (and Greek customer names/addresses, regardless of language) render correctly.
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
// @pdf-lib/fontkit's published types declare no default export, so `import fontkit from`
// failed to typecheck (TS1192) even though esm.sh's interop makes it work at runtime.
// Resolve the namespace and prefer its default if present — correct either way, and it
// does not change which object reaches registerFontkit.
import * as fontkitNs from '@pdf-lib/fontkit';
const fontkit = (fontkitNs as unknown as { default?: unknown }).default ?? fontkitNs;
import qrcode from 'qrcode-generator';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace, isCronAuthorized } from '../_shared/auth.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { getSpec, resolveColorsHex, toPdfColors, type TemplateSpec, type InvoicePdfColors } from './templates.ts';

// Open Sans — the platform-wide typeface. Static TTFs cover full Greek + Latin +
// Cyrillic + Euro (verified), so Greek invoice text renders correctly. SemiBold is
// the document "bold" (the app's heaviest loaded weight).
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
    price: 'Αξία', discount: 'Έκπτωση', priceAfterDiscount: 'Αξία μετά Έκπτωσης',
    withheld: 'Παρακρατήσεις', total: 'Πληρωτέο Ποσό', paid: 'Πληρωμένο', due2: 'Υπόλοιπο',
    prevBalance: 'Προηγούμενο υπόλοιπο', prevCredit: 'Προηγούμενη πίστωση', totalWithPrev: 'Συνολικό οφειλόμενο',
    vatSuspended: 'ΦΠΑ σε αναστολή', payOnline: 'Πληρωμή / προβολή online', scanToPay: 'Σαρώστε για πληρωμή',
    fees: 'Τέλη', stamp: 'Χαρτόσημο', otherTaxes: 'Λοιποί Φόροι', deductions: 'Κρατήσεις',
    digitalFee: 'Ψηφιακό Τέλος Συναλλαγής', related: 'Σχετ. Παραστατικό',
    paymentMethod: 'Τρόπος Πληρωμής', bank: 'Τραπεζικός Λογαριασμός', registry: 'ΓΕΜΗ', website: 'Ιστότοπος',
    mark: 'ΜΑΡΚ', uid: 'UID', verify: 'Σαρώστε για επαλήθευση στο myDATA',
    movement: 'ΣΤΟΙΧΕΙΑ ΔΙΑΚΙΝΗΣΗΣ', loadingPlace: 'Τόπος φόρτωσης', deliveryPlace: 'Τόπος παράδοσης',
    vehicle: 'Όχημα', purpose: 'Σκοπός', notes: 'Σημειώσεις', page: 'Σελίδα', of: 'από',
    paymentReceipt: 'ΑΠΟΔΕΙΞΗ ΕΙΣΠΡΑΞΗΣ', received: 'Εισπράχθηκε', method: 'Τρόπος πληρωμής',
    appliedTo: 'Εξόφληση', reference: 'Αναφορά', thankYou: 'Ευχαριστούμε για την πληρωμή σας.',
    contact: 'Επικοινωνία', office: 'Έδρα', value: 'Αξία', amountPaid: 'Ποσό πληρωμής',
    inWords: 'Ολογράφως', receivedBy: 'Ο λαβών', newBalance: 'Νέο υπόλοιπο', serial: 'Α/Α', code: 'Κωδ.',
    orderDetails: 'ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ', billTo: 'ΣΤΟΙΧΕΙΑ ΧΡΕΩΣΗΣ', shipTo: 'ΣΤΟΙΧΕΙΑ ΔΙΑΚΙΝΗΣΗΣ',
    itemCode: 'Κωδ. Είδους', itemDescr: 'Περιγραφή Είδους', itemComment: 'Σχόλιο Είδους',
    order: 'Παραγγελία', invoiceNo: 'Τιμολόγιο', orderNotes: 'Σημείωση παραγγελίας',
    receiptDetails: 'ΣΤΟΙΧΕΙΑ ΑΠΟΔΕΙΞΗΣ', paidTo: 'ΣΤΟΙΧΕΙΑ ΔΙΚΑΙΟΥΧΟΥ', settledDocs: 'ΣΤΟΙΧΕΙΑ ΕΞΟΦΛΗΣΗΣ',
    document: 'Παραστατικό', supplierBill: 'Παραστατικό προμηθευτή', onAccount: 'Πληρωμή έναντι λογαριασμού',
    allocated: 'Κατανεμημένο', unallocated: 'Έναντι λογαριασμού', remarks: 'Παρατηρήσεις',
    preInvoice: 'ΠΡΟΤΙΜΟΛΟΓΙΟ', preInvoiceNote: 'Δεν αποτελεί φορολογικό παραστατικό.',
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
    price: 'Price', discount: 'Discount', priceAfterDiscount: 'Price after Discount',
    withheld: 'Withholding', total: 'Amount due', paid: 'Paid', due2: 'Balance',
    prevBalance: 'Previous balance', prevCredit: 'Previous credit', totalWithPrev: 'Total outstanding',
    vatSuspended: 'VAT payment suspended', payOnline: 'Pay / View online', scanToPay: 'Scan to pay online',
    fees: 'Fees', stamp: 'Stamp duty', otherTaxes: 'Other taxes', deductions: 'Deductions',
    digitalFee: 'Digital transaction fee', related: 'Related doc',
    paymentMethod: 'Payment method', bank: 'Bank account', registry: 'Reg. no.', website: 'Website',
    mark: 'MARK', uid: 'UID', verify: 'Scan to verify on myDATA',
    movement: 'TRANSPORT DETAILS', loadingPlace: 'Loading place', deliveryPlace: 'Delivery place',
    vehicle: 'Vehicle', purpose: 'Purpose', notes: 'Notes', page: 'Page', of: 'of',
    paymentReceipt: 'PAYMENT RECEIPT', received: 'Received', method: 'Payment method',
    appliedTo: 'Applied to', reference: 'Reference', thankYou: 'Thank you for your payment.',
    contact: 'Contact', office: 'Registered office', value: 'Value', amountPaid: 'Amount paid',
    inWords: 'In words', receivedBy: 'Received by', newBalance: 'New balance', serial: 'No.', code: 'Code',
    orderDetails: 'ORDER DETAILS', billTo: 'BILL TO', shipTo: 'SHIP TO',
    itemCode: 'Item code', itemDescr: 'Description', itemComment: 'Comment',
    order: 'Order', invoiceNo: 'Invoice', orderNotes: 'Order note',
    receiptDetails: 'RECEIPT DETAILS', paidTo: 'PAID TO', settledDocs: 'SETTLEMENT DETAILS',
    document: 'Document', supplierBill: 'Supplier bill', onAccount: 'Payment on account',
    allocated: 'Allocated', unallocated: 'On account', remarks: 'Remarks',
    preInvoice: 'PRE-INVOICE', preInvoiceNote: 'Not a tax document.',
  },
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank transfer', cash: 'Cash', card: 'Card', check: 'Check', iris: 'IRIS', other: 'Other',
};

function docTitle(documentType: string | null, L: Record<string, string>, status?: string | null): string {
  // A DRAFT sales/service invoice is a pre-invoice (προτιμολόγιο): numbered but not issued
  // and never transmitted to myDATA, so it must NOT print as a fiscal "SALES INVOICE".
  // Retail receipts (11.x), credit notes (5.x) and delivery notes (9.3) keep their own titles.
  const isSalesOrService = !documentType || /^[12]\./.test(documentType);
  if (status === 'draft' && isSalesOrService) return L.preInvoice;
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

function fmtMoney(n: any, currency: string, lang: Lang): string {
  const v = Number(n ?? 0);
  const s = new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  const sym = currency === 'EUR' ? '€' : currency;
  return `${s} ${sym}`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(withApiLogging('finance-invoice-pdf', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Body is parsed BEFORE auth so we can tell an internal receipt call apart from a
  // user-driven render (the two authenticate differently — see below).
  let kind: 'invoice' | 'credit_note' | 'delivery_note' | 'payment_receipt' = 'invoice';
  let docId = '';
  let regenerate = false;
  try {
    const body = await req.json();
    regenerate = !!body.regenerate;
    if (body.credit_note_id) { kind = 'credit_note'; docId = body.credit_note_id; }
    else if (body.delivery_note_id) { kind = 'delivery_note'; docId = body.delivery_note_id; }
    else if (body.payment_id) { kind = 'payment_receipt'; docId = body.payment_id; }
    else if (body.invoice_id) { kind = 'invoice'; docId = body.invoice_id; }
    else return json({ error: 'invoice_id, credit_note_id, delivery_note_id or payment_id is required' }, 400);
  } catch {
    return json({ error: 'invalid body' }, 400);
  }

  // Service-to-service: the Stripe webhook has no user, so it can't mint the payment
  // receipt the way the finance UI does. A trusted internal caller (service-role or a
  // valid x-cron-secret) may generate a PAYMENT RECEIPT — and nothing else. Every other
  // document kind still requires a finance user, and the payment_id fully determines the
  // workspace server-side, so no caller-supplied tenancy is ever trusted.
  const internal = kind === 'payment_receipt' && isCronAuthorized(req);
  let authUserId: string | null = null;
  if (!internal) {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin', 'owner', 'finance'] });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);
    authUserId = auth.userId;
  } else {
    // authenticate() normally does this; internal calls must bootstrap secrets themselves.
    await bootstrapForFunction();
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const TABLE = kind === 'credit_note' ? 'credit_notes' : kind === 'delivery_note' ? 'delivery_notes' : kind === 'payment_receipt' ? 'payments' : 'invoices';
  const OUT = kind === 'credit_note' ? 'credit-note-output' : kind === 'delivery_note' ? 'delivery-note-output' : kind === 'payment_receipt' ? 'payment-receipt-output' : 'invoice-output';
  const PREFIX = kind === 'credit_note' ? 'cn' : kind === 'delivery_note' ? 'dn' : kind === 'payment_receipt' ? 'pr' : 'inv';

  const { data: row } = await supabase.from(TABLE).select('*').eq('id', docId).maybeSingle();
  if (!row) return json({ error: `${kind} not found` }, 404);
  // Tenancy: a finance user may only render documents in a workspace they belong to.
  // (Internal receipt calls have no user; their trust comes from the service secret.)
  if (!internal && !(await userCanAccessWorkspace(supabase, authUserId, row.workspace_id))) {
    return json({ error: 'Not authorized for this document' }, 403);
  }

  if (!regenerate && row.pdf_storage_path && row.pdf_generation_status === 'completed') {
    const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(row.pdf_storage_path, 60 * 60 * 24 * 7);
    return json({ ok: true, pdf_url: signed?.signedUrl, pdf_storage_path: row.pdf_storage_path, cached: true });
  }

  // A payment receipt (απόδειξη είσπραξης) is a proof-of-payment the customer already
  // holds. Once one has been issued (receipt_number assigned + PDF stored), never silently
  // re-render it for a DIFFERENT amount — that would hand the customer a second receipt whose
  // figure no longer matches the one they have. Applying credit no longer mutates payment
  // amounts (it allocates), so this is defense-in-depth: serve the issued copy unchanged.
  if (kind === 'payment_receipt' && (row as any).receipt_number && row.pdf_storage_path) {
    const { data: signed } = await supabase.storage.from('pdf-documents').createSignedUrl(row.pdf_storage_path, 60 * 60 * 24 * 7);
    return json({ ok: true, pdf_url: signed?.signedUrl, pdf_storage_path: row.pdf_storage_path, cached: true });
  }

  try {
    await supabase.from(TABLE).update({ pdf_generation_status: 'generating' }).eq('id', docId);

    // ── Payment receipt (απόδειξη είσπραξης) — its own clean acknowledgment layout,
    //    not a VAT invoice. Settles inbound money against one or more invoices. ──
    if (kind === 'payment_receipt') {
      const receiptNumber = (row as any).receipt_number || `PR-${String(docId).slice(0, 8).toUpperCase()}`;
      const [{ data: fsP }, { data: allocs }, { data: orderP }] = await Promise.all([
        supabase.from('finance_settings').select('*').eq('workspace_id', row.workspace_id).maybeSingle(),
        supabase.from('payment_allocations')
          .select('amount, invoice:invoices(internal_number, legal_number, fiscal_mark), supplier_bill:supplier_bills(supplier_bill_number), order:orders(order_number)')
          .eq('payment_id', docId),
        row.order_id
          ? supabase.from('orders').select('order_number, notes').eq('id', row.order_id).maybeSingle()
          : Promise.resolve({ data: null } as any),
      ]);
      let custP: any = null;
      if (row.counterparty_company_id) {
        const { data } = await supabase.from('crm_companies').select('*').eq('id', row.counterparty_company_id).maybeSingle();
        custP = data;
      } else if (row.counterparty_contact_id) {
        const { data } = await supabase.from('crm_contacts').select('*').eq('id', row.counterparty_contact_id).maybeSingle();
        custP = data;
      }
      let logoP: Uint8Array | null = null;
      if (fsP?.business_logo_path) {
        try {
          const { data: lf } = await supabase.storage.from('generation-images').download(fsP.business_logo_path);
          if (lf) logoP = new Uint8Array(await lf.arrayBuffer());
        } catch { /* logo optional */ }
      }
      // Bank the money moved through (shown as "method: bank" on the receipt).
      let bankAccountName: string | null = null;
      if (row.bank_account_id) {
        const { data: ba } = await supabase.from('finance_bank_accounts').select('name').eq('id', row.bank_account_id).maybeSingle();
        bankAccountName = (ba as any)?.name ?? null;
      }
      // New balance = the party's AR position after this payment. Positive = still owes;
      // negative = in credit. Delegated to get_customer_open_balance so there is exactly ONE
      // definition of a customer balance in the platform.
      // Only ever computed for direction='in'. A receipt for money we paid OUT (an expense,
      // a supplier bill) is an AP event: it moves the bank account, never the customer's
      // receivable. The previous hand-rolled sum here counted BOTH directions, so paying a
      // party inflated what that same party appeared to owe us.
      let newBalance: number | null = null;
      if (row.direction === 'in' && (row.counterparty_company_id || row.counterparty_contact_id)) {
        try {
          const { data: bal } = await supabase.rpc('get_customer_open_balance', {
            p_workspace_id: row.workspace_id,
            p_company_id: row.counterparty_company_id ?? null,
            p_contact_id: row.counterparty_company_id ? null : (row.counterparty_contact_id ?? null),
          });
          if (bal && typeof (bal as any).net_balance === 'number') newBalance = (bal as any).net_balance;
        } catch { /* balance optional */ }
      }
      const langP: Lang = fsP?.default_doc_language === 'el' ? 'el' : 'en';
      // Same palette as the workspace's invoices, so the receipt is on-brand. The receipt is
      // always drawn in the "commercial" (delivery-note) visual language regardless of the
      // chosen invoice template — colors are the only thing the template contributes.
      const colorsP = toPdfColors(resolveColorsHex(fsP?.invoice_template_id, fsP?.invoice_template_colors));
      const bytes = await buildPaymentReceiptPdf({
        payment: row, allocations: allocs ?? [], fs: fsP, customer: custP, lang: langP, logo: logoP,
        receiptNumber, bankAccountName, newBalance, colors: colorsP,
        orderNumber: orderP?.order_number ?? null, orderNotes: orderP?.notes ?? null,
      });
      const pPath = `${OUT}/${docId}/${PREFIX}-${docId}.pdf`;
      const { error: upPErr } = await supabase.storage.from('pdf-documents').upload(pPath, bytes, { upsert: true, contentType: 'application/pdf' });
      if (upPErr) throw upPErr;
      await supabase.from(TABLE).update({
        receipt_number: receiptNumber, pdf_storage_path: pPath, pdf_generation_status: 'completed', pdf_generated_at: new Date().toISOString(),
      }).eq('id', docId);
      const { data: signedP } = await supabase.storage.from('pdf-documents').createSignedUrl(pPath, 60 * 60 * 24 * 7);
      return json({ ok: true, pdf_url: signedP?.signedUrl, pdf_storage_path: pPath, receipt_number: receiptNumber });
    }

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

    // Bank details printed on the invoice come SOLELY from the treasury accounts flagged
    // "Show on invoice" (Settings → Bank accounts) — the single source of truth. The old
    // Business Identity list + legacy bank_* columns were retired. Always override so the
    // legacy finance_settings.bank_accounts jsonb is never printed.
    if (fs) {
      const { data: treasuryAccts } = await supabase
        .from('finance_bank_accounts')
        .select('name, kind, iban, account_ref')
        .eq('workspace_id', inv.workspace_id)
        .eq('is_active', true)
        .eq('show_on_invoice', true)
        .order('sort_order', { ascending: true });
      (fs as any).bank_accounts = (treasuryAccts ?? []).map((a: any) =>
        a.kind === 'bank'
          ? { type: 'bank', bank_name: a.name, iban: a.iban ?? '', beneficiary: (fs as any).business_name ?? '' }
          : { type: 'other', label: a.name, notes: a.account_ref ?? a.iban ?? '' },
      );
    }

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

    // Linked order — surface its number on the document and carry the customer's
    // order note (entered when the order was placed) onto the printed notes.
    if (inv.order_id) {
      const { data: ord } = await supabase.from('orders').select('order_number, notes').eq('id', inv.order_id).maybeSingle();
      if (ord?.order_number) inv.order_number = ord.order_number;
      if (ord?.notes) inv.order_notes = ord.notes;
    }

    // Business logo (generation-images/business-logos/…) — embedded in the header.
    let logo: Uint8Array | null = null;
    if (fs?.business_logo_path) {
      try {
        const { data: lf } = await supabase.storage.from('generation-images').download(fs.business_logo_path);
        if (lf) logo = new Uint8Array(await lf.arrayBuffer());
      } catch { /* logo optional */ }
    }

    // Carry-forward: what this customer already owed us BEFORE this document, so the invoice
    // shows their true position and not just this one line. Excludes the current invoice and
    // counts only inbound payments (an expense we paid them is AP, not AR). Opt-out per
    // workspace via finance_settings.invoice_show_previous_balance.
    let priorBalance: number | null = null;
    if (fs?.invoice_show_previous_balance !== false && (inv.customer_company_id || inv.customer_contact_id)) {
      try {
        const { data: pb } = await supabase.rpc('get_customer_prior_balance', {
          p_workspace_id: inv.workspace_id,
          p_company_id: inv.customer_company_id ?? null,
          p_contact_id: inv.customer_company_id ? null : (inv.customer_contact_id ?? null),
          p_exclude_invoice_id: inv.id,
          p_as_of: inv.issued_at ?? null,
        });
        const v = (pb as any)?.prior_balance;
        if (typeof v === 'number' && Math.abs(v) >= 0.01) priorBalance = v;
      } catch { /* carry-forward is informational — never block the document */ }
    }

    // English is the default; Greek only when explicitly chosen (until translations launch).
    const lang: Lang = inv.doc_language === 'el' ? 'el' : 'en';
    // Template: per-invoice snapshot wins, else workspace setting, else 'classic'.
    const templateId = inv.template_id || fs?.invoice_template_id || 'classic';
    const spec = getSpec(templateId);
    const colors = toPdfColors(resolveColorsHex(templateId, inv.template_colors ?? fs?.invoice_template_colors));

    // Pay / view-online link (invoices only, when enabled + still payable). Mint a token if
    // the invoice has none / an expired one — mint_invoice_pay_token persists it on the row.
    let payUrl: string | null = null;
    if (kind === 'invoice' && fs?.invoice_show_pay_link !== false
        && inv.status !== 'void' && inv.status !== 'credit_noted'
        && Number(inv.amount_due ?? inv.total ?? 0) > 0.005) {
      try {
        let token = inv.pay_token as string | null;
        const exp = inv.pay_token_expires_at ? new Date(inv.pay_token_expires_at) : null;
        if (!token || (exp && exp.getTime() < Date.now())) {
          const { data: tk } = await supabase.rpc('mint_invoice_pay_token', { p_invoice_id: inv.id, p_ttl_days: 90 });
          if (tk) token = tk as string;
        }
        if (token) {
          const base = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');
          payUrl = `${base}/pay/${token}`;
        }
      } catch { /* pay link is best-effort — never block the PDF */ }
    }

    const pdfBytes = await buildPdf({ inv, items, fs, customer, branch, lang, logo, spec, colors, priorBalance, payUrl });

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
}));

async function buildPdf(d: { inv: any; items: any[]; fs: any; customer: any; branch: any; lang: Lang; logo?: Uint8Array | null; spec: TemplateSpec; colors: InvoicePdfColors; priorBalance?: number | null; payUrl?: string | null }): Promise<Uint8Array> {
  const { inv, items, fs, customer, branch, lang, logo, spec, colors, priorBalance, payUrl } = d;
  const L = LABELS[lang];
  const isCommercial = spec.headerStyle === 'commercial';
  // Effective notes: the invoice's own notes, else the workspace default footer
  // (finance_settings.default_invoice_notes) — so documents created outside the
  // New Invoice dialog (POS, order→invoice, storefront) still print the footer.
  const effNotes = inv.print_terms !== false ? (inv.notes || fs?.default_invoice_notes || '') : '';
  const currency = inv.currency ?? 'EUR';
  const money = (n: any) => fmtMoney(n, currency, lang);
  // Template colors shadow the monochrome defaults so the rest of the layout code is unchanged.
  const INK = colors.text, MUTED = colors.muted, LINE = colors.line, HEADBG = colors.tableHeaderBg;
  const WHITE = rgb(1, 1, 1);

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
    const lines: string[] = [];
    // Honor explicit line breaks the user typed, THEN width-wrap each paragraph.
    for (const para of String(s ?? '').split(/\r?\n/)) {
      if (para.trim() === '') { lines.push(''); continue; }
      const words = para.split(/[ \t]+/).filter(Boolean); let cur = '';
      for (const w of words) {
        const t = cur ? cur + ' ' + w : w;
        if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
      }
      if (cur) lines.push(cur);
    }
    return lines.length ? lines : [''];
  };

  // ── Header (template-aware) ──
  // Bilingual issuer: on an English document prefer the *_en identity fields (name / address /
  // city / tax office / activity), falling back to the base (Greek) value when a translation
  // is missing. VAT, ΓΕΜΗ, phone, email, website, postal code are language-neutral.
  const en = lang === 'en';
  const bizName = (en ? (fs?.business_name_en || fs?.business_name) : fs?.business_name) || '';
  const bizAddress = en ? (fs?.business_address_en || fs?.business_address) : fs?.business_address;
  const bizCity = en ? (fs?.business_city_en || fs?.business_city) : fs?.business_city;
  const bizTaxOffice = en ? (fs?.business_tax_office_en || fs?.business_tax_office) : fs?.business_tax_office;
  const bizProfession = en ? (fs?.business_profession_en || fs?.business_profession) : fs?.business_profession;
  const issuerName = bizName;
  const title = docTitle(inv.document_type, L, inv.status);
  const isPreInvoice = title === L.preInvoice;
  const issuerLines = [
    [bizAddress, fs?.business_street_number].filter(Boolean).join(' '),
    [fs?.business_postal_code, bizCity].filter(Boolean).join(' '),
    fs?.business_vat ? `${L.vatNo}: ${fs.business_vat}` : '',
    bizTaxOffice ? `${L.taxOffice}: ${bizTaxOffice}` : '',
    bizProfession ? `${L.profession}: ${bizProfession}` : '',
    [fs?.business_phone ? `${L.phone} ${fs.business_phone}` : '', fs?.business_email || ''].filter(Boolean).join('  ·  '),
    fs?.business_website ? `${L.website}: ${fs.business_website}` : '',
    fs?.business_gemi ? `${L.registry}: ${fs.business_gemi}` : '',
    branch ? `${L.establishment} #${branch.branch_code}: ${[branch.name, branch.address, branch.street_number, branch.postal_code, branch.city].filter(Boolean).join(' ')}` : '',
  ].filter(Boolean) as string[];
  const metaRows: [string, string][] = [
    [L.number, String(inv.internal_number ?? inv.legal_number ?? '')],
    inv.series ? [L.series, String(inv.series)] : ['', ''],
    [L.date, inv.issued_at ? new Date(inv.issued_at).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB') : ''],
    inv.order_number ? [L.order, String(inv.order_number)] : ['', ''],
    inv.due_at ? [L.due, String(inv.due_at)] : ['', ''],
    inv.related_document ? [L.related, String(inv.related_document)] : ['', ''],
  ].filter((r) => r[0]) as [string, string][];

  // Pre-embed the logo once so any layout branch can place it.
  let logoImg: any = null, logoW = 0, logoH = 0;
  if (logo && inv.logo_mode !== 'none') {
    try {
      logoImg = await (async () => { try { return await pdf.embedPng(logo); } catch { return await pdf.embedJpg(logo); } })();
      const s = Math.min(120 / logoImg.width, 46 / logoImg.height);
      logoW = logoImg.width * s; logoH = logoImg.height * s;
    } catch { logoImg = null; }
  }

  const drawIssuerBlock = (x: number, topY: number, withLogo = true): number => {
    let yc = topY;
    if (withLogo && logoImg) { page.drawImage(logoImg, { x, y: yc - logoH, width: logoW, height: logoH }); yc -= logoH + 8; }
    text(issuerName, x, yc - 12, 15, bold, INK); yc -= 16;
    for (const l of issuerLines) { text(l, x, yc, 8.5, font, MUTED); yc -= 11; }
    return yc;
  };
  const drawMeta = (topY: number): number => {
    let my = topY;
    for (const [k, v] of metaRows) { textR(k, right - 95, my, 8.5, font, MUTED); textR(v, right, my, 9, bold); my -= 12; }
    return my;
  };

  // Sidebar (Modern): vertical accent wordmark in the left page margin. Drawn rotated 90°
  // so it reads bottom-to-top; glyphs sit within the [0, M] gutter, clear of the body (x ≥ M).
  if (spec.headerStyle === 'sidebar' && issuerName) {
    const wmSize = 15;
    const wmW = bold.widthOfTextAtSize(issuerName, wmSize);
    page.drawText(issuerName, {
      x: 24, y: Math.max(M, (A4.h - wmW) / 2), size: wmSize, font: bold,
      color: colors.accent, rotate: degrees(90),
    });
  }

  if (spec.headerStyle === 'commercial') {
    // Logo top-left, document title + QR top-right, issuer identity block (home badge) below.
    const topY = y;
    let leftBottom = topY;
    if (logoImg) { page.drawImage(logoImg, { x: M, y: topY - logoH, width: logoW, height: logoH }); leftBottom = topY - logoH; }
    textR(title, right, topY - 11, 12, bold, colors.accent);
    let qrBottom = topY - 18;
    if (inv.fiscal_qr_url && inv.print_online_code !== false) {
      const qs = 68;
      drawQr(page, String(inv.fiscal_qr_url), right - qs, topY - 22 - qs, qs);
      textR(L.verify, right, topY - 22 - qs - 9, 6.5, font, MUTED);
      qrBottom = topY - 22 - qs - 12;
    }
    const iy = Math.min(logoImg ? leftBottom - 16 : topY - 20, topY - 20);
    drawBadge(page, 'home', M + 9, iy - 9, 9, colors.accent);
    text(issuerName, M + 26, iy - 12, 15, bold, INK);
    let jy = iy - 26;
    for (const l of issuerLines) { text(l, M + 26, jy, 8.5, font, MUTED); jy -= 11; }
    y = Math.min(jy, qrBottom) - 6;
  } else if (spec.headerStyle === 'band') {
    const bandH = 70;
    page.drawRectangle({ x: 0, y: A4.h - bandH, width: A4.w, height: bandH, color: colors.headerBg });
    let nx = M;
    if (logoImg) { page.drawImage(logoImg, { x: M, y: A4.h - bandH + (bandH - logoH) / 2, width: logoW, height: logoH }); nx = M + logoW + 12; }
    text(issuerName, nx, A4.h - bandH / 2 - 5, 16, bold, colors.headerText);
    textR(title, right, A4.h - bandH / 2 - 6, 18, bold, colors.headerText);
    y = A4.h - bandH - 18;
    let iy = y; for (const l of issuerLines) { text(l, M, iy, 8.5, font, MUTED); iy -= 11; }
    const metaEnd = drawMeta(y);
    y = Math.min(iy, metaEnd) - 6;
  } else if (spec.headerStyle === 'minimal') {
    text(title, M, y - 30, 34, bold, INK);
    const metaEnd = drawMeta(y - 6);
    y = Math.min(y - 48, metaEnd) - 10;
    y = drawIssuerBlock(M, y, true) - 6;
  } else if (spec.titleStyle === 'left-xl') {
    text(title, M, y - 26, 30, bold, INK);
    const metaEnd = drawMeta(y - 6);
    const issEnd = drawIssuerBlock(M, y - 44, true);
    y = Math.min(issEnd, metaEnd) - 6;
  } else {
    // classic split: issuer left, title + meta right.
    const issEnd = drawIssuerBlock(M, y, true);
    textR(title, right, y - 2, 18, bold, colors.accent);
    const metaEnd = drawMeta(y - 24);
    y = Math.min(issEnd, metaEnd) - 6;
  }

  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.7, color: LINE });
  y -= 16;

  // A pre-invoice is not a fiscal document — say so plainly on the page.
  if (isPreInvoice) { text(L.preInvoiceNote, M, y, 8, font, MUTED); y -= 14; }

  // ── Customer / parties block ──
  const custName = customer ? (customer.name || [customer.first_name, customer.last_name].filter(Boolean).join(' ')) : '—';
  const custLines = customer ? [
    [customer.street ?? customer.address, customer.street_number].filter(Boolean).join(' '),
    [customer.postal_code, customer.city].filter(Boolean).join(' '),
    customer.vat_number ? `${L.vatNo}: ${customer.vat_number}` : '',
    customer.tax_office ? `${L.taxOffice}: ${customer.tax_office}` : '',
    [customer.phone ? `${L.phone} ${customer.phone}` : '', customer.email || ''].filter(Boolean).join('  ·  '),
  ].filter(Boolean) : [];

  if (isCommercial) {
    // Three icon-headed columns: order details · bill-to · ship-to (reference layout).
    const colW = (right - M - 20) / 3;
    const colX = [M, M + colW + 10, M + 2 * colW + 20];
    const orderLines = metaRows.map(([k, v]) => `${k}: ${v}`);
    const shipLines = inv.has_shipping
      ? [
          inv.ship_to ? `${L.deliveryPlace}: ${inv.ship_to}` : '',
          inv.ship_from ? `${L.loadingPlace}: ${inv.ship_from}` : '',
          inv.vehicle_number ? `${L.vehicle}: ${inv.vehicle_number}` : '',
        ].filter(Boolean)
      : custLines;
    const columns: [BadgeGlyph, string, string, string[]][] = [
      ['order', L.orderDetails, '', orderLines],
      ['bill', L.billTo, custName, custLines],
      ['ship', L.shipTo, '', shipLines],
    ];
    let colBottom = y;
    for (let i = 0; i < columns.length; i++) {
      const [glyph, header, name, lines] = columns[i];
      const cx = colX[i];
      drawBadge(page, glyph, cx + 8, y - 8, 8, colors.accent);
      text(header, cx + 22, y - 11, 8, bold, colors.accent);
      page.drawLine({ start: { x: cx + 22, y: y - 17 }, end: { x: cx + colW, y: y - 17 }, thickness: 0.4, color: LINE });
      let cyy = y - 28;
      if (name) { text(name, cx, cyy, 9, bold, INK); cyy -= 12; }
      for (const l of lines) {
        for (const wl of wrap(l, font, 8, colW - 4)) { text(wl, cx, cyy, 8, font, MUTED); cyy -= 10; }
      }
      colBottom = Math.min(colBottom, cyy);
    }
    y = colBottom - 8;
  } else {
    text(L.customer, M, y, 9, bold, MUTED);
    y -= 13;
    text(custName, M, y, 11, bold);
    y -= 13;
    for (const l of custLines) { text(l, M, y, 8.5, font, MUTED); y -= 11; }
    y -= 8;
  }

  // ── Items table ──
  const cols = { descr: M, qty: 300, unit: 340, price: 390, net: 450, vatp: 500, total: right };
  const drawHead = () => {
    if (isCommercial) {
      page.drawRectangle({ x: M, y: y - 3, width: right - M, height: 15, color: HEADBG });
      text(L.itemCode, M + 2, y, 7.5, bold);
      text(L.itemDescr, 112, y, 7.5, bold);
      text(L.itemComment, 240, y, 7.5, bold);
      textR(L.unitPrice, 400, y, 7.5, bold);
      textR(L.qty, 442, y, 7.5, bold);
      text(L.unit, 450, y, 7.5, bold);
      textR(L.net, right, y, 7.5, bold);
      y -= 18;
      return;
    }
    if (spec.tableHeaderFill) {
      page.drawRectangle({ x: M, y: y - 3, width: right - M, height: 16, color: HEADBG });
    }
    text(L.descr, cols.descr + 2, y, 8, bold);
    textR(L.qty, cols.qty + 28, y, 8, bold);
    text(L.unit, cols.unit, y, 8, bold);
    textR(L.unitPrice, cols.price + 52, y, 8, bold);
    textR(L.net, cols.net + 42, y, 8, bold);
    textR(L.vatPct, cols.vatp + 22, y, 8, bold);
    textR(L.lineTotal, cols.total, y, 8, bold);
    if (!spec.tableHeaderFill) {
      page.drawLine({ start: { x: M, y: y - 5 }, end: { x: right, y: y - 5 }, thickness: 1, color: LINE });
    }
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

    if (isCommercial) {
      const detailC = [[it.selected_color, it.selected_size].filter(Boolean).join(' / '), it.line_comments].filter(Boolean).join(' — ');
      const unitLabelC = it.unit ?? (it.measurement_unit_code != null ? UNIT_LABEL[Number(it.measurement_unit_code)] : '') ?? '';
      const codeLines = wrap(String(it.sku ?? '—'), font, 8, 64);
      const dLinesC = wrap(it.description ?? 'Item', font, 8, 118);
      const cLinesC = detailC ? wrap(detailC, font, 7.5, 88) : [];
      const rowHC = Math.max(13, Math.max(codeLines.length, dLinesC.length, cLinesC.length, 1) * 10 + 4);
      if (y - rowHC < M + 150) { newPage(); drawHead(); }
      let cyCode = y; for (const l of codeLines) { text(l, M + 2, cyCode, 8, font, MUTED); cyCode -= 10; }
      let cyD = y; for (const l of dLinesC) { text(l, 112, cyD, 8); cyD -= 10; }
      let cyK = y; for (const l of cLinesC) { text(l, 240, cyK, 7.5, font, MUTED); cyK -= 10; }
      textR(money(it.unit_price ?? 0), 400, y, 8);
      textR(qty, 442, y, 8);
      text(unitLabelC, 450, y, 8);
      textR(money(net), right, y, 8);
      y -= rowHC;
      page.drawLine({ start: { x: M, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.4, color: LINE });
      continue;
    }

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
  // Left column: notes (commercial — matches the reference's bottom-left Παρατηρήσεις),
  // otherwise the multi-rate VAT analysis.
  let vy = y;
  if (isCommercial) {
    if (effNotes) {
      text(L.notes, M, vy, 8, bold, MUTED); vy -= 13;
      for (const nl of wrap(effNotes, font, 8.5, right - M - 240)) { text(nl, M, vy, 8.5, font, MUTED); vy -= 11; }
    }
    if (inv.order_notes) {
      vy -= 3;
      text(L.orderNotes, M, vy, 8, bold, colors.accent); vy -= 12;
      for (const nl of wrap(String(inv.order_notes), font, 8.5, right - M - 240)) { text(nl, M, vy, 8.5, font, MUTED); vy -= 11; }
    }
  } else {
    text(L.vatAnalysis, M, vy, 8, bold, MUTED); vy -= 12;
    for (const [pct, agg] of Object.entries(vatByRate)) {
      text(`${L.net} ${pct}%: ${money(agg.net)}   ${L.vatAmt}: ${money(agg.vat)}`, M, vy, 8, font, MUTED);
      vy -= 11;
    }
  }

  // Totals (right box)
  const withheld = Number(inv.total_withheld_amount ?? 0);
  const grand = Number(inv.total ?? totNet + totVat - withheld);
  const boxX = right - 220;
  const totalsTop = y + 10;
  const row = (k: string, v: string, b = false) => {
    if (isCommercial) {
      // Reference layout: label left-aligned in the totals column, value right, hairline under.
      text(k, boxX, y, b ? 10 : 9, b ? bold : font, INK);
      textR(v, right, y, b ? 11 : 9.5, b ? bold : font);
      page.drawLine({ start: { x: boxX, y: y - 6 }, end: { x: right, y: y - 6 }, thickness: 0.4, color: LINE });
      y -= 20;
      return;
    }
    textR(k, right - 110, y, b ? 10 : 9, b ? bold : font, b ? INK : MUTED);
    textR(v, right, y, b ? 11 : 9.5, b ? bold : font);
    y -= b ? 16 : 13;
  };
  const fees = Number(inv.total_fees_amount ?? 0), stamp = Number(inv.total_stamp_duty_amount ?? 0);
  const otherTax = Number(inv.total_other_taxes_amount ?? 0), deductions = Number(inv.total_deductions_amount ?? 0);
  // Universal breakdown: Price / Discount / Price after Discount / VAT. The paid-upfront
  // (cash) discount scales the net + VAT so they foot to the stored grand total.
  const cashPct = Number(inv.cash_discount_pct ?? 0);
  const cashFactor = cashPct > 0 && cashPct < 100 ? 1 - cashPct / 100 : 1;
  const netAfter = Math.round(totNet * cashFactor * 100) / 100;
  const vatAfter = Math.round(totVat * cashFactor * 100) / 100;
  if (cashFactor < 1) {
    row(L.price, money(totNet));
    row(L.discount, `- ${money(Math.round((totNet - netAfter) * 100) / 100)}`);
    row(L.priceAfterDiscount, money(netAfter));
  } else {
    row(L.subtotalNet, money(netAfter));
  }
  row(L.totalVat, money(vatAfter));
  const digitalFee = Number(inv.digital_transaction_fee ?? 0);
  if (fees > 0) row(L.fees, money(fees));
  if (stamp > 0) row(L.stamp, money(stamp));
  if (otherTax > 0) row(L.otherTaxes, money(otherTax));
  if (digitalFee > 0) row(L.digitalFee, money(digitalFee));
  if (deductions > 0) row(L.deductions, `- ${money(deductions)}`);
  if (withheld > 0) row(L.withheld, `- ${money(withheld)}`);
  // Grand total — presentation per template.
  if (isCommercial) {
    // Large amount-due like the reference receipt (the preceding row already ruled off).
    text(L.total, boxX, y - 10, 10, bold, INK);
    textR(money(grand), right, y - 16, 22, bold, INK);
    y -= 28;
  } else if (spec.totalsBoxStyle === 'accent') {
    page.drawRectangle({ x: boxX, y: y - 4, width: right - boxX, height: 18, color: colors.accent });
    textR(L.total, right - 110, y + 1, 10, bold, WHITE);
    textR(money(grand), right, y + 1, 11, bold, WHITE);
    y -= 20;
  } else if (spec.totalsBoxStyle === 'accent-text') {
    // Modern: accent rule + accent-colored amount-due text (no filled box).
    page.drawLine({ start: { x: boxX, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.7, color: colors.accent });
    y -= 4;
    textR(L.total, right - 110, y, 10, bold, colors.accent);
    textR(money(grand), right, y, 11, bold, colors.accent);
    y -= 16;
  } else {
    page.drawLine({ start: { x: boxX, y: y + 4 }, end: { x: right, y: y + 4 }, thickness: 0.7, color: LINE });
    y -= 4;
    row(L.total, money(grand), true);
  }
  // Amount paid / balance due (mirrors the HTML preview).
  const amountPaid = Number(inv.amount_paid ?? 0);
  if (amountPaid > 0) {
    row(L.paid, `- ${money(amountPaid)}`);
    row(L.due2, money(Number(inv.amount_due ?? grand)), true);
  }
  // ── Carry-forward (informational) ──
  // Sits BELOW the grand total and never feeds it: `grand` is the myDATA/MARK figure for this
  // document alone. This block only tells the customer what they already owed on top of it.
  if (typeof priorBalance === 'number' && Math.abs(priorBalance) >= 0.01) {
    const thisDue = Number(inv.amount_due ?? grand);
    page.drawLine({ start: { x: boxX, y: y + 5 }, end: { x: right, y: y + 5 }, thickness: 0.4, color: LINE });
    y -= 3;
    if (priorBalance > 0) {
      row(L.prevBalance, money(priorBalance));
      row(L.totalWithPrev, money(Math.round((thisDue + priorBalance) * 100) / 100), true);
    } else {
      // Customer is in credit — show it as a credit, and never print a negative "total due".
      row(L.prevCredit, `- ${money(Math.abs(priorBalance))}`);
      row(L.totalWithPrev, money(Math.max(0, Math.round((thisDue + priorBalance) * 100) / 100)), true);
    }
  }
  if (spec.totalsBoxStyle === 'boxed') {
    page.drawRectangle({ x: boxX - 8, y: y - 2, width: (right - boxX) + 14, height: totalsTop - (y - 2), borderColor: LINE, borderWidth: 1 });
  }
  y = Math.min(y, vy) - 6;

  // ── VAT-suspension / reverse-charge legal note ──
  // When ΦΠΑ is suspended (e.g. art. 39a), the paper document must say so — the flag was
  // already transmitted to myDATA but never surfaced on the customer copy until now.
  if (inv.vat_payment_suspension) {
    if (y < M + 80) newPage();
    text(L.vatSuspended, M, y, 9, bold, colors.accent); y -= 14;
  }

  // ── Payment method + bank details ──
  const PAY_LABELS: Record<number, string> = { 1: 'Cash', 2: 'Check', 3: 'On credit', 4: 'Web banking', 5: 'POS / e-POS', 6: 'IRIS', 7: 'Domestic account', 8: 'Foreign account' };
  const payBits: string[] = [];
  if (inv.payment_method_code) payBits.push(`${L.paymentMethod}: ${PAY_LABELS[Number(inv.payment_method_code)] ?? inv.payment_method_code}`);
  if (inv.payment_method_info) payBits.push(String(inv.payment_method_info));
  // Payment accounts to print — sourced solely from the treasury accounts flagged
  // "Show on invoice" (mapped onto fs.bank_accounts above). No legacy fallback.
  const accounts: any[] = Array.isArray(fs?.bank_accounts) ? fs.bank_accounts : [];
  const accountLines: string[] = [];
  for (const a of accounts) {
    let detail = '';
    if (a?.type === 'bank') {
      detail = [a.bank_name, a.iban ? `IBAN ${a.iban}` : '', a.bic ? `BIC ${a.bic}` : '', a.beneficiary].filter(Boolean).join('  ·  ');
    } else if (a?.type === 'paypal') {
      detail = ['PayPal', a.paypal_email, a.url].filter(Boolean).join('  ·  ');
    } else {
      detail = [a.url, a.notes].filter(Boolean).join('  ·  ');
    }
    if (detail) accountLines.push(a?.label ? `${a.label}: ${detail}` : detail);
  }
  if (payBits.length || accountLines.length) {
    if (y < M + 110) newPage();
    // Sidebar (Modern) prints bank details in the accent color, like the design reference.
    const bankColor = spec.headerStyle === 'sidebar' ? colors.accent : MUTED;
    for (const pb of payBits) { text(pb, M, y, 8.5, font, MUTED); y -= 11; }
    accountLines.forEach((line, i) => {
      if (y < M + 60) newPage();
      text(i === 0 ? `${L.bank}: ${line}` : line, M, y, 8.5, font, bankColor); y -= 11;
    });
    y -= 4;
  }

  // ── Pay / view online (→ /pay/{token}) — a scannable QR + the link, so the customer
  //    holding the PDF can open their online page and pay. Distinct from the myDATA verify
  //    QR (that one proves the document to the tax authority; this one takes payment). ──
  if (payUrl) {
    if (y < M + 100) newPage();
    const qs = 64;
    const blockTop = y;
    drawQr(page, payUrl, right - qs, blockTop - qs, qs);
    textR(L.scanToPay, right, blockTop - qs - 9, 7, font, MUTED);
    text(L.payOnline, M, blockTop - 10, 9, bold, colors.accent);
    let py = blockTop - 24;
    for (const ul of wrap(payUrl, font, 8.5, right - M - qs - 16)) {
      text(ul, M, py, 8.5, font, spec.headerStyle === 'sidebar' ? colors.accent : MUTED); py -= 11;
    }
    y = Math.min(py, blockTop - qs - 12) - 8;
  }

  // ── Movement block (9.3 / invoice-with-shipping) ── (commercial shows ship-to in header columns)
  if (!isCommercial && inv.has_shipping) {
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

  // ── Notes / terms (gated by print_terms) + info box ── (commercial renders notes on the left)
  if (!isCommercial && effNotes) {
    if (y < M + 90) newPage();
    text(L.notes, M, y, 8, bold, MUTED); y -= 12;
    for (const nl of wrap(effNotes, font, 8.5, right - M - 130)) { text(nl, M, y, 8.5, font, MUTED); y -= 11; }
    y -= 2;
  }
  if (!isCommercial && inv.order_notes) {
    if (y < M + 80) newPage();
    text(L.orderNotes, M, y, 8, bold, MUTED); y -= 12;
    for (const nl of wrap(String(inv.order_notes), font, 8.5, right - M - 130)) { text(nl, M, y, 8.5, font, MUTED); y -= 11; }
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
    if (inv.fiscal_qr_url && inv.print_online_code !== false && !isCommercial) {
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

// Payment receipt (απόδειξη είσπραξης) — rendered in the SAME "commercial" visual language
// as the delivery-style invoice template (the reference document): logo top-left, title
// top-right, home-badged issuer identity, three icon-headed columns (receipt · bill-to ·
// settlement), a banded line table, bottom-left remarks and a bottom-right totals stack
// ending in the large amount. Only the content differs — money received, not goods sold.
// Document title mirrors the payment method (ΤΡΑΠΕΖΙΚΟ ΕΜΒΑΣΜΑ …).
const PAYMENT_METHOD_TITLE: Record<string, { en: string; el: string }> = {
  bank_transfer: { en: 'BANK TRANSFER', el: 'ΤΡΑΠΕΖΙΚΟ ΕΜΒΑΣΜΑ' },
  cash: { en: 'CASH', el: 'ΜΕΤΡΗΤΑ' },
  card: { en: 'CARD PAYMENT', el: 'ΚΑΡΤΑ' },
  check: { en: 'CHEQUE', el: 'ΕΠΙΤΑΓΗ' },
  iris: { en: 'IRIS', el: 'IRIS' },
  other: { en: 'PAYMENT', el: 'ΛΟΙΠΟΙ ΤΡΟΠΟΙ' },
};

// Width-wrap text (honors explicit line breaks first). Module-level so the receipt
// builder can use it (buildPdf keeps its own local copy).
function wrapText(s: string, f: PDFFont, size: number, maxW: number): string[] {
  const lines: string[] = [];
  for (const para of String(s ?? '').split(/\r?\n/)) {
    if (para.trim() === '') { lines.push(''); continue; }
    const words = para.split(/[ \t]+/).filter(Boolean); let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [''];
}

// ── Amount in words (receipt) ── EN + EL, 0..999,999 (plenty for a receipt line). ──
const EN_ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const EN_TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
function enHundreds(n: number): string {
  const p: string[] = [];
  if (n >= 100) { p.push(`${EN_ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { p.push(EN_TENS[Math.floor(n / 10)] + (n % 10 ? `-${EN_ONES[n % 10]}` : '')); n = 0; }
  if (n > 0) p.push(EN_ONES[n]);
  return p.join(' ');
}
function enInt(n: number): string {
  if (n === 0) return 'zero';
  const p: string[] = [];
  const th = Math.floor(n / 1000); n %= 1000;
  if (th) p.push(`${enHundreds(th)} thousand`);
  if (n) p.push(enHundreds(n));
  return p.join(' ');
}
const EL_ONES = ['μηδέν','ένα','δύο','τρία','τέσσερα','πέντε','έξι','επτά','οκτώ','εννέα','δέκα','έντεκα','δώδεκα','δεκατρία','δεκατέσσερα','δεκαπέντε','δεκαέξι','δεκαεπτά','δεκαοκτώ','δεκαεννέα'];
const EL_TENS = ['','','είκοσι','τριάντα','σαράντα','πενήντα','εξήντα','εβδομήντα','ογδόντα','ενενήντα'];
const EL_HUNDREDS = ['','εκατόν','διακόσια','τριακόσια','τετρακόσια','πεντακόσια','εξακόσια','επτακόσια','οκτακόσια','εννιακόσια'];
function elHundreds(n: number): string {
  const p: string[] = [];
  if (n >= 100) { const h = Math.floor(n / 100); p.push(h === 1 && n === 100 ? 'εκατό' : EL_HUNDREDS[h]); n %= 100; }
  if (n >= 20) { p.push(EL_TENS[Math.floor(n / 10)]); if (n % 10) p.push(EL_ONES[n % 10]); n = 0; }
  else if (n > 0) p.push(EL_ONES[n]);
  return p.join(' ');
}
function elInt(n: number): string {
  if (n === 0) return 'μηδέν';
  const p: string[] = [];
  const th = Math.floor(n / 1000); n %= 1000;
  if (th) p.push(th === 1 ? 'χίλια' : `${elHundreds(th)} χιλιάδες`);
  if (n) p.push(elHundreds(n));
  return p.join(' ');
}
function amountInWords(amount: number, currency: string, lang: Lang): string {
  const abs = Math.abs(amount);
  const whole = Math.floor(abs);
  const cents = Math.round((abs - whole) * 100);
  if (lang === 'el') {
    const cur = currency === 'EUR' ? 'ευρώ' : currency;
    let s = `${elInt(whole)} ${cur}`;
    if (cents) s += ` και ${elInt(cents)} λεπτά`;
    // Greek uppercase drops the tonos accent (ΟΚΤΑΚΟΣΙΑ, not ΟΚΤΑΚΌΣΙΑ).
    return s.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').normalize('NFC').toUpperCase();
  }
  const cur = currency === 'EUR' ? (whole === 1 ? 'euro' : 'euros') : currency;
  let s = `${enInt(whole)} ${cur}`;
  if (cents) s += ` and ${enInt(cents)} cent${cents === 1 ? '' : 's'}`;
  return s;
}

async function buildPaymentReceiptPdf(d: {
  payment: any; allocations: any[]; fs: any; customer: any; lang: Lang; logo?: Uint8Array | null;
  receiptNumber: string; bankAccountName?: string | null; newBalance?: number | null;
  colors: InvoicePdfColors; orderNumber?: string | null; orderNotes?: string | null;
}): Promise<Uint8Array> {
  const { payment, allocations, fs, customer, lang, logo, receiptNumber, bankAccountName, newBalance, colors, orderNumber, orderNotes } = d;
  const L = LABELS[lang];
  const currency = payment.currency ?? 'EUR';
  const money = (n: any) => fmtMoney(n, currency, lang);
  // Bare (symbol-less) amounts inside the table + totals stack, exactly like the reference.
  const num = (n: any) => new Intl.NumberFormat(lang === 'el' ? 'el-GR' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n ?? 0));
  const fmtDate = (v: any) => (v ? new Date(v).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB') : '');
  const INK = colors.text, MUTED = colors.muted, LINE = colors.line, ACC = colors.accent, HEADBG = colors.tableHeaderBg;

  const fonts = await loadFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  let page = pdf.addPage([A4.w, A4.h]);
  const right = A4.w - M;
  let y = A4.h - M;
  const text = (s: any, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(String(s ?? ''), { x, y: yy, size, font: f, color });
  const textR = (s: any, xRight: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(String(s ?? ''), { x: xRight - f.widthOfTextAtSize(String(s ?? ''), size), y: yy, size, font: f, color });
  const rule = (x1: number, x2: number, yy: number, thickness = 0.4, color = LINE) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });

  // ── Header: logo top-left · document title top-right ──
  const topY = y;
  let leftBottom = topY;
  if (logo) {
    try {
      const img = await (async () => { try { return await pdf.embedPng(logo); } catch { return await pdf.embedJpg(logo); } })();
      const s = Math.min(120 / img.width, 46 / img.height);
      page.drawImage(img, { x: M, y: topY - img.height * s, width: img.width * s, height: img.height * s });
      leftBottom = topY - img.height * s;
    } catch { /* logo optional */ }
  }
  // Title = the payment method (ΤΡΑΠΕΖΙΚΟ ΕΜΒΑΣΜΑ / BANK TRANSFER …), with the receipt
  // kind spelled out underneath so the document still names itself.
  const title = payment.method ? (PAYMENT_METHOD_TITLE[String(payment.method)]?.[lang] ?? L.paymentReceipt) : L.paymentReceipt;
  textR(title, right, topY - 11, 12, bold, ACC);
  textR(L.paymentReceipt, right, topY - 23, 7.5, font, MUTED);

  // ── Issuer identity, home-badged (reference layout) ──
  const iy = Math.min(logo ? leftBottom - 16 : topY - 20, topY - 20);
  drawBadge(page, 'home', M + 9, iy - 9, 9, ACC);
  const rEn = lang === 'en';
  const rBizName = (rEn ? (fs?.business_name_en || fs?.business_name) : fs?.business_name) || '';
  const rBizAddress = rEn ? (fs?.business_address_en || fs?.business_address) : fs?.business_address;
  const rBizCity = rEn ? (fs?.business_city_en || fs?.business_city) : fs?.business_city;
  const rBizTaxOffice = rEn ? (fs?.business_tax_office_en || fs?.business_tax_office) : fs?.business_tax_office;
  text(rBizName, M + 26, iy - 12, 15, bold, INK);
  const issuerLines = [
    [rBizAddress, fs?.business_street_number, fs?.business_postal_code, rBizCity].filter(Boolean).join(', '),
    fs?.business_phone ? `${L.phone} ${fs.business_phone}` : '',
    fs?.business_email || '',
    fs?.business_vat ? `${L.vatNo}: ${fs.business_vat}` : '',
    rBizTaxOffice ? `${L.taxOffice}: ${rBizTaxOffice}` : '',
  ].filter(Boolean) as string[];
  let jy = iy - 26;
  for (const l of issuerLines) {
    for (const wl of wrapText(l, font, 8.5, 300)) { text(wl, M + 26, jy, 8.5, font, MUTED); jy -= 11; }
  }
  y = jy - 10;

  // ── Three icon-headed columns: receipt details · payer/payee · settlement ──
  const colW = (right - M - 20) / 3;
  const colX = [M, M + colW + 10, M + 2 * colW + 20];
  const isOut = payment.direction === 'out';
  const custName = customer ? (customer.name || [customer.first_name, customer.last_name].filter(Boolean).join(' ')) : '—';
  const custCode = customer ? (customer.code || customer.customer_code || customer.customer_number) : null;
  const methodLabel = payment.method ? (PAYMENT_METHOD_LABELS[String(payment.method)] ?? String(payment.method)) : '';

  const receiptLines = [
    `${L.date}: ${fmtDate(payment.paid_at)}`,
    `${L.serial} ${L.paymentReceipt.toLowerCase()}: ${receiptNumber}`,
    orderNumber ? `${L.order}: ${orderNumber}` : '',
    `${L.method}: ${[methodLabel, bankAccountName].filter(Boolean).join(' — ')}`,
    payment.reference ? `${L.reference}: ${payment.reference}` : '',
  ].filter(Boolean) as string[];
  const partyLines = [
    custCode ? `${L.code}: ${custCode}` : '',
    [customer?.street ?? customer?.address, customer?.street_number].filter(Boolean).join(' '),
    [customer?.postal_code, customer?.city].filter(Boolean).join(' '),
    customer?.vat_number ? `${L.vatNo}: ${customer.vat_number}` : '',
    customer?.tax_office ? `${L.taxOffice}: ${customer.tax_office}` : '',
  ].filter(Boolean) as string[];
  const invRefs = [...new Set((allocations ?? []).map((a: any) => a.invoice?.legal_number || a.invoice?.internal_number).filter(Boolean))];
  const ordRefs = [...new Set((allocations ?? []).map((a: any) => a.order?.order_number).filter(Boolean))];
  const marks = [...new Set((allocations ?? []).map((a: any) => a.invoice?.fiscal_mark).filter(Boolean))];
  const allocated = (allocations ?? []).reduce((s: number, a: any) => s + Number(a.amount ?? 0), 0);
  const settleLines = [
    invRefs.length ? `${L.invoiceNo}: ${invRefs.join(', ')}` : '',
    ordRefs.length ? `${L.order}: ${ordRefs.join(', ')}` : '',
    (!invRefs.length && !ordRefs.length) ? L.onAccount : '',
    marks.length ? `${L.mark}: ${marks.join(', ')}` : '',
    `${L.allocated}: ${num(allocated)}`,
    Math.abs(Number(payment.amount ?? 0) - allocated) >= 0.01
      ? `${L.unallocated}: ${num(Number(payment.amount ?? 0) - allocated)}${payment.credit_number ? ` (${payment.credit_number})` : ''}` : '',
  ].filter(Boolean) as string[];

  const columns: [BadgeGlyph, string, string, string[]][] = [
    ['order', L.receiptDetails, '', receiptLines],
    ['bill', isOut ? L.paidTo : L.billTo, custName, partyLines],
    ['ship', L.settledDocs, '', settleLines],
  ];
  let colBottom = y;
  for (let i = 0; i < columns.length; i++) {
    const [glyph, header, name, lines] = columns[i];
    const cx = colX[i];
    drawBadge(page, glyph, cx + 8, y - 8, 8, ACC);
    text(header, cx + 22, y - 11, 8, bold, ACC);
    rule(cx + 22, cx + colW, y - 17);
    let cyy = y - 28;
    if (name) { for (const wl of wrapText(name, bold, 9, colW - 4)) { text(wl, cx, cyy, 9, bold, INK); cyy -= 12; } }
    for (const l of lines) {
      for (const wl of wrapText(l, font, 8, colW - 4)) { text(wl, cx, cyy, 8, font, MUTED); cyy -= 10; }
    }
    colBottom = Math.min(colBottom, cyy);
  }
  y = colBottom - 18;

  // ── Settlement table (one row per settled document) ──
  const cDoc = M + 2, cDescr = 130, cMark = 260, cDate = 430, cAmt = right;
  const drawHead = () => {
    page.drawRectangle({ x: M, y: y - 3, width: right - M, height: 15, color: HEADBG });
    text(L.document, cDoc, y, 7.5, bold);
    text(L.itemDescr, cDescr, y, 7.5, bold);
    text(L.mark, cMark, y, 7.5, bold);
    textR(L.date, cDate, y, 7.5, bold);
    textR(L.value, cAmt, y, 7.5, bold);
    y -= 18;
  };
  const newPage = () => { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M; };
  drawHead();

  type Row = { doc: string; descr: string; mark: string; date: string; amount: number };
  const rows: Row[] = (allocations ?? []).map((a: any) => ({
    doc: a.invoice?.legal_number || a.invoice?.internal_number || a.supplier_bill?.supplier_bill_number || '—',
    descr: a.invoice ? L.invoiceNo : a.supplier_bill ? L.supplierBill : L.appliedTo,
    mark: a.invoice?.fiscal_mark ?? '',
    date: '',
    amount: Number(a.amount ?? 0),
  }));
  // Money received with nothing (or only partly) allocated still needs a printed line.
  const residual = Math.round((Number(payment.amount ?? 0) - allocated) * 100) / 100;
  if (rows.length === 0 || Math.abs(residual) >= 0.01) {
    rows.push({ doc: '—', descr: L.onAccount, mark: '', date: '', amount: rows.length === 0 ? Number(payment.amount ?? 0) : residual });
  }
  for (const r of rows) {
    const docLines = wrapText(r.doc, font, 8, 92);
    const dLines = wrapText(r.descr, font, 8, 120);
    const mLines = wrapText(r.mark, font, 7.5, 160);
    const rowH = Math.max(13, Math.max(docLines.length, dLines.length, mLines.length, 1) * 10 + 4);
    if (y - rowH < M + 170) { newPage(); drawHead(); }
    let a1 = y; for (const l of docLines) { text(l, cDoc, a1, 8, font, MUTED); a1 -= 10; }
    let a2 = y; for (const l of dLines) { text(l, cDescr, a2, 8); a2 -= 10; }
    let a3 = y; for (const l of mLines) { text(l, cMark, a3, 7.5, font, MUTED); a3 -= 10; }
    textR(r.date, cDate, y, 8, font, MUTED);
    textR(num(r.amount), cAmt, y, 8);
    y -= rowH;
    rule(M, right, y + 4);
  }

  // ── Bottom: remarks (left) · totals stack (right) ──
  if (y < M + 175) newPage();
  y -= 18;
  const totalsX = right - 240;
  const notesW = totalsX - M - 24;

  let ny = y;
  text(L.remarks, M, ny, 9, bold, INK);
  rule(M, M + notesW, ny - 6, 0.6);
  ny -= 20;
  const noteBlocks: [string | null, string][] = [
    [null, payment.notes ? String(payment.notes) : ''],
    [L.orderNotes, orderNotes ? String(orderNotes) : ''],
    [L.inWords, amountInWords(Number(payment.amount), currency, lang)],
  ];
  for (const [head, body] of noteBlocks) {
    if (!body) continue;
    if (head) { text(`${head}:`, M, ny, 8, bold, MUTED); ny -= 11; }
    for (const nl of wrapText(body, font, 8.5, notesW)) { text(nl, M, ny, 8.5, font, MUTED); ny -= 11; }
    ny -= 4;
  }

  let ty = y;
  const totalRow = (k: string, v: string) => {
    text(k, totalsX, ty, 9, font, INK);
    textR(v, right, ty, 9, font, INK);
    rule(totalsX, right, ty - 6);
    ty -= 20;
  };
  totalRow(L.allocated, num(allocated));
  if (Math.abs(residual) >= 0.01) totalRow(L.unallocated, num(residual));
  if (newBalance != null && Number.isFinite(newBalance)) totalRow(L.newBalance, num(newBalance));
  // Large amount, exactly like the reference's "Πληρωτέο Ποσό".
  ty -= 4;
  text(L.amountPaid, totalsX, ty - 12, 10, bold, INK);
  textR(money(payment.amount), right, ty - 18, 22, bold, INK);
  ty -= 34;

  // ── Signature line (received by) ──
  y = Math.min(ny, ty) - 24;
  if (y < M + 40) { newPage(); y = A4.h - M - 40; }
  rule(right - 165, right, y, 0.6);
  textR(L.receivedBy.toUpperCase(), right, y - 11, 7.5, font, MUTED);

  return await pdf.save();
}

// Small line-art glyph inside a circular badge, echoing the reference receipt's section
// icons (home / order / bill-to / ship-to). Drawn from primitives — no icon font needed.
type BadgeGlyph = 'home' | 'order' | 'bill' | 'ship';
function drawBadge(page: PDFPage, glyph: BadgeGlyph, cx: number, cy: number, r: number, color: RGB) {
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: color, borderWidth: 1 });
  const s = r * 0.5; // glyph half-extent
  const line = (x1: number, y1: number, x2: number, y2: number, t = 0.9) =>
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: t, color });
  if (glyph === 'home') {
    line(cx - s, cy, cx, cy + s);                       // left roof
    line(cx, cy + s, cx + s, cy);                       // right roof
    line(cx - s * 0.66, cy, cx - s * 0.66, cy - s);     // left wall
    line(cx + s * 0.66, cy, cx + s * 0.66, cy - s);     // right wall
    line(cx - s * 0.66, cy - s, cx + s * 0.66, cy - s); // floor
  } else if (glyph === 'order') {
    line(cx, cy + s, cx, cy - s * 0.2);                 // stem
    line(cx - s * 0.55, cy - s * 0.15, cx, cy - s * 0.6); // arrowhead left
    line(cx + s * 0.55, cy - s * 0.15, cx, cy - s * 0.6); // arrowhead right
    line(cx - s * 0.85, cy - s * 0.9, cx + s * 0.85, cy - s * 0.9); // tray base
  } else if (glyph === 'bill') {
    page.drawCircle({ x: cx, y: cy + s * 0.45, size: s * 0.4, color }); // head (filled)
    line(cx - s * 0.62, cy - s * 0.15, cx - s * 0.62, cy - s * 0.9);    // left shoulder
    line(cx + s * 0.62, cy - s * 0.15, cx + s * 0.62, cy - s * 0.9);    // right shoulder
    line(cx - s * 0.62, cy - s * 0.15, cx + s * 0.62, cy - s * 0.15);   // shoulders top
  } else {
    // ship: truck (cargo box + cab + two wheels)
    page.drawRectangle({ x: cx - s, y: cy - s * 0.15, width: s * 1.05, height: s * 0.9, borderColor: color, borderWidth: 0.9 });
    page.drawRectangle({ x: cx + s * 0.1, y: cy - s * 0.15, width: s * 0.7, height: s * 0.55, borderColor: color, borderWidth: 0.9 });
    page.drawCircle({ x: cx - s * 0.5, y: cy - s * 0.32, size: s * 0.22, color });
    page.drawCircle({ x: cx + s * 0.5, y: cy - s * 0.32, size: s * 0.22, color });
  }
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
