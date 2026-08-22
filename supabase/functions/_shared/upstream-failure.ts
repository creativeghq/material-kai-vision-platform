/**
 * Is this failure the DATABASE being unavailable, or the caller's fault?
 *
 * THE OUTAGE THIS EXISTS FOR (2026-08-22). Postgres went unreachable for four hours. Every
 * edge function that reads the database does this:
 *
 *     const { data, error } = await supabase.from(…).select(…);
 *     if (error) throw new HttpError(400, error.message);      // 207 sites, 16 functions
 *
 * — written for the case where `error` means "your input was wrong". During the outage `error`
 * was a Cloudflare **522 Connection timed out** page, so every caller got `400 Bad Request`
 * with 2,916 bytes of HTML in the message. And `api-logger` never reports 4xx to Sentry, by
 * design, because a client error is not a bug. So a total outage looked like user error in every
 * dashboard and paged nobody, for four hours, while the logs filled with "400".
 *
 * Rewriting 207 call sites would fix today and not tomorrow: the 208th would be written the same
 * way. So the decision lives here and is applied once, in the wrapper every function already goes
 * through. A handler may keep saying 400; if the thing it is reporting is the database being
 * down, the wrapper says 503 and Sentry hears about it.
 *
 * PRECISION MATTERS IN ONE DIRECTION. Misreading a client error as an outage costs a wrong status
 * and a Sentry event. Misreading an outage as a client error is what happened above. The
 * signals below are deliberately literal — transport verbs, gateway codes, Postgres
 * unavailability SQLSTATEs — rather than anything that tries to be clever about wording.
 */

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

/** What the client is told. Never the upstream's own body — that leaked a whole HTML page. */
export const UPSTREAM_UNAVAILABLE_MESSAGE =
  'The data service is temporarily unavailable. Please retry in a moment.';

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
