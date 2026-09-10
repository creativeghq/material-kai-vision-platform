// GENERATED MIRROR of src/lib/countryCodes.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * VAT registration code → ISO-3166 alpha-2.
 *
 * Two codes in the EU differ between the two schemes, and Greece is one of them: the EU VAT
 * prefix is **EL** and the ISO country code is **GR**. Our CRM stores the VAT code (that is what
 * an ΑΦΜ, an invoice header and myDATA all carry), and every service keyed on ISO — a maps
 * query, a SERP location, a shipping rate table — silently does the wrong thing with it.
 *
 * "Silently" is the whole problem. DataForSEO's `country_to_location` does not reject an unknown
 * code: it falls through to its default, which is the United States. So a Greek supplier's
 * Google Business lookup was run against Michigan, billed, and reported as "no listing" — a
 * plausible answer, produced by asking the wrong question, with nothing anywhere saying so.
 *
 * The relation was already restated ad hoc in seven places as `['EL', 'GR'].includes(cc)`, which
 * answers "is this Greek" and cannot answer "what does ISO call it". This is the one table.
 *
 * IMPORT-FREE, ON PURPOSE — byte-mirrored to Deno by `npm run vocab:mirror`, because the edge
 * side needs the same answer before it spends money on an upstream lookup.
 */

/** Codes where the VAT scheme and ISO-3166 disagree. Everything else is identical in both. */
export const VAT_TO_ISO_COUNTRY: Readonly<Record<string, string>> = {
  EL: 'GR', // Greece — EU VAT prefix vs ISO
  UK: 'GB', // United Kingdom — HMRC's prefix vs ISO
};

/**
 * The ISO-3166 alpha-2 code for a stored country code, or `null` when there is not one.
 *
 * `null` means "we do not know", never a default: a caller that needs a country must say what it
 * does without one, out loud. Substituting a plausible country here is how the Michigan search
 * happened in the first place.
 */
export function isoCountryCode(code: string | null | undefined): string | null {
  const cc = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  return VAT_TO_ISO_COUNTRY[cc] ?? cc;
}

/** Is this country code Greece, in either spelling? The `['EL','GR'].includes` question. */
export function isGreekCountryCode(code: string | null | undefined): boolean {
  return isoCountryCode(code) === 'GR';
}
