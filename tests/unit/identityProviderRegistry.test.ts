import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// Imports the PURE half deliberately: `registry.ts` pulls in the Supabase client, which throws
// on import in the node test environment. The rules worth guarding all live in providers.ts.
import { IDENTITY_PROVIDERS, providerFor, providersFor } from '@/services/identity/providers';
import { VAT_COUNTRY_OPTIONS } from '@/lib/vatCountries';

/**
 * The identity-provider registry (#329) replaced a hardcoded `if country === 'EL' … else if EU …`
 * with a lookup. That is only an improvement if the registry stays honest about three things,
 * none of which TypeScript can check.
 */
describe('business-identity provider registry (#329)', () => {
  it('resolves the country the old hardcoded branch handled', () => {
    // The behaviour being preserved, pinned as a regression test rather than trusted:
    // Greek numbers must still reach ΑΑΔΕ and not VIES, even though VIES also covers Greece.
    expect(providerFor('EL')?.id).toBe('aade');
    expect(providerFor('GR')?.id).toBe('aade');
    // A non-Greek EU country goes to VIES.
    expect(providerFor('DE')?.id).toBe('vies');
    expect(providerFor('IT')?.id).toBe('vies');
    // Outside the EU there is genuinely nothing to ask — and that must be expressible.
    expect(providerFor('US')).toBeNull();
    expect(providerFor('CN')).toBeNull();
  });

  it('ΑΑΔΕ outranks VIES for Greece, and both are offered', () => {
    // Both can answer for EL. Order matters: ΑΑΔΕ returns the full registry record (ΚΑΔ, ΔΟΥ,
    // legal form) where VIES returns only name and address, so a silent reordering would quietly
    // downgrade every Greek lookup.
    const forGreece = providersFor('EL').map((p) => p.id);
    expect(forGreece).toEqual(['aade', 'vies']);
  });

  it('every declared country exists in the shared country list', () => {
    // A provider claiming a country code that no picker can produce is unreachable — the lookup
    // would silently never fire for it.
    const known = new Set(VAT_COUNTRY_OPTIONS.map((o) => o.code));
    // 'GR' is the ISO code; the VAT list uses the fiscal 'EL' for Greece. Both must resolve, so
    // it is allowed to be absent from the picker list.
    const exempt = new Set(['GR']);
    for (const p of IDENTITY_PROVIDERS) {
      if (p.countries === '*') continue;
      const unknown = p.countries.filter((c) => !known.has(c) && !exempt.has(c));
      expect(unknown, `provider '${p.id}' claims country codes that are not in VAT_COUNTRY_OPTIONS`).toEqual([]);
    }
  });

  it('provider ids match the values written to vat_validation_source', () => {
    // `id` doubles as the provenance written onto crm_companies. If an id drifts from what the
    // DB and the rest of the app expect, rows start recording an authority that does not exist —
    // and "who verified this VAT?" becomes unanswerable for those rows.
    const ids = IDENTITY_PROVIDERS.map((p) => p.id).sort();
    expect(ids).toEqual(['aade', 'vies']);
  });

  it('no two providers for one country share a priority', () => {
    // Equal priorities make resolution depend on array order, which is exactly the kind of
    // accidental behaviour this registry exists to remove.
    for (const country of new Set(VAT_COUNTRY_OPTIONS.map((o) => o.code))) {
      const ps = providersFor(country);
      const priorities = ps.map((p) => p.priority);
      expect(
        new Set(priorities).size,
        `providers for ${country} share a priority: ${ps.map((p) => `${p.id}=${p.priority}`).join(', ')}`,
      ).toBe(priorities.length);
    }
  });

  it('nothing outside the registry branches on a country code for provider choice', () => {
    // The whole point. If a caller reintroduces `=== 'EL'` to decide WHERE to verify, the
    // registry is decoration and adding a country silently misses that call site.
    const src = readFileSync('src/components/business/crm/CompanyIdentityLookup.tsx', 'utf8');
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    // Placeholder/label text may still mention Greece; a COMPARISON is what must be gone.
    expect(
      /(countryCode|cc)\s*===\s*'(EL|GR)'\s*&&/.test(stripped),
      'CompanyIdentityLookup still branches on country to choose a lookup provider — use providerFor()',
    ).toBe(false);
  });
});
