import React, { useState, useEffect, useCallback } from 'react';
import { History, Loader2, TrendingDown, ArrowDownRight, ArrowUpRight, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  CreditsService,
  creditOperationCategory,
  type CreditTransaction,
  type CreditSpendSummary,
} from '@/services/credits.service';
import { workspaceCreditsService, type WorkspaceCreditStatus } from '@/services/workspaceCreditsService';

const creditsService = new CreditsService();

const PAGE_SIZE = 20;

const WINDOWS: { label: string; days: number }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

// Category → tailwind accent for the breakdown bars / badges. Falls back to muted.
const CATEGORY_COLOR: Record<string, string> = {
  'AI Assistant': 'bg-violet-500',
  'Interior Design': 'bg-sky-500',
  'Video Generation': 'bg-rose-500',
  'Image Generation': 'bg-fuchsia-500',
  '3D / VR Worlds': 'bg-amber-500',
  'Image & Material Tools': 'bg-teal-500',
  'Presentation Sheets': 'bg-indigo-500',
  'Job Research': 'bg-emerald-500',
  'Mention Monitoring': 'bg-cyan-500',
  'Price Monitoring': 'bg-lime-500',
  'SEO Toolkit': 'bg-orange-500',
  Other: 'bg-muted-foreground/50',
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const CreditUsageHistory: React.FC = () => {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [pool, setPool] = useState<WorkspaceCreditStatus | null>(null);
  const [windowDays, setWindowDays] = useState(30);
  const [summary, setSummary] = useState<CreditSpendSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!user) return;
    setSummaryLoading(true);
    try {
      const result = await creditsService.getSpendSummary(windowDays);
      setSummary(result);
    } catch (error) {
      console.error('Error loading spend summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  }, [user, windowDays]);

  const loadFirstPage = useCallback(async () => {
    if (!user) return;
    setListLoading(true);
    try {
      const { data, count } = await creditsService.getTransactions(PAGE_SIZE, 0);
      setTransactions(data || []);
      setHasMore((data?.length || 0) < (count || 0));
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setListLoading(false);
    }
  }, [user]);

  const loadMore = async () => {
    if (!user) return;
    setLoadingMore(true);
    try {
      const { data, count } = await creditsService.getTransactions(PAGE_SIZE, transactions.length);
      const next = [...transactions, ...(data || [])];
      setTransactions(next);
      setHasMore(next.length < (count || 0));
    } catch (error) {
      console.error('Error loading more transactions:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeWorkspaceId) { setPool(null); return; }
      try {
        const s = await workspaceCreditsService.getStatus(activeWorkspaceId);
        if (!cancelled) setPool(s?.has_pool ? s : null);
      } catch {
        if (!cancelled) setPool(null);
      }
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  const topCategory = summary?.by_category?.[0];
  const maxCategorySpend = topCategory?.total_spent || 1;

  return (
    <div className="space-y-6">
      {/* Workspace shared-pool banner — shown when the active workspace is on shared credits */}
      {pool && (
        <Card className="rounded-2xl border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-medium">You're spending from your workspace pool</div>
                <div className="text-xs text-muted-foreground">
                  Pool balance <span className="font-semibold text-foreground">{pool.pool_balance.toFixed(2)}</span> credits
                  {pool.monthly_limit != null && (
                    <> · your monthly limit {pool.monthly_limit.toFixed(0)} ({pool.spent_this_month.toFixed(2)} used)</>
                  )}
                </div>
              </div>
            </div>
            {pool.monthly_limit != null && (
              <Badge variant="secondary">
                {Math.max(0, (pool.remaining_allowance ?? 0)).toFixed(2)} left this month
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Spend summary */}
      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-primary" />
                Spend Summary
              </CardTitle>
              <CardDescription>Where your credits went over the selected period</CardDescription>
            </div>
            <div className="flex gap-1 rounded-full bg-muted p-1">
              {WINDOWS.map((w) => (
                <button
                  key={w.days}
                  type="button"
                  onClick={() => setWindowDays(w.days)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    windowDays === w.days
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {summaryLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-2xl font-bold text-red-500">
                    {(summary?.total_spent ?? 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">Credits spent</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-500">
                    {(summary?.total_added ?? 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">Credits added / refunded</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{summary?.txn_count ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Charged operations</div>
                </div>
              </div>

              {summary && summary.by_category.length > 0 ? (
                <div className="space-y-3 border-t border-border pt-4">
                  {(() => {
                    // Roll raw operation_types up into friendly categories.
                    const grouped = new Map<string, number>();
                    for (const c of summary.by_category) {
                      const label = creditOperationCategory(c.operation_type);
                      grouped.set(label, (grouped.get(label) || 0) + Number(c.total_spent));
                    }
                    const rows = Array.from(grouped.entries()).sort((a, b) => b[1] - a[1]);
                    const maxVal = Math.max(rows[0]?.[1] || maxCategorySpend, 1);
                    return rows.map(([label, total]) => (
                      <div key={label} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 rounded-full ${CATEGORY_COLOR[label] || CATEGORY_COLOR.Other}`} />
                            {label}
                          </span>
                          <span className="font-semibold tabular-nums">{total.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${CATEGORY_COLOR[label] || CATEGORY_COLOR.Other}`}
                            style={{ width: `${Math.max((total / maxVal) * 100, 2)}%` }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                  No credits spent in this period.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent activity */}
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>Every credit charge, refund, and top-up, newest first</CardDescription>
        </CardHeader>
        <CardContent>
          {listLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No activity yet. Your credit charges will show up here.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((t) => {
                const isSpend = Number(t.amount) < 0;
                const category = creditOperationCategory(
                  (t.metadata?.operation_type as string) ?? t.transaction_type,
                );
                return (
                  <div key={t.id} className="flex items-center gap-3 py-3">
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                        isSpend ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'
                      }`}
                    >
                      {isSpend ? (
                        <ArrowDownRight className="h-4 w-4" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {t.description || category}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">
                          {category}
                        </Badge>
                        <span>{formatDate(t.created_at)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        className={`text-sm font-semibold tabular-nums ${
                          isSpend ? 'text-red-500' : 'text-green-500'
                        }`}
                      >
                        {isSpend ? '' : '+'}
                        {Number(t.amount).toFixed(2)}
                      </div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        bal {(t.balance_after ?? 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {hasMore && !listLoading && (
            <div className="pt-4 text-center">
              <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
