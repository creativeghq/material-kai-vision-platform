/**
 * Where a notification's `action_url` actually goes.
 *
 * `user_notifications.action_url` is a plain string written by four runtimes that cannot see the
 * router — edge functions, MIVAA (Python), frontend services, and a plpgsql trigger — and the bell
 * fed it straight to `navigate()`. `navigate()` treats ANY string as a PATH, so an absolute URL
 * becomes the path `/https://app.materialshub.gr/agent-hub`, matches no route, and lands on the
 * catch-all. Every job-research digest shipped that way: the row is well-formed, the URL is
 * correct, the notification is the right notification — and clicking it 404s.
 *
 * Absolute is not always the mistake, which is why this resolves per-URL instead of banning it.
 * The digest's `action_url` is also the CTA of the email that carries the same digest, and the
 * moodboard dormancy warning points at `…/functions/v1/moodboard-keep-active?token=…`, an endpoint
 * that is genuinely not a route in this app.
 *
 *   • app-relative path            → navigate()
 *   • absolute, one of our origins → strip to path + search + hash, navigate()
 *   • absolute, http(s) elsewhere  → open in a new tab
 *   • anything else                → nothing; a click handler never dereferences `javascript:`
 *
 * Producers should still write a path (guarded by tests/unit/deepLinkTargets.test.ts). This is the
 * half that cannot be fixed by a producer: rows written months ago are already in the table.
 */

export type NotificationTarget =
  /** An in-app destination — hand `to` to react-router's `navigate()`. */
  | { kind: 'route'; to: string }
  /** Somewhere else on the web — open it, do not route to it. */
  | { kind: 'external'; href: string }
  /** Nothing to open. The notification is still readable; it just has no destination. */
  | { kind: 'none' };

/**
 * The origins that are THIS app: wherever it is currently served from, plus the configured public
 * URL. Both are needed — MIVAA stamps `PUBLIC_APP_URL` into rows the app then reads from a preview
 * deployment, and a dev server reads rows stamped with the production origin.
 */
export function appOrigins(): string[] {
  const out: string[] = [];
  if (typeof window !== 'undefined' && window.location?.origin) out.push(window.location.origin);
  const configured = import.meta.env?.VITE_PUBLIC_APP_URL;
  if (configured) {
    try { out.push(new URL(configured).origin); } catch { /* misconfigured env — not a reason to throw in a click handler */ }
  }
  return out;
}

export function resolveNotificationTarget(
  raw: string | null | undefined,
  origins: string[] = appOrigins(),
): NotificationTarget {
  const value = (raw ?? '').trim();
  if (!value) return { kind: 'none' };

  // `//host/path` is protocol-relative: an EXTERNAL address wearing the shape of a path. Routing
  // it would make the router read `host` as the first path segment.
  if (value.startsWith('/') && !value.startsWith('//')) return { kind: 'route', to: value };

  let url: URL;
  try {
    url = new URL(value, origins[0] ?? 'https://app.invalid');
  } catch {
    return { kind: 'none' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { kind: 'none' };
  if (origins.includes(url.origin)) return { kind: 'route', to: `${url.pathname}${url.search}${url.hash}` };
  return { kind: 'external', href: url.href };
}
