import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Mail, Lock, FileDown } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent } from '@/components/core/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import { useShowPrices } from '@/hooks/useShowPrices';
import { formatDate } from '@/utils/datetime';

interface PublicMeta {
  title: string;
  subtitle: string | null;
  cover_image_url: string | null;
  branding: { logo_url: string | null; company_name: string | null };
}

/** The PDF template the document is dressed in — resolved server-side from the same
 *  source generate-catalog-pdf reads, so page and download cannot drift apart. */
interface TemplateArt {
  cover_image_url: string | null;
  content_background_url: string | null;
  back_cover_image_url: string | null;
  page_aspect: number | null;
}

interface CatalogPayload {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  template?: TemplateArt | null;
  cover_data: Record<string, any>;
  body_data: { sections: Array<{ id: string; title: string; intro: string | null; materials: Array<any> }> };
  back_cover_data: Record<string, any>;
  pdf_url: string | null;
}

/** One labelled block of key/value spec rows — the same shape the PDF renderer takes. */
interface SpecTable {
  title: string;
  rows: Array<{ label: string; value: string }>;
}

interface VerifyResponse {
  granted_access: boolean;
  email?: string;
  catalog?: CatalogPayload;
  branding?: { logo_url: string | null; company_name: string | null; contact_line: string | null };
  reason?: string;
}

const COOKIE_NAME = 'mk_catalog_token';

function readTokenForSlug(slug: string): string | null {
  if (typeof document === 'undefined') return null;
  const allCookies = document.cookie.split(';').map((c) => c.trim());
  const prefix = `${COOKIE_NAME}_${slug}=`;
  for (const c of allCookies) {
    if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
  }
  return null;
}

function writeTokenForSlug(slug: string, token: string, expiresAt: string) {
  if (typeof document === 'undefined') return;
  const expires = new Date(expiresAt).toUTCString();
  document.cookie = `${COOKIE_NAME}_${slug}=${encodeURIComponent(token)}; Path=/; Expires=${expires}; SameSite=Lax`;
}

