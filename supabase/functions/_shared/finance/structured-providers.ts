/**
 * Supplier e-invoice providers that serve an EN 16931 file beside their human viewer.
 *
 * Measured 2026-10-30 over ~700 stored `download_url`s: only invoiceportal.gr does. The others
 * (impact.gr, s1ecos.gr, e-invoicing.gr, Epsilon Digital) serve an HTML viewer and a PDF, so they
 * are deliberately absent — a host joins this table only once its structured URL was seen answer.
 * Import-free so the matching can be tested without a client.
 */

export interface StructuredProvider {
  host: string;
  structuredUrl: (downloadUrl: URL) => string;
}

export const STRUCTURED_PROVIDERS: readonly StructuredProvider[] = [
  {
    host: 'invoiceportal.gr',
    structuredUrl: (u) => `${u.origin}${u.pathname.replace(/\/+$/, '')}/EN16931`,
  },
];

/** The URL that serves the structured file for a stored download link, or null when none is known. */
export function structuredUrlFor(downloadUrl: string | null | undefined): string | null {
  if (!downloadUrl) return null;
  let u: URL;
  try { u = new URL(downloadUrl); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  return STRUCTURED_PROVIDERS.find((p) => p.host === host)?.structuredUrl(u) ?? null;
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
