import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubStatGrid } from '@/components/core/hub/HubStatTile';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import {
  userWebsitesService,
  type GaProperty,
  type GaSummary,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { SeoMetricTile } from './seo/SeoMetricTile';
import { compact, type SeoMetric, type SeoMetricDescriptor } from './seo/seoMetrics';

/**
 * Websites → Search Performance → Analytics.
 *
 * Search Console answers "what did Google show people". Analytics answers "and
 * what did those people then do". Neither is much use without the other: a page
 * with rising impressions and flat sessions has a title problem, and one with
 * rising sessions and no conversions has a page problem — and you cannot see
 * either from one feed alone.
 *
 * Analytics rides the SAME Google grant Search Console already holds, via
 * incremental authorization, so connecting it does not disturb an existing
 * Search Console connection.
 *
 * The states this panel keeps apart, all of which look like "no traffic" if you
 * only count rows: Google not connected · connected but no property chosen ·
 * property chosen and the sync failed · genuinely no sessions.
 */

const GA_METRICS: SeoMetricDescriptor[] = [
  { key: 'sessions', label: 'Sessions', format: 'count', upIsGood: true, help: 'Visits to the site. One person returning tomorrow is two sessions.' },
  { key: 'active_users', label: 'Active users', format: 'count', upIsGood: true, help: 'Distinct people, not visits. The gap between this and sessions is how often people come back.' },
  { key: 'new_users', label: 'New users', format: 'count', upIsGood: true, help: 'First-time visitors in the window.' },
  { key: 'engagement_rate', label: 'Engaged sessions', format: 'percent', upIsGood: true, help: 'Share of sessions that lasted, scrolled or converted — the inverse of a bounce, and a better read on whether the page delivered.' },
  { key: 'conversions', label: 'Conversions', format: 'count', upIsGood: true, help: 'Events marked as conversions in the Analytics property. Zero here usually means none are configured, not that nobody converted.' },
  { key: 'revenue', label: 'Revenue', format: 'currency', upIsGood: true, help: 'Revenue attributed by Analytics. Only present when ecommerce or a value-carrying event is set up.' },
];

export const WebsiteAnalyticsPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [summary, setSummary] = useState<GaSummary | null>(null);
  const [props, setProps] = useState<GaProperty[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await userWebsitesService.gaSummary(website.id, 28));
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => { void load(); }, [load]);

  const pickProperties = async () => {
    setBusy('list');
    try {
      setProps(await userWebsitesService.gaListProperties(website.id));
    } catch (e: any) {
      toast({ title: 'Could not list properties', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const choose = async (id: string) => {
    setBusy('set');
    try {
      await userWebsitesService.gaSetProperty(website.id, id);
      toast({ title: 'Analytics property selected' });
      await userWebsitesService.gaSync(website.id, 28);
      await load();
    } catch (e: any) {
      toast({ title: 'Could not select it', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const sync = async () => {
    setBusy('sync');
    try {
      const r = await userWebsitesService.gaSync(website.id, 28);
      toast({ title: 'Analytics synced', description: `${r.rows} rows pulled.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  const connected = summary?.status === 'ok' || summary?.status === 'not_collected' || summary?.status === 'collector_failed';
  const topChannels = (summary?.channels ?? []).slice(0, 6);
  const channelTotal = topChannels.reduce((s, c) => s + (c.sessions ?? 0), 0) || 1;

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Analytics
          </CardTitle>
          <CardDescription>
            What visitors did once they arrived, over the last {summary?.window_days ?? 28} days.
            {summary?.property_name ? <> · {summary.property_name}</> : null}
            {summary?.last_sync_at ? <> · synced {timeAgo(summary.last_sync_at)}</> : null}
          </CardDescription>
        </div>
        {connected && summary?.property_id && (
          <Button size="sm" variant="outline" onClick={sync} disabled={!!busy}>
            {busy === 'sync' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Sync
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {summary?.note && (
          <div className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
            summary.status === 'collector_failed'
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
              : 'border-hairline bg-surface-sunken text-muted-foreground'
          }`}>
            {summary.status === 'collector_failed' && (
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{summary.note}</span>
          </div>
        )}

        {/* Property picker — only when Google is connected but nothing is chosen. */}
        {summary?.status === 'not_connected' && summary.note?.includes('no Analytics property') && (
          <div className="flex flex-wrap items-center gap-2">
            {props === null ? (
              <Button size="sm" variant="outline" onClick={pickProperties} disabled={!!busy}>
                {busy === 'list' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Choose an Analytics property
              </Button>
            ) : props.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                This Google account cannot read any GA4 property. Check that it has at least Viewer access.
              </p>
            ) : (
              <Select onValueChange={choose} disabled={!!busy}>
                <SelectTrigger className="w-[340px]"><SelectValue placeholder="Pick a property…" /></SelectTrigger>
                <SelectContent>
                  {props.map((p) => (
                    <SelectItem key={p.property} value={p.property}>
                      {p.name}{p.account ? ` · ${p.account}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        <HubStatGrid>
          {GA_METRICS.map((d) => (
            <SeoMetricTile
              key={d.key}
              descriptor={d}
              metric={(summary?.metrics?.[d.key] as SeoMetric | undefined) ?? null}
              deltaCaption="vs previous period"
            />
          ))}
        </HubStatGrid>

        {topChannels.length > 0 && (
          <div className="border-t border-hairline pt-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Where the sessions came from</p>
            <div className="space-y-1.5">
              {topChannels.map((c) => (
                <div key={c.channel} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-xs text-foreground">{c.channel}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                    <div className="h-full bg-primary/60" style={{ width: `${((c.sessions ?? 0) / channelTotal) * 100}%` }} />
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">
                    {c.sessions != null ? compact(c.sessions) : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteAnalyticsPanel;
