import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  BANKS, BANK_NAMES, bankFromIban, normalizeBankName, resolveBank,
} from '../../src/config/bankVocabulary';

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

describe('a Greek IBAN names its own bank', () => {
  // Verified against live rows in this database and the Hellenic Bank Association's directory.
  const KNOWN: Array<[string, string]> = [
    ['GR9501408040804002002014228', 'Alpha'],
    ['GR7202603760000630200299602', 'Eurobank'],
    ['GR3801103950000039547010544', 'National'],
    ['GR6801722680005268041480581', 'Piraeus'],
    ['GR7711600000000001400052201', 'ProCredit'],
  ];

  it('reads the bank code out of positions 5-7', () => {
    for (const [iban, bank] of KNOWN) expect(bankFromIban(iban)?.name, iban).toBe(bank);
  });

  it('accepts the spaced form the operator pastes', () => {
    expect(bankFromIban('GR95 0140 8040 8040 0200 2014 228')?.name).toBe('Alpha');
    expect(bankFromIban('GR38-0110-3950-0000-3954-7010-544')?.name).toBe('National');
  });

  it('refuses a NON-Greek IBAN rather than reading those digits as a bank code', () => {
    // The live UNICREDIT row is `IT76O0200821…` — "O02" must match nothing, not a Greek bank.
    expect(bankFromIban('IT76O0200821000000106033834')).toBeNull();
    expect(bankFromIban('GB29NWBK60161331926819')).toBeNull();
    expect(bankFromIban('')).toBeNull();
    expect(bankFromIban(null)).toBeNull();
  });

  it('returns null for a Greek code nobody has listed', () => {
    expect(bankFromIban('GR1699900000000000000000000')).toBeNull();
  });
});

describe('a typed name is normalised, never refused', () => {
  it('folds the spellings that were actually in the table', () => {
    expect(normalizeBankName('Nathional')).toBe('National');
    expect(normalizeBankName('Piraeus Bank')).toBe('Piraeus');
    expect(normalizeBankName('piraeus')).toBe('Piraeus');
  });

  it('matches the Greek name the operator types', () => {
    expect(normalizeBankName('ΠΕΙΡΑΙΩΣ')).toBe('Piraeus');
    expect(normalizeBankName('Τράπεζα Πειραιώς')).toBe('Piraeus');
    expect(normalizeBankName('ΕΘΝΙΚΗ')).toBe('National');
  });

  it('keeps an unlisted bank exactly as written', () => {
    expect(normalizeBankName('UNICREDIT SPA ABI 02008 CAB 21000')).toBe('UNICREDIT SPA ABI 02008 CAB 21000');
    expect(normalizeBankName('  Banca Popolare  ')).toBe('Banca Popolare');
    expect(normalizeBankName('')).toBe('');
  });
});

describe('the number beats the claim', () => {
  it('an IBAN overrides a misspelled name', () => {
    expect(resolveBank('Nathional', 'GR7501102470000024744023169')).toBe('National');
  });

  it('falls back to the typed name when the IBAN says nothing', () => {
    expect(resolveBank('Piraeus Bank', '')).toBe('Piraeus');
    expect(resolveBank('Some Local Bank', 'IT76O0200821000000106033834')).toBe('Some Local Bank');
  });
});

describe('the list stays trustworthy', () => {
  it('every Greek code is three digits and unique', () => {
    const codes = BANKS.map((b) => b.greekIbanCode).filter(Boolean) as string[];
    expect(codes.length).toBeGreaterThanOrEqual(5);
    for (const c of codes) expect(c, c).toMatch(/^\d{3}$/);
    expect(new Set(codes).size, 'two banks claim the same IBAN code').toBe(codes.length);
  });

  it('every name is unique, and no alias collides with another bank', () => {
    expect(new Set(BANK_NAMES).size).toBe(BANK_NAMES.length);
    const seen = new Map<string, string>();
    for (const b of BANKS) {
      for (const a of [b.name, ...(b.aliases ?? [])]) {
        const k = a.toLowerCase().replace(/[^a-z0-9Ͱ-Ͽ]/g, '');
        const owner = seen.get(k);
        expect(owner ?? b.name, `"${a}" is claimed by both ${owner} and ${b.name}`).toBe(b.name);
        seen.set(k, b.name);
      }
    }
  });

  it('a BIC, where stated, is a real BIC shape', () => {
    for (const b of BANKS) {
      if (b.bic) expect(b.bic, b.name).toMatch(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/);
    }
  });
});

