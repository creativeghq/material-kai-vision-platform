/** Vercel deployment-protection bypass for the route-load smoke. */

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
