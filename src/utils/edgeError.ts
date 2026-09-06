// Unwrap Supabase edge-function invocation errors into the REAL reason.
// `supabase.functions.invoke()` converts any non-2xx response into a thrown
// `FunctionsHttpError` whose `.message` is the useless generic string
// "Edge Function returned a non-2xx status code". The actual reason the function
// returned (e.g. "Statement sending is disabled in finance settings.",
// "Link expired", "Stripe is not configured") lives in the JSON response BODY,
// reachable only via `await error.context.json()`.
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
      // Across the edge functions `error` is the MACHINE code (`gemi_not_found`,
      // `insufficient_credits`, `kiosk_disabled`) and `message` is the human sentence. Preferring
      // `error` printed the slug at the operator and threw the sentence away — "ΓΕΜΗ failed:
      // gemi_not_found" instead of "No ΓΕΜΗ record for this ΑΦΜ." A few functions instead put
      // prose straight in `error` and carry no slug, so only step over `error` when it is
      // slug-SHAPED; that keeps both conventions readable.
      const slug = typeof body.error === 'string' && /^[a-z][a-z0-9_]*$/.test(body.error) ? body.error : undefined;
      code = body.code ?? slug;
      module = body.module;
      message = slug ? (body.message ?? slug) : (body.error ?? body.message);
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

/**
 * True when the refusal is "you are out of credits" — the twin of `isNotEntitledError`, and the
 * cue to open the top-up flow instead of printing a failure.
 *
 * Running out of credits is not an error the user made; it is the moment to sell them more. Every
 * surface was hand-rolling its own test for it and getting a different answer: AgentHub matched
 * `/insufficient credits/i` — with a SPACE — against a body that says `insufficient_credits` with
 * an UNDERSCORE, so its top-up card, which has existed all along, could never once have rendered.
 * The user got the raw JSON of the 402 instead. One test, in the same file as the entitlement one.
 */
export function isInsufficientCreditsError(parsed: ParsedEdgeError): boolean {
  return parsed.code === 'insufficient_credits';
}

/**
 * The same question for a refusal that reached us as TEXT rather than as a `functions.invoke`
 * error — a streamed agent turn, a raw `fetch`, an `Error` re-thrown by a service. Matches the
 * machine code in either spelling and the English sentence, because all three are in the wild:
 * `insufficient_credits` (agent-chat, seo-api), `Insufficient credits` (generate-* functions),
 * and `Not enough credits to run this audit.` (toolkit-audit).
 */
export function looksInsufficientCredits(text: unknown): boolean {
  if (!text) return false;
  const s = text instanceof Error ? text.message : String(text);
  return /insufficient[_\s]credits|not enough credits/i.test(s);
}

/** The balance the refusal reported, when it carried one — for "you have X, this needs Y". */
export function balanceFromCreditsError(text: unknown): number | null {
  if (!text) return null;
  const s = text instanceof Error ? text.message : String(text);
  const m = s.match(/"current_balance"\s*:\s*(-?[\d.]+)/);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) ? n : null;
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
