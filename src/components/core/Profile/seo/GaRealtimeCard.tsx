import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RadioTower, RefreshCw } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { userWebsitesService, type GaRealtime } from '@/services/userWebsitesService';
import { countryFlag, countryName } from './gaBreakdowns';

const REFRESH_MS = 60_000;

export const GaRealtimeCard: React.FC<{ websiteId: string }> = ({ websiteId }) => {
  const [data, setData] = useState<GaRealtime | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await userWebsitesService.gaRealtime(websiteId));
      setError(null);
    } catch (e: any) {
      setData(null);
      setError(e?.message || 'Could not read realtime.');
    } finally {
      setBusy(false);
    }
  }, [websiteId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const list = (rows: { value: string; users: number }[], render: (v: string) => React.ReactNode) => (
    <div className="space-y-1">
      {rows.slice(0, 5).map((r) => (
        <div key={r.value} className="flex items-center justify-between gap-3 text-xs">
          <span className="min-w-0 truncate">{render(r.value)}</span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{r.users}</span>
        </div>
      ))}
      {rows.length === 0 && <p className="text-xs text-muted-foreground">—</p>}
    </div>
  );

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <RadioTower className="h-4 w-4 text-primary" />
            Right now
          </CardTitle>
          <CardDescription>Active users in the last 30 minutes. Refreshes every minute.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="sr-only">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex items-start gap-2 rounded-sm border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs leading-snug text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : !data ? (
          <div className="h-24 animate-pulse rounded-sm bg-surface-sunken" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-3xl font-semibold tabular-nums">{data.active_users ?? '—'}</p>
              <p className="text-xs text-muted-foreground">on the site</p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Pages</p>
              {list(data.pages, (v) => v)}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Countries</p>
              {list(data.countries, (v) => (
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true">{countryFlag(v)}</span>
                  {countryName(v, v)}
                </span>
              ))}
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Devices</p>
              {list(data.devices, (v) => <span className="capitalize">{v}</span>)}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
