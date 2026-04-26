/**
 * MarketPanel — shows live retailer market data next to the KB-based AI price
 * proposal inside PriceLookupDrawer. Renders:
 *   - min / max / median, verified coverage
 *   - optional "your KB price is at the Nth percentile" callout when a KB
 *     proposal is present
 *   - collapsible list of the individual retailer hits (cheapest first)
 *
 * Stateless on the backend — does NOT enroll the product into monitoring.
 * Reuses the monitoring cache if the product is already monitored (≤6h old).
 */

import React, { useMemo, useState } from 'react';
import { BadgeCheck, ChevronDown, ChevronRight, ExternalLink, Globe2, Star } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import type { MarketCheckResponse, PerplexityHit } from '@/services/priceMonitoringApi';

interface MarketPanelProps {
  market: MarketCheckResponse;
  /**
   * When set, we render a "your KB price sits at the Nth percentile" callout
   * comparing this number against the market range. Pass the current AI/KB
   * proposal price in the same currency.
   */
  kbPrice?: number | null;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
};

function fmt(n: number | null | undefined, currency: string | null): string {
  if (n == null) return '—';
  const sym = CURRENCY_SYMBOL[currency ?? ''] ?? '';
  return `${sym}${n.toFixed(2)}`;
}

function percentile(values: number[], target: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const below = sorted.filter((v) => v < target).length;
  return Math.round((below / sorted.length) * 100);
}

