import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';
import {
  canReplace,
  gateEnrichment,
  isPlaceholderEmail,
  pageConfirmsIdentity,
  phoneContradictsPostcode,
  splitTradeNames,
  type EnrichCandidate,
} from '../../supabase/functions/_shared/crm/identityCheck';
import { researchAliases } from '../../supabase/functions/_shared/crm/researchAliases';

const src = (p: string) => blankComments(readFileSync(join(process.cwd(), p), 'utf8'));

const EMPTY: EnrichCandidate = {
  website: null, email: null, phone: null, linkedin: null, facebook: null, twitter: null,
  description: null, industry: null, employee_count: null, city: null, state: null, country: null,
};

describe('trade names', () => {
  it('splits the several names ΑΑΔΕ packs into one field, so POLIHOME is searched on its own', () => {
    expect(splitTradeNames('ANDIPOL  POLIHOME ΠΟΛΥΧΟΟΥΜ')).toEqual(['ANDIPOL', 'POLIHOME', 'ΠΟΛΥΧΟΟΥΜ']);
    expect(researchAliases('ΑΦΟΙ ΠΟΛΙΤΗ Ε Ε', 'ANDIPOL  POLIHOME ΠΟΛΥΧΟΟΥΜ')).toContain('POLIHOME');
  });

  it('keeps a single multi-word name whole, numbers and ampersands included', () => {
    expect(splitTradeNames('STATUS DESIGN')).toEqual(['STATUS DESIGN']);
    expect(splitTradeNames('ΦΕΡΝΙΜΠΑΘ')).toEqual(['ΦΕΡΝΙΜΠΑΘ']);
    expect(splitTradeNames('STUDIO 2000')).toEqual(['STUDIO 2000']);
    expect(splitTradeNames('ALPHA & 1 TILES')).toEqual(['ALPHA & 1 TILES']);
  });

  it('the legal name is always searched, however many trade names there are', () => {
    const many = 'ΠΡΩΤΟ  ΔΕΥΤΕΡΟ  ΤΡΙΤΟ  ΤΕΤΑΡΤΟ';
    expect(researchAliases('ΝΟΜΙΚΗ ΕΠΩΝΥΜΙΑ ΑΕ', many).at(-1)).toBe('ΝΟΜΙΚΗ ΕΠΩΝΥΜΙΑ ΑΕ');
  });
});

describe('contradictions are refused', () => {
  it('an Athens 210 number on a Thessaloniki company is the ΤΟΠΑΛΗΣ mistake', () => {
    expect(phoneContradictsPostcode('+30 2104100560', '54627')).toBe(true);
    expect(phoneContradictsPostcode('+30 2310778734', '18545')).toBe(true);
  });

  it('other areas, mobiles and missing postcodes are not judged', () => {
    expect(phoneContradictsPostcode('+30 2394032222', '57009')).toBe(false);
    expect(phoneContradictsPostcode('6944123456', '54627')).toBe(false);
    expect(phoneContradictsPostcode('2104100560', null)).toBe(false);
  });

  it('a scraped Cloudflare placeholder is not an email address', () => {
    expect(isPlaceholderEmail('[email protected]')).toBe(true);
    expect(isPlaceholderEmail('info@newplan.gr')).toBe(false);
  });
});

