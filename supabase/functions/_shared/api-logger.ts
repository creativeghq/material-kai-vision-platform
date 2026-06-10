/**
 * Edge Function Observability Wrapper
 *
 * Single chokepoint that wraps any edge function handler to give the whole
 * fleet two things automatically, with no per-function boilerplate:
 *
 *  1. **Request logging** — one row per request in `api_usage_logs`. Column
 *     mapping (the table is request-shaped, not "endpoint/method/status"
 *     shaped — this mismatch silently failed every insert until it was fixed
 *     2026-05-31):
 *       request_path        ← function name
 *       request_method      ← HTTP method
 *       response_status     ← status code
 *       response_time_ms    ← duration
 *       ip_address          ← client IP (NOT NULL — falls back to '0.0.0.0')
 *       user_agent          ← UA header
 *       is_internal_request ← service-role / internal Bearer call
 *
 *  2. **Error reporting to Sentry** — the single unified mechanism for
 *     edge-function error capture (2026-06-09). Wrapped functions should NOT
 *     call `captureException` themselves for top-level request failures — the
 *     wrapper does it. Sentry is kept signal-only:
 *       - handler throws (unhandled) → captureException(realError) — stack-grouped
 *       - handler returns/throws 5xx  → captureMessage(error level), function + status
 *       - 4xx                          → never reported (client errors, not bugs)
 *       - 5xx whose message reads like a client error (validation / auth / method /
 *         not-found) → NOT reported, even though some functions mislabel these as
 *         500 (see `isLikelyClientError`). The HTTP response is left untouched —
 *         only the Sentry report is suppressed.
 *       - throw `HttpError(4xx, msg)` to both return the right status AND skip Sentry.
 *       - duplicate (function + status + message) events are throttled per worker
 *         (60s) so a looping failure can't flood the DSN (it has no sampling).
 *     Deep / background captures (errors swallowed mid-pipeline that never
 *     reach the wrapper — e.g. detached async work) should still call
 *     `captureException` directly from `_shared/sentry.ts`; they carry context
 *     the wrapper cannot see and ride the same underlying transport.
 *
 * The `api_usage_logs` table has no error-message column, so 4xx/5xx detail is
 * logged to the function console (and 5xx to Sentry); the status code is always
 * queryable from the table.
 *
 * Usage:
 *   import { withApiLogging } from '../_shared/api-logger.ts';
 *   Deno.serve(withApiLogging('my-function', async (req) => {
 *     // ... your handler ...
 *     return new Response(...);
 *   }));
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';
import { captureException, captureMessage } from './sentry.ts';

type Handler = (req: Request) => Promise<Response> | Response;

/**
 * Throw this from a handler to return a specific HTTP status. The wrapper honours
 * `.status` — a 4xx HttpError returns that code and is NOT reported to Sentry
 * (it's a client error, not a bug). New code should use this for validation/auth
 * failures instead of `throw new Error('… required')`.
 */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function getErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const s = (err as { status?: unknown; statusCode?: unknown }).status
      ?? (err as { statusCode?: unknown }).statusCode;
    if (typeof s === 'number' && s >= 400 && s <= 599) return s;
  }
  return undefined;
}

// Expected client errors — bad input, auth, method, not-found. Many functions
// signal these with a thrown Error or a blanket 500 instead of the correct 4xx
// (e.g. scrape-* return 500 for "Missing required parameters"; email-api returns
// 500 for "Domain is required"). We leave the HTTP response untouched but keep
// these OUT of Sentry so the dashboard stays signal-only. Tunable — widen/narrow
// as real noise vs. real bugs gets observed. Genuine server faults ("Cannot read
// properties of undefined", "fetch failed", DB errors) don't match and are reported.
const CLIENT_ERROR_RE =
  /(unauthor|forbidden|not allowed|method not allowed|permission denied|\brequired\b|missing (required )?param|invalid (endpoint|request|param|parameter|input|body|json|argument|token|signature)|must be (a |an |provided|set)|not found|no .{0,40} found|bad request|malformed)/i;
function isLikelyClientError(message: string | null): boolean {
  return !!message && CLIENT_ERROR_RE.test(message);
}

// Per-worker throttle so a hot-looping failure can't flood Sentry — the DSN
// transport has no sampling. Same (function + status + message head) within the
// window is dropped. In-memory only; resets on cold start, which is fine for a
// best-effort noise cap.
const _recentlySent = new Map<string, number>();
const THROTTLE_MS = 60_000;
function isThrottled(key: string): boolean {
  const now = Date.now();
  const last = _recentlySent.get(key);
  if (last !== undefined && now - last < THROTTLE_MS) return true;
  _recentlySent.set(key, now);
  if (_recentlySent.size > 500) {
    for (const [k, t] of _recentlySent) if (now - t > THROTTLE_MS) _recentlySent.delete(k);
  }
  return false;
}

