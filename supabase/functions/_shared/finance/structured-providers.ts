/**
 * Supplier e-invoice providers that serve an EN 16931 file beside their human viewer: the viewer
 * link plus `/EN16931`. Probed 2026-10-30: invoiceportal.gr, impact.gr, s1ecos.gr, eskap.gr,
 * parochos.gr, vs.gr and Epsilon answer; e-invoicing.gr did not, so it is absent. A host joins this
 * table only once its structured URL was seen answer. `host` matches itself and any subdomain.
 * Import-free so the matching can be tested without a client.
 */

export interface StructuredProvider {
  host: string;
  structuredUrl: (downloadUrl: URL) => string;
}

const viewerPlusSuffix = (u: URL) => `${u.origin}${u.pathname.replace(/\/+$/, '')}/EN16931`;

export const STRUCTURED_PROVIDERS: readonly StructuredProvider[] = [
  'invoiceportal.gr', 'impact.gr', 's1ecos.gr', 'eskap.gr', 'parochos.gr', 'vs.gr', 'epsilonnet.gr',
].map((host) => ({ host, structuredUrl: viewerPlusSuffix }));

const hostMatches = (hostname: string, provider: string) => hostname === provider || hostname.endsWith(`.${provider}`);

/** The URL that serves the structured file for a stored download link, or null when none is known. */
export function structuredUrlFor(downloadUrl: string | null | undefined): string | null {
  if (!downloadUrl) return null;
  let u: URL;
  try { u = new URL(downloadUrl); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  return STRUCTURED_PROVIDERS.find((p) => hostMatches(host, p.host))?.structuredUrl(u) ?? null;
}

export interface En16931Header { kind: 'invoice' | 'credit_note'; customizationId: string }

/**
 * Whether a body IS an EN 16931 UBL document, by its root element and customization id. A page
 * that merely mentions the standard, or an HTML error body served with a 200, is not one.
 */
export function readEn16931Header(body: string): En16931Header | null {
  const root = body.match(/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:[\w.-]+:)?(Invoice|CreditNote)\b[^>]*>/);
  if (!root) return null;
  const id = body.match(/<(?:[\w.-]+:)?CustomizationID[^>]*>\s*([^<\s]+)\s*</)?.[1];
  if (!id || !id.startsWith('urn:cen.eu:en16931:2017')) return null;
  return { kind: root[1] === 'Invoice' ? 'invoice' : 'credit_note', customizationId: id };
}
