import { UNITS, unitSuffix } from '@/lib/units';
// Bilingual label dictionary for invoice documents. MUST stay identical to the copy
// in supabase/functions/finance-invoice-pdf/index.ts so HTML and PDF read the same.
// This is a legal tax document (παραστατικό) — the Greek here is intentional and is NOT
// subject to the English-only-UI rule (the user picks GR/EN per invoice via doc_language).

export type Lang = 'el' | 'en';

export const INVOICE_LABELS: Record<Lang, Record<string, string>> = {
  el: {
    invoice: 'ΤΙΜΟΛΟΓΙΟ ΠΩΛΗΣΗΣ', service: 'ΤΙΜΟΛΟΓΙΟ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ',
    receipt: 'ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ', creditNote: 'ΠΙΣΤΩΤΙΚΟ ΤΙΜΟΛΟΓΙΟ', deliveryNote: 'ΔΕΛΤΙΟ ΑΠΟΣΤΟΛΗΣ',
    retailCreditNote: 'ΠΙΣΤΩΤΙΚΟ ΣΤΟΙΧΕΙΟ ΛΙΑΝΙΚΗΣ',
    issuer: 'ΕΚΔΟΤΗΣ', customer: 'ΠΕΛΑΤΗΣ', vatNo: 'ΑΦΜ', taxOffice: 'ΔΟΥ', profession: 'Δραστηριότητα',
    phone: 'Τηλ.', email: 'Email', establishment: 'Εγκατάσταση',
    number: 'Αριθμός', series: 'Σειρά', date: 'Ημερομηνία', due: 'Λήξη',
    descr: 'Περιγραφή', qty: 'Ποσ.', unit: 'Μ.Μ.', unitPrice: 'Τιμή Μον.', net: 'Καθαρή Αξία',
    vatPct: 'ΦΠΑ%', vatAmt: 'Αξία ΦΠΑ', lineTotal: 'Σύνολο',
    lineNo: '#', lineDiscount: 'Έκπτωση', lineOtherTaxes: 'Λοιποί Φόροι', totalValue: 'Συνολική Αξία',
    vatAnalysis: 'Ανάλυση ΦΠΑ', subtotalNet: 'Καθαρή Αξία', totalVat: 'Σύνολο ΦΠΑ',
    price: 'Αξία', discount: 'Έκπτωση', priceAfterDiscount: 'Αξία μετά Έκπτωσης',
    withheld: 'Παρακρατήσεις', total: 'Σύνολο', paid: 'Πληρωμένο', due2: 'Υπόλοιπο',
    prevBalance: 'Προηγούμενο υπόλοιπο', prevCredit: 'Προηγούμενη πίστωση', totalWithPrev: 'Συνολικό οφειλόμενο',
    vatSuspended: 'ΦΠΑ σε αναστολή', payOnline: 'Πληρωμή / προβολή online', scanToPay: 'Σαρώστε για πληρωμή',
    fees: 'Τέλη', stamp: 'Χαρτόσημο', otherTaxes: 'Λοιποί Φόροι', deductions: 'Κρατήσεις',
    digitalFee: 'Ψηφιακό Τέλος Συναλλαγής', related: 'Σχετ. Παραστατικό',
    paymentMethod: 'Τρόπος Πληρωμής', bank: 'Τραπεζικός Λογαριασμός', registry: 'ΓΕΜΗ', website: 'Ιστότοπος',
    mark: 'ΜΑΡΚ', uid: 'UID', authCode: 'Κωδ. Αυθεντικοποίησης', verify: 'Σαρώστε για επαλήθευση στο myDATA',
    docType: 'Είδος Παραστατικού', time: 'Ώρα', correlated: 'Συσχετιζόμενα Παραστατικά',
    currency: 'Νόμισμα', fxRate: 'Ισοτιμία', payable: 'Πληρωτέο Ποσό', charges: 'Επιβαρύνσεις',
    exemptionNote: 'Αιτία απαλλαγής ΦΠΑ', deliveryInfo: 'ΣΤΟΙΧΕΙΑ ΠΑΡΑΔΟΣΗΣ',
    movement: 'ΣΤΟΙΧΕΙΑ ΔΙΑΚΙΝΗΣΗΣ', loadingPlace: 'Τόπος φόρτωσης', deliveryPlace: 'Τόπος παράδοσης',
    vehicle: 'Όχημα', purpose: 'Σκοπός', notes: 'Σημειώσεις', page: 'Σελίδα', of: 'από',
    orderDetails: 'ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ', billTo: 'ΣΤΟΙΧΕΙΑ ΧΡΕΩΣΗΣ', shipTo: 'ΣΤΟΙΧΕΙΑ ΔΙΑΚΙΝΗΣΗΣ',
    itemCode: 'Κωδ. Είδους', itemDescr: 'Περιγραφή Είδους', itemComment: 'Σχόλιο Είδους',
    order: 'Παραγγελία', invoiceNo: 'Τιμολόγιο', orderNotes: 'Σημείωση παραγγελίας',
    preInvoice: 'ΠΡΟΤΙΜΟΛΟΓΙΟ', preInvoiceNote: 'Δεν αποτελεί φορολογικό παραστατικό.',
  },
  en: {
    invoice: 'SALES INVOICE', service: 'SERVICE INVOICE',
    receipt: 'RETAIL RECEIPT', creditNote: 'CREDIT NOTE', deliveryNote: 'DELIVERY NOTE',
    retailCreditNote: 'RETAIL CREDIT NOTE',
    issuer: 'ISSUER', customer: 'CUSTOMER', vatNo: 'VAT No.', taxOffice: 'Tax office', profession: 'Activity',
    phone: 'Tel.', email: 'Email', establishment: 'Establishment',
    number: 'Number', series: 'Series', date: 'Date', due: 'Due',
    descr: 'Description', qty: 'Qty', unit: 'Unit', unitPrice: 'Unit price', net: 'Net',
    vatPct: 'VAT%', vatAmt: 'VAT', lineTotal: 'Total',
    lineNo: '#', lineDiscount: 'Discount', lineOtherTaxes: 'Other taxes', totalValue: 'Total value',
    vatAnalysis: 'VAT analysis', subtotalNet: 'Net total', totalVat: 'Total VAT',
    price: 'Price', discount: 'Discount', priceAfterDiscount: 'Price after Discount',
    withheld: 'Withholding', total: 'Total', paid: 'Paid', due2: 'Balance',
    prevBalance: 'Previous balance', prevCredit: 'Previous credit', totalWithPrev: 'Total outstanding',
    vatSuspended: 'VAT payment suspended', payOnline: 'Pay / View online', scanToPay: 'Scan to pay online',
    fees: 'Fees', stamp: 'Stamp duty', otherTaxes: 'Other taxes', deductions: 'Deductions',
    digitalFee: 'Digital transaction fee', related: 'Related doc',
    paymentMethod: 'Payment method', bank: 'Bank account', registry: 'Reg. no.', website: 'Website',
    mark: 'MARK', uid: 'UID', authCode: 'Auth code', verify: 'Scan to verify on myDATA',
    docType: 'Document type', time: 'Time', correlated: 'Correlated documents',
    currency: 'Currency', fxRate: 'Exchange rate', payable: 'Payable amount', charges: 'Charges',
    exemptionNote: 'VAT exemption ground', deliveryInfo: 'DELIVERY INFORMATION',
    movement: 'TRANSPORT DETAILS', loadingPlace: 'Loading place', deliveryPlace: 'Delivery place',
    vehicle: 'Vehicle', purpose: 'Purpose', notes: 'Notes', page: 'Page', of: 'of',
    orderDetails: 'ORDER DETAILS', billTo: 'BILL TO', shipTo: 'SHIP TO',
    itemCode: 'Item code', itemDescr: 'Description', itemComment: 'Comment',
    order: 'Order', invoiceNo: 'Invoice', orderNotes: 'Order note',
    preInvoice: 'PRE-INVOICE', preInvoiceNote: 'Not a tax document.',
  },
};

