// GENERATED MIRROR of src/config/bankVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

// A bank name is NOT a closed set — a foreign supplier banks somewhere nobody listed — so this
// normalises rather than refuses. The live CRM held `National`/`Nathional` and
// `Piraeus`/`Piraeus Bank`: four names for two banks, neither wrong enough to notice.

export interface BankDef {
  name: string;
  bic?: string;
  /**
   * The three-digit HEBIC code in positions 5-7 of a GREEK IBAN.
   *
   * @remarks Present only where verified against live rows or the Hellenic Bank Association. A
   * guessed code silently labels an account with the wrong bank, and nobody re-checks a name.
   */
  greekIbanCode?: string;
  aliases?: readonly string[];
}

export const BANKS: readonly BankDef[] = [
  { name: 'National', bic: 'ETHNGRAA', greekIbanCode: '011', aliases: ['national bank of greece', 'nbg', 'ethniki', 'εθνικη', 'εθνική', 'εθνικη τραπεζα', 'εθνική τράπεζα', 'nathional'] },
  { name: 'Alpha', bic: 'GRBAGRAA', greekIbanCode: '014', aliases: ['alpha bank', 'alphabank', 'αλφα', 'άλφα', 'alpha trapeza'] },
  { name: 'Piraeus', bic: 'PIRBGRAA', greekIbanCode: '017', aliases: ['piraeus bank', 'peiraios', 'πειραιως', 'πειραιώς', 'τραπεζα πειραιως', 'τράπεζα πειραιώς'] },
  { name: 'Eurobank', bic: 'ERBKGRAA', greekIbanCode: '026', aliases: ['eurobank ergasias', 'ergasias', 'ευρωτραπεζα', 'ευρωbank'] },
  { name: 'ProCredit', greekIbanCode: '116', aliases: ['procredit bank', 'προκρεντιτ'] },
  { name: 'Attica', aliases: ['attica bank', 'αττικης', 'αττικής', 'τραπεζα αττικης'] },
  { name: 'Optima', aliases: ['optima bank', 'οπτιμα'] },
  { name: 'Pancreta', aliases: ['pancreta bank', 'παγκρητια', 'παγκρήτια'] },
  { name: 'Viva', aliases: ['viva.com', 'viva wallet', 'vivawallet'] },
  { name: 'Revolut', aliases: ['revolut bank', 'revolut ltd'] },
  { name: 'HSBC' },
  { name: 'Citibank', aliases: ['citi'] },
  { name: 'Deutsche Bank', aliases: ['deutsche'] },
  { name: 'UniCredit', aliases: ['unicredit spa', 'unicredit bank'] },
  { name: 'Intesa Sanpaolo', aliases: ['intesa'] },
  { name: 'BNP Paribas', aliases: ['bnp'] },
  { name: 'ING' },
  { name: 'Raiffeisen' },
  { name: 'Commerzbank' },
  { name: 'Santander' },
];

export const BANK_NAMES: readonly string[] = BANKS.map((b) => b.name);

const shape = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9Ͱ-Ͽ]/g, '');
const compact = (v: unknown) => String(v ?? '').replace(/[\s-]/g, '').toUpperCase();

/**
 * Which bank issued this IBAN, from the code the number carries.
 *
 * @remarks GREECE ONLY. Positions 5-7 are the HEBIC bank code in a Greek IBAN and something else
 * everywhere else — Italy puts a CIN letter there, so `IT76O0200821…` reads as "O02".
 */
export function bankFromIban(iban: unknown): BankDef | null {
  const s = compact(iban);
  if (!/^GR\d{2}\d{7}/.test(s)) return null;
  const code = s.slice(4, 7);
  return BANKS.find((b) => b.greekIbanCode === code) ?? null;
}

/** The canonical spelling, or the input trimmed — an unlisted bank is never renamed to a listed one. */
export function normalizeBankName(input: unknown): string {
  const raw = String(input ?? '').trim();
  const want = shape(raw);
  if (!want) return raw;
  const hit = BANKS.find((b) =>
    shape(b.name) === want || (b.aliases ?? []).some((a) => shape(a) === want));
  return hit ? hit.name : raw;
}

/** The number is evidence, the typed name a claim: `Nathional` on an 011 IBAN is a typo. */
export function resolveBank(typedName: unknown, iban: unknown): string {
  return bankFromIban(iban)?.name ?? normalizeBankName(typedName);
}
