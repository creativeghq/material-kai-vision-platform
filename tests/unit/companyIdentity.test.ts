/**
 * One way to add a business.
 *
 * "Create a company" was implemented three times, and the record you got depended entirely on
 * which screen you happened to be on:
 *   • CRM → Add company        — ΑΑΔΕ → ΓΕΜΗ → web research, ~25 populated columns
 *   • Expenses → payee         — name + two booleans
 *   • Invoices → add client    — name + an UNVERIFIED VAT + email, and that VAT goes on a
 *                                fiscal document and into myDATA
 * Same table, same counterparty, three different depths of record. The stored data is valid in
 * every case, so no integrity check and no typecheck can see it — the second and third surfaces
 * just quietly produce a worse CRM.
 *
 * `CompanyIdentityLookup` is now the one control and `QuickAddCompanyDialog` the one writer.
 * This test pins:
 *   1. the payload/dedupe derivations (pure, and each rule below was a real bug), and
 *   2. that the create-a-business surfaces still route through the shared control — the drift
 *      here is a FOURTH hand-rolled quick-create, which is exactly how we got three.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Walk for `.ts`/`.tsx` under a root. NOT `fs.globSync` — that landed in Node 22, and CI runs
 * Node 20, so it is `undefined` there: the guard threw in CI while passing on a dev machine.
 * Every other source-scanning test in this directory walks with readdirSync for the same reason.
 */
function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

import {
  companyIdentityPayload,
  emptyCompanyIdentity,
  vatDedupeForms,
} from '@/components/business/crm/companyIdentity';

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('vatDedupeForms — a VAT matches whatever spelling the row was saved under', () => {
  it('offers the raw, digits-only and EL-prefixed forms', () => {
    expect(vatDedupeForms('EL800370260')).toEqual(['EL800370260', '800370260']);
    expect(vatDedupeForms('800370260')).toEqual(['800370260', 'EL800370260']);
  });

  it('a myDATA issuer_vat still matches a CRM row stored with the country prefix', () => {
    // The exact-string match this replaced let every one of these through as a new duplicate.
    const stored = 'EL800370260';
    expect(vatDedupeForms('800370260')).toContain(stored);
    expect(vatDedupeForms(' 800370260 ')).toContain(stored);
  });

  it('strips punctuation and dedupes the forms', () => {
    expect(vatDedupeForms('EL 800-370-260')).toEqual(['EL 800-370-260', '800370260', 'EL800370260']);
    // A pure-digit number yields no duplicate entry for the raw form.
    expect(new Set(vatDedupeForms('800370260')).size).toBe(2);
  });

  it('is empty for no VAT — the caller must fall back to a name probe, not query on ""', () => {
    for (const v of [null, undefined, '', '   ']) expect(vatDedupeForms(v)).toEqual([]);
  });
});

describe('companyIdentityPayload — what actually gets written', () => {
  const registryFields = {
    name: 'ΑΚΜΗ ΠΛΑΚΑΚΙΑ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ',
    city: 'ΑΘΗΝΑ',
    tax_office: 'ΦΑΕ ΑΘΗΝΩΝ',
    gemi_number: '123456701000',
    vat_validated: true,
  };

  it('carries the whole registry patch through', () => {
    const out = companyIdentityPayload(
      emptyCompanyIdentity({ name: 'Acme', vatNumber: '800370260', fields: registryFields }),
      { is_supplier: true, is_customer: false },
    );
    expect(out.city).toBe('ΑΘΗΝΑ');
    expect(out.tax_office).toBe('ΦΑΕ ΑΘΗΝΩΝ');
    expect(out.gemi_number).toBe('123456701000');
    expect(out.vat_validated).toBe(true);
  });

  it('the TYPED name wins over the registry name', () => {
    // The operator saw both — the registry name landed in the field and they edited it. Letting
    // `...fields` win would silently discard that edit on save.
    const out = companyIdentityPayload(
      emptyCompanyIdentity({ name: 'Acme Tiles (Athens branch)', fields: registryFields }),
    );
    expect(out.name).toBe('Acme Tiles (Athens branch)');
  });

  it('falls back to the registry name, then to the VAT, when nothing was typed', () => {
    expect(companyIdentityPayload(emptyCompanyIdentity({ fields: registryFields })).name)
      .toBe(registryFields.name);
    expect(companyIdentityPayload(emptyCompanyIdentity({ vatNumber: '800370260' })).name)
      .toBe('800370260');
  });

  it('never lets whitespace masquerade as a name', () => {
    expect(companyIdentityPayload(emptyCompanyIdentity({ name: '   ', vatNumber: '800370260' })).name)
      .toBe('800370260');
  });

  it('writes BOTH role flags explicitly, opting out of the API "no role stated → customer" guess', () => {
    // crm-api POST sets is_customer = true when a request names neither flag. A supplier created
    // without naming them therefore lands as a customer too, and shows up in customer pickers,
    // AR statements and the receivables aging for a company we only ever buy from.
    const supplier = companyIdentityPayload(emptyCompanyIdentity({ name: 'Acme' }), {
      is_supplier: true,
      is_customer: false,
    });
    expect(supplier).toHaveProperty('is_customer', false);
    expect(supplier).toHaveProperty('is_supplier', true);
  });

  it('roles override anything a registry patch happened to carry', () => {
    const out = companyIdentityPayload(
      emptyCompanyIdentity({ name: 'Acme', fields: { ...registryFields, is_customer: true } }),
      { is_supplier: true, is_customer: false },
    );
    expect(out.is_customer).toBe(false);
  });

  it('upper-cases the country code and trims the VAT', () => {
    const out = companyIdentityPayload(
      emptyCompanyIdentity({ name: 'Acme', countryCode: 'de', vatNumber: '  DE123456789 ' }),
    );
    expect(out.country_code).toBe('DE');
    expect(out.vat_number).toBe('DE123456789');
  });

  it('does NOT stamp a country on a by-name create — the selector defaults to EL', () => {
    // The country combobox picks which REGISTRY to ask; it says nothing about where the business
    // is. Writing its 'EL' default unasked filed every by-name company as Greek, on a column that
    // drives VAT treatment and VIES eligibility.
    const byName = companyIdentityPayload(emptyCompanyIdentity({ name: "Bob's Scaffolding Ltd" }));
    expect(byName.country_code).toBeNull();
  });

  it('keeps the country a lookup resolved, even against a stale selector', () => {
    const out = companyIdentityPayload(
      emptyCompanyIdentity({
        name: 'Acme',
        countryCode: 'EL',
        vatNumber: 'DE123456789',
        fields: { country_code: 'DE' },
      }),
    );
    expect(out.country_code).toBe('DE');
  });

  it('sends vat_number null rather than "" when there is no VAT', () => {
    // '' is not a missing VAT — it is a VAT, and it collides with every other row that has one.
    expect(companyIdentityPayload(emptyCompanyIdentity({ name: 'Acme' })).vat_number).toBeNull();
  });
});

