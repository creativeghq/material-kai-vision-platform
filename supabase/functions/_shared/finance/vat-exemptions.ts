// GENERATED MIRROR of src/lib/mydataExemptionCategories.ts — do not edit here.
// Regenerate: npm run finance:mirror (part of gen:all). Freshness is enforced by
// tests/unit/financeMirrors.test.ts, which fails the build on any drift.

/**
 * myDATA VAT-exemption categories (ΑΑΔΕ "Κατηγορία Αιτίας Εξαίρεσης ΦΠΑ"), codes 1-31, required
 * on every 0%/exempt line (vatCategory 7/8). The ground is a LEGAL CITATION, not a UI string:
 * `labelEl` is byte-equal to §8.3 column "Αιτία Εξαίρεσης (ν. 5144/2024)" of the committed
 * spec `src/modules/myaade/AadeSpec/v2.0.2/ERP_v2.0.2.pdf`, and is pinned against that PDF by
 * tests/unit/mydataExemptionCategories.test.ts — a wrong article is a valid string.
 * Import-free by contract: mirrored to Deno by `npm run finance:mirror`.
 */
export interface MydataExemptionCategory {
  /** myDATA exemption code 1-31, stored as text on the line. */
  code: number;
  label: string;
  /** ΑΑΔΕ's own Greek wording. A Greek fiscal document must cite its exemption ground in
   *  Greek, so this is NOT covered by the English-only-UI rule. */
  labelEl: string;
}

export const MYDATA_EXEMPTION_CATEGORIES: MydataExemptionCategory[] = [
  { code: 1, label: 'Out of scope — arts. 2 & 3 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 2 και 3 του Κώδικα ΦΠΑ' },
  { code: 2, label: 'No VAT — art. 5 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 5 του Κώδικα ΦΠΑ' },
  { code: 3, label: 'No VAT — art. 17 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 17 του Κώδικα ΦΠΑ' },
  { code: 4, label: 'No VAT — art. 18 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 18 του Κώδικα ΦΠΑ' },
  { code: 5, label: 'No VAT — art. 21 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 21 του Κώδικα ΦΠΑ' },
  { code: 6, label: 'No VAT — art. 24 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 24 του Κώδικα ΦΠΑ' },
  { code: 7, label: 'No VAT — art. 27 of the VAT Code (domestic exemptions)', labelEl: 'Χωρίς ΦΠΑ - άρθρο 27 του Κώδικα ΦΠΑ' },
  { code: 8, label: 'No VAT — art. 29 of the VAT Code (exports outside the EU)', labelEl: 'Χωρίς ΦΠΑ - άρθρο 29 του Κώδικα ΦΠΑ' },
  { code: 9, label: 'No VAT — art. 30 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 30 του Κώδικα ΦΠΑ' },
  { code: 10, label: 'No VAT — art. 31 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 31 του Κώδικα ΦΠΑ' },
  { code: 11, label: 'No VAT — art. 32 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 32 του Κώδικα ΦΠΑ' },
  { code: 12, label: 'No VAT — art. 32 of the VAT Code — sea-going vessels', labelEl: 'Χωρίς ΦΠΑ - άρθρο 32 του Κώδικα ΦΠΑ - Πλοία Ανοικτής Θαλάσσης του Κώδικα ΦΠΑ' },
  { code: 13, label: 'No VAT — art. 32.1.γ of the VAT Code — sea-going vessels', labelEl: 'Χωρίς ΦΠΑ - άρθρο 32.1.γ. του Κώδικα ΦΠΑ - Πλοία Ανοικτής Θαλάσσης του Κώδικα ΦΠΑ' },
  { code: 14, label: 'No VAT — art. 33 of the VAT Code (intra-community supplies)', labelEl: 'Χωρίς ΦΠΑ - άρθρο 33 του Κώδικα ΦΠΑ' },
  { code: 15, label: 'No VAT — art. 44 of the VAT Code (small-enterprise scheme)', labelEl: 'Χωρίς ΦΠΑ - άρθρο 44 του Κώδικα ΦΠΑ' },
  { code: 16, label: 'No VAT — art. 45 of the VAT Code (reverse charge)', labelEl: 'Χωρίς ΦΠΑ - άρθρο 45 του Κώδικα ΦΠΑ' },
  { code: 17, label: 'No VAT — art. 47 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 47 του Κώδικα ΦΠΑ' },
  { code: 18, label: 'No VAT — art. 48 of the VAT Code (flat-rate farmers)', labelEl: 'Χωρίς ΦΠΑ - άρθρο 48 του Κώδικα ΦΠΑ' },
  { code: 19, label: 'No VAT — art. 54 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 54 του Κώδικα ΦΠΑ' },
  { code: 20, label: 'VAT included — art. 50 of the VAT Code', labelEl: 'ΦΠΑ εμπεριεχόμενος - άρθρο 50 του Κώδικα ΦΠΑ' },
  { code: 21, label: 'VAT included — art. 51 of the VAT Code', labelEl: 'ΦΠΑ εμπεριεχόμενος - άρθρο 51 του Κώδικα ΦΠΑ' },
  { code: 22, label: 'VAT included — art. 52 of the VAT Code', labelEl: 'ΦΠΑ εμπεριεχόμενος - άρθρο 52 του Κώδικα ΦΠΑ' },
  { code: 23, label: 'VAT included — art. 53 of the VAT Code', labelEl: 'ΦΠΑ εμπεριεχόμενος - άρθρο 53 του Κώδικα ΦΠΑ' },
  { code: 24, label: 'No VAT — art. 8 of the VAT Code', labelEl: 'Χωρίς ΦΠΑ - άρθρο 8 του Κώδικα ΦΠΑ' },
  { code: 25, label: 'No VAT — ΠΟΛ.1029/1995', labelEl: 'Χωρίς ΦΠΑ - ΠΟΛ.1029/1995' },
  { code: 26, label: 'No VAT — ΠΟΛ.1167/2015', labelEl: 'Χωρίς ΦΠΑ - ΠΟΛ.1167/2015' },
  { code: 27, label: 'Other VAT exemptions', labelEl: 'Λοιπές Εξαιρέσεις ΦΠΑ' },
  { code: 28, label: 'No VAT — art. 29 §1(b) of the VAT Code (Tax Free)', labelEl: 'Χωρίς ΦΠΑ – άρθρο 29 περ. β’ παρ.1 του Κώδικα ΦΠΑ, (Tax Free)' },
  { code: 29, label: 'No VAT — art. 56 of the VAT Code (OSS non-union scheme)', labelEl: 'Χωρίς ΦΠΑ – άρθρο 56 του Κώδικα ΦΠΑ (OSS_μη ενωσιακό καθεστώς)' },
  { code: 30, label: 'No VAT — art. 57 of the VAT Code (OSS union scheme)', labelEl: 'Χωρίς ΦΠΑ – άρθρο 57 του Κώδικα ΦΠΑ (OSS_ενωσιακό καθεστώς)' },
  { code: 31, label: 'No VAT — art. 58 of the VAT Code (IOSS)', labelEl: 'Χωρίς ΦΠΑ – άρθρο 58 του Κώδικα ΦΠΑ (IOSS)' },
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