export function withApiLogging(functionName: string, handler: Handler): Handler {
  return async (req: Request): Promise<Response> => {
    const start = Date.now();

    // Skip logging for CORS preflight — they're noise
    if (req.method === 'OPTIONS') {
      return handler(req);
    }

    // ip_address is NOT NULL on the table — fall back to a sentinel rather than
    // letting the insert fail (which is exactly what used to happen).
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || '0.0.0.0';
    const userAgent = req.headers.get('user-agent') || null;
    const method = req.method;

    // A service-role / internal Bearer call (cron, function-to-function) vs a
    // real external caller. Used for the is_internal_request flag.
    const authHeader = req.headers.get('authorization') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const isInternal = !!serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;

    let response: Response;
    let errorMessage: string | null = null;
    // Set only when the handler THREW (vs. returned its own error response) — a
    // real Error with a stack, which lets Sentry group by stack trace.
    let thrownError: Error | null = null;

    try {
      response = await handler(req);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
      thrownError = err instanceof Error ? err : new Error(errorMessage);
      // Honour an explicit status (HttpError) — a thrown 4xx returns that code and
      // is treated as a client error below. Plain throws default to 500.
      const explicitStatus = getErrorStatus(err);
      response = new Response(
        JSON.stringify({ error: errorMessage }),
        { status: explicitStatus ?? 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const durationMs = Date.now() - start;
    const statusCode = response.status;

    if (statusCode >= 400) {
      // The table has no error column — surface the error to the function log
      // so it's still findable, without blocking the response.
      try {
        const cloned = response.clone();
        const body = await cloned.text();
        const parsed = JSON.parse(body);
        errorMessage = errorMessage || parsed.error || parsed.message || null;
      } catch {
        // Body not JSON or already consumed — skip
      }
      if (errorMessage) {
        console.error(`[api-logger] ${functionName} ${statusCode}: ${errorMessage}`);
      }
    }

    // Sentry gets ONLY real server faults. A failure is reported iff it is 5xx AND
    // the message doesn't read like an expected client error. This keeps validation
    // / auth / method complaints out of Sentry even when a function mislabels them
    // as 500 (a known pattern in scrape-* and email-api). 4xx are never reported.
    if (statusCode >= 500 && !isLikelyClientError(errorMessage)) {
      const dedupeKey = `${functionName}:${statusCode}:${(errorMessage ?? '').slice(0, 80)}`;
      if (!isThrottled(dedupeKey)) {
        if (thrownError) {
          // Real unhandled throw — omit fingerprint so Sentry groups by stack trace
          // (distinct bugs stay distinct instead of collapsing into one issue).
          await captureException(thrownError, {
            tags: { function: functionName, method, status: String(statusCode), error_kind: 'unhandled_exception' },
            extra: { error_message: errorMessage ?? undefined },
          }).catch((e) => console.error('[api-logger] Sentry capture failed:', e));
        } else {
          // Handler caught its own error and returned a 5xx — no stack available, so
          // group by function + status + message head.
          await captureMessage(`${functionName} responded ${statusCode}`, 'error', {
            tags: { function: functionName, method, status: String(statusCode), error_kind: 'error_response' },
            extra: { error_message: errorMessage ?? undefined },
            fingerprint: [functionName, 'error_response', String(statusCode), (errorMessage ?? '').slice(0, 60)],
          }).catch((e) => console.error('[api-logger] Sentry capture failed:', e));
        }
      }
    }

    // Fire-and-forget — never block the response
    logToDb(functionName, method, statusCode, durationMs, ip, userAgent, isInternal).catch(
      (err) => console.error('[api-logger] Failed to log:', err.message),
    );

    return response;
  };
}

async function logToDb(
  requestPath: string,
  requestMethod: string,
  responseStatus: number,
  responseTimeMs: number,
  ipAddress: string,
  userAgent: string | null,
  isInternal: boolean,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) return;

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { error } = await supabase.from('api_usage_logs').insert({
    request_path: requestPath,
    request_method: requestMethod,
    response_status: responseStatus,
    response_time_ms: responseTimeMs,
    ip_address: ipAddress,
    user_agent: userAgent,
    is_internal_request: isInternal,
    created_at: new Date().toISOString(),
  });
  if (error) console.error('[api-logger] insert failed:', error.message);
}
