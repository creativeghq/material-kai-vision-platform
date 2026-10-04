/** Pure rules deciding which researched company details may be saved. No I/O, so tests import it. */
import { transliterateGreek } from './greekTransliteration.generated.ts';
import { foldForSearch } from '../searchFold.ts';

export type FieldSource = 'operator' | 'aade' | 'gemi' | 'invoice' | 'web_verified' | 'web';

export interface FieldProvenance { src: FieldSource; by?: string; at: string }

const SOURCE_RANK: Record<FieldSource, number> = { operator: 6, aade: 5, gemi: 5, invoice: 4, web_verified: 3, web: 1 };

/** A value with no recorded source may have been typed by an operator, so only a contradiction frees it. */
export function canReplace(existing: FieldSource | null | undefined, incoming: FieldSource, existingContradicted = false): boolean {
  if (!existing) return existingContradicted;
  if (existing === 'operator') return false;
  return SOURCE_RANK[incoming] > SOURCE_RANK[existing] || (existingContradicted && incoming !== 'web');
}

const LATIN = /[A-Za-z]/;
const GREEK = /[Ͱ-Ͽἀ-῿]/;

/** ΑΑΔΕ packs several trade names into one field ("ANDIPOL  POLIHOME ΠΟΛΥΧΟΟΥΜ"); searching the whole string finds nothing. */
export function splitTradeNames(title: string | null | undefined): string[] {
  const out: string[] = [];
  for (const chunk of String(title ?? '').split(/\s{2,}|[,;/|]+/)) {
    const words = chunk.trim().split(/\s+/).filter(Boolean);
    let run: string[] = [];
    let runLatin: boolean | null = null;
    for (const w of words) {
      if (!LATIN.test(w) && !GREEK.test(w)) { run.push(w); continue; }
      const isLatin = !GREEK.test(w);
      if (runLatin !== null && isLatin !== runLatin) { out.push(run.join(' ')); run = []; }
      run.push(w);
      runLatin = isLatin;
    }
    if (run.length) out.push(run.join(' '));
  }
  return [...new Set(out.filter((s) => s.replace(/[^\p{L}\p{N}]/gu, '').length >= 3))];
}

export const digitsOnly = (s: string | null | undefined): string => String(s ?? '').replace(/\D/g, '');

/** National 10-digit Greek number, or null for anything else (foreign, short, malformed). */
export function greekNational(phone: string | null | undefined): string | null {
  let d = digitsOnly(phone);
  if (d.startsWith('0030')) d = d.slice(4);
  else if (d.startsWith('30') && d.length === 12) d = d.slice(2);
  return /^[26]\d{9}$/.test(d) ? d : null;
}

/** Only the two certain regions are judged: 21x is Attica (ΤΚ 10–19), 231x is Thessaloniki (ΤΚ 54–57). */
export function phoneContradictsPostcode(phone: string | null | undefined, postalCode: string | null | undefined): boolean {
  const p = greekNational(phone);
  const tk = digitsOnly(postalCode);
  if (!p || p.startsWith('6') || tk.length !== 5) return false;
  const tk2 = Number(tk.slice(0, 2));
  const attica = tk2 >= 10 && tk2 <= 19;
  const thess = tk2 >= 54 && tk2 <= 57;
  if (p.startsWith('21')) return !attica;
  if (p.startsWith('231')) return !thess;
  return false;
}

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  const e = String(email ?? '').trim().toLowerCase();
  if (!e) return false;
  return /email\s*protected|\[email|cdn-cgi|example\.(com|org)|^noreply@|^no-reply@/.test(e)
    || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(e);
}

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.gr', 'hotmail.com', 'hotmail.gr', 'outlook.com',
  'outlook.com.gr', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'otenet.gr', 'hol.gr', 'forthnet.gr', 'windowslive.com',
  'aol.com', 'gmx.com', 'gmx.de', 'yandex.com', 'mail.ru', 'abv.bg', 'libero.it', 'protonmail.com', 'proton.me']);

export function emailDomain(email: string | null | undefined): string | null {
  const m = String(email ?? '').trim().toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  return m ? m[1] : null;
}