describe('the shared control is the only way a business gets created', () => {
  const LOOKUP = 'src/components/business/crm/CompanyIdentityLookup.tsx';
  const QUICK_ADD = 'src/components/business/crm/QuickAddCompanyDialog.tsx';

  /**
   * Surfaces that let an operator bring a NEW business into CRM. Each must reach the registry
   * lookup — directly (the CRM flow, which prefills its own review form) or through the shared
   * quick-add dialog (everywhere else). Adding a create-a-business surface means adding it here.
   */
  const CREATE_SURFACES: Array<{ file: string; via: string }> = [
    { file: 'src/modules/crm/components/AddCompanyModal.tsx', via: 'CompanyIdentityLookup' },
    { file: 'src/modules/finance/components/NewExpenseDialog.tsx', via: 'QuickAddCompanyDialog' },
    { file: 'src/modules/finance/components/NewInvoiceDialog.tsx', via: 'QuickAddCompanyDialog' },
  ];

  it('the shared control and dialog exist', () => {
    expect(src(LOOKUP)).toContain('export const CompanyIdentityLookup');
    expect(src(QUICK_ADD)).toContain('export const QuickAddCompanyDialog');
  });

  it('the quick-add dialog runs the dedupe probe before it offers a create', () => {
    const body = src(QUICK_ADD);
    expect(body).toContain('vatDedupeForms');
    // The duplicate must be offerable, not merely warned about — a warning you cannot act on
    // gets clicked past.
    expect(body).toMatch(/useExisting/);
  });

  it('every create-a-business surface routes through it', () => {
    for (const { file, via } of CREATE_SURFACES) {
      expect(src(file), `${file} must create businesses via ${via}`).toContain(via);
    }
  });

  it('no create-a-business surface hand-rolls the insert', () => {
    for (const { file } of CREATE_SURFACES) {
      const body = src(file);
      expect(body, `${file} must not insert into crm_companies directly`)
        .not.toMatch(/from\('crm_companies'\)[\s\S]{0,200}?\.insert\(/);
    }
  });

  /**
   * The ratchet. Any OTHER file writing `crm_companies` directly is a candidate fourth
   * hand-rolled create — the exact drift this whole change undoes. The list may shrink; it must
   * not grow. To add an entry you have to say, here, why the shared dialog does not fit.
   */
  it('the set of files inserting crm_companies directly does not grow', () => {
    const KNOWN: Record<string, string> = {
      // Your OWN company (Profile → Business), not a counterparty: no third-party registry
      // lookup applies and both role flags are deliberately false.
      'src/components/core/Profile/BusinessSection.tsx': 'own workspace business profile',
    };

    const root = process.cwd();
    const scanned = walk(join(root, 'src'))
      .map((f) => f.slice(root.length + 1).replace(/\\/g, '/'));
    // A scan that finds no files passes every assertion below while checking nothing. This is
    // the platform's dominant failure shape (see ops.silent_zero) and a source-grep guard is a
    // prime host for it — so the scan proves it ran before its verdict counts.
    expect(scanned.length, 'the source scan matched no files — the guard is inert').toBeGreaterThan(500);
    expect(scanned, 'the scan missed a file it is meant to police')
      .toContain('src/components/business/crm/QuickAddCompanyDialog.tsx');

    const files = scanned.filter((f) => /from\('crm_companies'\)[\s\S]{0,200}?\.insert\(/.test(src(f)));
    expect(files.sort()).toEqual(Object.keys(KNOWN).sort());
  });
});
