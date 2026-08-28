/**
 * The one phone normalizer on the client (#359 CM-1).
 *
 * There were four across the platform, with three behaviours:
 *
 *   • `messaging-api` prefixed a bare `+`, so `0030691…` became `+0030691…`
 *   • `messagingService` and `messagingCampaignService` each defaulted to country code **`+1`** —
 *     a Greek mobile typed as `6912345678` became `+16912345678`, a real US number. The message
 *     goes to a stranger, it is billed, it is a Meta violation, and it looks like a clean send.
 *   • `zernio-webhook-handler` stored whatever shape the provider sent.
 *
 * An opt-out written in one shape and checked in another is a guard that cannot see: it never
 * matches, nothing raises, and the message goes out anyway.
 *
 * So this does not guess. A value with no `+` and no `00` prefix is ambiguous and is REFUSED —
 * `null`, which every caller must surface rather than paper over. `normalize_msisdn` in SQL is the
 * comparison form (digits only); this is the outbound E.164 form.
 *
 * Import-free on purpose, so a test can load it without a Supabase client.
 */

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
