import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, LayoutList, Loader2, MapPin, RefreshCw } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/utils/datetime';
import { useToast } from '@/hooks/use-toast';
import {
  describeRankCheck,
  userWebsitesService,
  type SerpFeatureMissingKeyword,
  type SerpFeatureRow,
  type SerpFeaturesReport,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { captureShare, serpFeatureDescriptor, serpFeatureLabel } from './seo/serpFeatures';
import { shortLocationName } from './seo/SerpTargetPicker';

/** Literal classes: Tailwind's scanner reads source text. */
const SEGMENT = {
  owned: { fill: 'bg-emerald-600 dark:bg-emerald-400', label: 'Shows you' },
  close: { fill: 'bg-amber-500 dark:bg-amber-400', label: 'Not you — but you rank' },
  far: { fill: 'bg-muted-foreground/45', label: 'Not you — you don’t rank' },
  none: { fill: 'bg-muted', label: 'Block not on the page' },
} as const;

type SegmentKey = keyof typeof SEGMENT;

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {(Object.keys(SEGMENT) as SegmentKey[]).map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span className={cn('h-2.5 w-2.5 rounded-[2px]', SEGMENT[k].fill)} aria-hidden="true" />
          {SEGMENT[k].label}
        </li>
      ))}
    </ul>
  );
}

function splitOf(f: SerpFeatureRow, answered: number): Record<SegmentKey, number> {
  const owned = f.owned ?? 0;
  const missing = f.missing ?? 0;
  const close = f.missing_ranking ?? 0;
  const far = f.missing_unranked ?? Math.max(missing - close, 0);
  return { owned, close, far, none: Math.max(answered - (f.present ?? 0), 0) };
}

function FeatureBar({ split, answered }: { split: Record<SegmentKey, number>; answered: number }) {
  const total = Math.max(answered, 1);
  return (
    <div
      className="flex h-2.5 w-full overflow-hidden rounded-sm"
      role="img"
      aria-label={(Object.keys(SEGMENT) as SegmentKey[]).map((k) => `${split[k]} ${SEGMENT[k].label}`).join(', ')}
    >
      {(Object.keys(SEGMENT) as SegmentKey[]).filter((k) => split[k] > 0).map((k) => (
        <span
          key={k}
          className={cn('h-full', SEGMENT[k].fill)}
          style={{ width: `${(split[k] / total) * 100}%` }}
          title={`${split[k]} of ${answered} keywords: ${SEGMENT[k].label.toLowerCase()}`}
        />
      ))}
    </div>
  );
}

