// Shared SOAP/XML/credential helpers for every ΑΑΔΕ web-service edge function.
//
// Every ΑΑΔΕ service (RgWsPublic2, future myDATA endpoints, ICISnet customs, etc.) shares:
//   - the same WS-Security UsernameToken auth header
//   - the same credential storage (AADE_USERNAME + AADE_PASSWORD via resolveSecret)
//   - the same XML-extraction quirks (multiple namespace prefixes, NULL/--- sentinels)
//
// Functions that wrap a specific ΑΑΔΕ operation should:
//   1. Call resolveAadeCredentials() to get { username, password, afmCalledBy, sources }
//   2. Compose the operation-specific <Body> via buildSoapEnvelope(creds, bodyXml)
//   3. POST to the operation's endpoint with the SOAP 1.2 headers
//   4. Use pickTag / pickAllTagBlocks / summarizeError to parse the response

import { resolveSecret, type ResolvedSecret } from '../secrets.ts';

const WSSE_NS = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const PASSWORD_TYPE = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText';

export interface AadeCredentials {
  username: string;
  password: string;
  /** Empty string when not configured. ΑΑΔΕ accepts that as "unknown caller". */
  afmCalledBy: string;
  sources: {
    username: ResolvedSecret['source'];
    password: ResolvedSecret['source'];
    afm_called_by: ResolvedSecret['source'];
  };
}

export type SupabaseLike = { from: (t: string) => unknown };

/**
 * Pull ΑΑΔΕ credentials following the platform-wide env-first → DB-fallback policy.
 * Throws nothing — the caller checks `username` / `password` for empty strings
 * and decides how to respond (typically a 503 with `aade_not_configured`).
 */
export async function resolveAadeCredentials(supabase: SupabaseLike): Promise<AadeCredentials> {
  // deno-lint-ignore no-explicit-any
  const [usernameSecret, passwordSecret, afmCalledBySecret] = await Promise.all([
    resolveSecret(supabase as any, 'AADE_USERNAME'),
    resolveSecret(supabase as any, 'AADE_PASSWORD'),
    resolveSecret(supabase as any, 'AADE_AFM_CALLED_BY'),
  ]);
  return {
    username: usernameSecret.value ?? '',
    password: passwordSecret.value ?? '',
    afmCalledBy: afmCalledBySecret.value ?? '',
    sources: {
      username: usernameSecret.source,
      password: passwordSecret.source,
      afm_called_by: afmCalledBySecret.source,
    },
  };
}

export function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  }[c] as string));
}

/**
 * Build a SOAP 1.2 envelope with the WS-Security UsernameToken header that every ΑΑΔΕ
 * service requires. `bodyXml` is the raw XML payload that goes inside <env:Body>
 * (typically the operation-specific element, namespaces and all).
 */
export function buildSoapEnvelope(creds: { username: string; password: string }, bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope">
  <env:Header>
    <wsse:Security xmlns:wsse="${WSSE_NS}" env:mustUnderstand="true">
      <wsse:UsernameToken>
        <wsse:Username>${xmlEscape(creds.username)}</wsse:Username>
        <wsse:Password Type="${PASSWORD_TYPE}">${xmlEscape(creds.password)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </env:Header>
  <env:Body>${bodyXml}</env:Body>
</env:Envelope>`;
}

/** Extract the first matching tag's inner text (any namespace prefix), or null. */
export function pickTag(xml: string, tagName: string): string | null {
  const re = new RegExp(`<(?:[\\w-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tagName}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  let value = m[1].trim();
  if (value === '' || value === 'NULL' || value.toLowerCase() === 'nil') return null;
  value = value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
  return value;
}

/** Extract every matching tag's inner text (any namespace prefix). */
export function pickAllTagBlocks(xml: string, tagName: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${tagName}>`, 'gi');
  const out: string[] = [];
  let match;
  while ((match = re.exec(xml)) !== null) out.push(match[1]);
  return out;
}

/**
 * Locate the business error (ΑΑΔΕ wraps errors in <error_rec> or <pErrorRec_out>) or a SOAP
 * fault. Returns null when neither is present, OR when an `<error_rec>` is present but BOTH
 * its `<error_code>` and `<error_descr>` are empty / `xsi:nil` — ΑΑΔΕ always includes an
 * `<error_rec>` block in its responses and leaves both children nil on success.
 */
export function summarizeAadeError(xml: string): { code: string | null; message: string | null } | null {
  const errBlock = pickAllTagBlocks(xml, 'error_rec')[0] ?? pickAllTagBlocks(xml, 'pErrorRec_out')[0];
  if (errBlock) {
    const code = pickTag(errBlock, 'error_code');
    const message = pickTag(errBlock, 'error_descr');
    // Both nil/empty → this is the "no error" sentinel, not an actual error.
    if (code === null && message === null) return null;
    return { code, message };
  }
  const faultBlock = pickAllTagBlocks(xml, 'Fault')[0];
  if (faultBlock) {
    return { code: pickTag(faultBlock, 'Value'), message: pickTag(faultBlock, 'Text') ?? pickTag(faultBlock, 'Reason') };
  }
  return null;
}

/**
 * POST a SOAP 1.2 envelope to an ΑΑΔΕ endpoint. Returns { ok, xml, httpStatus, err }.
 * `ok` is true only when the HTTP layer succeeded — caller still has to inspect the XML
 * for a business-level <error_rec> via summarizeAadeError.
 */
export async function postSoap(endpoint: string, envelope: string, timeoutMs = 20_000): Promise<{
  ok: boolean;
  xml: string;
  httpStatus: number;
  err: string | null;
}> {
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'SOAPAction': '',
        'Accept': 'application/soap+xml, application/xml, text/xml',
      },
      body: envelope,
      signal: abort.signal,
    });
    clearTimeout(timer);
    const xml = await resp.text();
    return { ok: resp.ok, xml, httpStatus: resp.status, err: null };
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'unreachable';
    return { ok: false, xml: '', httpStatus: 0, err: detail };
  }
}