describe('a page proves ownership only with the company’s own identifiers', () => {
  const keys = { afm: '999124156', gemi: '139359201000', phones: ['+30 2310 781822'] };

  it('accepts the ΑΦΜ however it is written', () => {
    expect(pageConfirmsIdentity('Α.Φ.Μ.: 999124156 ΔΟΥ Ιωνίας', keys)).toBe('afm');
    expect(pageConfirmsIdentity('VAT EL 999 124 156', keys)).toBe('afm');
  });

  it('accepts the ΓΕΜΗ number or the invoice phone', () => {
    expect(pageConfirmsIdentity('Αρ. ΓΕΜΗ 139359201000', { ...keys, afm: null })).toBe('gemi');
    expect(pageConfirmsIdentity('Τηλ. 2310 781 822', { ...keys, afm: null, gemi: null })).toBe('phone');
  });

  it('accepts the registered street and postcode together — most Greek sites print an address, not an ΑΦΜ', () => {
    const addr = { afm: null, gemi: null, phones: [], street: 'ΛΑΡΙΣΗΣ 38', postalCode: '42100' };
    expect(pageConfirmsIdentity('Λαρίσης 38, 421 00 Τρίκαλα', addr)).toBe('address');
    expect(pageConfirmsIdentity('Λαρίσης 38, Αθήνα 11526', addr)).toBeNull();
    expect(pageConfirmsIdentity('Τρίκαλα 42100', addr)).toBeNull();
  });

  it('a neighbour on the same street and postcode is not the company: it needs the street number or the name', () => {
    const addr = { afm: null, gemi: null, phones: [], street: 'ΛΑΡΙΣΗΣ 38', postalCode: '42100', names: ['BESIOS WOOD A.E.'] };
    expect(pageConfirmsIdentity('Λαρίσης 52, 421 00 Τρίκαλα', addr)).toBeNull();
    expect(pageConfirmsIdentity('Besios — Λαρίσης 52, 421 00 Τρίκαλα', addr)).toBe('address');
  });

  it('two numbers side by side on a footer do not hide the one that matches', () => {
    expect(pageConfirmsIdentity('Τηλ: 2310 781822 - 2310 781823', { afm: null, gemi: null, phones: ['2310781822'] })).toBe('phone');
    expect(pageConfirmsIdentity('ΑΦΜ 999124156 / 2310781822', { afm: '999124156', gemi: null, phones: [] })).toBe('afm');
  });

  it('a matching name, or the digits buried inside an IBAN, prove nothing', () => {
    expect(pageConfirmsIdentity('ΕΛΕΥΘΕΡΙΟΥ ΑΕ — έπιπλα', keys)).toBeNull();
    expect(pageConfirmsIdentity('IBAN GR16 0110 1250 0999 1241 5600 695', { ...keys, phones: [] })).toBeNull();
  });
});

describe('the gate', () => {
  it('without a verified site nothing from the search is saved; it comes back as a suggestion', () => {
    const r = gateEnrichment({
      fields: { ...EMPTY, website: 'https://topalis.gr', phone: '+30 2104100560', description: 'paper bags', industry: 'Packaging' },
      verified: null, postalCode: '54627',
    });
    expect(r.save).toEqual({});
    expect(r.suggestions.website).toBe('https://topalis.gr');
    expect(r.suggestions.description).toBe('paper bags');
    expect(r.rejected.map((x) => x.field)).toContain('phone');
  });

  it('a verified site lets its own details through', () => {
    const r = gateEnrichment({
      fields: { ...EMPTY, website: 'https://www.besios.gr/', email: 'info@besios.gr', description: 'Panels', industry: 'Wood' },
      verified: { domain: 'besios.gr', by: 'afm' }, postalCode: '42100',
    });
    expect(r.save).toMatchObject({ website: 'https://besios.gr', email: 'info@besios.gr', description: 'Panels', industry: 'Wood' });
  });

  it('a search result that differs from the verified site is rejected, and its text is not saved', () => {
    const r = gateEnrichment({
      fields: { ...EMPTY, website: 'https://statusdesignike.eu', description: '1600 stores' },
      verified: { domain: 'statusdesign.gr', by: 'email_domain' }, postalCode: '13561',
    });
    expect(r.save.website).toBe('https://statusdesign.gr');
    expect(r.save.description).toBeUndefined();
    expect(r.rejected[0]).toMatchObject({ field: 'website' });
  });

  it('a searched site that redirects to its canonical domain counts as the verified site', () => {
    const r = gateEnrichment({
      fields: { ...EMPTY, website: 'https://acme.gr', email: 'info@acme.gr', description: 'Tiles', city: 'Milan' },
      verified: { domain: 'acme-tiles.com', by: 'afm', aliases: ['acme.gr'] }, postalCode: null,
    });
    expect(r.save).toMatchObject({ website: 'https://acme-tiles.com', email: 'info@acme.gr', description: 'Tiles', city: 'Milan' });
    expect(r.rejected).toEqual([]);
  });

  it('a placeholder email is rejected even from a verified site', () => {
    const r = gateEnrichment({
      fields: { ...EMPTY, website: 'https://newplan.gr', email: '[email protected]' },
      verified: { domain: 'newplan.gr', by: 'afm' }, postalCode: '57009',
    });
    expect(r.save.email).toBeUndefined();
    expect(r.rejected.map((x) => x.field)).toContain('email');
  });
});

