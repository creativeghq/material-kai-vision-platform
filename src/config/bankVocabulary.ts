export interface BankDef {
  name: string;
  /** ISO-3166-1 alpha-2. A brand can be DIFFERENT banks per country — see Postbank below. */
  country?: string;
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
  { name: 'National', country: 'GR', bic: 'ETHNGRAA', greekIbanCode: '011', aliases: ['national bank of greece', 'nbg', 'ethniki', 'εθνικη', 'εθνική', 'εθνικη τραπεζα', 'εθνική τράπεζα', 'nathional'] },
  { name: 'Alpha', country: 'GR', bic: 'GRBAGRAA', greekIbanCode: '014', aliases: ['alpha bank', 'alphabank', 'αλφα', 'άλφα', 'alpha trapeza'] },
  { name: 'Piraeus', country: 'GR', bic: 'PIRBGRAA', greekIbanCode: '017', aliases: ['piraeus bank', 'peiraios', 'πειραιως', 'πειραιώς', 'τραπεζα πειραιως', 'τράπεζα πειραιώς'] },
  { name: 'Eurobank', country: 'GR', bic: 'ERBKGRAA', greekIbanCode: '026', aliases: ['eurobank ergasias', 'ergasias', 'ευρωτραπεζα'] },
  // Attica and Pancreta merged into CrediaBank (Sept 2025); both names are still on invoices.
  { name: 'CrediaBank', country: 'GR', aliases: ['credia', 'credia bank', 'attica', 'attica bank', 'αττικης', 'αττικής', 'τραπεζα αττικης', 'pancreta', 'pancretan', 'pancreta bank', 'παγκρητια', 'παγκρήτια'] },
  { name: 'Optima', country: 'GR', aliases: ['optima bank', 'οπτιμα'] },
  { name: 'ProCredit', country: 'GR', greekIbanCode: '116', aliases: ['procredit bank', 'προκρεντιτ'] },
  { name: 'Aegean Baltic', country: 'GR', aliases: ['aegean baltic bank', 'abbank'] },
  { name: 'Viva', country: 'GR', aliases: ['viva.com', 'viva wallet', 'vivawallet'] },
  { name: 'Cooperative Bank of Chania', country: 'GR', aliases: ['chania', 'συνεταιριστικη χανιων', 'συνεταιριστική χανίων'] },
  { name: 'Cooperative Bank of Karditsa', country: 'GR', aliases: ['karditsa', 'συνεταιριστικη καρδιτσας'] },
  { name: 'Cooperative Bank of Epirus', country: 'GR', aliases: ['epirus', 'ηπειρου', 'ηπείρου'] },
  { name: 'Cooperative Bank of Thessaly', country: 'GR', aliases: ['thessaly', 'θεσσαλιας', 'θεσσαλίας'] },

  { name: 'Bank of Cyprus', country: 'CY', aliases: ['boc', 'τραπεζα κυπρου'] },
  { name: 'Hellenic Bank', country: 'CY', aliases: ['ελληνικη τραπεζα κυπρου'] },

  { name: 'UniCredit', country: 'IT', aliases: ['unicredit spa', 'unicredit bank'] },
  { name: 'Intesa Sanpaolo', country: 'IT', aliases: ['intesa'] },
  { name: 'Banco BPM', country: 'IT' },
  { name: 'BPER Banca', country: 'IT', aliases: ['bper'] },
  { name: 'Monte dei Paschi', country: 'IT', aliases: ['mps', 'banca monte dei paschi di siena'] },

  { name: 'Deutsche Bank', country: 'DE', aliases: ['deutsche'] },
  // Deutsche Postbank and Eurobank Bulgaria AD both trade as Postbank: bare is an alias of NEITHER.
  { name: 'Postbank (DE)', country: 'DE', aliases: ['deutsche postbank'] },
  { name: 'Commerzbank', country: 'DE' },
  { name: 'Sparkasse', country: 'DE', aliases: ['sparkassen'] },
  { name: 'ProCredit (DE)', country: 'DE', aliases: ['procredit bank germany'] },
  { name: 'N26', country: 'DE' },
  { name: 'Erste Bank', country: 'AT', aliases: ['erste'] },
  { name: 'Raiffeisen (AT)', country: 'AT', aliases: ['raiffeisen bank international', 'rbi'] },

  { name: 'Postbank (BG)', country: 'BG', aliases: ['eurobank bulgaria', 'eurobank bulgaria ad'] },
  { name: 'UniCredit Bulbank', country: 'BG', aliases: ['bulbank'] },
  { name: 'DSK Bank', country: 'BG', aliases: ['dsk'] },
  { name: 'UBB', country: 'BG', aliases: ['united bulgarian bank'] },
  { name: 'Fibank', country: 'BG', aliases: ['first investment bank'] },
  { name: 'ProCredit (BG)', country: 'BG' },
  { name: 'Banca Transilvania', country: 'RO', aliases: ['transilvania'] },
  { name: 'BRD', country: 'RO', aliases: ['brd societe generale'] },
  { name: 'Raiffeisen (RO)', country: 'RO' },

  { name: 'Ziraat Bankasi', country: 'TR', aliases: ['ziraat', 'ziraat bankası'] },
  { name: 'Is Bankasi', country: 'TR', aliases: ['isbank', 'türkiye iş bankası', 'is bankasi'] },
  { name: 'Garanti BBVA', country: 'TR', aliases: ['garanti'] },
  { name: 'Akbank', country: 'TR' },

  { name: 'BNP Paribas', country: 'FR', aliases: ['bnp'] },
  { name: 'Credit Agricole', country: 'FR', aliases: ['crédit agricole'] },
  { name: 'Societe Generale', country: 'FR', aliases: ['société générale', 'socgen'] },
  { name: 'Santander', country: 'ES' },
  { name: 'BBVA', country: 'ES' },
  { name: 'CaixaBank', country: 'ES', aliases: ['caixa'] },
  { name: 'Millennium BCP', country: 'PT', aliases: ['bcp'] },
  { name: 'ING', country: 'NL' },
  { name: 'ABN AMRO', country: 'NL' },
  { name: 'Rabobank', country: 'NL' },
  { name: 'Credit Europe Bank', country: 'NL', aliases: ['credit europe'] },
  { name: 'KBC', country: 'BE' },
  { name: 'Wise', country: 'BE', aliases: ['transferwise'] },

  { name: 'PKO Bank Polski', country: 'PL', aliases: ['pko'] },
  { name: 'Pekao', country: 'PL', aliases: ['bank pekao'] },
  { name: 'OTP Bank', country: 'HU', aliases: ['otp'] },
  { name: 'Komercni banka', country: 'CZ', aliases: ['komerční banka'] },

  { name: 'Revolut', country: 'LT', aliases: ['revolut bank', 'revolut ltd', 'revolut bank uab'] },
  { name: 'HSBC', country: 'GB' },
  { name: 'Barclays', country: 'GB' },
  { name: 'Lloyds', country: 'GB', aliases: ['lloyds bank'] },
  { name: 'NatWest', country: 'GB' },
  { name: 'Citibank', aliases: ['citi'] },
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
