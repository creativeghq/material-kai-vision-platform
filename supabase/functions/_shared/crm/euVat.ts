import { transliterateGreek } from './greekTransliteration.generated.ts';
import { foldForSearch } from '../searchFold.ts';

export interface EuVat { cc: string; number: string }

const FORMAT: Record<string, RegExp> = {
  AT: /^U\d{8}$/, BE: /^[01]\d{9}$/, BG: /^\d{9,10}$/, CY: /^\d{8}[A-Z]$/, CZ: /^\d{8,10}$/, DE: /^\d{9}$/,
  DK: /^\d{8}$/, EE: /^\d{9}$/, EL: /^\d{9}$/, ES: /^(?=.*[A-Z])[A-Z0-9]\d{7}[A-Z0-9]$/, FI: /^\d{8}$/,
  FR: /^[0-9A-Z]{2}\d{9}$/, HR: /^\d{11}$/, HU: /^\d{8}$/, IE: /^(\d{7}[A-Z]{1,2}|\d[A-Z+*]\d{5}[A-Z])$/,
  IT: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/, LV: /^\d{11}$/, MT: /^\d{8}$/, NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/, PT: /^\d{9}$/, RO: /^\d{2,10}$/, SE: /^\d{12}$/, SI: /^\d{8}$/, SK: /^\d{10}$/,
};

const COUNTRY_CODE: Record<string, string> = {
  AUSTRIA: 'AT', BELGIUM: 'BE', BULGARIA: 'BG', CYPRUS: 'CY', 'CZECH REPUBLIC': 'CZ', CZECHIA: 'CZ', GERMANY: 'DE',
  DENMARK: 'DK', ESTONIA: 'EE', GREECE: 'EL', SPAIN: 'ES', FINLAND: 'FI', FRANCE: 'FR', CROATIA: 'HR', HUNGARY: 'HU',
  IRELAND: 'IE', ITALY: 'IT', LITHUANIA: 'LT', LUXEMBOURG: 'LU', LATVIA: 'LV', MALTA: 'MT', NETHERLANDS: 'NL',
  'THE NETHERLANDS': 'NL', POLAND: 'PL', PORTUGAL: 'PT', ROMANIA: 'RO', SWEDEN: 'SE', SLOVENIA: 'SI', SLOVAKIA: 'SK',
  ΕΛΛΑΔΑ: 'EL', ITALIA: 'IT', ESPANA: 'ES', DEUTSCHLAND: 'DE',
};

const fold = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function euCountryCode(country: string | null | undefined): string | null {
  const c = fold(String(country ?? '').trim());
  if (!c) return null;
  if (c === 'GR') return 'EL';
  if (FORMAT[c]) return c;
  return COUNTRY_CODE[c] ?? null;
}

