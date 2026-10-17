import { describe, expect, it } from 'vitest';

import { blankedSource } from '../helpers/sourceIndex';
import {
  findExistingParty,
  findOrCreateParty,
  normalizeEmail,
  partyNameKey,
} from '../../supabase/functions/_shared/crm-party';

type Row = Record<string, unknown>;

function fakeDb(rows: Row[]) {
  const inserted: Row[] = [];
  const db = {
    inserted,
    from() {
      const filters: Array<(r: Row) => boolean> = [];
      let insertRow: Row | null = null;
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return q; },
        ilike: (col: string, pattern: string) => {
          const literal = pattern.replace(/\\([%_\\])/g, '$1').toLowerCase();
          filters.push((r) => String(r[col] ?? '').toLowerCase() === literal);
          return q;
        },
        order: () => q,
        limit: async () => ({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
        insert: (row: Row) => { insertRow = row; return q; },
        single: async () => {
          const row = { id: `new-${inserted.length}`, ...insertRow };
          inserted.push(row);
          return { data: row, error: null };
        },
      };
      return q;
    },
  };
  return db;
}

const WS = 'ws-1';
const company = (id: string, name: string, vat: string | null) =>
  ({ id, name, vat_norm: vat, workspace_id: WS, name_xscript: partyNameKey(name), email: null });

describe('a VAT number decides first', () => {
  it('the same VAT is the same business, whatever it is called', async () => {
    const db = fakeDb([company('a', 'ΚΥΡΙΑΖΗΣ Γ.ΧΑΡΙΤΟΠΟΥΛΟΣ Α.Ε.', '094247094')]);
    const r = await findExistingParty(db, 'crm_companies', WS, { name: 'Kyriazis SA', vat: 'EL094247094' });
    expect(r).toMatchObject({ status: 'duplicate', matchedOn: 'vat', existing: { id: 'a' } });
  });

  it('two different VAT numbers are never the same business, even under one name', async () => {
    const db = fakeDb([company('a', 'Acme Tiles', '094084100')]);
    const r = await findExistingParty(db, 'crm_companies', WS, { name: 'Acme Tiles', vat: '094247094' });
    expect(r.status).toBe('clear');
  });

  it('a same-name row with no VAT on file is still a candidate', async () => {
    const db = fakeDb([company('a', 'Acme Tiles', null)]);
    const r = await findExistingParty(db, 'crm_companies', WS, { name: 'ACME TILES', vat: '094247094' });
    expect(r).toMatchObject({ status: 'duplicate', matchedOn: 'name' });
  });
});

describe('an email is matched exactly, never as a pattern', () => {
  it('a wildcard address is not an address', () => {
    expect(normalizeEmail('%@%.%')).toBeNull();
    expect(normalizeEmail('a%b@x.com')).toBeNull();
    expect(normalizeEmail(' Maria@Example.COM ')).toBe('maria@example.com');
  });

  it('an underscore in the address does not match a different contact', async () => {
    const db = fakeDb([{ id: 'c', name: 'Other', email: 'aXb@x.com', vat_norm: null, workspace_id: WS, name_xscript: 'other' }]);
    const r = await findExistingParty(db, 'crm_contacts', WS, { email: 'a_b@x.com' }, { nameFallback: 'never' });
    expect(r.status).toBe('clear');
  });
});

describe('find-or-create', () => {
  it('a person is not merged on a shared name alone', async () => {
    const db = fakeDb([{ id: 'p', name: 'Γιώργος Παπαδόπουλος', email: 'g@one.gr', vat_norm: null, workspace_id: WS, name_xscript: partyNameKey('Γιώργος Παπαδόπουλος') }]);
    const r = await findOrCreateParty(db, 'crm_contacts', WS, { name: 'Γιώργος Παπαδόπουλος', email: 'g@two.gr' }, { name: 'Γιώργος Παπαδόπουλος' });
    expect(r.status).toBe('created');
  });

  it('the workspace comes from the caller, never from the row it was handed', async () => {
    const db = fakeDb([]);
    await findOrCreateParty(db, 'crm_companies', WS, { name: 'New Co' }, { name: 'New Co', workspace_id: 'other' });
    expect(db.inserted[0].workspace_id).toBe(WS);
  });
});

