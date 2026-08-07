// deno-lint-ignore-file no-explicit-any
/**
 * Portal lead emails → a structured lead.
 *
 * Syndication pushes listings out; the enquiries those portals generate come back as email, and were
 * being retyped by hand or lost. This turns one forwarded message into the fields
 * `property_inquiries` needs.
 *
 * Split out and dependency-free so `tests/unit/inboundLead.test.ts` can exercise the parsing against
 * real message shapes. Portal formats change without notice, and a parser with no tests is one that
 * silently starts dropping the phone number.
 */

/** Normalised parse of a forwarded portal email. */
export interface ParsedPortalLead {
  portal: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  reference: string | null;
}

/** Which portal sent it. Falls back to the sender's domain rather than guessing. */
export function detectPortal(from: string, subject: string, body: string): string {
  const hay = `${from} ${subject} ${body}`.toLowerCase();
  if (/spitogatos|spiti24/.test(hay)) return 'spitogatos';
  if (/xe\.gr|\bxe\b/.test(hay)) return 'xe';
  if (/idealista/.test(hay)) return 'idealista';
  if (/rightmove/.test(hay)) return 'rightmove';
  if (/zillow/.test(hay)) return 'zillow';
  if (/kyero/.test(hay)) return 'kyero';
  if (/zoopla/.test(hay)) return 'zoopla';
  const domain = /@([a-z0-9.-]+)/i.exec(from || '')?.[1];
  return domain ? domain.replace(/^(www|mail|noreply|no-reply)\./, '') : 'unknown';
}

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
// Deliberately not a general phone regex: this has to survive "+30 210 1234567", "6944-123456" and
// "(210) 123 4567" without swallowing a price or a reference number, so it requires a plausible
// length and at least one separator or a leading +.
const PHONE_RE = /(\+\d[\d\s().-]{7,17}\d|\b\d{10}\b|\b\d{3,4}[\s.-]\d{3}[\s.-]\d{3,4}\b)/;

/** Pull `Label: value` out of the body — the shape every portal notification uses. */
function labelled(body: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`^\\s*${label}\\s*[:\\-–]\\s*(.+)$`, 'im');
    const m = re.exec(body);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v && !/^[-–—]*$/.test(v)) return v;
    }
  }
  return null;
}

/**
 * Parse a forwarded portal email into lead fields.
 *
 * Labelled lines are tried first and a loose scan only as a fallback: the first email address in a
 * portal notification is often the PORTAL's own no-reply, and taking it would create a lead nobody
 * can answer. The labelled value is the buyer's.
 */
export function parsePortalLead(input: { from?: string; subject?: string; text?: string; html?: string }): ParsedPortalLead {
  const from = String(input.from ?? '');
  const subject = String(input.subject ?? '');
  // Strip tags rather than parse: we want the text a human would read, and an HTML parser here would
  // be a dependency plus an injection surface for no gain.
  const body = String(input.text ?? '') || String(input.html ?? '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ');

  const name = labelled(body, ['name', 'from', 'sender', 'contact', 'όνομα', 'ονοματεπώνυμο', 'nombre']);
  const emailLabelled = labelled(body, ['e-?mail', 'email', 'ηλ\\.? ?ταχυδρομείο', 'correo']);
  const phone = labelled(body, ['phone', 'tel', 'telephone', 'mobile', 'τηλέφωνο', 'κινητό', 'teléfono'])
    ?? PHONE_RE.exec(body)?.[1]?.trim() ?? null;

  // The buyer's address, never the portal's no-reply. A labelled value wins; a loose scan skips
  // anything that looks like automated portal mail.
  let email = emailLabelled && EMAIL_RE.test(emailLabelled) ? EMAIL_RE.exec(emailLabelled)![0] : null;
  if (!email) {
    const candidates = body.match(new RegExp(EMAIL_RE.source, 'gi')) ?? [];
    email = candidates.find((c) => !/no-?reply|donotreply|notification|mailer|bounce|support|info@/i.test(c)) ?? null;
  }

  const reference = labelled(body, ['ref', 'reference', 'ref\\.? ?no', 'property ref', 'listing id', 'κωδικός', 'κωδ'])
    ?? /\b(?:ref|κωδ(?:ικός)?)\.?\s*[:#]?\s*([A-Z0-9][A-Z0-9_-]{2,20})\b/i.exec(`${subject} ${body}`)?.[1]
    ?? null;

  const message = labelled(body, ['message', 'comments', 'enquiry', 'inquiry', 'μήνυμα', 'σχόλια', 'mensaje']);

  return {
    portal: detectPortal(from, subject, body),
    name: name?.slice(0, 200) ?? null,
    email: email?.toLowerCase() ?? null,
    phone: phone?.slice(0, 40) ?? null,
    message: (message ?? body).trim().slice(0, 4000) || null,
    reference: reference?.slice(0, 60) ?? null,
  };
}
