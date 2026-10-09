/** One session id and one analytics beacon for every embed component (#447). */

/** `crypto.randomUUID` exists only on https pages; a merchant's plain-http page still gets an id. */
function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function sessionId(): string {
  const KEY = 'materialkai:embed-session';
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = uuid();
    sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked: a per-widget id is still a valid session id; it just does not group.
    return uuid();
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
