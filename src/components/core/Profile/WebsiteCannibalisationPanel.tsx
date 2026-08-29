import React, { useCallback, useEffect, useState } from 'react';
import { GitMerge, Loader2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  userWebsitesService,
  type CannibalItem,
  type CannibalReport,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { compact } from './seo/seoMetrics';

/**
 * Websites → Search Performance → Competing pages.
 *
 * Google picks ONE page per query per site. When two of yours qualify it may not
 * pick the one you would, and the signal that should have gone to a single page is
 * split — so neither ranks as well as one would.
 *
 * This is invisible in every other view by construction: each page, looked at
 * alone, is fine. It only appears when you group Search Console rows by QUERY and
 * notice more than one of your own URLs under it — which is why it needs its own
 * surface rather than a column somewhere.
 *
 * Everything here is derived by `get_website_cannibalisation`; this formats.
 */

function severityVariant(s: string): 'error' | 'warning' | 'neutral' {
  return s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'neutral';
}

/** Path only — the domain is the same on every row and repeating it costs the width. */
function pathOf(url: string): string {
  try { return new URL(url).pathname || '/'; } catch { return url; }
}

function Row({ item }: { item: CannibalItem }) {
  // Google's preferred page is the one it shows most; the best converter is the one
  // that earns clicks. When they differ, the split is not just theoretical — it is
  // actively sending people to the weaker page.
  const leader = item.pages[0];
  const bestConverter = [...item.pages].sort((a, b) => b.clicks - a.clicks)[0];

  return (
    <div className="rounded-sm border border-hairline p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={severityVariant(item.severity)}>{item.severity}</Badge>
          <span className="truncate text-sm font-medium text-foreground">{item.query}</span>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {compact(item.impressions)} impressions · {item.page_count} pages
          {item.best_position != null ? ` · best #${item.best_position}` : ''}
        </span>
      </div>

      {!item.leader_is_best_converter && bestConverter && leader && (
        <p className="mt-1.5 text-[11px] leading-snug text-amber-800 dark:text-amber-300">
          Google mostly shows <b>{pathOf(leader.page)}</b>, but <b>{pathOf(bestConverter.page)}</b> earns more
          clicks from fewer impressions — the split is sending people to the weaker page.
        </p>
      )}

      <ul className="mt-2 space-y-1">
        {item.pages.map((p) => (
          <li key={p.page} className="flex items-baseline gap-2 rounded-sm bg-surface-sunken px-2 py-1">
            <a
              href={p.page}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-xs text-primary hover:underline"
            >
              {pathOf(p.page)}
            </a>
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {p.position != null ? `#${p.position}` : '—'} · {compact(p.impressions)} impr · {compact(p.clicks)} clicks
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const WebsiteCannibalisationPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const [report, setReport] = useState<CannibalReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await userWebsitesService.cannibalisation(website.id, 90, 10));
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

  const items = report?.items ?? [];

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitMerge className="h-4 w-4 text-primary" />
          Pages competing with each other
        </CardTitle>
        <CardDescription>
          Queries where more than one of your pages shows up. Google picks one, the ranking signal
          splits, and neither does as well as a single page would.
          {report?.queries_checked ? <> · {report.queries_checked} queries checked over {report.window_days} days</> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {report?.note && (
          <p className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
            {report.note}
          </p>
        )}
        {items.map((it) => <Row key={it.query} item={it} />)}
      </CardContent>
    </Card>
  );
};

export default WebsiteCannibalisationPanel;
