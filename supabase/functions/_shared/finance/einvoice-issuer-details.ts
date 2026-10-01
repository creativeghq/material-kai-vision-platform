
import { isValidIban, normalizeIban } from '../iban.generated.ts';

const IBAN_LENGTH: Record<string, number> = {
  GR: 27, CY: 28, IT: 27, ES: 24, PT: 25, FR: 27, DE: 22, AT: 20, BE: 16, NL: 18, LU: 20,
  IE: 22, GB: 22, BG: 22, RO: 24, PL: 28, CZ: 24, SK: 24, SI: 19, HR: 21, HU: 28, LT: 20,
  LV: 21, EE: 20, FI: 18, SE: 24, DK: 18, CH: 21, TR: 26, MT: 31, AL: 28, MK: 19, RS: 22,
};

export interface IssuerContacts {
  phones: string[];
  faxes: string[];
  emails: string[];
}

export interface EinvoiceIssuerDetails {
  ibans: string[];
  contacts: IssuerContacts | null;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function htmlToLines(html: string): string[] {
  return html
    .replace(/<(script|style|noscript|svg|head|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td|th|label|span|dt|dd)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export function extractIbans(text: string): string[] {
  const out: string[] = [];
  // Lookahead, so a non-IBAN run (the ΑΦΜ "EL094143557") cannot consume an IBAN printed after it.
  const re = /\b(?=(([A-Z]{2})\d{2}(?:[  ]?[A-Z0-9]){8,32}))/g;
  for (const m of text.matchAll(re)) {
    const len = IBAN_LENGTH[m[2]];
    if (!len) continue;
    const compact = normalizeIban(m[1]);
    if (compact.length < len) continue;
    const iban = compact.slice(0, len);
    if (isValidIban(iban) && !out.includes(iban)) out.push(iban);
  }
  return out;
}

// `\b` is ASCII-only in JS: it never matches after a Greek word.
const CUSTOMER_HEADING = /^(Στοιχεία (Πελάτη|Λήπτη|Αγοραστή)|Πελάτης|Λήπτης|Customer|Bill to|Buyer)(?!\p{L})/iu;
const PHONE_LABEL = /^(Τηλέφωνα|Τηλέφωνο|Τηλ\.?|Phones?|Tel\.?|Telephone)\s*:?$/i;
const FAX_LABEL = /^(Φαξ|Fax)\s*:?$/i;
const EMAIL_LABEL = /^(E-?mail|Ηλ\. ?Ταχυδρομείο)\s*:?$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function greekPhones(value: string): string[] {
  const out: string[] = [];
  const strip = (d: string) => (d.startsWith('0030') ? d.slice(4) : d.startsWith('30') && d.length > 10 ? d.slice(2) : d);
  for (const chunk of value.split(/[,;/|]|\s-\s/)) {
    let buf = '';
    for (const token of chunk.split(/\s+/)) {
      buf += token.replace(/\D/g, '');
      const d = strip(buf);
      if (/^(2\d{9}|69\d{8})$/.test(d)) {
        if (!out.includes(d)) out.push(d);
        buf = '';
      } else if (d.length >= 10) {
        buf = '';
      }
    }
  }
  return out;
}

function valueAfter(lines: string[], i: number): string {
  for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
    if (lines[j] !== ':') return lines[j];
  }
  return '';
}

/** Only the block above the customer heading, and only if it prints the issuer's ΑΦΜ — else it may be OURS. */
export function extractIssuerContacts(lines: string[], issuerVat: string): IssuerContacts | null {
  const end = lines.findIndex((l) => CUSTOMER_HEADING.test(l));
  if (end <= 0) return null;
  const block = lines.slice(0, end);
  const vat = issuerVat.replace(/\D/g, '');
  if (!vat || !block.some((l) => l.replace(/\D/g, '').endsWith(vat))) return null;

  const phones: string[] = [];
  const faxes: string[] = [];
  const emails: string[] = [];
  block.forEach((line, i) => {
    if (PHONE_LABEL.test(line)) phones.push(...greekPhones(valueAfter(block, i)));
    else if (FAX_LABEL.test(line)) faxes.push(...greekPhones(valueAfter(block, i)));
    else if (EMAIL_LABEL.test(line)) emails.push(...(valueAfter(block, i).match(EMAIL_RE) ?? []));
  });
  const uniq = (a: string[]) => [...new Set(a)];
  return {
    phones: uniq(phones),
    faxes: uniq(faxes).filter((f) => !phones.includes(f)),
    emails: uniq(emails.map((e) => e.toLowerCase())),
  };
}

export function readEinvoiceHtml(html: string, issuerVat: string): EinvoiceIssuerDetails {
  const lines = htmlToLines(html);
  return { ibans: extractIbans(lines.join('\n')), contacts: extractIssuerContacts(lines, issuerVat) };
}
