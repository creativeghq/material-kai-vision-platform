import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { userWebsitesService, type GaBreakdowns } from '@/services/userWebsitesService';

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
