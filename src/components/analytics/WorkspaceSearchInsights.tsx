import { useEffect, useState } from 'react';
import { SearchX, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import {
  type InsightsState, type SearchInsights, coverageVerdict, insightsOutcome,
} from './searchInsightsState';

const TONE: Record<string, 'success' | 'warning' | 'error' | 'neutral'> = {
  good: 'success', warn: 'warning', bad: 'error', unknown: 'neutral',
};

export function WorkspaceSearchInsights({ days = 30 }: { days?: number }) {
  const { activeWorkspaceId } = useWorkspace();
  const [state, setState] = useState<InsightsState>({ kind: 'loading' });

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    supabase
      .rpc('get_workspace_search_insights', { p_workspace_id: activeWorkspaceId, p_days: days })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { setState({ kind: 'failed', reason: error.message }); return; }
        if (!data) { setState({ kind: 'failed', reason: 'This workspace did not answer.' }); return; }
        setState({ kind: 'loaded', data: data as unknown as SearchInsights });
      });
    return () => { cancelled = true; };
  }, [activeWorkspaceId, days]);

  const outcome = insightsOutcome(state);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-sans text-base">
          <SearchX className="h-4 w-4" />
          What people looked for in your catalogue
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {outcome.kind === 'loading' && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {outcome.kind === 'failed' && (
          <p className="flex items-start gap-2 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              <span className="font-semibold">Could not load search activity</span> — this is not
              a statement that nobody searched. {outcome.reason}
            </span>
          </p>
        )}

        {outcome.kind === 'no_searches' && (
          <p className="text-sm text-muted-foreground">
            Nobody searched your catalogue in the last {outcome.windowDays} days.
          </p>
        )}

        {outcome.kind === 'ready' && (() => {
          const d = outcome.data;
          const v = coverageVerdict(d.zero_result_share);
          return (
            <>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
                <span className="text-sm">
                  <span className="text-2xl font-semibold tabular-nums">{d.searches}</span>
                  <span className="ml-2 text-muted-foreground">searches in {d.window_days} days</span>
                </span>
                <span className="text-sm">
                  <span className="text-2xl font-semibold tabular-nums">{d.answered}</span>
                  <span className="ml-2 text-muted-foreground">found something</span>
                </span>
                <Badge variant={TONE[v.tone]}>{v.label}</Badge>
              </div>

              {d.unmet.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">
                    Asked for, and you have none
                  </h4>
                  <ul className="space-y-1">
                    {d.unmet.map((u) => (
                      <li
                        key={u.query}
                        className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 text-sm"
                      >
                        <span>{u.query}</span>
                        <span className="tabular-nums text-muted-foreground">{u.searches}×</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {d.unmatched_terms.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Words your catalogue does not carry</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {d.unmatched_terms.map((t) => (
                      <Badge key={t.term} variant="neutral">
                        {t.term}
                        <span className="ml-1.5 tabular-nums opacity-70">{t.occurrences}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {d.top_products.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">Most engaged products</h4>
                  <ul className="space-y-1">
                    {d.top_products.map((p) => (
                      <li
                        key={p.product_id}
                        className="flex items-center justify-between gap-3 border-b border-hairline py-1.5 text-sm"
                      >
                        <span>{p.name}</span>
                        <span className="tabular-nums text-muted-foreground">{p.events}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          );
        })()}
      </CardContent>
    </Card>
  );
}
