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
  '/tools', '/tools/price-scan', '/tools/mention-scan', '/knowledge-base',
  // Core authed
  '/', '/profile', '/moodboard', '/agent-hub', '/compare', '/recognition',
  // Previously white-screened / capability- & entitlement-gated
  '/finance', '/quotes', '/discover', '/crm', '/sales', '/pos', '/network',
  // Admin (operator-only)
  '/admin', '/admin/operations', '/admin/modules', '/admin/background-agents',
];

// A failed dynamic import / runtime crash — the white-screen signatures.
const FATAL = /failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError|Loading chunk \d+ failed|Importing a module script failed|is not a function|is not defined|Cannot read propert|undefined is not an object/i;
// The app's error boundary fallback copy (src/components/core/ErrorBoundary.tsx).
const ERROR_BOUNDARY = /An error occurred while loading this page|A critical error has occurred|Something went wrong|Page Error/i;

for (const route of ROUTES) {
  test(`route loads: ${route}`, async ({ page }) => {
    const fatal: string[] = [];
    page.on('pageerror', (e) => { if (FATAL.test(e.message)) fatal.push(`pageerror: ${e.message}`); });
    page.on('console', (m) => { if (m.type() === 'error' && FATAL.test(m.text())) fatal.push(`console: ${m.text()}`); });

    await page.goto(route, { waitUntil: 'domcontentloaded' });

    // React must paint meaningful content — a blank body is a white-screen.
    await page
      .waitForFunction(() => (document.body?.innerText || '').trim().length > 20, null, { timeout: 20_000 })
      .catch(() => { throw new Error(`white-screen at ${route}: no content rendered`); });

    const bodyText = (await page.locator('body').innerText()).trim();
    expect(ERROR_BOUNDARY.test(bodyText), `error boundary rendered at ${route}`).toBeFalsy();
    expect(fatal, `fatal runtime/chunk errors at ${route}:\n${fatal.join('\n')}`).toEqual([]);
  });
}
