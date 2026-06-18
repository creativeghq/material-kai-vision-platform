/**
 * Shared scaffolding for the public /tools surface.
 *
 * Holds the common header/shell, the price + mention result cards, the
 * scanning skeleton, the upsell card, the quota hook, and small formatters.
 * Each tool page (price scan, mention scan, heat-pump sizer, …) imports what
 * it needs and stays thin.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  Newspaper,
  PackageCheck,
  PackageX,
  Search,
  Sparkles,
  Store,
  TrendingDown,
  User as UserIcon,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Skeleton } from '@/components/core/ui/skeleton';
import {
  fetchQuota,
  type PublicMentionResult,
  type PublicMentionScanResponse,
  type PublicPriceResult,
  type PublicPriceScanResponse,
  type PublicQuota,
} from '@/services/publicToolsService';

// ── Quota hook ────────────────────────────────────────────────────────────

export function useToolsQuota(accessToken: string | null) {
  const [quota, setQuota] = useState<PublicQuota | null>(null);
  const [quotaError, setQuotaError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuota(accessToken)
      .then(setQuota)
      .catch((e: unknown) => setQuotaError(e instanceof Error ? e.message : 'Failed to load quota'));
  }, [accessToken]);

  return { quota, setQuota, quotaError };
}

// ── Shell (shared header + container) ──────────────────────────────────────

export function ToolsShell({
  headerRight,
  backTo = '/tools',
  children,
}: {
  headerRight?: ReactNode;
  /** Where the back arrow points. Defaults to the tools hub. */
  backTo?: string;
  children: ReactNode;
}) {
  const { user, signOut } = useAuth();
  const isAuthenticated = !!user;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/40 sticky top-0 z-30 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-14 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>MaterialsHub</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            {headerRight}
            <Link to={backTo}>
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">{backTo === '/tools' ? 'All tools' : 'Back'}</span>
              </Button>
            </Link>
            {isAuthenticated ? (
              <>
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
      <main className="container mx-auto max-w-4xl px-4 py-10">{children}</main>
    </div>
  );
}

export function QuotaBadge({ quota, isAuthenticated }: { quota: PublicQuota | null; isAuthenticated: boolean }) {
  if (!quota) return null;
  if (isAuthenticated && quota.credits_balance != null) {
    return (
      <Badge variant="outline" className="hidden sm:inline-flex gap-1.5">
        <Coins className="h-3.5 w-3.5 text-primary" />
        <span className="tabular-nums">{quota.credits_balance.toLocaleString()}</span>
        <span className="text-muted-foreground">credits</span>
      </Badge>
    );
  }
  if (!isAuthenticated) {
    return (
      <Badge variant="outline" className="hidden sm:inline-flex">
        {quota.remaining} / {quota.limit} free scans left today
      </Badge>
    );
  }
  return null;
}

// ── Scanning skeleton ──────────────────────────────────────────────────────

export function ScanningPanel({ kind }: { kind: 'price' | 'mention' }) {
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

// ── Price results ──────────────────────────────────────────────────────────

export function PriceResultsCard({ data }: { data: PublicPriceScanResponse }) {
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
            <StatTile label="Lowest" value={formatPrice(data.stats.min, data.stats.currency)} accent="text-emerald-500 dark:text-emerald-400" />
            <StatTile label="Median" value={formatPrice(data.stats.median, data.stats.currency)} />
            <StatTile label="Highest" value={formatPrice(data.stats.max, data.stats.currency)} accent="text-muted-foreground" />
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
  const discount =
    r.original_price && r.price && r.original_price > r.price
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
        {r.product_title && <div className="text-xs text-muted-foreground truncate">{r.product_title}</div>}
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
        <div className="text-lg font-semibold tabular-nums">{formatPrice(r.price, r.currency)}</div>
        {r.original_price && r.original_price !== r.price && (
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            <span className="text-xs text-muted-foreground line-through tabular-nums">{formatPrice(r.original_price, r.currency)}</span>
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

// ── Mention results ────────────────────────────────────────────────────────

export function MentionResultsCard({ data }: { data: PublicMentionScanResponse }) {
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
            <p className="text-xs text-muted-foreground mt-1">News, blogs, and editorial coverage from across the web.</p>
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
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium self-center mr-1">Top outlets</span>
            {data.top_outlets.map((o) => (
              <span key={o.domain} className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">
                <img
                  src={`https://www.google.com/s2/favicons?domain=${o.domain}&sz=32`}
                  alt=""
                  loading="lazy"
                  className="h-3 w-3"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                  }}
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
        <div className="font-medium truncate mb-1 group-hover:text-primary transition-colors">{m.title || m.url}</div>
        {m.excerpt && <div className="text-sm text-muted-foreground line-clamp-2 mb-2">{m.excerpt}</div>}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          {(m.outlet_name || domain) && <span className="font-medium text-foreground/70">{m.outlet_name || domain}</span>}
          {m.published_at && (
            <>
              <span>·</span>
              <span>{formatDate(m.published_at)}</span>
            </>
          )}
          {m.source && <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] ml-1">{prettifySource(m.source)}</span>}
          {m.language_code && <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{m.language_code}</span>}
        </div>
      </div>
      <ExternalLink className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0 mt-1" />
    </a>
  );
}

// ── Upsell (shown when quota / credits are exhausted) ──────────────────────

export function UpsellCard({ quota, isAuthenticated }: { quota: PublicQuota; isAuthenticated: boolean }) {
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
                You have {(quota.credits_balance ?? 0).toLocaleString()} credits left — each scan costs {quota.credits_per_scan}. Top up to keep scanning.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link to="/billing/credits" className="block">
            <Button className="w-full gap-2" size="lg">
              <Sparkles className="h-4 w-4" />
              Buy credits
            </Button>
          </Link>
          <p className="text-xs text-muted-foreground text-center">Credits never expire · no subscription · pay as you go</p>
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
              The free tier resets in about {hours} hour{hours === 1 ? '' : 's'}. Want to keep scanning right now?
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
              <Button className="w-full gap-2">Create free account</Button>
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
              <Button variant="outline" className="w-full gap-2">See credit packs</Button>
            </Link>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          Already have an account?{' '}
          <Link to="/auth?redirect=/tools" className="text-primary hover:underline">
            Sign in
          </Link>{' '}
          to use your existing balance.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Formatters ─────────────────────────────────────────────────────────────

export function formatPrice(value: number | null | undefined, currency: string | null | undefined): string {
  if (value == null) return '—';
  const cur = (currency || 'EUR').toUpperCase();
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toFixed(2)} ${cur}`;
  }
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function prettifySource(source: string): string {
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
