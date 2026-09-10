/** Is this failure the DATABASE being unavailable, or the caller's fault? */

/** SQLSTATE classes that mean the server could not serve, not that the request was bad. */
const UNAVAILABLE_SQLSTATE_CLASSES = [
  '08', // connection exception
  '53', // insufficient resources (too many connections, out of memory, disk full)
  '57', // operator intervention (admin shutdown, crash shutdown, cannot connect now)
  '58', // system error (io_error, file access)
  'XX', // internal error (data corrupted, index corrupted)
];

/** HTTP statuses a gateway hands back when the ORIGIN failed, seen as a PostgREST "code". */
const GATEWAY_STATUS_CODES = ['502', '503', '504', '520', '521', '522', '523', '524', '525', '526'];

/**
 * Literal signatures of "the other end did not answer". Anchored on transport and gateway
 * vocabulary — never on how a message is phrased.
 */
const UPSTREAM_MESSAGE_RE = new RegExp([
  // An HTML error page where JSON was expected — a gateway answered instead of the API.
  '<!doctype html', '<html[ >]',
  // Cloudflare / nginx / gateway wording.
  'connection timed out', 'bad gateway', 'gateway time-?out', 'service unavailable',
  'origin is unreachable', 'web server is down', 'error code 5[0-9]{2}',
  // supabase-js / Deno / undici transport failures.
  'fetch failed', 'error sending request', 'failed to fetch', 'network error',
  'socket hang ?up', 'connection (refused|reset|closed|failure)', 'connection error',
  'client network socket disconnected', 'premature close', 'stream (closed|reset)',
  'econnrefused', 'econnreset', 'etimedout', 'enotfound', 'eai_again', 'epipe',
  'tls handshake', 'handshake failed', 'request timeout', 'operation timed out',
  // PostgREST could not produce a body because what answered was not the API.
  'json could not be generated',
  // Postgres itself saying it cannot serve right now.
  'the database system is (starting up|shutting down|in recovery)',
  'too many clients', 'remaining connection slots', 'terminating connection',
  'could not connect', 'server closed the connection', 'no connection to the server',
  'canceling statement due to (statement timeout|conflict with recovery)',
].join('|'), 'i');

/** Pull a message + code out of whatever a caller threw or logged. */
function shapeOf(input: unknown): { message: string; code: string } {
  if (input === null || input === undefined) return { message: '', code: '' };
  if (typeof input === 'string') return { message: input, code: '' };

  if (typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ['message', 'details', 'hint', 'error_description', 'error']) {
      const v = o[key];
      if (typeof v === 'string') parts.push(v);
    }
    // An Error carrying the real failure as `cause` — the shape new code should use.
    const cause = o.cause;
    if (cause && cause !== input) {
      const inner = shapeOf(cause);
      if (inner.message) parts.push(inner.message);
      if (inner.code && !o.code) o.code = inner.code;
    }
    const code = typeof o.code === 'string' ? o.code
      : typeof o.code === 'number' ? String(o.code)
        : '';
    return { message: parts.join(' | '), code };
  }

  return { message: String(input), code: '' };
}

/**
 * True when the failure is the upstream data service being unavailable.
 *
 * Accepts an Error, a supabase/PostgREST error object, or a bare message string, because the
 * call sites this has to cover pass all three.
 */
export function isUpstreamFailure(input: unknown): boolean {
  const { message, code } = shapeOf(input);

  if (code) {
    if (GATEWAY_STATUS_CODES.includes(code)) return true;
    // A 5-character SQLSTATE: the class is the first two characters.
    if (code.length === 5 && UNAVAILABLE_SQLSTATE_CLASSES.includes(code.slice(0, 2))) return true;
    // PGRST1xx / 23505 / 42501 and friends are the request's own fault — say so explicitly
    // rather than falling through to the text scan, which could match a quoted value.
    if (/^PGRST/i.test(code) || /^(22|23|42|P0)/.test(code)) return false;
  }

  return !!message && UPSTREAM_MESSAGE_RE.test(message);
}

/**
 * A policy refused, versus nobody granted. Only these two literals — Postgres writes both.
 */
const RLS_POLICY_RE = /violates row-level security policy/i;
const MISSING_GRANT_RE =
  /permission denied for (table|view|relation|materialized view|function|procedure|routine|schema|sequence|column|type|database|large object)\s*"?([\w.$]+)"?/i;

export type DbFailureKind = 'upstream' | 'rls_denied' | 'grant_missing' | 'client';

/**
 * What KIND of failure this is, so the wrapper can give it the status it deserves.
 *
 * `client` means "leave it exactly as the handler said" — that is the answer for every ordinary
 * validation error, constraint violation and business rule, which is most of them.
 */
export function classifyDbFailure(input: unknown): DbFailureKind {
  if (isUpstreamFailure(input)) return 'upstream';

  const { message } = shapeOf(input);
  if (!message) return 'client';

  // A policy refusing is checked first: "new row violates row-level security policy for table x"
  // also contains the word permission in some client wrappers.
  if (RLS_POLICY_RE.test(message)) return 'rls_denied';
  if (MISSING_GRANT_RE.test(message)) return 'grant_missing';

  return 'client';
}

/** "function is_workspace_member" — what the log and Sentry need to name the missing GRANT. */
export function describeDeniedObject(message: string | null | undefined): string {
  const m = message?.match(MISSING_GRANT_RE);
  return m ? `${m[1].toLowerCase()} ${m[2]}` : 'an unnamed database object';
}

/** What the client is told. Never the upstream's own body — that leaked a whole HTML page. */
export const UPSTREAM_UNAVAILABLE_MESSAGE =
  'The data service is temporarily unavailable. Please retry in a moment.';

/** A real authorization answer. The raw text names the table, which the caller need not know. */
export const ACCESS_DENIED_MESSAGE =
  'You do not have access to that.';

/**
 * Deliberately says nothing about GRANTs. The caller cannot act on it, and the object name is
 * ours — it belongs in Sentry, not in a response body.
 */
export const ACTION_UNAVAILABLE_MESSAGE =
  'This action is unavailable right now. It has been reported.';

/**
 * A bounded, single-line summary for the console and Sentry. An HTML error page is 3KB of
 * markup whose only informative part is the title, and during an outage it is logged on every
 * request.
 */
export function summariseUpstreamFailure(message: string | null | undefined): string {
  if (!message) return 'upstream failure (no message)';
  const title = message.match(/<title>([^<]{1,120})<\/title>/i)?.[1];
  const source = (title ?? message).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return source.length > 200 ? `${source.slice(0, 200)}…` : source;
}
