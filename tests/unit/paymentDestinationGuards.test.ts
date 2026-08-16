/**
 * A bank account is a payment destination. Two defects on the same table (#366) were both about
 * money going somewhere nobody chose:
 *
 *   • BU-9 — nothing validated an IBAN anywhere. `normalizeIban` deliberately does not (it runs on
 *     every keystroke and a half-typed IBAN must stay editable), and there were ZERO mod-97 checks
 *     across both repos. So a typo was storable as a counterparty payment destination and the
 *     first thing to notice would be a failed — or misdirected — transfer.
 *   • BU-4 — "set as primary" was a client-side two-phase write. A failure between the two calls
 *     left the counterparty with NO primary while the toast said "Failed to set primary", which
 *     reads as "nothing changed".
 *
 * Neither is visible to a typecheck: a wrong IBAN is a valid string, and a missing primary is a
 * valid absence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isValidIban, normalizeIban } from '@/utils/iban';

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((p) => ({ path: p.replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));
const rel = (p: string) => p.slice(p.indexOf('/src/') + 1);

describe('IBAN mod-97', () => {
  // Published specimen IBANs. Each pair is the real one plus a single-digit typo, which is exactly
  // the failure mode a checksum exists to catch and the one a length check never would.
  const VALID = [
    'GR16 0110 1250 0000 0001 2300 695',  // Greece — the platform's home country
    'DE89 3704 0044 0532 0130 00',        // Germany
    'GB82 WEST 1234 5698 7654 32',        // UK, with letters in the BBAN
    'FR14 2004 1010 0505 0001 3M02 606',  // France, mixed alphanumeric
    'CY17 0020 0128 0000 0012 0052 7600',  // Cyprus
    'IT60 X054 2811 1010 0000 0123 456',   // Italy, letter in the check position
  ];
  const TYPO = [
    'GR16 0110 1250 0000 0001 2300 696',
    'DE89 3704 0044 0532 0130 01',
    'GB82 WEST 1234 5698 7654 31',
  ];

  it.each(VALID)('accepts %s', (iban) => {
    expect(isValidIban(iban)).toBe(true);
  });

  it.each(TYPO)('rejects the single-digit typo %s', (iban) => {
    expect(isValidIban(iban)).toBe(false);
  });

  it('treats a MISSING iban as fine — it rejects a wrong one, not an absent one', () => {
    // A counterparty identified by SWIFT + account number legitimately has no IBAN on file.
    expect(isValidIban('')).toBe(true);
    expect(isValidIban(null)).toBe(true);
    expect(isValidIban(undefined)).toBe(true);
  });

  it('rejects junk that is the right shape but not an IBAN', () => {
    expect(isValidIban('NOTANIBAN')).toBe(false);
    expect(isValidIban('1234567890123456')).toBe(false); // no country prefix
    expect(isValidIban('GRXX01101250000000012300695')).toBe(false); // check digits not numeric
    expect(isValidIban('GR16')).toBe(false); // too short to carry a BBAN
  });

  it('normalizes before checking, so a pasted statement value validates', () => {
    // e-banking screens print IBANs in 4-char groups, sometimes with non-breaking spaces.
    const spaced = 'gr16 0110 1250 0000 0001 2300 695';
    expect(normalizeIban(spaced)).toBe('GR1601101250000000012300695');
    expect(isValidIban(spaced)).toBe(true);
    expect(isValidIban('GR16-0110-1250-0000-0001-2300-695')).toBe(true);
  });
});

describe('IBAN validation is applied on the WRITE path', () => {
  /**
   * `normalizeIban` on its own is a formatter — it was applied at 4 write sites and validated at
   * none. A service that stores an IBAN must also check it; a component that only normalizes an
   * `onChange` must NOT, or a half-typed value becomes uneditable.
   */
  const SERVICE_WRITERS = FILES.filter(({ path, src }) =>
    /\/services\//.test(path) && /normalizeIban/.test(src));

  it('finds the service write paths at all (a passing empty scan proves nothing)', () => {
    expect(SERVICE_WRITERS.map(({ path }) => rel(path)).sort()).toEqual([
      'src/modules/finance/services/financeService.ts', // workspace treasury accounts
      'src/services/crm.service.ts',                    // counterparty (supplier/customer) banks
    ]);
  });

  it.each(SERVICE_WRITERS.map(({ path, src }) => [rel(path), src]))(
    '%s validates as well as normalizes',
    (_path, src) => {
      expect(src).toMatch(/\bisValidIban\s*\(/);
    },
  );
});

describe('setting the primary bank account is atomic', () => {
  const CARD = readFileSync(
    resolve(process.cwd(), 'src/components/business/crm/CrmBankAccountsCard.tsx'), 'utf8');
  const SERVICE = readFileSync(resolve(process.cwd(), 'src/services/crm.service.ts'), 'utf8');

  it('goes through the SQL RPC, not two client-side updates', () => {
    expect(SERVICE).toContain('crm_set_primary_bank_account');
    expect(CARD).toMatch(/crmBankAccountsAPI\.setPrimary\(/);
  });

  it('no longer clears the other primaries from the client', () => {
    // The exact shape that could half-apply: patch `is_primary` through the row API, in a fan-out
    // or otherwise, and then set the chosen one in a second call. (`is_primary: false` still
    // appears in the EMPTY form default, which is a form value, not a write.)
    expect(CARD).not.toMatch(/crmBankAccountsAPI\.update\([^)]*is_primary/);
    expect(CARD).not.toMatch(/Promise\.all\([^)]*crmBankAccountsAPI\.update/);
  });

  it('latches while the request is in flight, so a double-click cannot race it', () => {
    expect(CARD).toMatch(/primaryBusy/);
  });
});
