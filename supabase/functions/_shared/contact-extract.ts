/**
 * contact-extract.ts — pull the phone, the email and the VAT number out of a scraped company page.
 *
 * These three live in the site FOOTER and the imprint page, which is the one part of a website
 * `onlyMainContent: true` deliberately throws away. `company_website_scrape` had that flag on and
 * asked for markdown only, so the switchboard number and the VAT number were being discarded on a
 * page we had already paid Firecrawl to fetch — and then an Opus pass was asked to find contact
 * details in text they had been removed from.
 *
 * The VAT number matters more than it looks. `create_company_from_vat` already turns a VAT into an
 * official ΑΑΔΕ / VIES record — legal name, registered address — and VIES covers all 27 member
 * states. Discovery could never reach it, because a web search yields a NAME and VIES needs a VAT.
 * EU law requires a company's own site to publish its VAT, so the site is the missing link between
 * the two halves.
 *
 * DETERMINISTIC ON PURPOSE. No model runs here. A regex that finds nothing is visibly empty; a
 * model asked for a phone number will produce something that looks like one.
 */

/**
 * EU VAT number formats, per member state, as the national part only (no country prefix).
 *
 * Anchored and exact — a loose `\d{8,12}` would match an order reference, a date range, or (on a
 * tile manufacturer's site, which is what this platform scrapes) a product code or a size chart.
 * Sources: the EU VIES published format list.
 */
const EU_VAT_FORMATS: Record<string, RegExp> = {
  AT: /U\d{8}/,
  BE: /[01]\d{9}/,
  BG: /\d{9,10}/,
  CY: /\d{8}[A-Z]/,
  CZ: /\d{8,10}/,
  DE: /\d{9}/,
  DK: /\d{8}/,
  EE: /\d{9}/,
  EL: /\d{9}/,
  ES: /(?:[A-Z]\d{8}|\d{8}[A-Z]|[A-Z]\d{7}[A-Z])/,
  FI: /\d{8}/,
  FR: /[A-Z0-9]{2}\d{9}/,
  HR: /\d{11}/,
  HU: /\d{8}/,
  IE: /(?:\d{7}[A-Z]{1,2}|\d[A-Z0-9+*]\d{5}[A-Z])/,
  IT: /\d{11}/,
  LT: /(?:\d{9}|\d{12})/,
  LU: /\d{8}/,
  LV: /\d{11}/,
  MT: /\d{8}/,
  NL: /\d{9}B\d{2}/,
  PL: /\d{10}/,
  PT: /\d{9}/,
  RO: /\d{2,10}/,
  SE: /\d{12}/,
  SI: /\d{8}/,
  SK: /\d{10}/,
  // Not EU, but a UK VAT on an EU supplier's page is worth recognising rather than mangling.
  GB: /(?:\d{9}|\d{12}|GD\d{3}|HA\d{3})/,
};

/**
 * `GR` is the ISO country code; `EL` is the VAT prefix Greece actually uses, and VIES only accepts
 * EL. Getting this backwards silently fails every Greek lookup — which for this platform is the
 * one that matters most.
 */
const VAT_PREFIX_ALIASES: Record<string, string> = { GR: 'EL', UK: 'GB' };

/**
 * Labels that introduce a VAT number when the number itself carries no country prefix. A German
 * imprint writes `USt-IdNr.: DE123456789` (prefixed) but an Italian one writes `P.IVA 01265320364`
 * and a Greek one `ΑΦΜ: 094014201` — with the country implied by the fact you are on their site.
 */
const VAT_LABELS = [
  'vat', 'vat no', 'vat number', 'vat id', 'vat reg', 'tva', 'btw', 'iva', 'p\\.?\\s?iva',
  'partita iva', 'ust-?idnr', 'umsatzsteuer-?identifikationsnummer', 'steuernummer',
  'nip', 'dič', 'dic', 'ico dph', 'cui', 'cif', 'nif', 'nipc', 'αφμ', 'a\\.?φ\\.?μ',
  'oib', 'pvm', 'kmkr', 'y-tunnus', 'alv', 'cvr', 'moms',
];

/** Labels that introduce a phone number, across the languages of the sourcing markets. */
const PHONE_LABELS = [
  'tel', 'telephone', 'telefon', 'telefono', 'teléfono', 'telefone', 'téléphone', 'telefoon',
  'phone', 'fon', 'τηλ', 'τηλέφωνο', 'puh', 'tlf', 'tālr', 'mob', 'mobile', 'gsm',
];

