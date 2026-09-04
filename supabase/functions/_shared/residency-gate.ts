/**
 * What may leave the EEA (issue #394).
 *
 * QwenCloud/DashScope runs in Singapore by default, which is a transfer out of the
 * EEA with no adequacy decision. Alibaba does offer an EU deployment scope in
 * Frankfurt (`eu-central-1`), and pointing at it is the REAL fix — see
 * `DASHSCOPE_BASE_URL` in ai-client.ts. This module is the second line, for the
 * period before that is configured and for the case where someone points a new
 * caller at a non-EEA provider without thinking about it.
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not GDPR compliance and must never be described as such. It catches
 * identifiers that a regex can catch with high precision. It does NOT catch:
 *
 *   - a person's NAME. "Find me everything about Maria Papadopoulou" reads to this
 *     gate as an ordinary research question, because a name is not distinguishable
 *     from any other proper noun without knowing your CRM.
 *   - a postal address.
 *   - a company that is a sole trader, where the company IS a person.
 *
 * So this is a FLOOR, not a guarantee. The guarantee is the EU endpoint plus a DPA.
 * Saying otherwise would make the gate worse than useless: a filter believed to be
 * complete is how people stop thinking about the thing it half-covers.
 *
 * It fails CLOSED. An unreadable payload is refused, because the failure mode of
 * letting it through is a transfer that cannot be undone.
 */

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

/**
 * A phone number needs a phone SIGNAL, not merely enough digits.
 *
 * The first version accepted any run of 9+ digits, which made `article 123456789 in
 * the 2026 catalogue` a phone number — i.e. it blocked ordinary catalogue research,
 * which is the traffic this provider is FOR. A gate that fires on the normal case
 * gets switched off, and then it protects nothing.
 *
 * So: an explicit international prefix, or an explicit label. A bare digit run never
 * counts, and that is a deliberate hole — see the module docstring on being a floor.
 */
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
