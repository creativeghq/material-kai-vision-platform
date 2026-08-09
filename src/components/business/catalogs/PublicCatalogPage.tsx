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

interface CatalogPayload {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  cover_data: Record<string, any>;
  body_data: { sections: Array<{ id: string; title: string; intro: string | null; materials: Array<any> }> };
  back_cover_data: Record<string, any>;
  pdf_url: string | null;
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
          backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${meta.cover_image_url})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : { background: '#1a1a2e' }}
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

const CatalogReader: React.FC<{
  catalog: CatalogPayload;
  branding?: { logo_url: string | null; company_name: string | null; contact_line: string | null };
  onDownload: (pdfUrl: string) => void;
}> = ({ catalog, branding, onDownload }) => {
  const { showPrices } = useShowPrices();
  const sections = catalog.body_data?.sections || [];
  const dateStr = useMemo(() => {
    const raw = catalog.cover_data?.date;
    if (!raw) return null;
    try { return formatDate(raw); } catch { return null; }
  }, [catalog.cover_data?.date]);
  const coverImage = catalog.cover_data?.cover_image_url || null;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="text-white py-16 px-6 relative"
        style={coverImage ? {
          backgroundImage: `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${coverImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        } : { background: '#1a1a2e' }}
      >
        <div className="container mx-auto max-w-4xl space-y-3">
          {branding?.logo_url && <img src={branding.logo_url} alt={branding.company_name || ''} className="h-10 mb-4" />}
          <h1 className="text-3xl md:text-5xl font-semibold">{catalog.title}</h1>
          {catalog.subtitle && <p className="text-lg opacity-90">{catalog.subtitle}</p>}
          {catalog.description && <p className="text-sm opacity-80 max-w-2xl">{catalog.description}</p>}
          <div className="flex items-center gap-4 pt-4 text-sm opacity-80">
            {dateStr && <span>{dateStr}</span>}
            {catalog.pdf_url && (
              <Button size="sm" variant="secondary" onClick={() => onDownload(catalog.pdf_url!)}>
                <FileDown className="mr-2 h-4 w-4" /> Download PDF
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl py-10 px-6 space-y-12">
        {sections.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">This catalog has no sections yet.</div>
        ) : sections.map((section) => (
          <section key={section.id}>
            <h2 className="text-2xl font-semibold border-l-4 border-primary pl-3 mb-2">{section.title}</h2>
            {section.intro && <p className="text-sm text-muted-foreground mb-6 max-w-2xl">{section.intro}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(section.materials || []).map((m: any) => (
                <Card key={m.id} className="overflow-hidden">
                  <div className="aspect-square bg-muted">
                    {m.image_url ? (
                      <img src={m.image_url} alt={m.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">no image</div>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-1">
                    <div className="font-medium text-sm">{m.name}</div>
                    {m.description && <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>}
                    {m.specs && Object.keys(m.specs).length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {Object.entries(m.specs).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(' • ')}
                      </p>
                    )}
                    {showPrices && m.price != null && (
                      <div className="text-base font-semibold pt-1">
                        {formatPrice(m.price, m.currency)}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </main>

      <footer className="border-t py-8 px-6 text-center text-sm text-muted-foreground space-y-1">
        {catalog.back_cover_data?.closing_message && <p>{catalog.back_cover_data.closing_message}</p>}
        {(catalog.back_cover_data?.contact_line || branding?.contact_line) && (
          <p className="font-medium">{catalog.back_cover_data?.contact_line || branding?.contact_line}</p>
        )}
        {branding?.company_name && <p className="text-xs">© {new Date().getFullYear()} {branding.company_name}</p>}
      </footer>
    </div>
  );
};

function formatPrice(amount: number, currency: string | null): string {
  const symbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency === 'GBP' ? '£' : (currency ? `${currency} ` : '');
  return `${symbol}${amount.toFixed(2)}`;
}
