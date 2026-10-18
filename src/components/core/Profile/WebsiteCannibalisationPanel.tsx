import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, GitMerge, Loader2, SearchX } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState, HubFilterSelect, HubResetFilters, HubToolbar } from '@/components/core/hub';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import {
  userWebsitesService,
  type CannibalItem,
  type CannibalReport,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { compact } from './seo/seoMetrics';
import { useTableSegments } from './seo/useTableSegments';
import { safeHref } from '@/utils/safeUrl';
import { KeywordActions } from './seo/KeywordActions';
import { useToast } from '@/hooks/use-toast';

type SortKey = 'impressions' | 'pages' | 'position' | 'severity' | 'query';
const SORT_OPTIONS: { value: SortKey; label: string; dir: 'asc' | 'desc' }[] = [
  { value: 'impressions', label: 'Most impressions', dir: 'desc' },
  { value: 'severity', label: 'Most severe', dir: 'desc' },
  { value: 'pages', label: 'Most competing pages', dir: 'desc' },
  { value: 'position', label: 'Best position', dir: 'asc' },
  { value: 'query', label: 'Query A–Z', dir: 'asc' },
];
const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
const SEVERITY_LABELS: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
const SPLIT_LABELS: Record<string, string> = {
  misdirected: 'Sending clicks to the weaker page',
  aligned: 'Leader is the best converter',
};

/** Websites → Search Performance → Competing pages. */

function severityVariant(s: string): 'error' | 'warning' | 'neutral' {
  return s === 'high' ? 'error' : s === 'medium' ? 'warning' : 'neutral';
}

/** Path only — the domain is the same on every row and repeating it costs the width. */
function pathOf(url: string): string {
  try { return new URL(url).pathname || '/'; } catch { return url; }
}

/** Pick the page that keeps the query; every other competing page 301s to it. */
interface ConsolidateCtx {
  websiteId: string;
  mainPage: string | null;
  articles: Map<string, { id: string; title: string | null }>;
  onDecided: () => void;
}

function ConsolidateDialog({ item, onClose, ctx }: { item: CannibalItem; onClose: () => void; ctx: ConsolidateCtx }) {
  const { toast } = useToast();
  const bestConverter = [...item.pages].sort((a, b) => b.clicks - a.clicks)[0];
  const [canonical, setCanonical] = useState(ctx.mainPage ?? (item.leader_is_best_converter ? item.pages[0] : bestConverter)?.page ?? '');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const competingArticles = item.pages
    .filter((p) => p.page !== canonical)
    .map((p) => ({ page: p.page, article: ctx.articles.get(p.page.replace(/\/+$/, '')) }))
    .filter((x): x is { page: string; article: { id: string; title: string | null } } => !!x.article);

  const choose = async () => {
    setSaving(true);
    try {
      await userWebsitesService.setCannibalisationMainPage(ctx.websiteId, item.query, canonical);
      toast({ title: `Main page for "${item.query}" saved`, description: pathOf(canonical) });
      ctx.onDecided();
    } catch (e: any) {
      toast({ title: 'Not saved', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const refresh = async (articleId: string, page: string) => {
    if (!window.confirm('Draft a refresh of this article so it stops competing for the query? It is charged at the real model cost; the changes are proposals you approve.')) return;
    setRefreshing(articleId);
    try {
      const r = await userWebsitesService.refreshArticle(articleId,
        `cannibalisation: "${item.query}" now belongs to ${canonical}. Shift ${pathOf(page)} to a different intent or hand the overlapping part to the main page, and link to it.`);
      toast(r.proposed > 0 || r.meta_proposed
        ? { title: 'Refresh drafted', description: `${r.proposed} change${r.proposed === 1 ? '' : 's'} proposed. Review them in the article.` }
        : { title: 'Nothing to change', description: r.message ?? 'The refresh found nothing to propose for this article.' });
    } catch (e: any) {
      toast({ title: 'Refresh failed', description: e.message, variant: 'destructive' });
    } finally { setRefreshing(null); }
  };
  const others = item.pages.filter((p) => p.page !== canonical);
  const lines = others.map((p) => `Redirect 301 ${pathOf(p.page)} ${canonical}`).join('\n');

  const copy = async () => {
    try { await navigator.clipboard.writeText(lines); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Consolidate “{item.query}”</DialogTitle>
          <DialogDescription>
            Keep one page for this query. Move anything the others say that it does not into it first, then redirect them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {item.pages.map((p) => (
            <label key={p.page} className="flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1 hover:bg-surface-hover">
              <input type="radio" name="canonical" checked={canonical === p.page} onChange={() => setCanonical(p.page)} />
              <span className="min-w-0 flex-1 truncate text-sm">{pathOf(p.page)}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {p.position != null ? `#${p.position}` : '—'} · {compact(p.clicks)} clicks
              </span>
            </label>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Redirects (Apache .htaccess format)</span>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void copy()} disabled={!others.length}>
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-sm border border-hairline bg-surface-sunken p-3 text-xs">{lines || 'Pick the page to keep.'}</pre>
          <p className="text-[11px] text-muted-foreground">
            On WordPress, the Redirection plugin takes the same pairs. Update internal links to the kept page too, or each one costs a hop.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          <Button size="sm" disabled={saving || !canonical || canonical === ctx.mainPage} onClick={() => void choose()}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            {canonical === ctx.mainPage ? 'This is the main page' : 'Make this the main page'}
          </Button>
          {competingArticles.map(({ page, article }) => (
            <Button key={article.id} size="sm" variant="outline" disabled={refreshing !== null} onClick={() => void refresh(article.id, page)}>
              {refreshing === article.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Refresh {article.title ? `“${article.title}”` : pathOf(page)}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ item, websiteId, ctx }: { item: CannibalItem; websiteId: string; ctx: ConsolidateCtx }) {
  // Google's preferred page is the one it shows most; the best converter is the one
  // that earns clicks. When they differ, the split is not just theoretical — it is
  // actively sending people to the weaker page.
  const leader = item.pages[0];
  const bestConverter = [...item.pages].sort((a, b) => b.clicks - a.clicks)[0];
  const [consolidating, setConsolidating] = useState(false);

  return (
    <div className="rounded-sm border border-hairline p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge variant={severityVariant(item.severity)}>{item.severity}</Badge>
          <span className="truncate text-sm font-medium text-foreground">{item.query}</span>
          {ctx.mainPage && <Badge variant="success" className="shrink-0">Main page: {pathOf(ctx.mainPage)}</Badge>}
        </div>
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {compact(item.impressions)} impressions · {item.page_count} pages
          {item.best_position != null ? ` · best #${item.best_position}` : ''}
          <KeywordActions websiteId={websiteId} keyword={item.query} />
          <Button size="sm" variant="outline" className="h-7" onClick={() => setConsolidating(true)}>Consolidate</Button>
        </span>
      </div>
      {consolidating && <ConsolidateDialog item={item} ctx={ctx} onClose={() => setConsolidating(false)} />}

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
              href={safeHref(p.page)}
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
  const [decisions, setDecisions] = useState<Map<string, string>>(new Map());
  const [articles, setArticles] = useState<Map<string, { id: string; title: string | null }>>(new Map());
  const loadDecisions = useCallback(() => {
    void userWebsitesService.cannibalisationDecisions(website.id).then(setDecisions).catch(() => setDecisions(new Map()));
  }, [website.id]);
  useEffect(() => {
    loadDecisions();
    void userWebsitesService.publishedArticleUrls(website.id).then(setArticles).catch(() => setArticles(new Map()));
  }, [website.id, loadDecisions]);

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

  const items = report?.items ?? [];
  const t = useTableSegments<CannibalItem, SortKey, 'severity' | 'split'>({
    rows: items,
    searchText: (it) => [it.query, ...it.pages.map((p) => p.page)],
    sorters: {
      impressions: (it) => it.impressions,
      pages: (it) => it.page_count,
      position: (it) => it.best_position,
      severity: (it) => SEVERITY_RANK[it.severity] ?? 0,
      query: (it) => it.query,
    },
    initialSort: { key: 'impressions', dir: 'desc' },
    facets: {
      severity: { label: 'Severity', valueOf: (it) => it.severity, labels: SEVERITY_LABELS, order: ['high', 'medium', 'low'] },
      split: {
        label: 'Click split',
        valueOf: (it) => (it.leader_is_best_converter ? 'aligned' : 'misdirected'),
        labels: SPLIT_LABELS,
        order: ['misdirected', 'aligned'],
      },
    },
  });

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent>
      </Card>
    );
  }

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
        {items.length > 0 && (
          <HubToolbar
            className="rounded-sm border"
            search={t.query}
            onSearchChange={t.setQuery}
            searchPlaceholder="Search query or page"
            filters={
              <>
                <HubFilterSelect {...t.filterSelect('severity', 'Any severity')} />
                <HubFilterSelect {...t.filterSelect('split', 'Any click split')} />
                <HubFilterSelect
                  label="Sort"
                  allValue="impressions"
                  value={t.sort.key}
                  options={SORT_OPTIONS}
                  onChange={(v) => {
                    const opt = SORT_OPTIONS.find((o) => o.value === v);
                    if (opt) t.setSort({ key: opt.value, dir: opt.dir });
                  }}
                />
              </>
            }
            actions={<HubResetFilters count={t.activeCount} onReset={t.clear} />}
          />
        )}
        {items.length > 0 && t.visible.length === 0 && (
          <HubEmptyState
            variant="filtered"
            icon={SearchX}
            title="No competing queries match these filters"
            description={`All ${items.length} queries are still here; the search or a filter is hiding them.`}
            action={<Button size="sm" variant="outline" onClick={t.clear}>Clear filters</Button>}
          />
        )}
        {t.visible.map((it) => (
          <Row key={it.query} item={it} websiteId={website.id}
            ctx={{ websiteId: website.id, mainPage: decisions.get(it.query) ?? null, articles, onDecided: loadDecisions }} />
        ))}
      </CardContent>
    </Card>
  );
};

export default WebsiteCannibalisationPanel;
