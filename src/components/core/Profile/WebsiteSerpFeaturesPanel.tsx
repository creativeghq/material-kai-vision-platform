import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, LayoutList, Loader2, MapPin } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/core/ui/table';
import { TableColumnHeader } from '@/components/core/ui/table-column-header';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { timeAgo } from '@/utils/datetime';
import {
  userWebsitesService,
  type SerpFeatureRow,
  type SerpFeaturesReport,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { captureShare, serpFeatureDescriptor, serpFeatureLabel } from './seo/serpFeatures';
import { shortLocationName } from './seo/SerpTargetPicker';

function CaptureStrip({ series }: { series: SerpFeatureRow['series'] }) {
  if (series.length === 0) return <span className="text-[11px] text-muted-foreground">—</span>;
  return (
    <div className="flex h-6 items-end gap-0.5" role="img" aria-label="Share of checked keywords showing this feature, per capture">
      {series.map((p) => {
        const s = captureShare(p);
        if (s.present == null) {
          return (
            <span
              key={p.date}
              className="h-full w-2 rounded-[1px] border border-dashed border-muted-foreground/50"
              title={`${p.date}: unknown — none of ${p.unknown} checks answered`}
            />
          );
        }
        return (
          <span
            key={p.date}
            className="relative w-2 rounded-[1px] bg-muted-foreground/25"
            style={{ height: `${Math.max(s.present * 100, 6)}%` }}
            title={`${p.date}: on ${p.present} of ${p.answered} checked · cites you on ${p.owned}${p.unknown ? ` · ${p.unknown} unknown` : ''}`}
          >
            {s.owned ? (
              <span
                className="absolute bottom-0 left-0 w-full rounded-[1px] bg-[hsl(var(--success))]"
                style={{ height: `${(s.owned / (s.present || 1)) * 100}%` }}
              />
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

function Count({ value, unknown }: { value: number | null; unknown: boolean }) {
  if (unknown || value == null) {
    return <span className="text-xs text-amber-800 dark:text-amber-300" title="No latest check answered">unknown</span>;
  }
  return <span className="font-semibold tabular-nums">{value}</span>;
}

export const WebsiteSerpFeaturesPanel: React.FC<{ website: UserWebsite; onOpenRanks?: () => void }> = ({
  website, onOpenRanks,
}) => {
  const [data, setData] = useState<SerpFeaturesReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

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

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  const unknownAll = data?.status === 'collector_failed';
  const warn = unknownAll || (data?.unknown ?? 0) > 0;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LayoutList className="h-4 w-4 text-primary" />
          SERP features
        </CardTitle>
        <CardDescription>
          Which blocks appear on your tracked keywords&apos; results pages, which of them cite you, and where a rival holds one you do not.
          {data?.latest_capture ? <> · latest capture {timeAgo(data.latest_capture)}</> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 p-0 pb-2">
        {error ? (
          <div className="px-6">
            <HubEmptyState
              variant="empty"
              title="Could not load SERP features"
              description={error}
              action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>}
            />
          </div>
        ) : !data || data.status === 'not_collected' ? (
          <div className="px-6">
            <HubEmptyState
              variant="empty"
              title={data?.tracked ? 'No keyword checked yet' : 'No keywords tracked yet'}
              description={data?.note ?? 'Features are read from the daily rank check of the keywords you track.'}
              action={onOpenRanks ? <Button size="sm" onClick={onOpenRanks}>Open the Rank Tracker</Button> : undefined}
            />
          </div>
        ) : (
          <>
            {data.note && (
              <div className={`mx-6 flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
                warn
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                  : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}>
                {warn && <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                <span>{data.note}</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4 px-6">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Checked</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">{data.answered}<span className="text-base text-muted-foreground">/{data.tracked}</span></p>
                <p className="text-[11px] text-muted-foreground">latest check answered</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Unknown</p>
                <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${data.unknown > 0 ? 'text-amber-700 dark:text-amber-300' : ''}`}>{data.unknown}</p>
                <p className="text-[11px] text-muted-foreground">latest check failed</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Never checked</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">{data.never_checked}</p>
                <p className="text-[11px] text-muted-foreground">in no count here</p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableColumnHeader>Feature</TableColumnHeader>
                  <TableColumnHeader align="right">On the page</TableColumnHeader>
                  <TableColumnHeader align="right">Cites you</TableColumnHeader>
                  <TableColumnHeader align="right">Missing</TableColumnHeader>
                  <TableColumnHeader className="w-40">Last captures</TableColumnHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.features.map((f) => {
                  const d = serpFeatureDescriptor(f.key);
                  const expanded = open === f.key;
                  const canExpand = !unknownAll && (f.missing ?? 0) > 0;
                  return (
                    <React.Fragment key={f.key}>
                      <TableRow>
                        <TableCell className="max-w-[260px]">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-left font-medium disabled:cursor-default"
                            disabled={!canExpand}
                            onClick={() => setOpen(expanded ? null : f.key)}
                            aria-expanded={canExpand ? expanded : undefined}
                          >
                            {canExpand
                              ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />)
                              : <span className="w-3.5" />}
                            {serpFeatureLabel(f.key)}
                          </button>
                          {d?.what && <p className="pl-[18px] text-[11px] text-muted-foreground">{d.what}</p>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Count value={f.present} unknown={unknownAll} />
                          {!unknownAll && f.present != null && (
                            <span className="text-xs text-muted-foreground"> / {data.answered}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right"><Count value={f.owned} unknown={unknownAll} /></TableCell>
                        <TableCell className="text-right">
                          {unknownAll || f.missing == null
                            ? <Count value={null} unknown />
                            : f.missing > 0
                              ? <Badge variant="warning">{f.missing}</Badge>
                              : <span className="text-xs text-muted-foreground">0</span>}
                        </TableCell>
                        <TableCell><CaptureStrip series={f.series} /></TableCell>
                      </TableRow>
                      {expanded && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-surface-sunken">
                            <p className="mb-1.5 text-[11px] text-muted-foreground">
                              {d?.ifPresent ?? 'On the page and not citing you.'}
                              {(f.missing ?? 0) > f.missing_keywords.length ? ` Showing ${f.missing_keywords.length} of ${f.missing}.` : ''}
                            </p>
                            <ul className="grid gap-1 sm:grid-cols-2">
                              {f.missing_keywords.map((k) => (
                                <li key={k.id} className="flex items-center gap-2 text-xs">
                                  <span className="truncate font-medium">{k.keyword}</span>
                                  <span className="shrink-0 text-muted-foreground">
                                    {k.position != null ? `#${k.position}` : 'not ranking'} · {k.device}
                                    {k.location_name ? (
                                      <> · <MapPin className="inline h-3 w-3" aria-hidden="true" /> {shortLocationName(k.location_name)}</>
                                    ) : null}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteSerpFeaturesPanel;
