/** RFC 822 messages out, Gmail API payloads in. Import-free so the unit tests can run it. */

export interface MimeAttachment { filename: string; contentType: string; base64: string }

export interface OutgoingMail {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
  html?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: MimeAttachment[];
}

const CRLF = '\r\n';

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

export function base64ToBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(data: string): Uint8Array {
  const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** A header value with CR/LF removed, so no input can start a header of its own. */
export function headerSafe(value: string): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
}

export function encodeHeaderWord(value: string): string {
  const v = headerSafe(value);
  // deno-lint-ignore no-control-regex
  return /^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${utf8ToBase64(v)}?=`;
}

function wrapBase64(b64: string): string {
  return b64.replace(/.{1,76}/g, (line) => line + CRLF).trimEnd();
}

function boundary(tag: string): string {
  return `=_${tag}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function textPart(contentType: string, body: string): string {
  return `Content-Type: ${contentType}; charset=UTF-8${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${wrapBase64(utf8ToBase64(body))}`;
}

export function buildMimeMessage(mail: OutgoingMail): string {
  const headers = [
    `From: ${headerSafe(mail.from)}`,
    `To: ${mail.to.map(headerSafe).join(', ')}`,
    ...(mail.cc?.length ? [`Cc: ${mail.cc.map(headerSafe).join(', ')}`] : []),
    ...(mail.bcc?.length ? [`Bcc: ${mail.bcc.map(headerSafe).join(', ')}`] : []),
    `Subject: ${encodeHeaderWord(mail.subject)}`,
    ...(mail.inReplyTo ? [`In-Reply-To: ${headerSafe(mail.inReplyTo)}`] : []),
    ...(mail.references ? [`References: ${headerSafe(mail.references)}`] : []),
    'MIME-Version: 1.0',
  ];
  const body = mail.html
    ? (() => {
      const b = boundary('alt');
      return {
        type: `multipart/alternative; boundary="${b}"`,
        content: [`--${b}`, textPart('text/plain', mail.text), `--${b}`, textPart('text/html', mail.html), `--${b}--`].join(CRLF),
      };
    })()
    : null;
  const atts = mail.attachments ?? [];
  if (!atts.length) {
    if (body) return [...headers, `Content-Type: ${body.type}`, '', body.content].join(CRLF);
    return [...headers, textPart('text/plain', mail.text)].join(CRLF);
  }
  const mixed = boundary('mix');
  const parts = [
    body ? `Content-Type: ${body.type}${CRLF}${CRLF}${body.content}` : textPart('text/plain', mail.text),
    ...atts.map((a) => {
      const name = encodeHeaderWord(a.filename).replace(/"/g, '');
      return `Content-Type: ${headerSafe(a.contentType) || 'application/octet-stream'}; name="${name}"${CRLF}`
        + `Content-Disposition: attachment; filename="${name}"${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${wrapBase64(a.base64)}`;
    }),
  ];
  return [...headers, `Content-Type: multipart/mixed; boundary="${mixed}"`, '', ...parts.flatMap((p) => [`--${mixed}`, p]), `--${mixed}--`].join(CRLF);
}

// ── Gmail payloads in ───────────────────────────────────────────────────────────────

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

export interface ParsedGmailMessage {
  headers: Record<string, string>;
  text: string | null;
  html: string | null;
  attachments: Array<{ attachmentId: string; filename: string; mimeType: string; size: number }>;
}

function charsetOf(part: GmailPart): string {
  const ct = part.headers?.find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';
  return /charset="?([^";\s]+)"?/i.exec(ct)?.[1]?.toLowerCase() ?? 'utf-8';
}

function decodeBody(part: GmailPart): string {
  const bytes = base64UrlToBytes(part.body?.data ?? '');
  try {
    return new TextDecoder(charsetOf(part)).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export function parseGmailPayload(payload: GmailPart): ParsedGmailMessage {
  const headers: Record<string, string> = {};
  for (const h of payload.headers ?? []) headers[h.name.toLowerCase()] = h.value;
  const out: ParsedGmailMessage = { headers, text: null, html: null, attachments: [] };
  const walk = (part: GmailPart) => {
    const type = (part.mimeType ?? '').toLowerCase();
    if (part.filename && part.body?.attachmentId) {
      out.attachments.push({ attachmentId: part.body.attachmentId, filename: part.filename, mimeType: type, size: part.body.size ?? 0 });
      return;
    }
    if (type === 'text/plain' && out.text === null && part.body?.data) out.text = decodeBody(part);
    else if (type === 'text/html' && out.html === null && part.body?.data) out.html = decodeBody(part);
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);
  return out;
}

/** "Maria K <maria@keros.com>" → { name, address }. */
export function parseAddress(raw: string | undefined | null): { name: string | null; address: string | null } {
  const v = String(raw ?? '').trim();
  const m = /^(.*)<([^>]+)>\s*$/.exec(v);
  if (m) return { name: m[1].trim().replace(/^"|"$/g, '').trim() || null, address: m[2].trim().toLowerCase() };
  return { name: null, address: v.includes('@') ? v.toLowerCase() : null };
}

/** An address header split into people, keeping commas inside quotes and angle brackets. */
export function parseAddressList(raw: string | undefined | null): Array<{ name: string | null; address: string | null }> {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  let angle = 0;
  for (const ch of String(raw ?? '')) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === '<') angle++;
    else if (!quoted && ch === '>') angle = Math.max(0, angle - 1);
    if (ch === ',' && !quoted && angle === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((p) => parseAddress(p)).filter((a) => a.address);
}