function CaptureStrip({ series }: { series: SerpFeatureRow['series'] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground">Last {series.length} checks</span>
      <div className="flex h-5 items-end gap-0.5" role="img" aria-label="Share of checked keywords showing this block, per check">
        {series.map((p) => {
          const s = captureShare(p);
          if (s.present == null) {
            return (
              <span
                key={p.date}
                className="h-full w-1.5 rounded-[1px] border border-dashed border-muted-foreground/50"
                title={`${p.date}: unknown — none of ${p.unknown} checks answered`}
              />
            );
          }
          return (
            <span
              key={p.date}
              className="relative w-1.5 rounded-[1px] bg-muted-foreground/25"
              style={{ height: `${Math.max(s.present * 100, 8)}%` }}
              title={`${p.date}: on ${p.present} of ${p.answered} pages · shows you on ${p.owned}${p.unknown ? ` · ${p.unknown} unknown` : ''}`}
            >
              {s.owned ? (
                <span
                  className="absolute bottom-0 left-0 w-full rounded-[1px] bg-emerald-600 dark:bg-emerald-400"
                  style={{ height: `${(s.owned / (s.present || 1)) * 100}%` }}
                />
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function KeywordList({ rows }: { rows: SerpFeatureMissingKeyword[] }) {
  return (
    <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
      {rows.map((k) => (
        <li key={k.id} className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="truncate font-medium text-foreground">{k.keyword}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {k.position != null ? `#${k.position}` : '—'} · {k.device}
            {k.location_name ? (
              <> · <MapPin className="inline h-3 w-3" aria-hidden="true" /> {shortLocationName(k.location_name)}</>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function FeatureDetail({ f }: { f: SerpFeatureRow }) {
  const d = serpFeatureDescriptor(f.key);
  const close = f.missing_keywords.filter((k) => k.position != null);
  const far = f.missing_keywords.filter((k) => k.position == null);
  const truncated = (f.missing ?? 0) > f.missing_keywords.length;
  return (
    <div className="space-y-3 border-t border-hairline bg-surface-sunken px-4 py-3 sm:px-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground">What it means for you</p>
          <p className="mt-0.5 text-xs leading-snug text-foreground">{d?.ifPresent ?? 'This block is on the page and does not show your site.'}</p>
        </div>
        {d?.howToGetIn && (
          <div>
            <p className="text-[11px] font-semibold text-muted-foreground">How a site gets into it</p>
            <p className="mt-0.5 text-xs leading-snug text-foreground">{d.howToGetIn}</p>
          </div>
        )}
      </div>
      {close.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <span className={cn('h-2 w-2 rounded-[2px]', SEGMENT.close.fill)} aria-hidden="true" />
            Closest wins — you already rank, the block shows someone else ({f.missing_ranking ?? close.length})
          </p>
          <KeywordList rows={close} />
        </div>
      )}
      {far.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
            <span className={cn('h-2 w-2 rounded-[2px]', SEGMENT.far.fill)} aria-hidden="true" />
            You are not in Google’s top 100 for these ({f.missing_unranked ?? far.length})
          </p>
          <p className="mb-1.5 text-[11px] text-muted-foreground">
            {d?.needsRanking === false
              ? 'This block does not come from the website ranking, so these are reachable without one.'
              : 'Google fills this block from pages it already ranks — these need a page that ranks for the keyword first.'}
          </p>
          <KeywordList rows={far} />
        </div>
      )}
      {truncated && (
        <p className="text-[11px] text-muted-foreground">Showing {f.missing_keywords.length} of {f.missing}.</p>
      )}
      <CaptureStrip series={f.series} />
    </div>
  );
}

function Stat({ label, value, of, hint, tone }: {
  label: string; value: number | null | undefined; of?: number; hint: string; tone?: 'warning';
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className={cn('mt-0.5 text-2xl font-semibold tabular-nums', tone === 'warning' && 'text-amber-700 dark:text-amber-300')}>
        {value ?? '—'}
        {of != null && <span className="text-base text-muted-foreground">/{of}</span>}
      </p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

export const WebsiteSerpFeaturesPanel: React.FC<{ website: UserWebsite; onOpenRanks?: () => void }> = ({
  website, onOpenRanks,
}) => {
  const [data, setData] = useState<SerpFeaturesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await userWebsitesService.serpFeatures(website.id, 8));
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : 'Could not load SERP features');
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => { void load(); }, [load]);

  /** Features are read off the rank check, so refreshing them IS a rank check. */
  const refresh = async () => {
    setChecking(true);
    try {
      const r = await userWebsitesService.runRankCheck(website.id);
      toast({ title: 'Results pages re-read', description: describeRankCheck(r, data?.tracked ?? r.checked) });
      await load();
    } catch (e: unknown) {
      toast({ title: 'Check failed', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  const unknownAll = data?.status === 'collector_failed';
  const warn = unknownAll || (data?.unknown ?? 0) > 0;
  const host = website.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  const seen = (data?.features ?? []).filter((f) => (f.present ?? 0) > 0);
  const notSeen = (data?.features ?? []).filter((f) => f.present === 0);
  const showsYou = seen.reduce((n, f) => n + (f.owned ?? 0), 0);
  const withoutYou = seen.reduce((n, f) => n + (f.missing ?? 0), 0);

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <LayoutList className="h-4 w-4 text-primary" />
            SERP features
          </CardTitle>
          <CardDescription>
            The extra blocks Google puts on the results page for your tracked keywords, and whether {host} is in them.
            {data?.latest_capture ? <> · last read {timeAgo(data.latest_capture)}</> : null}
          </CardDescription>
        </div>
        {data?.tracked ? (
          <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={checking}>
            {checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Re-read now
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-5 p-0 pb-2">
        <ol className="mx-4 grid gap-3 rounded-sm border border-hairline bg-surface-sunken p-3 text-xs leading-snug text-muted-foreground sm:mx-6 sm:grid-cols-3">
          <li>
            <span className="font-semibold text-foreground">1 · Nothing to switch on.</span>{' '}
            Google decides which blocks appear (AI Overview, map, images…). This panel reports them; it does not set them.
          </li>
          <li>
            <span className="font-semibold text-foreground">2 · Read daily.</span>{' '}
            The rank check opens Google for every keyword in the Rank Tracker, on its device and location, and records every block on that page.
          </li>
          <li>
            <span className="font-semibold text-foreground">3 · Are you in it?</span>{' '}
            For each block we check whether it links or shows {host}. Open a row to see the keywords where it does not, and what would change that.
          </li>
        </ol>

        {error ? (
          <div className="px-4 sm:px-6">
            <HubEmptyState
              variant="empty"
              title="Could not load SERP features"
              description={error}
              action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>}
            />
          </div>
        ) : !data || data.status === 'not_collected' ? (
          <div className="px-4 sm:px-6">
            <HubEmptyState
              variant="empty"
              title={data?.tracked ? 'No keyword checked yet' : 'No keywords tracked yet'}
              description={data?.note ?? 'Features are read from the daily rank check of the keywords you track. Add keywords in the Rank Tracker to start.'}
              action={onOpenRanks ? <Button size="sm" onClick={onOpenRanks}>Open the Rank Tracker</Button> : undefined}
            />
          </div>
        ) : (
          <>
            {data.note && (
              <div className={cn(
                'mx-4 flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug sm:mx-6',
                warn
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                  : 'border-hairline bg-surface-sunken text-muted-foreground',
              )}>
                {warn && <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>{data.note}</span>
              </div>
            )}

            {!unknownAll && (
              <div className="grid grid-cols-2 gap-4 px-4 sm:px-6 lg:grid-cols-4">
                <Stat label="Pages read" value={data.answered} of={data.tracked} hint="tracked keywords whose latest check answered" />
                <Stat label="You rank" value={data.ranking} of={data.answered} hint="keywords where you are in Google’s top 100" />
                <Stat label="Blocks showing you" value={showsYou} hint="across all checked pages" />
                <Stat label="Blocks without you" value={withoutYou} hint="on the page, showing someone else" tone={withoutYou > 0 ? 'warning' : undefined} />
              </div>
            )}

            {!unknownAll && seen.length > 0 && (
              <div>
                <div className="flex flex-col gap-2 border-b border-hairline px-4 pb-2 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                  <p className="text-xs font-semibold text-foreground">
                    Blocks on your pages <span className="font-normal text-muted-foreground">· each bar is your {data.answered} checked keywords</span>
                  </p>
                  <Legend />
                </div>
                <ul>
                  {seen.map((f) => {
                    const d = serpFeatureDescriptor(f.key);
                    const split = splitOf(f, data.answered);
                    const expanded = open === f.key;
                    const canExpand = (f.missing ?? 0) > 0;
                    return (
                      <li key={f.key} className="border-b border-hairline last:border-b-0">
                        <button
                          type="button"
                          className="grid w-full gap-2 px-4 py-3 text-left hover:bg-surface-sunken/60 disabled:cursor-default disabled:hover:bg-transparent sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-6"
                          disabled={!canExpand}
                          onClick={() => setOpen(expanded ? null : f.key)}
                          aria-expanded={canExpand ? expanded : undefined}
                        >
                          <span className="flex min-w-0 items-start gap-1.5">
                            {canExpand
                              ? (expanded ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />)
                              : <span className="w-3.5 shrink-0" />}
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-foreground">{serpFeatureLabel(f.key)}</span>
                              {d?.what && <span className="block text-[11px] leading-snug text-muted-foreground">{d.what}</span>}
                            </span>
                          </span>
                          <FeatureBar split={split} answered={data.answered} />
                          <span className="text-xs tabular-nums text-muted-foreground sm:w-44 sm:text-right">
                            on <span className="font-semibold text-foreground">{f.present}</span> of {data.answered} pages
                            {' · '}
                            {(f.owned ?? 0) > 0
                              ? <span className="font-semibold text-emerald-700 dark:text-emerald-400">shows you {f.owned}</span>
                              : <span>shows you 0</span>}
                          </span>
                        </button>
                        {expanded && <FeatureDetail f={f} />}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {!unknownAll && notSeen.length > 0 && (
              <div className="px-4 sm:px-6">
                <p className="text-xs font-semibold text-foreground">Not on any checked page</p>
                <ul className="mt-1.5 space-y-1">
                  {notSeen.map((f) => {
                    const d = serpFeatureDescriptor(f.key);
                    return (
                      <li key={f.key} className="text-xs leading-snug">
                        <span className="font-medium text-foreground">{serpFeatureLabel(f.key)}</span>
                        {d?.ifAbsent && <span className="text-muted-foreground"> — {d.ifAbsent}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {!unknownAll && (data.context_features?.length ?? 0) > 0 && (
              <div className="px-4 pb-2 sm:px-6">
                <p className="text-xs font-semibold text-foreground">Also on these pages</p>
                <p className="text-[11px] text-muted-foreground">Blocks that do not belong to a website, so there is no “you” to look for — shown for the shape of the page.</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {data.context_features!.map((c) => (
                    <li
                      key={c.key}
                      className="rounded-sm border border-hairline bg-surface-sunken px-2 py-0.5 text-[11px] text-muted-foreground"
                      title={serpFeatureDescriptor(c.key)?.what}
                    >
                      <span className="text-foreground">{serpFeatureLabel(c.key)}</span> · {c.present} of {data.answered}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteSerpFeaturesPanel;
