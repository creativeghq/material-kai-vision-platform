/** The JSON response every browser-facing edge function returns. */
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
