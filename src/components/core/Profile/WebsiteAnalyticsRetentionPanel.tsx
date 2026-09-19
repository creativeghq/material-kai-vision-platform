import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Repeat } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { userWebsitesService, type GaJourney, type UserWebsite } from '@/services/userWebsitesService';
import { statusPresentation } from './seo/seoMetrics';

export const WebsiteAnalyticsRetentionPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const [journey, setJourney] = useState<GaJourney | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const j = await userWebsitesService.gaJourney(website.id);
        if (!cancelled) { setJourney(j); setError(null); }
      } catch (e: any) {
        if (!cancelled) { setJourney(null); setError(e?.message || 'Could not load retention.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [website.id]);

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  const c = journey?.cohorts;
  const failed = error || c?.status === 'collector_failed';
  const present = statusPresentation(error ? 'collector_failed' : (c?.status ?? 'not_collected'));
  const periods = c?.periods ?? [];

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Repeat className="h-4 w-4 text-primary" />
          Retention
        </CardTitle>
        <CardDescription>
          Of the people who first arrived in a given week, how many came back in the weeks after.
          Week 0 is the cohort itself, so it is always 100%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(error || c?.status !== 'ok') && (
          <div className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
            failed
              ? 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-amber-800 dark:text-amber-300'
              : 'border-hairline bg-surface-sunken text-muted-foreground'
          }`}>
            {failed && <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>
              <span className="font-medium">{present.placeholder}</span>
              {' — '}
              {error || c?.note || present.explain}
            </span>
          </div>
        )}

        {c?.status === 'ok' && c.rows.length > 0 && (
          <div className="table-scroll">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-surface-sunken">
                  <th className="whitespace-nowrap px-2 py-1.5 text-left font-semibold">Cohort</th>
                  <th className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">Users</th>
                  {periods.map((p) => (
                    <th key={p} className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                      Week {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.map((row) => {
                  const byNth = new Map(row.periods.map((p) => [p.nth, p]));
                  return (
                    <tr key={row.cohort_label} className="border-t border-hairline">
                      <td className="whitespace-nowrap px-2 py-1.5">{row.cohort_label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{row.total_users?.toLocaleString() ?? '—'}</td>
                      {periods.map((p) => {
                        const cell = byNth.get(p);
                        // Younger than this offset has not CHURNED, the week has not happened.
                        if (!cell || cell.retention == null) {
                          return <td key={p} className="px-2 py-1.5 text-right text-muted-foreground">—</td>;
                        }
                        return (
                          <td
                            key={p}
                            className="px-2 py-1.5 text-right tabular-nums"
                            style={{ backgroundColor: `hsl(var(--primary) / ${(0.06 + 0.7 * (cell.retention / 100)).toFixed(3)})` }}
                            title={`${cell.active_users?.toLocaleString() ?? '—'} of ${row.total_users?.toLocaleString() ?? '—'}`}
                          >
                            {cell.retention}%
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteAnalyticsRetentionPanel;
