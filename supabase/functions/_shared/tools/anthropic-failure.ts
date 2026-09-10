/** What to tell the agent when an Anthropic call comes back not-ok. */

/** Anthropic's error envelope: `{ type: 'error', error: { type, message } }`. */
function upstreamMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.trim()) {
      const kind = typeof parsed?.error?.type === 'string' ? `${parsed.error.type}: ` : '';
      return `${kind}${msg.trim()}`;
    }
  } catch {
    // Not JSON — fall through to the raw text, which is still better than nothing.
  }
  const trimmed = (body ?? '').trim();
  return trimmed ? trimmed : null;
}

/**
 * The `error` string for a non-ok response.
 *
 * @param status    HTTP status from the provider.
 * @param body      Raw response body — already consumed by the caller via `response.text()`.
 * @param what      What was being attempted, e.g. `'Web search'`.
 * @param retryable Whether the caller classed this as transient.
 */
export function describeAnthropicFailure(
  status: number,
  body: string,
  what: string,
  retryable: boolean,
): string {
  if (retryable) {
    return `The ${what.toLowerCase()} provider is overloaded (${status}) and did not recover after `
      + 'retries. This is upstream and temporary — it is NOT a problem with the query, the account '
      + 'or the request. Say so plainly and offer to retry in a minute or to run a narrower scope now.';
  }
  const detail = upstreamMessage(body);
  // 400/401/403/404/422 will repeat identically until the REQUEST changes, so the reason is the
  // only useful part. Truncated because this reaches a model's context and a provider can return
  // a very long body.
  return detail
    ? `${what} failed (${status}): ${detail.slice(0, 400)}`
    : `${what} failed (${status}) and the provider returned no detail.`;
}
