/** The one phone normalizer on the client (#359 CM-1). */

/** E.164 (`+` followed by 8–15 digits), or null when the input is not unambiguously international. */
export function normalizeToE164(phoneNumber: string | null | undefined): string | null {
  const raw = String(phoneNumber ?? '').trim();
  // `+` and `00` are the same prefix written two ways. Anything else is a local number, and which
  // country it belongs to is not knowable from the digits.
  const intl = raw.startsWith('+') ? raw.slice(1) : raw.startsWith('00') ? raw.slice(2) : null;
  if (intl === null) return null;
  const digits = intl.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  // A country code never starts with 0.
  if (digits.startsWith('0')) return null;
  return `+${digits}`;
}

/** The comparison form — digits only, matching SQL's `normalize_msisdn`. */
export function msisdnKey(phoneNumber: string | null | undefined): string | null {
  const e164 = normalizeToE164(phoneNumber);
  return e164 ? e164.slice(1) : null;
}