export interface ExtractedContacts {
  /** E.164-ish where the page gave us a `+`, otherwise as printed. Deduped, order preserved. */
  phones: string[];
  emails: string[];
  /** Split ready for `create_company_from_vat`, which takes the prefix and the number separately. */
  vat_numbers: { country_code: string; vat_number: string; raw: string; source: 'prefixed' | 'labelled' }[];
  /** Where each kind came from, so a caller can tell "the page had none" from "we never looked". */
  found_in: { links: number; text: number };
}

/** Collapse a printed number to something comparable, keeping a leading `+`. */
function normalisePhone(raw: string): string {
  const trimmed = String(raw).trim();
  const plus = /^\s*\+/.test(trimmed) || /^\s*00\d/.test(trimmed);
  const digits = trimmed.replace(/[^\d]/g, '').replace(/^00/, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return plus ? `+${digits}` : digits;
}

function pushUnique(into: string[], value: string): void {
  if (value && !into.includes(value)) into.push(value);
}

/**
 * Pull `tel:` and `mailto:` out of the page's own links.
 *
 * This is the high-precision half. A `tel:` href is a phone number because the site author said so
 * — no pattern matching, no false positives. It only works when the scrape is NOT filtered to main
 * content, because that filter removes the footer these live in.
 */
function fromLinks(links: string[], out: ExtractedContacts): void {
  for (const href of links) {
    const h = String(href || '').trim();
    if (/^tel:/i.test(h)) {
      const n = normalisePhone(decodeURIComponent(h.slice(4)));
      if (n) { pushUnique(out.phones, n); out.found_in.links++; }
    } else if (/^mailto:/i.test(h)) {
      const addr = decodeURIComponent(h.slice(7)).split('?')[0].trim().toLowerCase();
      if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(addr)) { pushUnique(out.emails, addr); out.found_in.links++; }
    }
  }
}

/**
 * Text patterns — the recall half, kept deliberately narrow.
 *
 * A phone number is only taken when the page SAYS it is one: either an international `+` prefix or
 * an explicit label. A general "sequence of 9-ish digits" pattern is unusable here, because this
 * platform scrapes tile and sanitaryware manufacturers whose pages are full of article codes,
 * dimensions and price lists that match it perfectly.
 */
