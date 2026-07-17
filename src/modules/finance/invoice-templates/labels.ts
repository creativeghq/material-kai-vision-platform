// Bilingual label dictionary for invoice documents. MUST stay identical to the copy
// in supabase/functions/finance-invoice-pdf/index.ts so HTML and PDF read the same.
// This is a legal tax document (παραστατικό) — the Greek here is intentional and is NOT
// subject to the English-only-UI rule (the user picks GR/EN per invoice via doc_language).

export type Lang = 'el' | 'en';

export const INVOICE_LABELS: Record<Lang, Record<string, string>> = {
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
    fees: 'Τέλη', stamp: 'Χαρτόσημο', otherTaxes: 'Λοιποί Φόροι', deductions: 'Κρατήσεις',
    digitalFee: 'Ψηφιακό Τέλος Συναλλαγής', related: 'Σχετ. Παραστατικό',
    paymentMethod: 'Τρόπος Πληρωμής', bank: 'Τραπεζικός Λογαριασμός', registry: 'ΓΕΜΗ', website: 'Ιστότοπος',
    mark: 'ΜΑΡΚ', uid: 'UID', verify: 'Σαρώστε για επαλήθευση στο myDATA',
    movement: 'ΣΤΟΙΧΕΙΑ ΔΙΑΚΙΝΗΣΗΣ', loadingPlace: 'Τόπος φόρτωσης', deliveryPlace: 'Τόπος παράδοσης',
    vehicle: 'Όχημα', purpose: 'Σκοπός', notes: 'Σημειώσεις', page: 'Σελίδα', of: 'από',
    orderDetails: 'ΣΤΟΙΧΕΙΑ ΠΑΡΑΓΓΕΛΙΑΣ', billTo: 'ΣΤΟΙΧΕΙΑ ΧΡΕΩΣΗΣ', shipTo: 'ΣΤΟΙΧΕΙΑ ΔΙΑΚΙΝΗΣΗΣ',
    itemCode: 'Κωδ. Είδους', itemDescr: 'Περιγραφή Είδους', itemComment: 'Σχόλιο Είδους',
    order: 'Παραγγελία', invoiceNo: 'Τιμολόγιο', orderNotes: 'Σημείωση παραγγελίας',
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
    fees: 'Fees', stamp: 'Stamp duty', otherTaxes: 'Other taxes', deductions: 'Deductions',
    digitalFee: 'Digital transaction fee', related: 'Related doc',
    paymentMethod: 'Payment method', bank: 'Bank account', registry: 'Reg. no.', website: 'Website',
    mark: 'MARK', uid: 'UID', verify: 'Scan to verify on myDATA',
    movement: 'TRANSPORT DETAILS', loadingPlace: 'Loading place', deliveryPlace: 'Delivery place',
    vehicle: 'Vehicle', purpose: 'Purpose', notes: 'Notes', page: 'Page', of: 'of',
    orderDetails: 'ORDER DETAILS', billTo: 'BILL TO', shipTo: 'SHIP TO',
    itemCode: 'Item code', itemDescr: 'Description', itemComment: 'Comment',
    order: 'Order', invoiceNo: 'Invoice', orderNotes: 'Order note',
  },
};

export function invoiceDocTitle(documentType: string | null | undefined, L: Record<string, string>): string {
  switch (documentType) {
    case '2.1': case '2.2': case '2.3': case '2.4': return L.service;
    case '11.1': case '11.2': case '11.3': case '11.4': case '11.5': return L.receipt;
    case '5.1': case '5.2': return L.creditNote;
    case '9.3': return L.deliveryNote;
    default: return L.invoice;
  }
}

export const PAYMENT_METHOD_LABELS: Record<number, string> = {
  1: 'Cash', 2: 'Check', 3: 'On credit', 4: 'Web banking', 5: 'POS / e-POS', 6: 'IRIS', 7: 'Domestic account', 8: 'Foreign account',
};

// myDATA VAT category → percent (when a line carries an explicit category).
export const VAT_PCT_BY_CAT: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };
export const UNIT_LABEL_BY_CODE: Record<number, string> = { 1: 'pcs', 2: 'kg', 3: 'lt', 4: 'm', 5: 'm²', 6: 'm³' };