export const MarketPanel: React.FC<MarketPanelProps> = ({ market, kbPrice }) => {
  const [expanded, setExpanded] = useState(false);
  const { stats, results, summary, from_monitoring_cache, cache_age_seconds } = market;
  const hits = useMemo(
    () => [...results].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)),
    [results]
  );
  // Percentile is only meaningful against the same set that powers the stats —
  // exact matches (or legacy null match_kind rows that predate identity verification).
  const exactPriced = hits
    .filter((h) => (h.match_kind === 'exact' || h.match_kind == null) && h.price != null)
    .map((h) => h.price as number);

  const pct = kbPrice != null && exactPriced.length > 0 ? percentile(exactPriced, kbPrice) : null;
  const calloutTone =
    pct == null
      ? null
      : pct >= 25 && pct <= 75
        ? 'good'
        : pct > 75
          ? 'high'
          : 'low';

  return (
    <div className="rounded-md border bg-muted/10 p-4 space-y-3">
      {/* How many of the rendered rows actually fed the min/median/max.
          Variants + unverifiable are excluded from stats but still shown
          in the expandable list so admins have context. */}
      {(() => {
        const exactCount = hits.filter(
          (h) => h.match_kind === 'exact' || h.match_kind == null
        ).length;
        return (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              <span className="font-semibold text-sm">Market (live)</span>
              {from_monitoring_cache && (
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  title={
                    cache_age_seconds != null
                      ? `Reused from continuous monitoring snapshot — ${Math.round(cache_age_seconds / 60)} min old. No credits spent.`
                      : 'Reused from continuous monitoring snapshot.'
                  }
                >
                  Cached
                </Badge>
              )}
            </div>
            <span
              className="text-[11px] text-muted-foreground"
              title={
                exactCount === hits.length
                  ? `All ${hits.length} hits are exact matches.`
                  : `${exactCount} exact matches feed the stats. Variants and unverified rows are shown but excluded from min/median/max.`
              }
            >
              {exactCount}/{hits.length} exact · {stats.verified_count}/{stats.count} verified · {market.country_code}
            </span>
          </div>
        );
      })()}

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</div>
          <div className="font-medium">{fmt(stats.min, stats.currency)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Median</div>
          <div className="font-medium">{fmt(stats.median, stats.currency)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</div>
          <div className="font-medium">{fmt(stats.max, stats.currency)}</div>
        </div>
      </div>

      {calloutTone && pct != null && kbPrice != null && (
        <div
          className={`rounded-md border p-2.5 text-xs ${
            calloutTone === 'good'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : calloutTone === 'high'
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          Your KB price <strong>{fmt(kbPrice, stats.currency)}</strong> sits at the{' '}
          <strong>{pct}th percentile</strong> of the market
          {calloutTone === 'good' && ' — within the middle 50%.'}
          {calloutTone === 'high' && ' — above 75% of retailers. You may be leaving margin on the table, or your KB sources skew retail-plus.'}
          {calloutTone === 'low' && ' — below 25% of retailers. Likely under-priced or KB sources are stale.'}
        </div>
      )}

      {summary && (
        <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-primary/40 pl-3">
          {summary}
        </p>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {expanded ? 'Hide retailers' : `Show ${hits.length} retailers`}
      </button>

      {expanded && (
        <div className="divide-y rounded border bg-background/40">
          {hits.map((h, i) => (
            <MarketHitRow key={`${h.product_url}-${i}`} hit={h} />
          ))}
        </div>
      )}
    </div>
  );
};

const MarketHitRow: React.FC<{ hit: PerplexityHit }> = ({ hit }) => {
  const sym = CURRENCY_SYMBOL[hit.currency ?? ''] ?? '';
  const discrepancy = hit.notes && hit.notes.includes('verify:') ? hit.notes : null;
  const viaMarketplace = hit.notes?.match(/via (Skroutz|Bestprice|Shopflix|Google Shopping)/i)?.[1] ?? null;
  const rowDimmed = hit.match_kind === 'variant' || hit.match_kind === 'unverifiable';
  let favicon: string | null = null;
  try {
    favicon = `https://www.google.com/s2/favicons?domain=${new URL(hit.product_url).hostname}&sz=64`;
  } catch {
    favicon = null;
  }
  return (
    <div className={`flex items-center gap-2 px-3 py-2 text-xs ${rowDimmed ? 'opacity-75' : ''}`}>
      {hit.image_url && (
        <a href={hit.product_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <img
            src={hit.image_url}
            alt={hit.retailer_name}
            loading="lazy"
            className="h-8 w-8 rounded object-cover bg-muted"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </a>
      )}
      <div className="flex-1 min-w-0">
        {hit.product_title && (
          <div
            className="text-[10px] text-muted-foreground/80 truncate"
            title={hit.product_title}
          >
            {hit.product_title}
          </div>
        )}
        <div className="flex items-center gap-1.5 flex-wrap">
          <a
            href={hit.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium hover:underline truncate flex items-center gap-1"
          >
            {favicon && (
              <img
                src={favicon}
                alt=""
                width={14}
                height={14}
                className="h-3.5 w-3.5 rounded-sm shrink-0"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <span className="truncate">{hit.retailer_name}</span>
          </a>
          {viaMarketplace && (
            <span
              className="text-[9px] px-1 rounded border border-blue-400 text-blue-500"
              title={`Discovered through ${viaMarketplace}`}
            >
              via {viaMarketplace}
            </span>
          )}
          {hit.verified && (
            <span
              className="inline-flex items-center text-emerald-500"
              title={discrepancy ?? "Price confirmed from the retailer's live page"}
            >
              <BadgeCheck className="h-3 w-3" />
            </span>
          )}
          {hit.match_kind === 'variant' && (
            <span
              className="text-[9px] px-1 rounded border border-amber-400 text-amber-500"
              title={hit.match_note ?? 'Different variant (color/finish/size). Excluded from stats.'}
            >
              Variant
            </span>
          )}
          {hit.match_kind === 'unverifiable' && (
            <span
              className="text-[9px] px-1 rounded border border-gray-400 text-gray-400"
              title={hit.match_note ?? "Product identity could not be confirmed — price shown is indicative."}
            >
              ?
            </span>
          )}
          {hit.rating_value != null && (
            <span className="flex items-center gap-0.5 text-muted-foreground">
              <Star className="h-2.5 w-2.5 fill-current" />
              {hit.rating_value.toFixed(1)}
            </span>
          )}
          {hit.availability === 'out_of_stock' && (
            <span className="text-[10px] text-orange-400">Out of stock</span>
          )}
          <a
            href={hit.product_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground ml-auto shrink-0"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {hit.original_price != null && hit.price != null && hit.original_price > hit.price && (
          <span className="text-[10px] line-through text-muted-foreground mr-1">
            {sym}
            {hit.original_price.toFixed(2)}
          </span>
        )}
        <span className="font-semibold">
          {sym}
          {hit.price?.toFixed(2) ?? '—'}
        </span>
      </div>
    </div>
  );
};