export function invoiceDocTitle(
  documentType: string | null | undefined,
  L: Record<string, string>,
  status?: string | null,
): string {
  // A DRAFT sales/service invoice is a pre-invoice (προτιμολόγιο) — numbered but not issued
  // and never sent to myDATA — so it must not print as a fiscal "SALES INVOICE".
  const isSalesOrService = !documentType || /^[12]\./.test(documentType);
  if (status === 'draft' && isSalesOrService) return L.preInvoice;
  switch (documentType) {
    case '2.1': case '2.2': case '2.3': case '2.4': return L.service;
    // 11.4 is the RETAIL CREDIT note — it sat in the receipt row and printed as
    // "ΑΠΟΔΕΙΞΗ ΛΙΑΝΙΚΗΣ", i.e. a refund document titled as a sale.
    case '11.4': return L.retailCreditNote;
    case '11.1': case '11.2': case '11.3': case '11.5': return L.receipt;
    case '5.1': case '5.2': return L.creditNote;
    case '9.3': return L.deliveryNote;
    default: return L.invoice;
  }
}

// The myDATA payment-method name comes from the ONE table (AADE 8.12) in
// `@/modules/finance/paymentVocabulary`, re-exported here so a template keeps importing its
// labels from one place. The literal that used to sit here was AADE's list rotated by two, so
// a POS receipt printed as "Domestic account" — see the header on `MYDATA_PAYMENT_CODE`.
export { mydataPaymentLabel } from '@/modules/finance/paymentVocabulary';

// myDATA VAT category → percent (when a line carries an explicit category).
export const VAT_PCT_BY_CAT: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };
/** AADE measurement-unit code → printed label. Derived from the canonical unit list so the
 *  PDF cannot drift from what the line was actually stored as. */
export const UNIT_LABEL_BY_CODE: Record<number, string> = Object.fromEntries(
  UNITS.filter((u) => u.mydataCode != null).map((u) => [u.mydataCode as number, unitSuffix(u.key)]),
) as Record<number, string>;