/** The Italian partita IVA carries a check digit, so a stray 11-digit run is not sent to VIES. */
function italianChecksumOk(n: string): boolean {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(n[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return (10 - (sum % 10)) % 10 === Number(n[10]);
}

function valid(cc: string, number: string): boolean {
  const re = FORMAT[cc];
  if (!re || !re.test(number)) return false;
  return cc !== 'IT' || italianChecksumOk(number);
}

const PREFIXES = [...Object.keys(FORMAT), 'GR'].join('|');
const BODY = String.raw`[0-9A-Z](?:[0-9A-Z+*]|[\s.\-](?=[0-9]))*`;
const PREFIXED = new RegExp(String.raw`(?<![0-9A-Z])(${PREFIXES})[\s.\-]{0,2}(${BODY})`, 'g');
const LABEL = String.raw`(?:P\.?\s?IVA|PARTITA\s+IVA|C\.?\s?F\.?\s*(?:E|\/|-)?\s*P\.?\s?IVA|VAT(?:\s*(?:NO|NUMBER|REG(?:ISTRATION)?(?:\s+NO)?|ID))?|N\.?\s?I\.?\s?F\.?|C\.?\s?I\.?\s?F\.?|NIPC|NIP|UST-?\s?ID(?:-?NR)?|USTIDNR|TVA(?:\s+INTRACOMMUNAUTAIRE)?|BTW|CVR|MOMS|DIC|ICO|Α\.?\s?Φ\.?\s?Μ\.?|AFM|NUM\.?\s*IVA)`;
const LABELLED = new RegExp(String.raw`(?<![0-9A-ZΑ-Ω])${LABEL}[\s.:#°ºN\-/]{0,6}(${BODY})`, 'g');

export function extractEuVatNumbers(pageText: string, country?: string | null, max = 4): EuVat[] {
  const text = fold(pageText);
  const home = euCountryCode(country);
  const out: EuVat[] = [];
  const firstValid = (cc: string, raw: string): string | null => {
    const tokens = raw.split(/[\s.\-]+/).filter(Boolean);
    for (let k = 1; k <= tokens.length; k++) {
      const n = tokens.slice(0, k).join('');
      if (valid(cc, n)) return n;
    }
    return null;
  };
  const add = (cc: string, raw: string): boolean => {
    const code = cc === 'GR' ? 'EL' : cc;
    const number = firstValid(code, raw);
    if (!number) return false;
    if (!out.some((v) => v.cc === code && v.number === number)) out.push({ cc: code, number });
    return true;
  };
  for (const m of text.matchAll(LABELLED)) {
    const body = m[1].trim();
    const cc = body.slice(0, 2);
    if ((FORMAT[cc] || cc === 'GR') && add(cc, body.slice(2).replace(/^[\s.\-]+/, ''))) continue;
    if (home) add(home, body);
  }
  for (const m of text.matchAll(PREFIXED)) add(m[1], m[2]);
  if (home) out.sort((a, b) => Number(b.cc === home) - Number(a.cc === home));
  return out.slice(0, max);
}

const NOISE = new Set([
  'CERAMICA', 'CERAMICHE', 'CERAMICAS', 'CERAMIQUE', 'CERAMICS', 'CERAMIC', 'KERAMIK', 'KERAMIKA', 'INDUSTRIE',
  'INDUSTRIA', 'INDUSTRIAS', 'INDUSTRIAL', 'INDUSTRIES', 'GRUPO', 'GROUP', 'GRUPPO', 'ITALIA', 'ITALY', 'ESPANA',
  'SPAIN', 'AZULEJOS', 'TILES', 'TILE', 'DESIGN', 'HOLDING', 'INTERNATIONAL', 'COMPANY', 'SOCIETA', 'SOCIEDAD',
  'THE', 'AND', 'PER', 'DEL', 'DELLA', 'DEGLI', 'LOS', 'LAS', 'UND', 'DES', 'SPA', 'SRL', 'SAS', 'SARL', 'GMBH',
  'LTD', 'LIMITED', 'PLC', 'INC', 'LDA', 'SRO', 'APS', 'UNIPERSONALE', 'SOCIO', 'UNICO', 'BENEFIT', 'COOP',
  'COOPERATIVA', 'SCARL', 'ANONIMA', 'LIMITADA', 'CORPORATION', 'CORP', 'HELLAS', 'ΑΝΩΝΥΜΗ', 'ΕΤΑΙΡΕΙΑ', 'ΕΤΑΙΡΙΑ',
  'ΕΜΠΟΡΙΚΗ', 'ΒΙΟΜΗΧΑΝΙΚΗ', 'ΜΟΝΟΠΡΟΣΩΠΗ', 'ΙΔΙΩΤΙΚΗ', 'ΚΕΦΑΛΑΙΟΥΧΙΚΗ', 'ΠΕΡΙΟΡΙΣΜΕΝΗΣ', 'ΕΥΘΥΝΗΣ', 'ΚΑΙ', 'ΣΙΑ',
]);

export function distinctiveNameWords(names: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    for (const w of fold(String(n ?? '')).split(/[^A-Z0-9Α-Ω]+/)) {
      if (w.length < 3 || /^\d+$/.test(w) || NOISE.has(w)) continue;
      out.add(w);
      if (/[Α-Ω]/.test(w)) out.add(transliterateGreek(foldForSearch(w)).toUpperCase());
    }
  }
  return [...out];
}

const words = (s: string) => new Set(fold(s).split(/[^A-Z0-9Α-Ω]+/).filter(Boolean));
const compact = (s: string) => fold(s).replace(/[^A-Z0-9Α-Ω]/g, '');

export function nameMatches(registered: string | null | undefined, names: (string | null | undefined)[]): boolean {
  const reg = String(registered ?? '');
  if (!reg.trim()) return false;
  const regWords = words(reg);
  const regCompact = compact(reg);
  return distinctiveNameWords(names).some((w) => regWords.has(w) || (w.length >= 5 && regCompact.includes(w)));
}

export type EuVatVerdict = 'verified' | 'name_mismatch' | 'unnamed_unconfirmed';

/** VIES said valid. Its name must name the company; where the state withholds the name ('---'), the page must. */
export function judgeViesName(viesName: string | null, nameOnPage: boolean, names: (string | null | undefined)[]): EuVatVerdict {
  const n = String(viesName ?? '').trim();
  if (!n || /^-+$/.test(n)) return nameOnPage ? 'verified' : 'unnamed_unconfirmed';
  return nameMatches(n, names) ? 'verified' : 'name_mismatch';
}
