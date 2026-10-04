import { assertSafeUrl } from '../ssrf-guard.ts';
import { domainOf, htmlToText, likelyIdentityLinks, pageConfirmsIdentity, type IdentityKeys, type MatchedBy } from './identityCheck.ts';

const MAX_BYTES = 1_500_000;
const PAGE_TIMEOUT_MS = 8000;

/** Redirects are followed by hand so every hop passes the SSRF guard (invariant 7); `until` caps the whole check. */
async function fetchPage(url: string, until: number): Promise<{ html: string; finalUrl: string } | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const left = until - Date.now();
    if (left < 1500) return null;
    try {
      await assertSafeUrl(current, { allowSchemes: ['https:', 'http:'] });
      const res = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(Math.min(PAGE_TIMEOUT_MS, left)),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; MaterialsHubVerifier/1.0)', accept: 'text/html' },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location')!, current).toString();
        await res.body?.cancel();
        continue;
      }
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) { await res.body?.cancel(); return null; }
      const reader = res.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
      await reader.cancel().catch(() => {});
      const buf = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) { buf.set(c, o); o += c.length; }
      return { html: new TextDecoder().decode(buf), finalUrl: current };
    } catch {
      return null;
    }
  }
  return null;
}

export interface SiteCheck { requested: string; domain: string; alive: boolean; by: MatchedBy | null }

/** Loads the site (and up to three contact/company/terms pages) and looks for the company's own identifiers. */
export async function verifyWebsite(candidate: string, keys: IdentityKeys, until: number): Promise<SiteCheck | null> {
  const requested = domainOf(candidate);
  if (!requested) return null;
  const home = await fetchPage(`https://${requested}/`, until)
    ?? await fetchPage(`https://www.${requested}/`, until) ?? await fetchPage(`http://${requested}/`, until);
  if (!home) return { requested, domain: requested, alive: false, by: null };
  const domain = domainOf(home.finalUrl) ?? requested;
  let by = pageConfirmsIdentity(htmlToText(home.html), keys);
  for (const link of by ? [] : likelyIdentityLinks(home.html, home.finalUrl)) {
    const page = await fetchPage(link, until);
    by = page ? pageConfirmsIdentity(htmlToText(page.html), keys) : null;
    if (by) break;
  }
  return { requested, domain, alive: true, by };
}
