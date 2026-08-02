/**
 * Vercel deployment-protection bypass for the route-load smoke.
 *
 * WHY THIS EXISTS
 * ---------------
 * The smoke used to run against https://app.materialshub.gr — i.e. against production, AFTER
 * users were already being served the new build. It caught a null-crash on `/` and `/discover`
 * once, but only after ~6 people had hit it. It is now a real gate: `deploy-frontend`
 * uploads with `--skip-domain`, so the candidate is a production build that nothing is aliased
 * to, and `promote` only moves the domain onto it once these tests pass.
 *
 * That candidate is a `*.vercel.app` URL, and this project has Vercel SSO protection enabled for
 * `all_except_custom_domains` — so it answers 302 to an auth wall. The supported way through is
 * the `x-vercel-protection-bypass` header (measured 2026-08-02: 302 without it, 200 with).
 *
 * THE TRAP THIS GUARDS
 * --------------------
 * If the secret were simply absent, every request would land on Vercel's login page — which
 * renders fine, has no error boundary and no console errors, so all 42 route assertions would
 * PASS and the gate would wave through a completely broken build. That is the same shape as the
 * health check that accepted a 302: a check that looks green because it never reached the app.
 * So a protected target with no secret is a hard failure, never a silent skip.
 *
 * WHY THERE IS NO `x-vercel-set-bypass-cookie`
 * --------------------------------------------
 * The obvious companion header asks Vercel to set a bypass COOKIE so a browser session carries
 * the bypass onward. It is the wrong tool here and it broke the first run. Measured
 * against a real candidate:
 *
 *   header only                          -> 200, 0 redirects
 *   header + cookie directive + jar      -> 200, 1 redirect
 *   header + cookie directive, no jar    -> infinite 307 loop (curl exit 47)
 *
 * Playwright applies `extraHTTPHeaders` to EVERY request in the context, so the header already
 * authorises each one and the cookie buys nothing — while the redirect it triggers is one more
 * thing that can go wrong between the test and the page. Simplest path that measures clean.
 */

/** Hosts Vercel puts behind deployment protection. Custom domains are exempt by configuration. */
const isProtectedHost = (rawUrl: string): boolean => {
  const withScheme = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    return /\.vercel\.app$/i.test(new URL(withScheme).hostname);
  } catch {
    return false;
  }
};

export function bypassHeaders(baseURL: string): Record<string, string> {
  if (!isProtectedHost(baseURL)) return {};

  // Trim. A secret piped into `gh secret set` from a Windows shell picks up a trailing CRLF,
  // and a header value ending in CR is not the same credential: measured, the clean
  // value returns 200 while the same value with a trailing CR returns 400 — and in Chromium it
  // simply fails the bypass, so the run lands on Vercel's login page and every route "passes".
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
  if (!secret) {
    throw new Error(
      `[smoke] ${baseURL} is behind Vercel deployment protection but ` +
      'VERCEL_AUTOMATION_BYPASS_SECRET is not set.\n' +
      'Every request would be served the SSO login page, which renders cleanly — so the whole ' +
      'suite would pass without ever loading the app, and a broken build would be promoted.\n' +
      'Set the secret (Vercel → Project → Settings → Deployment Protection → Protection Bypass ' +
      'for Automation) as a repository secret, or point SMOKE_BASE_URL at the custom domain.',
    );
  }

  return { 'x-vercel-protection-bypass': secret };
}
