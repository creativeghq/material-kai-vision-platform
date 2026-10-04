/** Parses ΣΕΒΕ (seve.gr) exporter-directory pages and sitemaps. Pure, so tests import it. */
import { domainOf, greekNational } from './identityCheck.ts';

export const SEVE_ORIGIN = 'https://www.seve.gr';

export interface SitemapEntry { url: string; slug: string; lastmod: string | null }

export interface SeveMember {
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  phones: string[];
  emails: string[];
  website: string | null;
  website_domain: string | null;
  industries: string[];
  intrastat: { code: string; description: string; industry: string | null }[];
  contact_person: string | null;
  founded_year: number | null;
  certificates: string | null;
  description: string | null;
}

const decode = (s: string) => s
  .replace(/&#8211;|&ndash;/g, '–').replace(/&#8217;|&rsquo;/g, '’').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#039;|&#39;/g, "'").replace(/&nbsp;|&#160;/g, ' ');
const text = (html: string | undefined | null) =>
  html ? decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || null : null;

export const slugOf = (url: string): string => {
  const raw = url.split('/company/')[1]?.replace(/\/$/, '') ?? '';
  try { return decodeURIComponent(raw); } catch { return raw; }
};

export function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const url = m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    if (!url || !url.includes('/company/') || url.includes('/en/company/')) continue;
    out.push({ url, slug: slugOf(url), lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1]?.trim() ?? null });
  }
  return out;
}

export const companySitemaps = (indexXml: string): string[] =>
  [...indexXml.matchAll(/<loc>([^<]*company-sitemap\d*\.xml)<\/loc>/g)].map((m) => m[1]);

/** The value cell of a labelled block (`<div class="phone">…label…</div><div class="col-xs-6">VALUE</div>`). */
function block(html: string, cls: string): string | null {
  const re = new RegExp(`<div class="${cls}">\\s*<div class="clearfix">\\s*<div class="col-xs-6">[\\s\\S]*?</div>\\s*<div class="col-xs-6">([\\s\\S]*?)</div>\\s*</div>`);
  return html.match(re)?.[1] ?? null;
}

export function parseMemberPage(html: string): SeveMember | null {
  const name = text(html.match(/<h2 class="title">([\s\S]*?)<\/h2>/)?.[1]);
  if (!name) return null;

  const addr = text(block(html, 'address'));
  const parts = addr ? addr.split(',').map((p) => p.trim()).filter(Boolean) : [];
  const tk = parts.find((p) => /^\d{3}\s?\d{2}$/.test(p))?.replace(/\s/g, '') ?? null;

  const phones = new Set<string>();
  for (const cls of ['phone', 'fax']) {
    for (const m of (text(block(html, cls)) ?? '').matchAll(/(?:\+?30)?[\d\s\-().]{10,}/g)) {
      const n = greekNational(m[0]);
      if (n) phones.add(n);
    }
  }

  const siteHtml = block(html, 'website') ?? '';
  const website = siteHtml.match(/href="([^"]+)"/)?.[1] ?? text(siteHtml);
  const emails = [...(block(html, 'email') ?? '').matchAll(/mailto:([^"]+)"/g)].map((m) => m[1].trim().toLowerCase());

  const branchesHtml = html.match(/<div class="company-branches">([\s\S]*?)<\/div>/)?.[1] ?? '';
  const industries = [...branchesHtml.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => decode(m[1]).trim());

  const intrastat: SeveMember['intrastat'] = [];
  for (const b of html.matchAll(/<div class="branches">([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const industry = text(b[1].match(/<h4>([\s\S]*?)<\/h4>/)?.[1]);
    for (const c of b[1].matchAll(/<p class="pro_code">([^<]*)<\/p>\s*<p class="descr">([\s\S]*?)<\/p>/g)) {
      if (c[1].trim()) intrastat.push({ code: c[1].trim(), description: text(c[2]) ?? '', industry });
    }
  }

  const year = Number(text(block(html, 'institution')));
  return {
    name,
    address: addr,
    postal_code: tk,
    city: tk ? parts[parts.indexOf(parts.find((p) => p.replace(/\s/g, '') === tk)!) + 1] ?? null : null,
    phones: [...phones],
    emails: [...new Set(emails)],
    website: website || null,
    website_domain: domainOf(website),
    industries,
    intrastat,
    contact_person: text(block(html, 'person')),
    founded_year: Number.isInteger(year) && year > 1800 ? year : null,
    certificates: text(block(html, 'certifications')),
    description: text(html.match(/<div class="company-info">\s*<h3>[\s\S]*?<\/h3>([\s\S]*?)<\/div>/)?.[1]),
  };
}

/** Upper-case, accent-free, legal forms removed: the key a CRM name and a ΣΕΒΕ name are compared on. */
const LEGAL_FORMS = new Set(['ΑΝΩΝΥΜΗ', 'ΕΤΑΙΡΕΙΑ', 'ΕΤΑΙΡΙΑ', 'ΕΜΠΟΡΙΚΗ', 'ΒΙΟΜΗΧΑΝΙΚΗ', 'ΜΟΝΟΠΡΟΣΩΠΗ', 'ΙΔΙΩΤΙΚΗ',
  'ΚΕΦΑΛΑΙΟΥΧΙΚΗ', 'ΠΕΡΙΟΡΙΣΜΕΝΗΣ', 'ΕΥΘΥΝΗΣ', 'ΑΕ', 'ΑΒΕΕ', 'ΑΕΒΕ', 'ΕΠΕ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ', 'ΚΑΙ', 'ΣΙΑ', 'ΜΟΝ',
  'LTD', 'SA', 'AE', 'IKE', 'OE', 'EE']);

export function foldCompanyName(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(^|[^A-ZΑ-Ω])((?:[A-ZΑ-Ω]\.){2,})/g, (_, pre: string, abbr: string) => pre + abbr.replace(/\./g, ''))
    .split(/[^A-ZΑ-Ω0-9]+/).filter((w) => w && !LEGAL_FORMS.has(w)).join(' ');
}
