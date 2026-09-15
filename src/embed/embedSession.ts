/** One session id and one analytics beacon for every embed component (#447). */

export function sessionId(): string {
  const KEY = 'materialkai:embed-session';
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked (private mode, third-party cookie rules). A per-widget id is still a valid
    // session id; it just does not group.
    return crypto.randomUUID();
  }
}

/**
 * Report one widget event. Never throws and never blocks the page: a visitor's site must not
 * break because our telemetry would not write.
 */
export function trackEmbedEvent(input: {
  apiBase: string;
  apiKey: string | null;
  productId: string | null;
  eventType: string;
}): void {
  if (!input.apiKey || !input.productId) return;
  const url = `${input.apiBase}/functions/v1/products-3d-api`
    + `?action=event&event_type=${encodeURIComponent(input.eventType)}`
    + `&product_id=${encodeURIComponent(input.productId)}&key=${encodeURIComponent(input.apiKey)}`
    + `&session_id=${encodeURIComponent(sessionId())}`
    + `&source_page=${encodeURIComponent(location.href.slice(0, 500))}`;
  // keepalive so an event that navigates away still reports.
  fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
}
