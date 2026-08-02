/**
 * The deployment-protection bypass used by the route-load smoke.
 *
 * This is guarding a gate, so the thing worth testing is the failure mode rather than the happy
 * path. `fe-smoke` now runs against an unaliased `*.vercel.app` production candidate and decides
 * whether `promote` releases it. That candidate sits behind Vercel SSO, so without the bypass
 * header every request is served the login page — which renders cleanly, has no error boundary
 * and logs no console errors. All 42 route assertions would PASS and a broken build would be
 * promoted.
 *
 * So "no secret" must be a hard failure and never a quiet empty header set.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { bypassHeaders } from '../e2e/vercelBypass';

const VAR = 'VERCEL_AUTOMATION_BYPASS_SECRET';
const original = process.env[VAR];

afterEach(() => {
  if (original === undefined) delete process.env[VAR];
  else process.env[VAR] = original;
});

describe('vercel protection bypass', () => {
  it('sends nothing for the custom domain — it is exempt from SSO', () => {
    delete process.env[VAR];
    expect(bypassHeaders('https://app.materialshub.gr')).toEqual({});
  });

  it('THROWS on a protected candidate when the secret is missing', () => {
    delete process.env[VAR];
    expect(() => bypassHeaders('https://material-kai-abc123-basilakis-projects.vercel.app'))
      .toThrow(/VERCEL_AUTOMATION_BYPASS_SECRET is not set/);
  });

  it('never degrades to an empty header set on a protected candidate', () => {
    // The specific regression this guards: returning {} instead of throwing would let the suite
    // smoke Vercel's login page and report every route healthy.
    delete process.env[VAR];
    let returned: unknown = 'did-not-throw';
    try { returned = bypassHeaders('https://x.vercel.app'); } catch { returned = 'threw'; }
    expect(returned).toBe('threw');
  });

  it('sends the bypass header when the secret is present', () => {
    process.env[VAR] = 'a'.repeat(32);
    expect(bypassHeaders('https://x.vercel.app')['x-vercel-protection-bypass']).toBe('a'.repeat(32));
  });

  it('trims surrounding whitespace off the secret', () => {
    // A secret piped into `gh secret set` from a Windows shell arrives with a trailing CRLF.
    // A header value ending in CR is a different credential — the bypass fails and the browser
    // lands on Vercel's login page, where every route assertion passes against the wrong site.
    process.env[VAR] = `  ${'c'.repeat(32)}\r\n`;
    expect(bypassHeaders('https://x.vercel.app')['x-vercel-protection-bypass']).toBe('c'.repeat(32));
  });

  it('treats a whitespace-only secret as missing rather than sending it', () => {
    process.env[VAR] = '   \r\n';
    expect(() => bypassHeaders('https://x.vercel.app')).toThrow(/is not set/);
  });

  it('does NOT ask Vercel to set a bypass cookie', () => {
    // This is a regression pin, not a style preference. Sending `x-vercel-set-bypass-cookie`
    // makes Vercel answer 307 + Set-Cookie; measured against a real candidate the header alone
    // is 200 with 0 redirects, while the cookie directive is 200 after a redirect at best and
    // an infinite 307 loop when cookies are not retained. Playwright applies extraHTTPHeaders to
    // every request anyway, so the cookie adds a redirect and buys nothing.
    process.env[VAR] = 'a'.repeat(32);
    expect(bypassHeaders('https://x.vercel.app')).not.toHaveProperty('x-vercel-set-bypass-cookie');
  });

  it('tolerates a scheme-less URL, as `vercel deploy` output can be', () => {
    process.env[VAR] = 'b'.repeat(32);
    expect(bypassHeaders('x.vercel.app')['x-vercel-protection-bypass']).toBe('b'.repeat(32));
  });
});
