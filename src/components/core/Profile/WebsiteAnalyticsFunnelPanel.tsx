import React, { useEffect, useState } from 'react';
import { AlertTriangle, Filter, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { userWebsitesService, type GaJourney, type UserWebsite } from '@/services/userWebsitesService';
import { statusPresentation } from './seo/seoMetrics';

export const WebsiteAnalyticsFunnelPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
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
        if (!cancelled) { setJourney(null); setError(e?.message || 'Could not load the journey.'); }
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

  const f = journey?.funnel;
  const failed = error || f?.status === 'collector_failed';
  const present = statusPresentation(error ? 'collector_failed' : (f?.status ?? 'not_collected'));

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Filter className="h-4 w-4 text-primary" />
          Funnel
        </CardTitle>
        <CardDescription>
          Where people leave. Which journey this is comes from the events the property actually
          reports, so it describes the site rather than assuming a shop.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(error || f?.status !== 'ok') && (
          <div className={`flex items-start gap-2 rounded-sm border px-3 py-2 text-xs leading-snug ${
            failed
              ? 'border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] text-amber-800 dark:text-amber-300'
              : 'border-hairline bg-surface-sunken text-muted-foreground'
          }`}>
            {failed && <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            <span>
              <span className="font-medium">{present.placeholder}</span>
              {' — '}
              {error || f?.note || present.explain}
            </span>
          </div>
        )}

        {f?.status === 'ok' && f.steps.length > 0 && (
          <div className="space-y-2">
            {f.steps.map((s) => {
              const width = Math.max(1.5, Math.min(100, s.of_first ?? 0));
              return (
                <div key={s.step_index}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
                    <span className="font-medium">
                      {s.step_index + 1}. {s.step_label}
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">{s.event_name}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.active_users?.toLocaleString() ?? '—'} users
                      {s.of_first != null && <> · {s.of_first}% of arrivals</>}
                    </span>
                  </div>
                  <div className="h-6 w-full overflow-hidden rounded-sm bg-surface-sunken">
                    <div className="h-full bg-primary/70" style={{ width: `${width}%` }} />
                  </div>
                  {s.step_index > 0 && s.dropped != null && s.dropped > 0 && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {s.dropped.toLocaleString()} left here
                      {s.of_previous != null && <> · {(100 - s.of_previous).toFixed(1)}% of the previous step</>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WebsiteAnalyticsFunnelPanel;