export const PublicCatalogPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();

  const [meta, setMeta] = useState<PublicMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [verified, setVerified] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const callAccess = useCallback(async (body: any) => {
    const { data, error } = await supabase.functions.invoke('catalog-access', { body });
    if (error) throw await edgeError(error);
    return data;
  }, []);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingMeta(true);
        const data = await callAccess({ action: 'public_meta', slug });
        if (cancelled) return;
        if (data?.error || !data?.title) {
          setNotFound(true);
          return;
        }
        setMeta(data);

        const existingToken = readTokenForSlug(slug);
        if (existingToken) {
          setVerifying(true);
          const ver = await callAccess({ action: 'verify', slug, token: existingToken });
          if (!cancelled && ver?.granted_access) {
            setVerified(ver);
            // Fire-and-forget page_view track. Atomically increments the
            // catalog's view_count and writes a row to catalog_view_events
            // so the admin operations screen sees the visit.
            callAccess({ action: 'track_view', slug, token: existingToken }).catch(() => {});
          }
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) {
          setLoadingMeta(false);
          setVerifying(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug, callAccess]);

  const handleTrackedDownload = useCallback(async (pdfUrl: string) => {
    const token = slug ? readTokenForSlug(slug) : null;
    if (token && slug) {
      // Best-effort — open the PDF even if logging fails.
      callAccess({ action: 'track_download', slug, token }).catch(() => {});
    }
    window.open(pdfUrl, '_blank');
  }, [slug, callAccess]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !email.trim()) return;
    setSubmitting(true);
    try {
      const data = await callAccess({ action: 'request', slug, email: email.trim() });
      if (!data?.granted_access) {
        toast({
          title: 'Access denied',
          description: 'This email isn’t in the access list. Contact the catalog owner if you believe this is a mistake.',
          variant: 'destructive',
        });
        return;
      }
      if (data.token && data.expires_at) writeTokenForSlug(slug, data.token, data.expires_at);
      const ver = await callAccess({ action: 'verify', slug, token: data.token });
      if (ver?.granted_access) {
        setVerified(ver);
        // First-visit page_view event. The /verify path already issued the
        // cookie; fire the tracker now that we know the user is in.
        callAccess({ action: 'track_view', slug, token: data.token }).catch(() => {});
      }
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to submit', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  }, [slug, email, callAccess, toast]);

  if (loadingMeta || verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-2">
            <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="font-medium">Catalog not found</div>
            <p className="text-sm text-muted-foreground">This link may be invalid or has been archived.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (verified?.granted_access && verified.catalog) {
    return <CatalogReader catalog={verified.catalog} branding={verified.branding} onDownload={handleTrackedDownload} />;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="flex-1 flex items-center justify-center p-6 relative"
        style={meta.cover_image_url ? {
          // The gate stands on the document's own cover — same art the PDF opens with.
          backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${meta.cover_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : { background: 'var(--brand-gradient)' }}
      >
        <Card className="w-full max-w-md">
          <CardContent className="p-8 space-y-6">
            {meta.branding.logo_url && (
              <img src={meta.branding.logo_url} alt={meta.branding.company_name || ''} className="h-10 mx-auto" />
            )}
            <div className="text-center space-y-1">
              <h1 className="text-xl font-semibold">{meta.title}</h1>
              {meta.subtitle && <p className="text-sm text-muted-foreground">{meta.subtitle}</p>}
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" /> Enter your email to view this catalog
              </Label>
              <Input
                id="email"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
              <Button type="submit" className="w-full" disabled={submitting || !email.trim()}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Access is restricted to invited recipients.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

/**
 * Specification tables — the same `body_data.spec_tables` the PDF renders, so the
 * page and the download never disagree. Standard design-system table: plain <table>
 * inside a .dashboard-card, edge-to-edge via -mx-6, overflow-x-auto (NOT hidden —
 * <main> clips horizontally, so a wide table would silently lose columns).
 */
/**
 * Accent rule ABOVE the heading, then the heading — the same block the PDF draws at the
 * top of every section (see drawHeadingWithRule in _shared/pdf/document.ts).
 */
const SectionHeading: React.FC<{ title: string; intro?: string | null }> = ({ title, intro }) => (
  <div className="mb-6">
    <div className="h-[3px] w-8 bg-[hsl(var(--ink))] mb-3" />
    <h2 className="font-display text-2xl font-semibold text-[hsl(var(--ink))]">{title}</h2>
    {intro && <p className="text-sm text-[hsl(var(--ink-muted))] mt-2 max-w-2xl">{intro}</p>}
  </div>
);

/**
 * Specification tables — the same `body_data.spec_tables` the PDF renders, so the page
 * and the download never disagree. Two columns of label/value groups, matching the PDF's
 * specification pages.
 */
const SpecTables: React.FC<{ tables: SpecTable[] }> = ({ tables }) => (
  <section>
    <SectionHeading title="Technical specification" />
    <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 'var(--grid-gap)' }}>
      {tables.map((t) => (
        <div key={t.title}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ink))] pb-1.5 border-b border-[hsl(var(--ink))]">
            {t.title}
          </h3>
          {/* overflow-x-auto, NOT hidden: Layout puts overflow-x-hidden on <main>, so a
              table wider than the viewport would be clipped with no scrollbar. */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <tbody>
                {t.rows.map((r, i) => (
                  <tr key={`${r.label}-${i}`} className={i % 2 === 1 ? 'bg-[hsl(var(--paper-panel))]' : undefined}>
                    <th scope="row" className="text-left py-2 pr-3 font-normal text-[hsl(var(--ink-muted))] align-top w-2/5">
                      {r.label}
                    </th>
                    <td className="py-2 font-semibold text-[hsl(var(--ink))]">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  </section>
);

/** One catalog item, laid out as the PDF lays it out: image left, copy right, hairline below. */
const ItemRow: React.FC<{ material: any; showPrices: boolean }> = ({ material: m, showPrices }) => (
  <div className="flex flex-col sm:flex-row gap-5 py-6 border-b border-[hsl(var(--paper-rule))] last:border-b-0">
    {/* object-contain, not cover: these are product shots, dimension drawings and kit
        layouts — cropping one to a square cuts the measurements off the drawing. */}
    <div className="shrink-0 w-full sm:w-[170px] h-[170px] bg-[hsl(var(--paper-panel))] border border-[hsl(var(--paper-rule))] rounded-md overflow-hidden flex items-center justify-center">
      {m.image_url
        ? <img src={m.image_url} alt={m.name} loading="lazy" className="w-full h-full object-contain" />
        : <span className="text-xs text-[hsl(var(--ink-muted))]">no image</span>}
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="font-display text-lg font-semibold text-[hsl(var(--ink))]">{m.name}</h3>
      {m.description && <p className="text-sm text-[hsl(var(--ink))] mt-1 max-w-3xl">{m.description}</p>}
      {m.specs && Object.keys(m.specs).length > 0 && (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {Object.entries(m.specs).map(([k, v]) => (
            <div key={k} className="text-xs">
              <dt className="inline text-[hsl(var(--ink-muted))]">{k}: </dt>
              <dd className="inline font-semibold text-[hsl(var(--ink))]">{String(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      {showPrices && m.price != null && (
        <div className="text-lg font-semibold text-[hsl(var(--ink))] mt-3">{formatPrice(m.price, m.currency)}</div>
      )}
    </div>
  </div>
);

const CatalogReader: React.FC<{
  catalog: CatalogPayload;
  branding?: { logo_url: string | null; company_name: string | null; contact_line: string | null };
  onDownload: (pdfUrl: string) => void;
}> = ({ catalog, branding, onDownload }) => {
  const { showPrices } = useShowPrices();
  const sections = catalog.body_data?.sections || [];
  const specTables: SpecTable[] = useMemo(() => {
    const raw = (catalog.body_data as any)?.spec_tables;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((t: any) => t && typeof t.title === 'string' && Array.isArray(t.rows))
      .map((t: any) => ({
        title: t.title,
        rows: t.rows.filter((r: any) => r && r.label != null && r.value != null)
          .map((r: any) => ({ label: String(r.label), value: String(r.value) })),
      }))
      .filter((t: SpecTable) => t.rows.length > 0);
  }, [catalog.body_data]);
  const dateStr = useMemo(() => {
    const raw = catalog.cover_data?.date;
    if (!raw) return null;
    try { return formatDate(raw); } catch { return null; }
  }, [catalog.cover_data?.date]);
  const coverImage = catalog.cover_data?.cover_image_url || null;
  const template = catalog.template ?? null;
  const contentBg = template?.content_background_url ?? null;
  const backCover = template?.back_cover_image_url ?? null;
  // Reserve the template's own page proportions for the cover, so it never letterboxes.
  const coverAspect = template?.page_aspect && template.page_aspect > 0 ? template.page_aspect : 16 / 9;

  return (
    <div className="document-surface min-h-screen">
      {/* COVER — the template's own artwork, full bleed and nothing written over it. The
          PDF's drawCover does exactly this: when a cover image exists it is drawn edge to
          edge and the title lives on the first content page, not on the art. */}
      {coverImage && (
        <div className="w-full overflow-hidden" style={{ aspectRatio: String(coverAspect) }}>
          <img src={coverImage} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Everything below the cover sits on the template's inside page. Fixed so the
          spine and footer motif stay put while the content scrolls over them, which is
          how the artwork reads on a page of any length. */}
      <div
        style={contentBg ? {
          backgroundImage: `url(${contentBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
        } : undefined}
      >
        <header className="container mx-auto max-w-5xl px-6 pt-12 pb-8">
          {!coverImage && branding?.logo_url && (
            <img src={branding.logo_url} alt={branding.company_name || ''} className="h-10 mb-6" />
          )}
          <div className="h-[3px] w-8 bg-[hsl(var(--ink))] mb-4" />
          <h1 className="font-display text-3xl md:text-5xl font-semibold text-[hsl(var(--ink))]">{catalog.title}</h1>
          {catalog.subtitle && <p className="text-lg text-[hsl(var(--ink-muted))] mt-2">{catalog.subtitle}</p>}
          {catalog.description && <p className="text-sm text-[hsl(var(--ink-muted))] mt-3 max-w-2xl">{catalog.description}</p>}
          <div className="flex flex-wrap items-center gap-4 pt-6 text-sm text-[hsl(var(--ink-muted))]">
            {dateStr && <span>{dateStr}</span>}
            {catalog.pdf_url && (
              // Explicit ink/paper colours: the shared button variants resolve against the
              // APP theme, and a dark-surface `secondary` on white paper is barely legible.
              <Button
                size="sm"
                variant="outline"
                className="bg-transparent border-[hsl(var(--ink))] text-[hsl(var(--ink))] hover:bg-[hsl(var(--paper-panel))] hover:text-[hsl(var(--ink))]"
                onClick={() => onDownload(catalog.pdf_url!)}
              >
                <FileDown className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            )}
          </div>
        </header>

        <main className="container mx-auto max-w-5xl px-6 pb-16 space-y-14">
          {sections.length === 0 ? (
            <div className="text-center text-[hsl(var(--ink-muted))] py-12">This catalog has no sections yet.</div>
          ) : sections.map((section) => (
            <section key={section.id}>
              <SectionHeading title={section.title} intro={section.intro} />
              <div className="border-t border-[hsl(var(--paper-rule))]">
                {(section.materials || []).map((m: any) => (
                  <ItemRow key={m.id} material={m} showPrices={showPrices} />
                ))}
              </div>
            </section>
          ))}

          {specTables.length > 0 && <SpecTables tables={specTables} />}
        </main>
      </div>

      {/* BACK COVER — the template's closing artwork, with the closing message over it,
          mirroring the PDF's final page. */}
      {backCover ? (
        <footer>
          <div className="relative">
            <div className="w-full overflow-hidden" style={{ aspectRatio: String(coverAspect) }}>
              <img src={backCover} alt="" className="w-full h-full object-cover" />
            </div>
            {catalog.back_cover_data?.closing_message && (
              <div className="absolute inset-0 flex items-center justify-center p-8 bg-black/30">
                <p className="max-w-2xl text-center text-lg text-white">{catalog.back_cover_data.closing_message}</p>
              </div>
            )}
          </div>
          {/* The contact line and copyright are information, not artwork — they keep their
              own strip so they survive whatever the workspace uploads as a back cover. */}
          <div className="py-6 px-6 text-center text-sm text-[hsl(var(--ink-muted))] space-y-1">
            {(catalog.back_cover_data?.contact_line || branding?.contact_line) && (
              <p className="font-medium">{catalog.back_cover_data?.contact_line || branding?.contact_line}</p>
            )}
            {branding?.company_name && <p className="text-xs">© {new Date().getFullYear()} {branding.company_name}</p>}
          </div>
        </footer>
      ) : (
        <footer className="border-t border-[hsl(var(--paper-rule))] py-8 px-6 text-center text-sm text-[hsl(var(--ink-muted))] space-y-1">
          {catalog.back_cover_data?.closing_message && <p>{catalog.back_cover_data.closing_message}</p>}
          {(catalog.back_cover_data?.contact_line || branding?.contact_line) && (
            <p className="font-medium">{catalog.back_cover_data?.contact_line || branding?.contact_line}</p>
          )}
          {branding?.company_name && <p className="text-xs">© {new Date().getFullYear()} {branding.company_name}</p>}
        </footer>
      )}
    </div>
  );
};

function formatPrice(amount: number, currency: string | null): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : (currency ? `${currency} ` : '');
  return `${symbol}${amount.toFixed(2)}`;
}
