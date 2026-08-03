/**
 * The JSON response every browser-facing edge function returns.
 *
 * This was written out 70 times, under two names (`jsonResponse` and `json`), always with the same
 * body: stringify, set the status, spread the shared `corsHeaders`, set the content type. The
 * duplication was harmless in itself — but it meant there was no single place to change how the
 * platform answers, so anything cross-cutting (a security header, a trace id) would have had to be
 * applied seventy times and would have been applied to sixty-eight.
 *
 * Deliberately NOT used by cron and webhook endpoints that omit `corsHeaders` on purpose:
 * `monitoring-cron`, `viva-webhooks`, and the two seo-api toolkit handlers. Nothing in a browser
 * calls those, and advertising CORS from them would be a behaviour change smuggled into a cleanup.
 * They keep their local helper; the difference is the point.
 */
import { corsHeaders } from './cors.ts';

/**
 * `body` is generic so each caller keeps its own response type — several functions typed this as
 * their own `XResponse` interface, and collapsing them all to `unknown` would have thrown away
 * type information the compiler was using.
 */
export function jsonResponse<T>(body: T, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
