/**
 * API Usage Logger — Shared Edge Function Wrapper
 *
 * Wraps any edge function handler to automatically log every request
 * to the `api_usage_logs` table. Captures:
 *   - endpoint (function name)
 *   - HTTP method
 *   - status code
 *   - response time (ms)
 *   - client IP
 *   - user agent
 *   - error message (on 4xx/5xx)
 *
 * Usage:
 *   import { withApiLogging } from '../_shared/api-logger.ts';
 *   serve(withApiLogging('my-function', async (req) => {
 *     // ... your handler ...
 *     return new Response(...);
 *   }));
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Handler = (req: Request) => Promise<Response> | Response;

export function withApiLogging(functionName: string, handler: Handler): Handler {
  return async (req: Request): Promise<Response> => {
    const start = Date.now();

    // Skip logging for CORS preflight — they're noise
    if (req.method === 'OPTIONS') {
      return handler(req);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || null;
    const userAgent = req.headers.get('user-agent') || null;
    const method = req.method;

    // Extract user/key from auth header for tracking
    const authHeader = req.headers.get('authorization') || '';
    const apiKeyHeader = req.headers.get('x-api-key') || req.headers.get('apikey') || '';
    const apiKeyId = apiKeyHeader
      ? apiKeyHeader.slice(0, 12) + '…'
      : authHeader.startsWith('Bearer ')
        ? 'jwt'
        : 'anonymous';

    let response: Response;
    let errorMessage: string | null = null;

    try {
      response = await handler(req);
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
      response = new Response(
        JSON.stringify({ error: errorMessage }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const durationMs = Date.now() - start;
    const statusCode = response.status;

    if (statusCode >= 400) {
      // Try to capture error from response body without consuming it
      try {
        const cloned = response.clone();
        const body = await cloned.text();
        const parsed = JSON.parse(body);
        errorMessage = errorMessage || parsed.error || parsed.message || null;
      } catch {
        // Body not JSON or already consumed — skip
      }
    }

    // Fire-and-forget — never block the response
    logToDb(functionName, method, statusCode, durationMs, ip, userAgent, apiKeyId, errorMessage).catch(
      (err) => console.error('[api-logger] Failed to log:', err.message),
    );

    return response;
  };
}

async function logToDb(
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number,
  ipAddress: string | null,
  userAgent: string | null,
  apiKeyId: string,
  errorMessage: string | null,
): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseKey) return;

  const supabase = createClient(supabaseUrl, supabaseKey);

  await supabase.from('api_usage_logs').insert({
    api_key_id: apiKeyId,
    endpoint,
    method,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    ip_address: ipAddress,
    user_agent: userAgent,
    error_message: errorMessage,
    created_at: new Date().toISOString(),
  });
}
