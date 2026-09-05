import { test, expect } from '@playwright/test';

/**
 * Route-load smoke. For each top route: navigate, and FAIL if the page white-screens, throws
 * a chunk-load / runtime error, or renders the error boundary. A guard's "Access Restricted"/
 * upsell card is a PASS (the app rendered cleanly) — we're hunting crashes, not access.
 *
 * The smoke account is an operator-admin so the lazy chunks behind CapabilityGuard/
 * EntitlementGuard/AdminGuard actually load (otherwise the guard short-circuits before the
 * page's chunk and a broken page would be missed).
 */
const ROUTES = [
  // Public (no auth)
  '/tools', '/tools/price-scan', '/tools/mention-scan',
  '/tools/project-plan', '/tools/heat-pump', '/tools/heating-cost', // public lead-gen tools (blueprint estimator + heating)
  '/knowledge-base', '/brands',
  // Core authed
  '/', '/profile', '/moodboard', '/agent-hub', '/compare', '/recognition',
  '/blueprints', '/projects', '/portal', '/market-trends', // newer authed surfaces
  '/billing/subscriptions', '/billing/credits',
  // Previously white-screened / capability- & entitlement-gated
  '/finance', '/quotes', '/discover', '/crm', '/sales', '/pos', '/network',
  '/inbox', '/trip-expenses', // newer gated surfaces
  '/supplier-portal', // Supplier portal (self-gates when no claimed identity)
  // Admin (operator-only)
  '/admin', '/admin/operations', '/admin/modules', '/admin/background-agents',
  '/admin/data-health', '/admin/knowledge-base', '/admin/materials-data', // newer / heavy admin pages
  '/admin/flows', '/admin/data-import', '/admin/plans',
  '/admin/monitoring', '/admin/supplier-claims', // Monitoring shell + supplier-claim review
];

// A failed dynamic import / runtime crash — the white-screen signatures.
const FATAL = /failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed|Importing a module script failed|is not a function|is not defined|Cannot read propert|undefined is not an object/i;
// The app's error boundary fallback copy (src/components/core/ErrorBoundary.tsx).
const ERROR_BOUNDARY = /An error occurred while loading this page|A critical error has occurred|Something went wrong|Page Error/i;

/**
 * KAI-QP diagnostic. Sentry's CSP report for `Blocked 'connect' from 'data:'` names bundle line 16
 * as the source — that line is `@sentry/browser`, whose global fetch/XHR wrapper is the JS frame
 * that issues every request, so the report can never say who ASKED. 88% of that issue's events
 * are this very smoke (HeadlessChrome on the runner, a fresh IP per run), so this is also where
 * the answer is cheapest: record the asking stack at call time, installed before any page script,
 * and PRINT it. Never asserted — the policy is report-only and this is a finder, not a gate.
 */
const DATA_REQUEST_PROBE = () => {
  const log: string[] = [];
  (window as Window & { __dataRequests?: string[] }).__dataRequests = log;
  const origFetch = window.fetch;
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (/^data:/i.test(url)) log.push(`fetch ${url.slice(0, 60)}\n${new Error().stack ?? ''}`);
    return origFetch.call(window, input, init);
  }) as typeof window.fetch;
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args: Parameters<XMLHttpRequest['open']>) {
    const url = String(args[1]);
    if (/^data:/i.test(url)) log.push(`xhr ${url.slice(0, 60)}\n${new Error().stack ?? ''}`);
    return origOpen.apply(this, args);
  } as typeof XMLHttpRequest.prototype.open;
};

for (const route of ROUTES) {
  test(`route loads: ${route}`, async ({ page }) => {
    const fatal: string[] = [];
    page.on('pageerror', (e) => { if (FATAL.test(e.message)) fatal.push(`pageerror: ${e.message}`); });
    page.on('console', (m) => { if (m.type() === 'error' && FATAL.test(m.text())) fatal.push(`console: ${m.text()}`); });
    await page.addInitScript(DATA_REQUEST_PROBE);

    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // React must paint meaningful content — a blank body is a white-screen.
    await page
      .waitForFunction(() => (document.body?.innerText || '').trim().length > 20, null, { timeout: 20_000 })
      .catch(() => { throw new Error(`white-screen at ${route}: no content rendered`); });

    const bodyText = (await page.locator('body').innerText()).trim();
    expect(ERROR_BOUNDARY.test(bodyText), `error boundary rendered at ${route}`).toBeFalsy();
    expect(fatal, `fatal runtime/chunk errors at ${route}:\n${fatal.join('\n')}`).toEqual([]);

    const dataRequests = await page.evaluate(
      () => (window as Window & { __dataRequests?: string[] }).__dataRequests ?? [],
    );
    if (dataRequests.length > 0) {
      process.stdout.write(
        `[csp-diagnostic] ${route}: ${dataRequests.length} data: request(s) — KAI-QP initiator(s):\n` +
        `${dataRequests.join('\n---\n')}\n`,
      );
    }
  });
}
