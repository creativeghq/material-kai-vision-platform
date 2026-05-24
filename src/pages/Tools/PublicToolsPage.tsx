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
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Coins,
  ExternalLink,
  Globe,
  Loader2,
  LogIn,
  LogOut,
  MessageSquareText,
  Newspaper,
  PackageCheck,
  PackageX,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingDown,
  User as UserIcon,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import {
  PublicToolsApiError,
  fetchQuota,
  mentionScan,
  priceScan,
  type PublicMentionScanResponse,
  type PublicPriceResult,
  type PublicMentionResult,
  type PublicPriceScanResponse,
  type PublicQuota,
} from '@/services/publicToolsService';

type ScanTab = 'price' | 'mention';

export default function PublicToolsPage() {
  const { user, session, signOut } = useAuth();
  const accessToken = session?.access_token ?? null;
  const isAuthenticated = !!user;

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
    fetchQuota(accessToken)
      .then(setQuota)
      .catch((e: unknown) => setQuotaError(e instanceof Error ? e.message : 'Failed to load quota'));
  }, [accessToken]);

  const turnstileSiteKey = quota?.turnstile_site_key ?? null;
  const creditsPerScan = quota?.credits_per_scan ?? 5;
  const balance = quota?.credits_balance ?? null;
  // Block scanning when: anon hit 2/day cap, OR authed but balance < cost.
  const limitReached = isAuthenticated
    ? balance != null && balance < creditsPerScan
    : quota?.remaining === 0;

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
    if (tab === 'price') setPriceResult(null);
    else setMentionResult(null);
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
          accessToken,
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
          accessToken,
        });
        setMentionResult(res);
        setQuota(res.quota);
      }
    } catch (e: unknown) {
      if (e instanceof PublicToolsApiError) {
        if (e.detail.kind === 'quota_exceeded' || e.detail.kind === 'insufficient_credits') {
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
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            {quota && !isAuthenticated && (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {quota.remaining} / {quota.limit} free scans left today
              </Badge>
            )}
            {quota && isAuthenticated && balance != null && (
              <Badge variant="outline" className="hidden sm:inline-flex gap-1.5">
                <Coins className="h-3.5 w-3.5 text-primary" />
                <span className="tabular-nums">{balance.toLocaleString()}</span>
                <span className="text-muted-foreground">credits</span>
              </Badge>
            )}
            {isAuthenticated ? (
              <>
                <Link to="/">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Back to platform</span>
                  </Button>
                </Link>
                <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UserIcon className="h-3.5 w-3.5" />
                  {user?.email}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => signOut()}
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Link to="/auth?redirect=/tools">
                <Button variant="ghost" size="sm" className="gap-2">
                  <LogIn className="h-4 w-4" />
                  <span>Sign in</span>
                </Button>
              </Link>
            )}
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
          <UpsellCard quota={quota!} isAuthenticated={isAuthenticated} />
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

              {quota && !isAuthenticated && quota.remaining > 0 && (
                <p className="text-xs text-muted-foreground">
                  {quota.remaining} of {quota.limit} free scans remaining today.
                  {' '}Identical queries within 24 hours are served instantly and don't count.
                </p>
              )}
              {quota && isAuthenticated && balance != null && (
                <p className="text-xs text-muted-foreground">
                  {balance.toLocaleString()} credits available · each scan costs {creditsPerScan} credits.
                  {' '}Identical queries within 24 hours are served instantly and don't debit.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {scanning && <ScanningPanel kind={tab} />}
        {!scanning && tab === 'price' && priceResult && <PriceResultsCard data={priceResult} />}
        {!scanning && tab === 'mention' && mentionResult && <MentionResultsCard data={mentionResult} />}
      </main>
    </div>
  );
}

function ScanningPanel({ kind }: { kind: ScanTab }) {
  const isPrice = kind === 'price';
  const steps = isPrice
    ? [
        { label: 'Searching retailers across the web', icon: Globe },
        { label: 'Reading product pages to verify prices', icon: PackageCheck },
        { label: 'Ranking by price and availability', icon: TrendingDown },
      ]
    : [
        { label: 'Querying news outlets and blogs', icon: Newspaper },
        { label: 'Filtering for relevant mentions', icon: Search },
        { label: 'Grouping by outlet', icon: Globe },
      ];

  return (
    <Card className="mt-6 dashboard-card overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-md animate-pulse" />
            <div className="relative rounded-full bg-primary/10 p-2.5">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
          </div>
          <div>
            <CardTitle className="text-lg">
              {isPrice ? 'Scanning live retailers…' : 'Scanning recent mentions…'}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              This usually takes 5–20 seconds. We're calling several sources in parallel.
            </p>
          </div>
        </div>
        <ul className="mt-4 space-y-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <li key={i} className="flex items-center gap-2.5 text-sm">
                <div className="rounded-full bg-muted p-1">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                </div>
                <span className="text-muted-foreground">{s.label}</span>
                <CircleDot
                  className="h-3 w-3 text-primary/60 ml-auto animate-pulse"
                  style={{ animationDelay: `${i * 200}ms` }}
                />
              </li>
            );
          })}
        </ul>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              {isPrice && <Skeleton className="h-5 w-20 shrink-0" />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
  const verifiedCount = data.results.filter((r) => r.verified).length;
  return (
    <Card className="mt-6 dashboard-card overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              {data.stats.count} retailer{data.stats.count === 1 ? '' : 's'} found
            </CardTitle>
            {verifiedCount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {verifiedCount} verified by direct page read · prices live as of scan time
              </p>
            )}
          </div>
          {data.from_cache && (
            <Badge variant="secondary" className="gap-1.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              Cached · instant
            </Badge>
          )}
        </div>
        {data.stats.count > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <StatTile
              label="Lowest"
              value={formatPrice(data.stats.min, data.stats.currency)}
              accent="text-emerald-500 dark:text-emerald-400"
            />
            <StatTile
              label="Median"
              value={formatPrice(data.stats.median, data.stats.currency)}
            />
            <StatTile
              label="Highest"
              value={formatPrice(data.stats.max, data.stats.currency)}
              accent="text-muted-foreground"
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {data.results.map((r, i) => (
            <PriceResultRow key={`${r.product_url}-${i}`} r={r} isLowest={r.price != null && r.price === data.stats.min} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${accent ?? ''}`}>{value}</div>
    </div>
  );
}

function PriceResultRow({ r, isLowest }: { r: PublicPriceResult; isLowest: boolean }) {
  const domain = hostnameOf(r.product_url);
  const discount = r.original_price && r.price && r.original_price > r.price
    ? Math.round(((r.original_price - r.price) / r.original_price) * 100)
    : null;
  return (
    <a
      href={r.product_url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors"
    >
      <RetailerFavicon domain={domain} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-medium truncate">{r.retailer_name}</span>
          {r.verified && <VerifiedPill />}
          {isLowest && (
            <Badge variant="outline" className="gap-1 rounded-full border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[10px] h-5 px-2">
              <TrendingDown className="h-2.5 w-2.5" />
              best price
            </Badge>
          )}
          <AvailabilityTag availability={r.availability} />
        </div>
        {r.product_title && (
          <div className="text-xs text-muted-foreground truncate">{r.product_title}</div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/80">
          {domain && <span className="truncate">{domain}</span>}
          {r.source && (
            <>
              <span>·</span>
              <span>via {prettifySource(r.source)}</span>
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0 ml-2">
        <div className="text-lg font-semibold tabular-nums">
          {formatPrice(r.price, r.currency)}
        </div>
        {r.original_price && r.original_price !== r.price && (
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground line-through tabular-nums">
              {formatPrice(r.original_price, r.currency)}
            </span>
            {discount && discount > 0 && (
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border-0 text-[10px] h-4 px-1.5 rounded-full">
                −{discount}%
              </Badge>
            )}
          </div>
        )}
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
    </a>
  );
}

function VerifiedPill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
      <CheckCircle2 className="h-2.5 w-2.5" />
      Verified
    </span>
  );
}

function AvailabilityTag({ availability }: { availability: string | null }) {
  if (!availability) return null;
  const norm = availability.toLowerCase();
  if (norm.includes('out') || norm.includes('εκτός')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
        <PackageX className="h-2.5 w-2.5" />
        Out of stock
      </span>
    );
  }
  if (norm.includes('in_stock') || norm === 'in stock' || norm.includes('available')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
        <PackageCheck className="h-2.5 w-2.5" />
        In stock
      </span>
    );
  }
  return null;
}

function RetailerFavicon({ domain }: { domain: string | null }) {
  if (!domain) {
    return (
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
        <Store className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="h-9 w-9 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center">
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
        alt=""
        loading="lazy"
        className="h-6 w-6"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
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
    <Card className="mt-6 dashboard-card overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-primary" />
              {data.total_results} mention{data.total_results === 1 ? '' : 's'} in the last 30 days
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              News, blogs, and editorial coverage from across the web.
            </p>
          </div>
          {data.from_cache && (
            <Badge variant="secondary" className="gap-1.5 rounded-full">
              <CheckCircle2 className="h-3 w-3" />
              Cached · instant
            </Badge>
          )}
        </div>
        {data.top_outlets.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium self-center mr-1">
              Top outlets
            </span>
            {data.top_outlets.map((o) => (
              <span
                key={o.domain}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs"
              >
                <img
                  src={`https://www.google.com/s2/favicons?domain=${o.domain}&sz=32`}
                  alt=""
                  loading="lazy"
                  className="h-3 w-3"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
                <span>{o.domain}</span>
                <span className="text-muted-foreground">·{o.count}</span>
              </span>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border/40">
          {data.results.map((m, i) => (
            <MentionRow key={`${m.url}-${i}`} m={m} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MentionRow({ m }: { m: PublicMentionResult }) {
  const domain = m.outlet_domain || hostnameOf(m.url);
  return (
    <a
      href={m.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors"
    >
      <RetailerFavicon domain={domain} />
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate mb-1 group-hover:text-primary transition-colors">
          {m.title || m.url}
        </div>
        {m.excerpt && (
          <div className="text-sm text-muted-foreground line-clamp-2 mb-2">{m.excerpt}</div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {(m.outlet_name || domain) && (
            <span className="font-medium text-foreground/70">{m.outlet_name || domain}</span>
          )}
          {m.published_at && (
            <>
              <span>·</span>
              <span>{formatDate(m.published_at)}</span>
            </>
          )}
          {m.source && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] ml-1">
              {prettifySource(m.source)}
            </span>
          )}
          {m.language_code && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
              {m.language_code}
            </span>
          )}
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0 mt-1" />
    </a>
  );
}

function UpsellCard({ quota, isAuthenticated }: { quota: PublicQuota; isAuthenticated: boolean }) {
  const resetMs = useMemo(() => {
    try {
      return new Date(quota.reset_at).getTime() - Date.now();
    } catch {
      return 24 * 3600 * 1000;
    }
  }, [quota.reset_at]);

  const hours = Math.max(1, Math.round(resetMs / 3_600_000));

  if (isAuthenticated) {
    return (
      <Card className="dashboard-card border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2.5">
              <Coins className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Out of credits</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                You have {(quota.credits_balance ?? 0).toLocaleString()} credits left —
                each scan costs {quota.credits_per_scan}. Top up to keep scanning.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link to="/billing" className="block">
            <Button className="w-full gap-2" size="lg">
              <Sparkles className="h-4 w-4" />
              Buy credits
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground text-center">
            Credits never expire · no subscription · pay as you go
          </p>
        </CardContent>
      </Card>
    );
  }

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
            <Link to="/auth?mode=signup&redirect=/tools" className="block">
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
          <Link to="/auth?redirect=/tools" className="text-primary hover:underline">Sign in</Link>{' '}
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

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function prettifySource(source: string): string {
  const map: Record<string, string> = {
    perplexity: 'Perplexity',
    perplexity_sonar: 'Perplexity',
    perplexity_web_search: 'Perplexity',
    dataforseo: 'Google Shopping',
    dataforseo_shopping: 'Google Shopping',
    dataforseo_news: 'Google News',
    firecrawl_url: 'Direct page read',
    firecrawl_careers: 'Career page',
    skroutz: 'Skroutz',
    bestprice: 'BestPrice',
    shopflix: 'Shopflix',
    idealo: 'Idealo',
    rss: 'RSS feed',
    youtube: 'YouTube',
  };
  return map[source] ?? source.replace(/_/g, ' ');
}
