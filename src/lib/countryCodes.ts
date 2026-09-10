/** VAT registration code → ISO-3166 alpha-2. */

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
