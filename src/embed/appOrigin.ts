/**
 * Where the hosted pages live, from the widget's own script tag.
 *
 * Derived rather than hardcoded: the bundle is served from the app origin, so whatever loaded it is
 * the right host for the planner, the tools hub and any referral link. A constant would be wrong on
 * staging and in any self-hosted deployment, and wrong in the quiet way — the link renders, it just
 * goes somewhere else.
 *
 * Shared because two widgets now need it. `document.currentScript` is null by the time a custom
 * element's method runs, so the fallback scans for the script by name.
 */
export function appOrigin(): string {
  const src = (document.currentScript as HTMLScriptElement | null)?.src
    ?? Array.from(document.querySelectorAll('script'))
      .map((s) => s.src)
      .find((u) => u.includes('materialkai-product'));
  try {
    if (src) return new URL(src).origin;
  } catch { /* fall through to the page's own origin */ }
  return location.origin;
}

/**
 * A link back to us that carries the embedder's referral code.
 *
 * THE OTHER HALF OF ATTRIBUTION. The lead already belongs to the embedder — the key decides that
 * and nothing in the page can change it. This is the visitor who does not fill in a form today and
 * signs up next month: `?ref=` is stashed by `WorkspaceContext` and redeemed after authentication,
 * which makes them a `client` of the embedder's workspace — their own projects, quotes and
 * moodboards, no back-office. That is the relationship an architect's website visitor should have
 * with the architect, which is why this is worth carrying at all.
 *
 * No code, no parameter: a link that pretends to attribute and does not is worse than a plain one.
 */
export function referralLink(path: string, referralCode: string | null): string {
  const base = `${appOrigin()}${path}`;
  return referralCode ? `${base}${path.includes('?') ? '&' : '?'}ref=${encodeURIComponent(referralCode)}` : base;
}
