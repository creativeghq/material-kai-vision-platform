/** Where the hosted pages live, from the widget's own script tag. */
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

/** A link back to us that carries the embedder's referral code. */
export function referralLink(path: string, referralCode: string | null): string {
  const base = `${appOrigin()}${path}`;
  return referralCode ? `${base}${path.includes('?') ? '&' : '?'}ref=${encodeURIComponent(referralCode)}` : base;
}
