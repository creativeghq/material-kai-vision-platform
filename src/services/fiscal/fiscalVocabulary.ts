/**
 * The fiscal-connector value-set, written ONCE (#391).
 *
 * `FiscalCapability` was the same six-line union in `fiscalConnectorService` and
 * `_shared/fiscal/types.ts` — one fact on both sides of the Vite/Deno boundary.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `workspace_fiscal_bindings_capability_check`. Pinned to the constraint text by
 * `tests/unit/paymentVocabulary.test.ts`.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/**
 * `workspace_fiscal_bindings_capability_check`.
 *
 * A workspace binds each capability to a connector INDEPENDENTLY, which is the whole
 * reason this is a set rather than a single `fiscal_connector_slug` column: a tenant can
 * transmit legal invoices through Novus while numbering them locally. That also means the
 * order here carries no precedence — a binding is per capability, and there is no winner.
 *
 * Contrast `PAYMENT_PROVIDER_SLUGS`, which is multi-select for a different reason: fiscal
 * picks ONE connector per capability, payments offer several methods at once and let the
 * customer choose.
 */
export const FISCAL_CAPABILITIES = [
  'legal_invoice',
  'pre_invoice_notice',
  'pdf_render',
  'tax_submission',
  'numbering',
  'payment_reconciliation',
] as const;
export type FiscalCapability = (typeof FISCAL_CAPABILITIES)[number];

export function isFiscalCapability(v: unknown): v is FiscalCapability {
  return typeof v === 'string' && (FISCAL_CAPABILITIES as readonly string[]).includes(v);
}

/**
 * myDATA `movePurpose` — AADE's Σκοπός Διακίνησης table, the reason goods are on a lorry.
 *
 * WHAT WAS WRONG. The platform offered SEVEN purposes, hand-written in four places (the
 * invoice dialog, the delivery-note dialog, the admin detail page and the transmitter's own
 * label map), all agreeing with each other and all wrong from code 6 onwards:
 *
 *   - `6` was offered as "Movement between premises". AADE 6 is **Φύλαξη / Storage**.
 *     Ενδοδιακίνηση — the actual movement-between-your-own-premises — is **8**, which was
 *     not offered at all. So a transfer between two of the operator's own warehouses was
 *     filed as a storage movement.
 *   - `7` was offered as "Consignment". AADE 7 is
 *     **Επεξεργασία / Συναρμολόγηση / Αποσυναρμολόγηση**.
 *   - `9`–`20` did not exist here: Purchase, ship and aircraft supply, free distribution,
 *     warranty, loan, storage with third parties, other transfers, courier.
 *
 * Same shape as the payment-method rotation and found the same way (a competitor's public
 * API docs, 2026-08-29): every value is a valid integer in range, both halves of the app
 * agreed, and the document AADE registers says something the operator never chose.
 *
 * `19` is the escape hatch and carries `otherMovePurposeTitle` — free text naming the
 * purpose. Anything the table cannot express goes there rather than being approximated by a
 * neighbouring code.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by `npm run vocab:mirror`.
 */
export interface MydataMovePurpose {
  code: number;
  en: string;
  el: string;
  /**
   * False for the five codes withdrawn from myDATA v1.0.11 onwards (6, 15, 16, 17, 18).
   * They stay in the table because HISTORICAL documents carry them and must still render
   * their real name — they are only kept out of the pickers for new documents. Deliberately
   * NOT a transmit-time refusal: the withdrawal is sourced from provider documentation
   * rather than from a table we hold, so AADE rejecting the code is the authority, not us.
   */
  submittable: boolean;
}

