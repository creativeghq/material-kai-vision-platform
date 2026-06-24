// Unwrap Supabase edge-function invocation errors into the REAL reason.
//
// `supabase.functions.invoke()` converts any non-2xx response into a thrown
// `FunctionsHttpError` whose `.message` is the useless generic string
// "Edge Function returned a non-2xx status code". The actual reason the function
// returned (e.g. "Statement sending is disabled in finance settings.",
// "Link expired", "Stripe is not configured") lives in the JSON response BODY,
// reachable only via `await error.context.json()`.
//
// Use these helpers at every `functions.invoke` call site so users see the real
// reason instead of the generic masked message.

/**
 * Resolve the human-readable message from a `supabase.functions.invoke` error.
 * Reads the response body (`error.context`) and prefers its `error`/`message`
 * field; falls back to the error's own message, then `fallback`.
 *
 * Safe to call with any thrown value. `error.context` is a `Response` whose body
 * can be read once — only call this once per error.
 */
export async function edgeErrorMessage(error: unknown, fallback = 'Request failed'): Promise<string> {
  if (!error) return fallback;
  const anyErr = error as any;
  try {
    const body = await anyErr?.context?.json?.();
    const reason = body?.error ?? body?.message;
    if (reason) return String(reason);
  } catch {
    // body wasn't JSON (HTML 502, empty body, already-consumed) — fall through
  }
  return anyErr?.message ? String(anyErr.message) : fallback;
}

/**
 * Convenience: turn a `functions.invoke` error into a real `Error` carrying the
 * unwrapped body message. Replacement for `if (error) throw error;`:
 *
 *   const { data, error } = await supabase.functions.invoke('fn', { body });
 *   if (error) throw await edgeError(error);
 */
export async function edgeError(error: unknown, fallback = 'Request failed'): Promise<Error> {
  return new Error(await edgeErrorMessage(error, fallback));
}
