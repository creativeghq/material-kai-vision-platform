/**
 * Public Tools Page (/tools)
 *
 * Lead-gen surface. Anonymous visitors get 2 scans/day (combined across price
 * + mention). Identical queries within 24h return from cache without burning
 * quota or upstream credits. Every scan requires a fresh Cloudflare Turnstile
 * token.
 *
 * Route is registered OUTSIDE <AuthGuard> in App.tsx — no login required.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  LogIn,
  MessageSquareText,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import {
  PublicToolsApiError,
  fetchQuota,
  mentionScan,
  priceScan,
  type PublicMentionScanResponse,
  type PublicPriceScanResponse,
  type PublicQuota,
} from '@/services/publicToolsService';

type ScanTab = 'price' | 'mention';

export default function PublicToolsPage() {
  const [tab, setTab] = useState<ScanTab>('price');
  const [quota, setQuota] = useState<PublicQuota | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  const [productName, setProductName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [priceCountry, setPriceCountry] = useState('');

  const [subjectLabel, setSubjectLabel] = useState('');
  const [mentionCountry, setMentionCountry] = useState('');

  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [priceResult, setPriceResult] = useState<PublicPriceScanResponse | null>(null);
  const [mentionResult, setMentionResult] = useState<PublicMentionScanResponse | null>(null);

  useEffect(() => {
    fetchQuota()
      .then(setQuota)
      .catch((e: unknown) => setQuotaError(e instanceof Error ? e.message : 'Failed to load quota'));
  }, []);

  const limitReached = quota?.remaining === 0;
  const turnstileSiteKey = quota?.turnstile_site_key ?? null;

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
    setTurnstileError(null);
  }, []);

  const handleTurnstileExpired = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  const handleTurnstileError = useCallback((code: string) => {
    setTurnstileError(code);
    setTurnstileToken(null);
  }, []);

  const resetCaptcha = () => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  };

  const onScan = async () => {
    if (!turnstileToken) {
      setScanError('Please complete the captcha first.');
      return;
    }
    setScanning(true);
    setScanError(null);
    try {
      if (tab === 'price') {
        if (productName.trim().length < 2) {
          setScanError('Product name must be at least 2 characters.');
          return;
        }
        const res = await priceScan({
          turnstileToken,
          productName: productName.trim(),
          manufacturer: manufacturer.trim() || undefined,
          dimensions: dimensions.trim() || undefined,
          countryCode: priceCountry.trim().toUpperCase() || undefined,
        });
        setPriceResult(res);
        setQuota(res.quota);
      } else {
        if (subjectLabel.trim().length < 2) {
          setScanError('Subject must be at least 2 characters.');
          return;
        }
        const res = await mentionScan({
          turnstileToken,
          subjectLabel: subjectLabel.trim(),
          countryCode: mentionCountry.trim().toUpperCase() || undefined,
        });
        setMentionResult(res);
        setQuota(res.quota);
      }
    } catch (e: unknown) {
      if (e instanceof PublicToolsApiError) {
        if (e.detail.kind === 'quota_exceeded') {
          setQuota(e.detail.quota);
          setScanError(null);
        } else {
          setScanError(e.detail.message);
        }
      } else {
        setScanError(e instanceof Error ? e.message : 'Scan failed');
      }
    } finally {
      setScanning(false);
      resetCaptcha();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>MaterialsHub</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {quota && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {quota.remaining} / {quota.limit} free scans left today
              </Badge>
            )}
            <Link to="/auth">
              <Button variant="ghost" size="sm" className="gap-2">
                <LogIn className="h-4 w-4" />
                <span>Sign in</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-4xl px-4 py-10">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-semibold tracking-tight mb-3">
            Free product intelligence
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Type any product or brand. See live retailer prices, recent press mentions, and
            outlet coverage — pulled from across the web in seconds.
          </p>
        </div>

        {quotaError && (
          <Card className="mb-6 border-destructive/40">
            <CardContent className="py-4 flex items-center gap-3 text-sm">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <span>Could not load quota: {quotaError}</span>
            </CardContent>
          </Card>
        )}

        {limitReached ? (
          <UpsellCard quota={quota!} />
        ) : (
          <Card className="dashboard-card">
            <CardHeader>
              <Tabs value={tab} onValueChange={(v) => setTab(v as ScanTab)}>
                <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
                  <TabsTrigger
                    value="price"
                    className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    <span>Price scan</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="mention"
                    className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    <MessageSquareText className="h-4 w-4" />
                    <span>Mention scan</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="price" className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Label htmlFor="product-name">Product name</Label>
                      <Input
                        id="product-name"
                        placeholder="e.g. Hansgrohe Talis E single-lever basin mixer"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        maxLength={200}
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor="manufacturer">Manufacturer (optional)</Label>
                      <Input
                        id="manufacturer"
                        placeholder="e.g. Hansgrohe"
                        value={manufacturer}
                        onChange={(e) => setManufacturer(e.target.value)}
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dimensions">Dimensions (optional)</Label>
                      <Input
                        id="dimensions"
                        placeholder='e.g. 60x60 cm'
                        value={dimensions}
                        onChange={(e) => setDimensions(e.target.value)}
                        maxLength={80}
                      />
                    </div>
                    <div className="sm:col-span-2 sm:w-1/2">
                      <Label htmlFor="price-country">Country (ISO 2-letter, optional)</Label>
                      <Input
                        id="price-country"
                        placeholder="GR, DE, IT…"
                        value={priceCountry}
                        onChange={(e) => setPriceCountry(e.target.value)}
                        maxLength={2}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="mention" className="pt-6 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Label htmlFor="subject-label">Brand or product to monitor</Label>
                      <Input
                        id="subject-label"
                        placeholder="e.g. Kohler, Roca, Geberit AquaClean Mera"
                        value={subjectLabel}
                        onChange={(e) => setSubjectLabel(e.target.value)}
                        maxLength={200}
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor="mention-country">Country (ISO 2-letter, optional)</Label>
                      <Input
                        id="mention-country"
                        placeholder="GR, DE, US…"
                        value={mentionCountry}
                        onChange={(e) => setMentionCountry(e.target.value)}
                        maxLength={2}
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardHeader>

            <CardContent className="space-y-4">
              {turnstileSiteKey ? (
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                  <div>
                    <Label className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Shield className="h-3.5 w-3.5" />
                      <span>Bot check — required before each scan</span>
                    </Label>
                    <TurnstileWidget
                      ref={turnstileRef}
                      siteKey={turnstileSiteKey}
                      action={tab === 'price' ? 'price_scan' : 'mention_scan'}
                      onVerify={handleTurnstileVerify}
                      onExpired={handleTurnstileExpired}
                      onError={handleTurnstileError}
                    />
                    {turnstileError && (
                      <p className="text-xs text-destructive mt-1">Captcha error: {turnstileError}</p>
                    )}
                  </div>
                  <Button
                    onClick={onScan}
                    disabled={scanning || !turnstileToken}
                    className="gap-2 min-w-[160px]"
                    size="lg"
                  >
                    {scanning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Scanning…</span>
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        <span>Run scan</span>
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading bot check…</span>
                </div>
              )}

              {scanError && (
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{scanError}</span>
                </div>
              )}

              {quota && quota.remaining > 0 && (
                <p className="text-xs text-muted-foreground">
                  {quota.remaining} of {quota.limit} free scans remaining today.
                  {' '}Identical queries within 24 hours are served instantly and don't count.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {tab === 'price' && priceResult && <PriceResultsCard data={priceResult} />}
        {tab === 'mention' && mentionResult && <MentionResultsCard data={mentionResult} />}
      </main>
    </div>
  );
}

function PriceResultsCard({ data }: { data: PublicPriceScanResponse }) {
  if (!data.success) {
    return (
      <Card className="mt-6 border-destructive/40">
        <CardContent className="py-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{data.error || 'Scan failed.'}</span>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="mt-6 dashboard-card">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">
            {data.stats.count} retailer{data.stats.count === 1 ? '' : 's'} found
          </CardTitle>
          {data.from_cache && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Instant (cached)
            </Badge>
          )}
        </div>
        {data.stats.count > 0 && (
          <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide">Lowest</div>
              <div className="text-lg font-semibold">
                {formatPrice(data.stats.min, data.stats.currency)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide">Median</div>
              <div className="text-lg font-semibold">
                {formatPrice(data.stats.median, data.stats.currency)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground text-xs uppercase tracking-wide">Highest</div>
              <div className="text-lg font-semibold">
                {formatPrice(data.stats.max, data.stats.currency)}
              </div>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {data.results.map((r, i) => (
            <a
              key={`${r.product_url}-${i}`}
              href={r.product_url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium truncate">{r.retailer_name}</span>
                  {r.verified && (
                    <Badge variant="outline" className="text-[10px] h-4 gap-1">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      verified
                    </Badge>
                  )}
                </div>
                {r.product_title && (
                  <div className="text-xs text-muted-foreground truncate">{r.product_title}</div>
                )}
              </div>
              <div className="text-right shrink-0 ml-4">
                <div className="font-semibold">{formatPrice(r.price, r.currency)}</div>
                {r.original_price && r.original_price !== r.price && (
                  <div className="text-xs text-muted-foreground line-through">
                    {formatPrice(r.original_price, r.currency)}
                  </div>
                )}
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground ml-3 shrink-0" />
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MentionResultsCard({ data }: { data: PublicMentionScanResponse }) {
  if (!data.success) {
    return (
      <Card className="mt-6 border-destructive/40">
        <CardContent className="py-4 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span>{data.error || 'Scan failed.'}</span>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="mt-6 dashboard-card">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-lg">
            {data.total_results} mention{data.total_results === 1 ? '' : 's'} in the last 30 days
          </CardTitle>
          {data.from_cache && (
            <Badge variant="secondary" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              Instant (cached)
            </Badge>
          )}
        </div>
        {data.top_outlets.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="text-xs text-muted-foreground self-center">Top outlets:</span>
            {data.top_outlets.map((o) => (
              <Badge key={o.domain} variant="outline" className="gap-1">
                <Globe className="h-3 w-3" />
                {o.domain} <span className="text-muted-foreground">·{o.count}</span>
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {data.results.map((m, i) => (
            <a
              key={`${m.url}-${i}`}
              href={m.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate mb-1">{m.title || m.url}</div>
                  {m.excerpt && (
                    <div className="text-sm text-muted-foreground line-clamp-2">{m.excerpt}</div>
                  )}
                  <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2 flex-wrap">
                    {m.outlet_domain && <span>{m.outlet_domain}</span>}
                    {m.published_at && <span>· {formatDate(m.published_at)}</span>}
                    {m.source && <Badge variant="outline" className="text-[10px] h-4">{m.source}</Badge>}
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function UpsellCard({ quota }: { quota: PublicQuota }) {
  const resetMs = useMemo(() => {
    try {
      return new Date(quota.reset_at).getTime() - Date.now();
    } catch {
      return 24 * 3600 * 1000;
    }
  }, [quota.reset_at]);

  const hours = Math.max(1, Math.round(resetMs / 3_600_000));

  return (
    <Card className="dashboard-card border-primary/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2.5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-xl">You've used your {quota.limit} free scans today</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              The free tier resets in about {hours} hour{hours === 1 ? '' : 's'}.
              Want to keep scanning right now?
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border/40 p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <LogIn className="h-4 w-4 text-primary" />
              <span>Sign up — free</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>· Higher daily quota</li>
              <li>· Save scans and track them over time</li>
              <li>· Get alerts when prices drop or new mentions appear</li>
            </ul>
            <Link to="/auth?mode=signup" className="block">
              <Button className="w-full gap-2">
                Create free account
              </Button>
            </Link>
          </div>
          <div className="rounded-lg border border-border/40 p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Buy credits — pay as you go</span>
            </div>
            <ul className="text-sm text-muted-foreground space-y-1.5">
              <li>· No commitment, no subscription</li>
              <li>· Scan as many products / brands as you need</li>
              <li>· Credits never expire</li>
            </ul>
            <Link to="/auth?mode=signup&redirect=/billing" className="block">
              <Button variant="outline" className="w-full gap-2">
                See credit packs
              </Button>
            </Link>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Already have an account?{' '}
          <Link to="/auth" className="text-primary hover:underline">Sign in</Link>{' '}
          to use your existing balance.
        </p>
      </CardContent>
    </Card>
  );
}

function formatPrice(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return '—';
  const cur = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${cur}`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
