/** What may leave the EEA (issue #394). */

export interface ResidencyVerdict {
  allowed: boolean;
  /** Which detector fired. Never includes the matched value itself. */
  reason?: string;
  /** Safe to show a user: names the KIND of data, never the data. */
  message?: string;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

/** IBAN with a real mod-97 check, so a random alphanumeric run is not a false positive. */
const IBAN_CANDIDATE = /\b([A-Z]{2}[0-9]{2}[A-Z0-9]{10,30})\b/g;

/**
 * A tax number only counts when something LABELS it as one. A bare 9-digit run is a
 * product code far more often than an ΑΦΜ.
 *
 * NOT `\b` before the alternation: JavaScript word boundaries are ASCII-only, so
 * `\bΑΦΜ` never matches the Greek label it was written for — the exact case this gate
 * exists to catch in a Greek workspace. Matched on a non-letter prefix instead.
 */
const LABELLED_TAX_ID =
  /(?:^|[^A-Za-zͰ-Ͽ])(?:ΑΦΜ|AFM|VAT(?:\s*(?:no|number|id))?|TIN|Tax\s*(?:ID|number))[\s:.#-]*([A-Z]{0,2}[0-9][0-9\s-]{6,15})/i;

/** A phone number needs a phone SIGNAL, not merely enough digits. */
const PHONE_INTL = /\+\d{1,3}[\s.-]?(?:\(?\d{2,4}\)?[\s.-]?){2,4}\d{2,4}/;
const PHONE_LABELLED =
  /(?:^|[^A-Za-zͰ-Ͽ])(?:τηλ|τηλέφωνο|tel|phone|mobile|κινητό|fax)[\s.:]*\+?[\d\s().-]{7,}/i;

function ibanChecksumPasses(iban: string): boolean {
  const s = iban.toUpperCase().replace(/\s+/g, '');
  if (s.length < 15 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let expanded = '';
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    expanded += code >= 65 && code <= 90 ? String(code - 55) : ch;
  }
  // mod 97 in chunks — the number is far past Number.MAX_SAFE_INTEGER.
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/**
 * Does this text carry an identifier that must not leave the EEA?
 *
 * `phone` is checked LAST and only when the text is short, because a long research
 * answer full of dimensions and part numbers will eventually produce a digit run that
 * looks like a phone number, and a gate that cries wolf gets switched off.
 */
export function findPersonalData(text: string): string | null {
  if (!text) return null;

  if (EMAIL.test(text)) return 'email address';

  for (const m of text.matchAll(IBAN_CANDIDATE)) {
    if (ibanChecksumPasses(m[1])) return 'bank account (IBAN)';
  }

  if (LABELLED_TAX_ID.test(text)) return 'tax identification number';

  // An international prefix is a signal on its own, at any length. A LABELLED number
  // only on short inputs — a long research answer can mention "tel" near a table of
  // figures without a phone number being present.
  if (PHONE_INTL.test(text)) return 'phone number';
  if (text.length <= 400 && PHONE_LABELLED.test(text)) return 'phone number';

  return null;
}

/**
 * Gate a payload bound for a provider outside the EEA.
 *
 * `destinationIsEea` is passed by the caller rather than inferred here, because the
 * caller is the only thing that knows which endpoint it is actually about to hit —
 * and that endpoint is configurable precisely so it CAN be moved into the EU.
 */
export function assertTransferAllowed(
  parts: (string | undefined | null)[],
  opts: { destinationIsEea: boolean; providerLabel: string },
): ResidencyVerdict {
  if (opts.destinationIsEea) return { allowed: true };

  let text: string;
  try {
    text = parts.filter(Boolean).join('\n');
  } catch {
    // Fail closed: something unserialisable is something we cannot inspect.
    return {
      allowed: false,
      reason: 'payload_unreadable',
      message: `This request could not be checked before sending it to ${opts.providerLabel}, which is outside the EU. It was not sent.`,
    };
  }

  const found = findPersonalData(text);
  if (!found) return { allowed: true };

  return {
    allowed: false,
    reason: found.replace(/\s+/g, '_'),
    // Names the KIND, never the value — an error message that echoes the datum has
    // just written it to a log, which is the thing being prevented.
    message:
      `This request contains a ${found} and ${opts.providerLabel} runs outside the EU, `
      + `so it was not sent. Point DASHSCOPE_BASE_URL at the Frankfurt (eu-central-1) `
      + `endpoint to use this provider with customer data, or remove the ${found} from the request.`,
  };
}

/** Alibaba's EU-scoped host. Frankfurt workspaces are `{workspaceId}.<this>`. */
const EEA_HOST = 'eu-central-1.maas.aliyuncs.com';

/**
 * True when the configured endpoint is one of Alibaba's EU-scoped hosts.
 *
 * Compares the parsed HOSTNAME, never the raw string. The previous test ran the region pattern
 * against the whole URL, so `https://x.eu-central-1.maas.aliyuncs.com.evil.example/v1` — and
 * equally a query string mentioning the region — was read as EEA, and personal data that should
 * have been blocked was sent to whoever owned that domain. A URL that will not parse is not
 * an EEA endpoint: this gate fails closed, because the caller uses `false` to mean "block".
 */
export function isEeaEndpoint(baseUrl: string | undefined | null): boolean {
  if (!baseUrl) return false;
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === EEA_HOST || host.endsWith(`.${EEA_HOST}`);
}