export const MYDATA_MOVE_PURPOSES: readonly MydataMovePurpose[] = [
  { code: 1,  submittable: true,  en: 'Sale',                                  el: 'Πώληση' },
  { code: 2,  submittable: true,  en: 'Sale on behalf of third parties',       el: 'Πώληση για Λογαριασμό Τρίτων' },
  { code: 3,  submittable: true,  en: 'Sampling',                              el: 'Δειγματισμός' },
  { code: 4,  submittable: true,  en: 'Exhibition',                            el: 'Έκθεση' },
  { code: 5,  submittable: true,  en: 'Return',                                el: 'Επιστροφή' },
  { code: 6,  submittable: false, en: 'Storage',                               el: 'Φύλαξη' },
  { code: 7,  submittable: true,  en: 'Processing / assembly / disassembly',   el: 'Επεξεργασία - Συναρμολόγηση - Αποσυναρμολόγηση' },
  { code: 8,  submittable: true,  en: 'Movement between own premises',         el: 'Ενδοδιακίνηση' },
  { code: 9,  submittable: true,  en: 'Purchase',                              el: 'Αγορά' },
  { code: 10, submittable: true,  en: 'Supply of ships and aircraft',          el: 'Εφοδιασμός πλοίων και αεροσκαφών' },
  { code: 11, submittable: true,  en: 'Free distribution',                     el: 'Δωρεάν διάθεση' },
  { code: 12, submittable: true,  en: 'Warranty',                              el: 'Εγγύηση' },
  { code: 13, submittable: true,  en: 'Loan for use',                          el: 'Χρησιδανεισμός' },
  { code: 14, submittable: true,  en: 'Storage with third parties',            el: 'Αποθήκευση σε Τρίτους' },
  { code: 15, submittable: false, en: 'Return from storage',                   el: 'Επιστροφή από Φύλαξη' },
  { code: 16, submittable: false, en: 'Recycling',                             el: 'Ανακύκλωση' },
  { code: 17, submittable: false, en: 'Destruction of waste material',         el: 'Καταστροφή άχρηστου υλικού' },
  { code: 18, submittable: false, en: 'Fixed-asset transfer',                  el: 'Διακίνηση Παγίων (Ενδοδιακίνηση)' },
  { code: 19, submittable: true,  en: 'Other transfers',                       el: 'Λοιπές Διακινήσεις' },
  { code: 20, submittable: true,  en: 'Transport / courier',                   el: 'Μεταφορές - Ταχυμεταφορές' },
];

/** The code that takes a free-text title (`otherMovePurposeTitle`) instead of a fixed name. */
export const MYDATA_MOVE_PURPOSE_OTHER = 19;

/** What a picker offers for a NEW document — the withdrawn five are not choices. */
export const SELECTABLE_MOVE_PURPOSES: readonly MydataMovePurpose[] =
  MYDATA_MOVE_PURPOSES.filter((p) => p.submittable);

/**
 * The printed / transmitted name for a purpose code. Falls back to the code itself: an
 * unrecognised purpose on a movement document must READ as unrecognised rather than borrow
 * a neighbour's name, which is the whole defect this replaces.
 */
export function movePurposeLabel(code: number | string | null | undefined, lang: 'el' | 'en' = 'en'): string {
  if (code == null || code === '') return '';
  const n = Number(code);
  const found = MYDATA_MOVE_PURPOSES.find((p) => p.code === n);
  return found ? found[lang] : String(code);
}

export function isMydataMovePurpose(code: unknown): boolean {
  const n = Number(code);
  return Number.isInteger(n) && MYDATA_MOVE_PURPOSES.some((p) => p.code === n);
}

/**
 * AADE income classification, DERIVED FROM THE DOCUMENT TYPE.
 *
 * Two independent axes, and the tax authority validates the pair against the document type:
 *
 *  - the TYPE says which market — `E3_561_001` wholesale (Appendix 19: "Wholesale Sales of
 *    Goods and Services – for Traders") vs `E3_561_003` retail ("Retail Sales … – Private
 *    Clientele"). Document family `11.x` is retail; everything else is wholesale.
 *  - the CATEGORY says what was sold — `category1_1` "Commodity Sale Income" vs `category1_3`
 *    "Provision of Services Income". Families `2.x` (service invoice) and `11.2` (retail
 *    service receipt) are services; the rest are goods.
 *
 * WHY THIS IS DERIVED AND NOT A DEFAULT. Both halves used to fall back to a flat
 * `('E3_561_001','category1_1')` — the wholesale-goods pair — for every line whose product
 * carried no per-product override, which is the ordinary case. AADE does not accept that pair
 * off `1.x`, so the fallback made two whole document families untransmittable:
 *
 *    11.1 → 313 "Classification type E3_561_001 is forbidden for Classification category
 *               category1_1 combined with invoice type Item11_1"
 *    2.1  → 331 "Could not load/found valid validation doc for classification with category
 *               category1_1 and type E3_561_001"
 *
 * i.e. every POS retail receipt and every service invoice was rejected at the provider, while
 * the wholesale invoice next to it went through — so the settings page looked configured and
 * the connector looked healthy. Confirmed against the Novus sandbox 2026-09-06 (issue #319):
 * with the pair derived, 1.1 / 2.1 / 11.1 / 11.2 are all accepted.
 *
 * An explicit per-product or per-line classification still wins — this is only what to use when
 * nothing more specific was recorded.
 */
export function mydataIncomeClassificationType(documentType: string | null | undefined): string {
  return String(documentType ?? '').startsWith('11.') ? 'E3_561_003' : 'E3_561_001';
}

export function mydataIncomeClassificationCategory(documentType: string | null | undefined): string {
  const t = String(documentType ?? '');
  return t.startsWith('2.') || t === '11.2' ? 'category1_3' : 'category1_1';
}