function fromText(text: string, out: ExtractedContacts): void {
  // International form: +30 210 1234567, 0030-210-1234567
  const intl = /(?:\+|\b00)\s?(\d[\d\s().\-/]{6,20}\d)/g;
  for (const m of text.matchAll(intl)) {
    const n = normalisePhone(`+${m[1]}`);
    if (n) { pushUnique(out.phones, n); out.found_in.text++; }
  }

  // Labelled form: Tel: 210 1234567 / Τηλ. 2101234567
  //
  // The boundary is a Unicode lookaround, NOT `\b`. `\b` is defined on ASCII word characters, so
  // `\bτηλ\b` never matches — there is no ASCII boundary before a Greek letter — and every Greek
  // site's phone number was silently invisible while the English ones worked. Same trap would hit
  // Cyrillic and any accented label.
  const labelled = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${PHONE_LABELS.join('|')})(?![\\p{L}])\\s*[.:）)]?\\s*((?:\\+|00)?\\d[\\d\\s().\\-/]{6,20}\\d)`,
    'giu',
  );
  for (const m of text.matchAll(labelled)) {
    const n = normalisePhone(m[1]);
    if (n) { pushUnique(out.phones, n); out.found_in.text++; }
  }

  for (const m of text.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g)) {
    const addr = m[0].toLowerCase();
    // Image filenames and tracking pixels routinely look like addresses after markdown conversion.
    if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(addr)) continue;
    pushUnique(out.emails, addr);
    out.found_in.text++;
  }
}

/**
 * One candidate shape for both VAT paths: an alphanumeric run that may carry a SINGLE separator
 * between characters, and must begin and end on an alphanumeric.
 *
 * The end anchor is what makes it usable. A capture of `[A-Z0-9][A-Z0-9\s.\-]{5,15}` looks
 * equivalent and is not: it happily runs past the number and swallows the following words, so
 * `P.IVA. 01411010356 - Via Radici Nord` yielded `01411010356VIARADICINORD` and matched no country
 * format at all. Requiring an alphanumeric after each optional separator stops the run at the first
 * ` - `, and still tolerates the way real imprints print a VAT: `DE 143 454 214`, `IT-01270230350`.
 */
const VAT_CANDIDATE = '[A-Z0-9](?:[\\s.\\-]?[A-Z0-9]){5,15}';

/**
 * Strip the separators and any leading country prefix, then take the LONGEST leading run that fits
 * the country's own format.
 *
 * The trimming loop is not defensive padding, it is load-bearing. `VAT_CANDIDATE` tolerates a
 * single separator between characters so that `DE 143 454 214` is readable — but that also lets a
 * greedy match run straight on into the next word when the page prints
 * `P.Iva IT01270230350 Capitale sociale`, yielding `01270230350CAPITALESOCIALE`, which fits no
 * country format and silently drops a VAT that is plainly there. Taking the longest valid prefix
 * recovers the number without giving up the spaced form.
 */
function acceptVat(
  cc: string,
  pattern: RegExp,
  raw: string,
  source: 'prefixed' | 'labelled',
  out: ExtractedContacts,
): void {
  const compact = raw.toUpperCase().replace(/[\s.\-]/g, '').replace(new RegExp(`^${cc}`), '');
  const exact = new RegExp(`^${pattern.source}$`);
  for (let end = compact.length; end >= 6; end--) {
    const number = compact.slice(0, end);
    if (!exact.test(number)) continue;
    if (out.vat_numbers.some((v) => v.country_code === cc && v.vat_number === number)) return;
    out.vat_numbers.push({ country_code: cc, vat_number: number, raw: raw.trim(), source });
    return;
  }
}

/** VAT numbers written with their country prefix — `IT01265320364`, `DE 143 454 214`. */
function vatPrefixed(text: string, out: ExtractedContacts): void {
  for (const [cc, pattern] of Object.entries(EU_VAT_FORMATS)) {
    const re = new RegExp(`(?<![A-Z0-9])${cc}[\\s.\\-]?(${VAT_CANDIDATE})`, 'gi');
    for (const m of text.matchAll(re)) acceptVat(cc, pattern, m[1], 'prefixed', out);
  }
}

/**
 * VAT numbers written bare under a local label, which is the common case on a company's own site.
 *
 * Needs `countryHint` — without a country there is no way to tell a 9-digit Greek ΑΦΜ from a
 * 9-digit German USt-IdNr, and guessing produces a number that VIES will reject or, worse, that
 * belongs to a different company. No hint means no labelled extraction, deliberately.
 */
function vatLabelled(text: string, countryHint: string | undefined, out: ExtractedContacts): void {
  if (!countryHint) return;
  const cc = VAT_PREFIX_ALIASES[countryHint.toUpperCase()] ?? countryHint.toUpperCase();
  const pattern = EU_VAT_FORMATS[cc];
  if (!pattern) return;

  // Same Unicode-lookaround boundary as the phone labels, and for the same reason: `\b` would
  // never fire before `ΑΦΜ`, which is the one label this platform most needs to read.
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${VAT_LABELS.join('|')})(?![\\p{L}])\\s*[.:nº°]{0,3}\\s*((?:${cc})?[\\s.\\-]?${VAT_CANDIDATE})`,
    'giu',
  );
  for (const m of text.matchAll(re)) acceptVat(cc, pattern, m[1], 'labelled', out);
}

/**
 * Extract contact details from a scraped page.
 *
 * @param markdown  page text (Firecrawl `markdown`, with `onlyMainContent: false`)
 * @param links     page links (Firecrawl `links`) — where `tel:` and `mailto:` come from
 * @param countryHint ISO-2 of the company, which unlocks bare/unprefixed VAT numbers
 */
export function extractContactDetails(
  markdown: string | null | undefined,
  links: string[] | null | undefined,
  countryHint?: string | null,
): ExtractedContacts {
  const out: ExtractedContacts = { phones: [], emails: [], vat_numbers: [], found_in: { links: 0, text: 0 } };
  if (Array.isArray(links)) fromLinks(links, out);
  const text = String(markdown ?? '');
  if (text) {
    fromText(text, out);
    vatPrefixed(text, out);
    vatLabelled(text, countryHint ?? undefined, out);
  }
  // A prefixed hit is stronger evidence than a labelled one; surface it first.
  out.vat_numbers.sort((a, b) => (a.source === b.source ? 0 : a.source === 'prefixed' ? -1 : 1));
  return out;
}
