/**
 * What may leave the EEA.
 *
 * QwenCloud/DashScope runs in Singapore by default. Alibaba offers an EU deployment
 * scope in Frankfurt, and pointing `DASHSCOPE_BASE_URL` there is the REAL fix; this
 * gate is the floor for the period before that, and for the next person who wires a
 * caller to a non-EEA provider without thinking about it.
 *
 * The tests below pin two things in equal measure: that it catches what it claims to,
 * and that it does NOT claim to catch what it cannot. A gate believed to be complete
 * is worse than no gate, because it stops people thinking about the half it misses.
 */
import { describe, it, expect } from 'vitest';
import {
  findPersonalData,
  assertTransferAllowed,
  isEeaEndpoint,
} from '../../supabase/functions/_shared/residency-gate.ts';

describe('what it catches', () => {
  it('an email address', () => {
    expect(findPersonalData('write to maria@example.gr about it')).toBe('email address');
  });

  it('an IBAN, checked by its own checksum rather than its shape', () => {
    // Real-format IBAN with a valid mod-97 remainder.
    expect(findPersonalData('pay GB82WEST12345698765432 today')).toBe('bank account (IBAN)');
  });

  it('but NOT an alphanumeric run that merely looks like one', () => {
    // Same shape, deliberately wrong checksum — a product code, not an account.
    expect(findPersonalData('part GB99WEST12345698765432 in stock')).toBeNull();
  });

  it('a tax number when something labels it as one', () => {
    expect(findPersonalData('ΑΦΜ: 123456789')).toBe('tax identification number');
    expect(findPersonalData('VAT number EL123456789')).toBe('tax identification number');
  });

  it('but NOT a bare nine-digit run, which is a product code far more often', () => {
    expect(findPersonalData('article 123456789 in the 2026 catalogue')).toBeNull();
  });

  it('a phone number in a short prompt', () => {
    expect(findPersonalData('call +30 210 1234567')).toBe('phone number');
  });

  it('but NOT digit runs inside a long research answer', () => {
    // A page of prose full of dimensions and part numbers will eventually contain
    // something phone-shaped. A gate that cries wolf on research output gets switched
    // off, and then it protects nothing at all.
    const prose = 'Dimensions 600 400 200. '.repeat(40) + 'Ref 210 1234567 in the table.';
    expect(prose.length).toBeGreaterThan(400);
    expect(findPersonalData(prose)).toBeNull();
  });
});

describe('what it openly does NOT catch', () => {
  // These are not bugs. They are the reason the module says it is a floor and not
  // compliance, and the reason the EU endpoint is the actual fix. If someone later
  // "improves" the gate to catch names, they must also stop calling it a floor.
  it('a person name', () => {
    expect(findPersonalData('find everything about Maria Papadopoulou')).toBeNull();
  });

  it('a postal address', () => {
    expect(findPersonalData('deliver to 14 Ermou Street, Athens 10563')).toBeNull();
  });
});

describe('the gate', () => {
  const nonEea = { destinationIsEea: false, providerLabel: 'QwenCloud' };

  it('blocks a payload carrying an identifier', () => {
    const v = assertTransferAllowed(['find suppliers for maria@example.gr'], nonEea);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe('email_address');
  });

  it('never echoes the value it blocked on', () => {
    // The message is written to logs and shown to users. Repeating the datum there
    // is the transfer it exists to prevent, performed by the error path.
    const v = assertTransferAllowed(['contact maria@example.gr'], nonEea);
    expect(v.message).toBeTruthy();
    expect(v.message).not.toContain('maria@example.gr');
    expect(v.message).toContain('email address');
  });

  it('allows ordinary research', () => {
    const v = assertTransferAllowed(['ceramic tile manufacturers in Poland'], nonEea);
    expect(v.allowed).toBe(true);
  });

  it('is a no-op once the destination is in the EU', () => {
    const v = assertTransferAllowed(['contact maria@example.gr'], {
      destinationIsEea: true,
      providerLabel: 'QwenCloud',
    });
    expect(v.allowed).toBe(true);
  });
});

describe('EU endpoint detection', () => {
  it('recognises a Frankfurt workspace host', () => {
    expect(isEeaEndpoint('https://ws-abc123.eu-central-1.maas.aliyuncs.com/api/v1')).toBe(true);
  });

  it('does not mistake Singapore for the EU', () => {
    expect(isEeaEndpoint('https://dashscope-intl.aliyuncs.com/compatible-mode/v1')).toBe(false);
  });

  it('treats an unset endpoint as non-EEA — fail closed', () => {
    // Unset means the SDK default, and the SDK default is Singapore. Reading "unknown"
    // as "probably fine" is how a default becomes a transfer nobody decided to make.
    expect(isEeaEndpoint(undefined)).toBe(false);
    expect(isEeaEndpoint('')).toBe(false);
  });
});
