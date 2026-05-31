/**
 * API Usage Logger — Shared Edge Function Wrapper
 *
 * Wraps any edge function handler to automatically log every request to the
 * `api_usage_logs` table. Column mapping (the table is request-shaped, not
 * "endpoint/method/status" shaped — this mismatch silently failed every insert
 * until it was fixed 2026-05-31):
 *   request_path        ← function name
 *   request_method      ← HTTP method
 *   response_status     ← status code
 *   response_time_ms    ← duration
 *   ip_address          ← client IP (NOT NULL — falls back to '0.0.0.0')
 *   user_agent          ← UA header
 *   is_internal_request ← service-role / internal Bearer call
 *
 * The table has no error-message column, so 4xx/5xx detail is logged to the
 * function console only; failures are still visible via response_status.
 *
 * Usage:
 *   import { withApiLogging } from '../_shared/api-logger.ts';
 *   serve(withApiLogging('my-function', async (req) => {
 *     // ... your handler ...
 *     return new Response(...);
 *   }));
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from './cors.ts';

type Handler = (req: Request) => Promise<Response> | Response;

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

    try {
      response = await handler(req);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
      response = new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