/** A business email domain is a website candidate; a webmail one says nothing about who owns a site. */
export const isBusinessDomain = (domain: string | null | undefined): boolean => !!domain && !FREE_MAIL.has(domain);

export function domainOf(url: string | null | undefined): string | null {
  const s = String(url ?? '').trim().toLowerCase();
  if (!s) return null;
  const host = s.replace(/^[a-z]+:\/\//, '').split(/[/?#:]/)[0].replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

export interface IdentityKeys {
  afm: string | null; gemi: string | null; phones: string[];
  street?: string | null; postalCode?: string | null; names?: (string | null | undefined)[];
}

export type MatchedBy = 'afm' | 'gemi' | 'phone' | 'address';

const fold = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STREET_NOISE = new Set(['ΟΔΟΣ', 'ΛΕΩΦΟΡΟΣ', 'ΛΕΩΦ', 'ΠΛΑΤΕΙΑ', 'ΘΕΣΗ', 'ΒΙΠΕ', 'ΒΙΟΜΗΧΑΝΙΚΗ', 'ΠΕΡΙΟΧΗ', 'ΕΘΝΙΚΗ', 'ΟΔΟΥ', 'STREET', 'AVENUE']);

const LEGAL_FORM = /^(ΑΝΩΝΥΜΗ|ΕΤΑΙΡΕΙΑ|ΕΤΑΙΡΙΑ|ΕΜΠΟΡΙΚΗ|ΒΙΟΜΗΧΑΝΙΚΗ|ΜΟΝΟΠΡΟΣΩΠΗ|ΙΔΙΩΤΙΚΗ|ΚΕΦΑΛΑΙΟΥΧΙΚΗ|ΠΕΡΙΟΡΙΣΜΕΝΗΣ|ΕΥΘΥΝΗΣ|ΕΤΕΡΟΡΡΥΘΜΗ|ΟΜΟΡΡΥΘΜΗ|ΕΙΣΑΓΩΓΙΚΗ|ΕΞΑΓΩΓΙΚΗ|LIMITED|COMPANY|GROUP)$/;

/** Distinctive words of the company's names, in Greek and in search transliteration. */
function nameKeys(names: IdentityKeys['names']): string[] {
  const out = new Set<string>();
  for (const n of names ?? []) {
    for (const w of fold(String(n ?? '')).split(/[^A-ZΑ-Ω0-9]+/)) {
      if (w.length < 5 || LEGAL_FORM.test(w)) continue;
      out.add(w);
      if (GREEK.test(w)) out.add(transliterateGreek(foldForSearch(w)).toUpperCase());
    }
  }
  return [...out].filter((w) => w.length >= 5);
}

/** The needle's digits, each optionally separated, not glued to other digits: "2310 778 734", never inside an IBAN. */
function digitsOnPage(text: string, needle: string): boolean {
  return new RegExp(String.raw`(?<!\d)` + needle.split('').join(String.raw`[\s.\-]?`) + String.raw`(?!\d)`).test(text);
}

/** The longest real word of the registered street (ΤΣΙΜΙΣΚΗ from "ΟΔΟΣ ΤΣΙΜΙΣΚΗ 12"), or null. */
function streetKey(street: string | null | undefined): string | null {
  const words = fold(String(street ?? '')).split(/[^A-ZΑ-Ω]+/).filter((w) => w.length >= 5 && !STREET_NOISE.has(w));
  return words.sort((a, b) => b.length - a.length)[0] ?? null;
}

const streetNumber = (street: string | null | undefined): string | null =>
  String(street ?? '').match(/\b([1-9]\d{0,3})\b/)?.[1] ?? null;

/** Ownership needs the company's own ΑΦΜ, ΓΕΜΗ, invoice phone, or its registered address plus its number or name; a name alone proves nothing. */
export function pageConfirmsIdentity(pageText: string, keys: IdentityKeys): MatchedBy | null {
  const afm = digitsOnly(keys.afm);
  if (afm.length >= 8 && afm.length <= 14 && digitsOnPage(pageText, afm)) return 'afm';
  const gemi = digitsOnly(keys.gemi);
  if (gemi.length >= 9 && digitsOnPage(pageText, gemi)) return 'gemi';
  for (const p of keys.phones) {
    const n = greekNational(p);
    if (n && n.startsWith('2') && digitsOnPage(pageText, n)) return 'phone';
  }
  const tk = digitsOnly(keys.postalCode);
  const street = streetKey(keys.street);
  if (tk.length !== 5 || !street || !digitsOnPage(pageText, tk)) return null;
  const page = fold(pageText);
  if (!page.includes(street)) return null;
  const num = streetNumber(keys.street);
  const numberNear = !!num && new RegExp(`${street}[^0-9]{0,8}${num}(?!\\d)`).test(page);
  const named = nameKeys(keys.names).some((n) => page.includes(n));
  return numberNear || named ? 'address' : null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/\s+/g, ' ');
}

const SUBPAGE_HINT = /(contact|epikoin|επικοιν|company|etaireia|εταιρ|about|profil|terms|oroi|όροι|privacy|aporrito|impressum|imprint)/i;

/** Up to `max` same-site links most likely to carry the ΑΦΜ (contact, company, terms pages). */
export function likelyIdentityLinks(html: string, baseUrl: string, max = 3): string[] {
  const base = new URL(baseUrl);
  const out: string[] = [];
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi)) {
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    if (!SUBPAGE_HINT.test(decodeURIComponent(u.pathname))) continue;
    const s = `${u.origin}${u.pathname}`;
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export interface EnrichCandidate {
  website: string | null; email: string | null; phone: string | null; linkedin: string | null; facebook: string | null;
  twitter: string | null; description: string | null; industry: string | null; employee_count: string | null;
  city: string | null; state: string | null; country: string | null;
}

export interface GateInput {
  fields: EnrichCandidate;
  verified: { domain: string; by: MatchedBy | 'email_domain'; aliases?: string[] } | null;
  postalCode: string | null;
}

export interface GateResult {
  save: Partial<EnrichCandidate>;
  suggestions: Partial<EnrichCandidate>;
  rejected: { field: keyof EnrichCandidate; value: string; reason: string }[];
}

const SITE_BOUND: (keyof EnrichCandidate)[] = ['description', 'industry', 'linkedin', 'facebook', 'twitter', 'employee_count', 'city', 'state', 'country'];

/** Without a verified site nothing from the search is saved; it comes back as a suggestion for the operator to confirm. */
export function gateEnrichment({ fields, verified, postalCode }: GateInput): GateResult {
  const save: Partial<EnrichCandidate> = {};
  const suggestions: Partial<EnrichCandidate> = {};
  const rejected: GateResult['rejected'] = [];
  const reject = (field: keyof EnrichCandidate, reason: string) => rejected.push({ field, value: String(fields[field]), reason });

  const searchedDomain = domainOf(fields.website);
  if (verified) save.website = `https://${verified.domain}`;
  const sameSite = !!verified && !!searchedDomain && (searchedDomain === verified.domain || !!verified.aliases?.includes(searchedDomain));
  if (fields.website && !sameSite) {
    if (verified) reject('website', `differs from the verified site ${verified.domain}`);
    else suggestions.website = fields.website;
  }

  if (fields.email) {
    const d = emailDomain(fields.email);
    if (isPlaceholderEmail(fields.email)) reject('email', 'placeholder or malformed address');
    else if (sameSite && d && (d === verified!.domain || verified!.aliases?.includes(d))) save.email = fields.email;
    else suggestions.email = fields.email;
  }
  if (fields.phone) {
    if (phoneContradictsPostcode(fields.phone, postalCode)) reject('phone', 'area code contradicts the registered postcode');
    else if (sameSite) save.phone = fields.phone;
    else suggestions.phone = fields.phone;
  }
  for (const k of SITE_BOUND) {
    if (!fields[k]) continue;
    if (sameSite) save[k] = fields[k]!;
    else suggestions[k] = fields[k]!;
  }
  return { save, suggestions, rejected };
}