describe('the server paths use it', () => {
  const RAW_EMAIL_ILIKE = /\.ilike\(\s*'email'\s*,\s*(?!escapeLike|emailEqPattern)[^)]*\)/;
  for (const f of [
    'supabase/functions/finance-storefront/index.ts',
    'supabase/functions/products-3d-api/index.ts',
    'supabase/functions/contracts-api/index.ts',
    'supabase/functions/hr-api/expansion.ts',
    'supabase/functions/_shared/tools/quote-tools.ts',
  ]) {
    it(`${f} has no unescaped email ilike`, () => {
      expect(blankedSource(f)).not.toMatch(RAW_EMAIL_ILIKE);
    });
  }

  it('the crm-api guard asks the shared matcher, and a same-VAT match cannot be overridden', () => {
    const src = blankedSource('supabase/functions/crm-api/handlers/_partyDedupe.ts');
    expect(src).toContain("from '../../_shared/crm-party.ts'");
    expect(src).toMatch(/allowDuplicate && result\.matchedOn !== 'vat'/);
  });

  it('a hire reuses the candidate\'s own contact before looking for or creating one', () => {
    const src = blankedSource('supabase/functions/hr-api/expansion.ts');
    const hire = src.slice(src.indexOf("case 'hire-application'"), src.indexOf("case 'list-onboarding'"));
    expect(hire.indexOf('crm_contact_id ?? null')).toBeGreaterThan(-1);
    expect(hire.indexOf('crm_contact_id ?? null')).toBeLessThan(hire.indexOf('findOrCreateParty('));
    expect(hire).toContain(".is('hired_employee_id', null)");
  });
});

describe('#485 C-2 — contact commercial terms need owner/admin, on create AND update', () => {
  it('both write paths strip them', () => {
    const src = blankedSource('supabase/functions/crm-api/handlers/contacts-api-handler.ts');
    expect([...src.matchAll(/stripContactCommercialTerms\(pickContactFields\(body\)/g)].length).toBe(2);
    for (const col of ['credit_limit', 'discount_percent', 'payment_terms_days', 'responsible_sales_user_ids']) {
      expect(src.slice(src.indexOf('CONTACT_COMMERCIAL_TERMS_COLUMNS'))).toContain(`'${col}'`);
    }
  });

  it('the create-and-attach path on the company handler strips them too', () => {
    const src = blankedSource('supabase/functions/crm-api/handlers/companies-api-handler.ts');
    expect(src).toContain('stripContactCommercialTerms(pickContactFields(newContact');
  });
});

describe('#485 C-7 — company-enrich', () => {
  const src = blankedSource('supabase/functions/company-enrich/index.ts');

  it('calls the model through the shared client, with prompts from the registry', () => {
    expect(src).not.toContain('api.anthropic.com');
    expect(src).toContain('callClaudeMessages(');
    expect(src).not.toContain('<research>');
    expect(src).toContain('fenceResearch(');
  });

  it('holds the reserve until the work is settled', () => {
    expect(src).not.toMatch(/reserveCredits\([^)]*\);\s*[^\n]*\n\s*await refundCredits\(/);
    expect([...src.matchAll(/bill\.settle\(\)/g)].length).toBe(3);
  });
});

describe('#485 C-8 — mail tools that change state ask first', () => {
  const src = blankedSource('supabase/functions/_shared/tools/mail-tools.ts');
  for (const [tool, from, to] of [
    ['mail_update', 'export const createMailUpdateTool', 'export const createMailSenderToCrmTool'],
    ['mail_sender_to_crm', 'export const createMailSenderToCrmTool', 'export function createMailTools'],
  ] as const) {
    it(tool, () => {
      const body = src.slice(src.indexOf(from), src.indexOf(to));
      expect(body).toContain('confirm !== true');
      expect(body).toContain(`ask(ctx, '${tool}'`);
    });
  }
});