describe('source precedence', () => {
  it('an operator value is never replaced', () => {
    expect(canReplace('operator', 'aade', true)).toBe(false);
  });

  it('an invoice replaces a web guess, a web guess never replaces an invoice', () => {
    expect(canReplace('web', 'invoice')).toBe(true);
    expect(canReplace('invoice', 'web_verified')).toBe(false);
  });

  it('a value with no recorded source is freed only by a contradiction', () => {
    expect(canReplace(undefined, 'invoice')).toBe(false);
    expect(canReplace(undefined, 'invoice', true)).toBe(true);
  });
});

describe('the writers apply the rules before they write', () => {
  it('company-enrich verifies and gates BEFORE updating the row, and saves only what the gate passed', () => {
    const s = src('supabase/functions/company-enrich/index.ts');
    const gate = s.indexOf('gateEnrichment({');
    const write = s.indexOf('.update({ ...patch, field_sources');
    expect(s.indexOf('await verifyIdentity(')).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(s.indexOf('await verifyIdentity('));
    expect(write).toBeGreaterThan(gate);
    expect(s).toContain('Object.entries(gated.save)');
    expect(s).not.toMatch(/if \(!existing && fields\[k\]\) patch\[k\]/);
  });

  it('the website fetch goes through the SSRF guard, follows redirects by hand, and runs under one deadline', () => {
    const s = src('supabase/functions/_shared/crm/verifyWebsite.ts');
    expect(s).toContain('assertSafeUrl(current');
    expect(s).toContain("redirect: 'manual'");
    expect(s).toContain('const left = until - Date.now()');
    expect(src('supabase/functions/company-enrich/index.ts')).toContain('const until = Date.now() + VERIFY_BUDGET_MS');
  });

  it('an email domain that redirects off-site never becomes the verified website', () => {
    expect(src('supabase/functions/company-enrich/index.ts')).toContain('if (c.fromEmail && check.domain === check.requested) emailSite = check.domain');
  });

  it('research writes reach the CRM API marked web_verified, so they are not recorded as typed by a person', () => {
    for (const p of ['src/modules/crm/pages/CompanyDetailPage.tsx', 'src/modules/crm/components/RefreshResearchButton.tsx']) {
      expect(src(p)).toContain('_sources: res.sourceHints');
    }
    expect(src('supabase/functions/crm-api/handlers/companies-api-handler.ts')).toContain("hinted[f] === 'web_verified'");
  });

  it('a person’s edit through the CRM API is stamped as operator-sourced, on the server', () => {
    const s = src('supabase/functions/crm-api/handlers/companies-api-handler.ts');
    expect(s).toContain("OPERATOR_SOURCED_FIELDS = ['website', 'email', 'phone', 'industry', 'description']");
    expect(s).toContain(": { src: 'operator', by: userId ?? 'api', at }");
    const writable = s.slice(s.indexOf('COMPANY_WRITABLE_COLUMNS = ['), s.indexOf('] as const;'));
    expect(writable).not.toContain("'field_sources'");
  });

  it('the invoice reader can replace a web-sourced phone or email and records that it did', () => {
    const s = src('supabase/functions/supplier-einvoice-details/index.ts');
    expect(s).toMatch(/canReplace\(sources\.phone\?\.src, 'invoice'/);
    expect(s).toMatch(/canReplace\(sources\.email\?\.src, 'invoice'/);
    expect(s).toContain('patch.field_sources = sources');
  });
});