describe('all three writers normalise', () => {
  it('the CRM service resolves the bank on create AND update', () => {
    // The form is not the only writer — the agent tool and suggestion-accept write here too.
    const svc = code('src/services/crm.service.ts');
    const api = svc.slice(svc.indexOf('export const crmBankAccountsAPI'));
    expect((api.match(/resolveBank\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the agent tool resolves it too, from the mirrored copy', () => {
    const tool = code('supabase/functions/_shared/tools/crm-tools.ts');
    expect(tool).toContain("from '../bankVocabulary.generated.ts'");
    expect(tool.slice(tool.indexOf("if (action === 'add')"))).toMatch(/bank_name: resolveBank\(/);
  });

  it('the form offers the list and fills it from the IBAN', () => {
    const form = code('src/components/business/crm/CrmBankAccountsCard.tsx');
    expect(form).toMatch(/BANKS\.map\(/);
    expect(form).toMatch(/list="crmb-bank-names"/);
    expect(form).toContain('bankFromIban(');
    expect(form).toMatch(/id="crmb-name"/);
  });
});

describe('a brand that is several banks is never one bank', () => {
  it('leaves a bare Postbank alone rather than picking a country for the operator', () => {
    // Deutsche Postbank (DE) and Eurobank Bulgaria AD trading as Postbank (BG) are different
    // banks. Folding the bare word to either one invents a fact the operator never stated.
    expect(normalizeBankName('Postbank')).toBe('Postbank');
    expect(normalizeBankName('Deutsche Postbank')).toBe('Postbank (DE)');
    expect(normalizeBankName('Eurobank Bulgaria')).toBe('Postbank (BG)');
  });

  it('keeps each multi-country brand qualified', () => {
    const ambiguous = ['Postbank', 'Raiffeisen'];
    for (const brand of ambiguous) {
      const bare = BANKS.filter((b) => b.name.toLowerCase() === brand.toLowerCase());
      expect(bare, `${brand} is listed unqualified but exists in several countries`).toHaveLength(0);
      expect(BANKS.filter((b) => b.name.startsWith(brand)).length).toBeGreaterThan(1);
    }
  });

  it('a country, where stated, is an ISO-2 code', () => {
    for (const b of BANKS) {
      if (b.country) expect(b.country, b.name).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe('a bank that stopped existing still resolves', () => {
  it('folds Attica and Pancreta onto the bank they merged into', () => {
    // CrediaBank, September 2025. Both names are still printed on invoices in the system.
    expect(normalizeBankName('Attica Bank')).toBe('CrediaBank');
    expect(normalizeBankName('ΑΤΤΙΚΗΣ')).toBe('CrediaBank');
    expect(normalizeBankName('Pancreta')).toBe('CrediaBank');
    expect(normalizeBankName('Credia')).toBe('CrediaBank');
  });

  it('does not claim a name that means two different banks', () => {
    // Alpha Bank was Alpha Credit Bank until 1994 and CrediaBank is new, so "CreditBank" is
    // genuinely ambiguous — it stays as typed rather than resolving to a guess.
    expect(normalizeBankName('CreditBank')).toBe('CreditBank');
  });
});

describe('the list is wide enough to pick from', () => {
  it('covers the countries this workspace actually buys from', () => {
    const countries = new Set(BANKS.map((b) => b.country).filter(Boolean));
    for (const c of ['GR', 'IT', 'DE', 'BG', 'TR', 'GB']) expect(countries.has(c), c).toBe(true);
    expect(BANK_NAMES.length).toBeGreaterThanOrEqual(40);
  });

  it('still offers the ones asked for by name', () => {
    for (const n of ['UniCredit', 'ProCredit', 'Revolut', 'CrediaBank']) {
      expect(BANK_NAMES, n).toContain(n);
    }
  });
});
