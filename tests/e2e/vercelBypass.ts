/**
 * Vercel deployment-protection bypass for the route-load smoke.
 *
 * WHY THIS EXISTS
 * ---------------
 * The smoke used to run against https://app.materialshub.gr — i.e. against production, AFTER
 * users were already being served the new build. It caught a null-crash on `/` and `/discover`
 * on 2026-08-01, but only once ~6 people had hit it. It is now a real gate: `deploy-frontend`
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
 * `x-vercel-set-bypass-cookie` matters as much as the header: an SPA fires many subresource and
 * fetch requests, and the cookie carries the bypass through the whole browser session.
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

  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
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

  return {
    'x-vercel-protection-bypass': secret,
    // Sets a bypass cookie on the first response so subresources and fetches inherit it.
    'x-vercel-set-bypass-cookie': 'samesitenone',
  };
}
