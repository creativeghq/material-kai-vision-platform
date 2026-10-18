import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Loader2, Target } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { formatNumber } from '@/utils/decimal';
import { useLaunchQuickStart } from './dashboardPrimitives';

export interface WebsiteOpportunity {
  kind: string;
  subject: string;
  subject_kind: string;
  affected: number;
  reason: string;
  evidence: Record<string, unknown>;
  score: number;
  status: string;
}

const KIND_LABEL: Record<string, string> = {
  quick_win: 'Quick win',
  refresh: 'Refresh',
  consolidate: 'Consolidate',
  new_page: 'New page',
  not_crawled: 'Not crawled',
  crawled_not_indexed: 'Crawled, not indexed',
  fix_page: 'Fix page',
};

const KIND_TONE: Record<string, 'success' | 'warning' | 'info' | 'neutral'> = {
  quick_win: 'success', refresh: 'warning', consolidate: 'warning', new_page: 'info',
};

/** Which dashboard tab acts on each kind. */
export const OPPORTUNITY_TAB: Record<string, string> = {
  quick_win: 'gsc',
  refresh: 'articles',
  consolidate: 'gsc/cannibalisation',
  new_page: 'articles',
  not_crawled: 'health/crawl',
  crawled_not_indexed: 'health/crawl',
  fix_page: 'health/pages',
};

const ACTION_LABEL: Record<string, string> = {
  quick_win: 'Search Console',
  refresh: 'Articles',
  consolidate: 'Cannibalisation',
  new_page: 'Write it',
  not_crawled: 'Crawl',
  crawled_not_indexed: 'Crawl',
  fix_page: 'Pages',
};

/** Websites → Overview: the top of get_website_opportunities, one action per row. */
export const WebsiteOpportunitiesCard: React.FC<{ websiteId: string; onOpenTab?: (tab: string) => void }> = ({ websiteId, onOpenTab }) => {
  const launchQuickStart = useLaunchQuickStart();
  const [rows, setRows] = useState<WebsiteOpportunity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc('get_website_opportunities' as never, { p_website_id: websiteId } as never);
    if (rpcErr) { setError(rpcErr.message); setRows([]); return; }
    setRows((data ?? []) as WebsiteOpportunity[]);
  }, [websiteId]);

  useEffect(() => { void load(); }, [load]);

  const actionable = (rows ?? []).filter((r) => r.status === 'ok').slice(0, 10);
  const unavailable = (rows ?? []).filter((r) => r.status !== 'ok');

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          What to do next
        </CardTitle>
        <CardDescription>
          Ranked from Search Console, the crawl, your articles and your competitors. Each row says why it is here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows === null ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">Could not rank the opportunities: {error}</p>
        ) : actionable.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing actionable from the data collected so far{unavailable.length ? ' — the notes below say what is missing' : ''}.
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {actionable.map((o, i) => (
              <div key={`${o.kind}-${o.subject}-${i}`} className="flex items-start gap-3 py-2">
                <Badge variant={KIND_TONE[o.kind] ?? 'neutral'} className="mt-0.5 shrink-0">{KIND_LABEL[o.kind] ?? o.kind}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {o.subject}
                    {o.affected > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground tabular-nums">×{formatNumber(o.affected)}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{o.reason}</p>
                </div>
                {o.kind === 'new_page' ? (
                  <Button size="sm" variant="ghost" className="shrink-0"
                    onClick={() => launchQuickStart('seo-article', 'Generate full article', websiteId, o.subject)}>
                    {ACTION_LABEL.new_page} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                ) : onOpenTab && OPPORTUNITY_TAB[o.kind] && (
                  <Button size="sm" variant="ghost" className="shrink-0" onClick={() => onOpenTab(OPPORTUNITY_TAB[o.kind])}>
                    {ACTION_LABEL[o.kind]} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        {unavailable.length > 0 && (
          <div className="space-y-1 border-t border-hairline pt-2 text-xs text-muted-foreground">
            {unavailable.map((u, i) => (
              <div key={`${u.kind}-${i}`}>
                <span className="font-medium text-foreground">{KIND_LABEL[u.kind] ?? u.kind}:</span> {u.reason}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
