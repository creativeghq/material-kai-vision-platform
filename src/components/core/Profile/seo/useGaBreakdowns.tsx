import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { userWebsitesService, type GaBreakdowns } from '@/services/userWebsitesService';
import {
  GA_STORED_WINDOW, GA_WINDOWS, drillAsBreakdown, failedBreakdown,
  type GaBreakdown, type GaDrillQuery, type GaWindow,
} from './gaBreakdowns';

export function useGaWindow(): [GaWindow, (w: GaWindow) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('ga_days'));
  const days = (GA_WINDOWS as readonly number[]).includes(raw) ? (raw as GaWindow) : GA_STORED_WINDOW;
  const set = useCallback((w: GaWindow) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (w === GA_STORED_WINDOW) next.delete('ga_days'); else next.set('ga_days', String(w));
      return next;
    }, { replace: true });
  }, [setParams]);
  return [days, set];
}

export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A live GA slice; `null` asks nothing. A failure is a `collector_failed` breakdown, never an empty one. */
export function useGaSlice(websiteId: string, query: GaDrillQuery | null): { data: GaBreakdown | null; loading: boolean } {
  const [data, setData] = useState<GaBreakdown | null>(null);
  const [loading, setLoading] = useState(false);
  const key = query ? JSON.stringify(query) : '';

  useEffect(() => {
    if (!key) { setData(null); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    const q = JSON.parse(key) as GaDrillQuery;
    (async () => {
      try {
        const r = await userWebsitesService.gaDrill(websiteId, q);
        if (!cancelled) setData(drillAsBreakdown(r));
      } catch (e: any) {
        if (!cancelled) setData(failedBreakdown(e?.message || 'Could not query Analytics.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [websiteId, key]);

  return { data, loading };
}

/**
 * The GA breakdowns for one site, plus the screen to render INSTEAD of a pane. `gate` is shared so
 * three panes cannot each invent their own answer to "Analytics has not been connected".
 */
export function useGaBreakdowns(websiteId: string): {
  data: GaBreakdowns | null;
  loading: boolean;
  error: string | null;
  gate: React.ReactElement | null;
} {
  const [data, setData] = useState<GaBreakdowns | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const r = await userWebsitesService.gaBreakdowns(websiteId);
        if (!cancelled) { setData(r); setError(null); }
      } catch (e: any) {
        if (!cancelled) { setData(null); setError(e?.message || 'Could not load Analytics'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [websiteId]);

  let gate: React.ReactElement | null = null;
  if (loading && !data) {
    gate = (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-14">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  } else if (error) {
    gate = (
      <Card className="dashboard-card">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  return { data, loading, error, gate };
}
