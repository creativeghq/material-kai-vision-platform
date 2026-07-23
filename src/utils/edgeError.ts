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
export interface ParsedEdgeError {
  /** Human-readable reason (body `error`/`message` → error.message → fallback). */
  message: string;
  /** Machine code the function returned in the body, e.g. `not_entitled`, `insufficient_credits`. */
  code?: string;
  /** Module slug the refusal is about — the backend sets this on `not_entitled` (entitlement.ts). */
  module?: string;
  /** HTTP status of the non-2xx response (402 for both entitlement AND credit refusals). */
  status?: number;
}

/**
 * Read a `functions.invoke` error's response body ONCE and return its structured fields.
 * The body (`error.context`, a Response) can only be read a single time — call this once per
 * error and reuse the result; don't also call `edgeErrorMessage` on the same error object.
 */
export async function parseEdgeError(error: unknown, fallback = 'Request failed'): Promise<ParsedEdgeError> {
  const anyErr = error as any;
  const status = typeof anyErr?.context?.status === 'number' ? anyErr.context.status : undefined;
  let code: string | undefined;
  let module: string | undefined;
  let message: string | undefined;
  try {
    const body = await anyErr?.context?.json?.();
    if (body) {
      code = body.code;
      module = body.module;
      message = body.error ?? body.message;
    }
  } catch {
    // body wasn't JSON (HTML 502, empty body, already-consumed) — fall through
  }
  return {
    message: message ? String(message) : (anyErr?.message ? String(anyErr.message) : fallback),
    code, module, status,
  };
}

/**
 * True when the refusal is a per-workspace ENTITLEMENT block (the canonical `not_entitled` shape
 * from `_shared/entitlement.ts → notEntitledResponse`), NOT a credit/quota 402. Route these to the
 * module upsell (the `module` field names which module to sell). Keyed on `code`, not bare 402,
 * because seo/inbox/credit paths also 402 with `insufficient_credits`.
 */
export function isNotEntitledError(parsed: ParsedEdgeError): boolean {
  return parsed.code === 'not_entitled';
}

export async function edgeErrorMessage(error: unknown, fallback = 'Request failed'): Promise<string> {
  if (!error) return fallback;
  return (await parseEdgeError(error, fallback)).message;
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
