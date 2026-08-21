// GENERATED MIRROR of src/lib/mydataExemptionCategories.ts — do not edit here.
// Regenerate: npm run finance:mirror (part of gen:all). Freshness is enforced by
// tests/unit/financeMirrors.test.ts, which fails the build on any drift.

/** myDATA VAT-exemption categories (ΑΑΔΕ "Κατηγορία Αιτίας Εξαίρεσης ΦΠΑ"), codes
 * 1–31. Required by myDATA on every 0%/exempt invoice line (vatCategory 7/8) —
 * see `vatExemptionCategory` in
 * [_shared/fiscal/types.ts](supabase/functions/_shared/fiscal/types.ts) and the
 * line mapping in `invoice-builder.ts`.
 *
 * On a CRM party this is stored on `vat_exemption_reason` (text) as the **numeric
 * code**, and pre-fills the exemption category on that customer's 0%-VAT invoice
 * lines. Labels carry the governing article so the operator picks the correct one;
 * the Code is the load-bearing value sent to myDATA. */
export interface MydataExemptionCategory {
  /** myDATA exemption code 1–31, stored as text on the party. */
  code: number;
  label: string;
  /** Greek wording. A Greek fiscal document must cite its exemption ground in Greek —
   *  the ground is a legal statement on the παραστατικό, not a UI string, so it is NOT
   *  covered by the English-only-UI rule. Article references are identical to `label`. */
  labelEl: string;
}

export const MYDATA_EXEMPTION_CATEGORIES: MydataExemptionCategory[] = [
  { code: 1,  label: 'Out of scope — arts. 2 & 3 of the VAT Code' , labelEl: 'Εκτός πεδίου ΦΠΑ — άρθρα 2 και 3 του Κώδικα ΦΠΑ' },
  { code: 2,  label: 'No VAT — art. 5 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 5 του Κώδικα ΦΠΑ' },
  { code: 3,  label: 'No VAT — art. 13 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 13 του Κώδικα ΦΠΑ' },
  { code: 4,  label: 'No VAT — art. 14 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 14 του Κώδικα ΦΠΑ' },
  { code: 5,  label: 'No VAT — art. 16 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 16 του Κώδικα ΦΠΑ' },
  { code: 6,  label: 'No VAT — art. 19 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 19 του Κώδικα ΦΠΑ' },
  { code: 7,  label: 'No VAT — art. 22 of the VAT Code (domestic exemptions)' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 22 του Κώδικα ΦΠΑ (απαλλαγές στο εσωτερικό της χώρας)' },
  { code: 8,  label: 'No VAT — art. 24 of the VAT Code (exports outside the EU)' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 24 του Κώδικα ΦΠΑ (εξαγωγές εκτός ΕΕ)' },
  { code: 9,  label: 'No VAT — art. 25 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 25 του Κώδικα ΦΠΑ' },
  { code: 10, label: 'No VAT — art. 26 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 26 του Κώδικα ΦΠΑ' },
  { code: 11, label: 'No VAT — art. 27 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 27 του Κώδικα ΦΠΑ' },
  { code: 12, label: 'No VAT — art. 27 — sea-going vessels' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 27 — Πλοία ανοικτής θαλάσσης' },
  { code: 13, label: 'No VAT — art. 27.1.γ — sea-going vessels' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 27.1.γ — Πλοία ανοικτής θαλάσσης' },
  { code: 14, label: 'No VAT — art. 28 of the VAT Code (intra-community supplies)' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 28 του Κώδικα ΦΠΑ (ενδοκοινοτικές παραδόσεις)' },
  { code: 15, label: 'No VAT — art. 39 of the VAT Code (small-enterprise scheme)' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 39 του Κώδικα ΦΠΑ (καθεστώς μικρών επιχειρήσεων)' },
  { code: 16, label: 'No VAT — art. 39a of the VAT Code (reverse charge)' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 39α του Κώδικα ΦΠΑ (αντιστροφή της επιβάρυνσης)' },
  { code: 17, label: 'No VAT — art. 40 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 40 του Κώδικα ΦΠΑ' },
  { code: 18, label: 'No VAT — art. 41 of the VAT Code (flat-rate farmers)' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 41 του Κώδικα ΦΠΑ (αγρότες ειδικού καθεστώτος)' },
  { code: 19, label: 'No VAT — art. 47 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 47 του Κώδικα ΦΠΑ' },
  { code: 20, label: 'VAT included — art. 43 of the VAT Code' , labelEl: 'ΦΠΑ εμπεριεχόμενος — άρθρο 43 του Κώδικα ΦΠΑ' },
  { code: 21, label: 'VAT included — art. 44 of the VAT Code' , labelEl: 'ΦΠΑ εμπεριεχόμενος — άρθρο 44 του Κώδικα ΦΠΑ' },
  { code: 22, label: 'VAT included — art. 45 of the VAT Code' , labelEl: 'ΦΠΑ εμπεριεχόμενος — άρθρο 45 του Κώδικα ΦΠΑ' },
  { code: 23, label: 'VAT included — art. 46 of the VAT Code' , labelEl: 'ΦΠΑ εμπεριεχόμενος — άρθρο 46 του Κώδικα ΦΠΑ' },
  { code: 24, label: 'No VAT — art. 6 of the VAT Code' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 6 του Κώδικα ΦΠΑ' },
  { code: 25, label: 'No VAT — ΠΟΛ.1029/1995' , labelEl: 'Χωρίς ΦΠΑ — ΠΟΛ.1029/1995' },
  { code: 26, label: 'No VAT — ΠΟΛ.1167/2015' , labelEl: 'Χωρίς ΦΠΑ — ΠΟΛ.1167/2015' },
  { code: 27, label: 'Other VAT exemptions' , labelEl: 'Λοιπές εξαιρέσεις ΦΠΑ' },
  { code: 28, label: 'No VAT — art. 24 §1(b) — export outside the EU' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 24 παρ. 1 περ. β — εξαγωγή εκτός ΕΕ' },
  { code: 29, label: 'No VAT — art. 47b — intra-community distance sales of goods' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 47β — ενδοκοινοτικές εξ αποστάσεως πωλήσεις αγαθών' },
  { code: 30, label: 'No VAT — art. 47c — goods imported from third countries/territories' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 47γ — αγαθά εισαγόμενα από τρίτες χώρες/εδάφη' },
  { code: 31, label: 'No VAT — art. 47d — OSS non-union scheme (services)' , labelEl: 'Χωρίς ΦΠΑ — άρθρο 47δ — καθεστώς OSS μη ενωσιακό (υπηρεσίες)' },
];

/** Resolve the human label for a stored code (string or number), in the document's language. */
export function mydataExemptionLabel(
  code: string | number | null | undefined,
  lang: 'el' | 'en' = 'en',
): string | null {
  if (code === null || code === undefined || code === '') return null;
  const n = typeof code === 'number' ? code : parseInt(code, 10);
  const hit = MYDATA_EXEMPTION_CATEGORIES.find((c) => c.code === n);
  if (!hit) return null;
  return lang === 'el' ? hit.labelEl : hit.label;
}
