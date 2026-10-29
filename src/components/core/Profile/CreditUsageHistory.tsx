import React, { useState, useEffect, useMemo } from 'react';
import { formatDate as formatDateValue } from '@/utils/datetime';
import { Download, Loader2, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  CreditsService,
  creditOperationCategory,
  type CreditSpendCategoryLabel,
  type CreditStatement,
} from '@/services/credits.service';
import { workspaceCreditsService, type WorkspaceCreditStatus } from '@/services/workspaceCreditsService';
import { downloadCsv, toCsv } from '@/modules/finance/services/accountingExportService';

const creditsService = new CreditsService();

// Keyed by the category union, so a new category cannot ship without a colour and quietly render as "Other".
const CATEGORY_COLOR: Record<CreditSpendCategoryLabel, string> = {
  'AI Assistant': 'bg-violet-500',
  'SEO Toolkit': 'bg-orange-500',
  'Mention Monitoring': 'bg-cyan-500',
  'Price Monitoring': 'bg-lime-500',
  'Job Research': 'bg-emerald-500',
  'B2B & Company Research': 'bg-blue-500',
  'Web Research': 'bg-yellow-500',
  'Knowledge Base': 'bg-indigo-400',
  'Catalog & Products': 'bg-stone-500',
  Stock: 'bg-neutral-500',
  'Finance & Documents': 'bg-green-600',
  CRM: 'bg-red-500',
  HR: 'bg-orange-700',
  'Real Estate': 'bg-amber-700',
  Messaging: 'bg-green-500',
  Automations: 'bg-zinc-500',
  'Inbox & Email': 'bg-pink-500',
  'Social Content': 'bg-rose-400',
  'Interior Design': 'bg-sky-500',
  'Video Generation': 'bg-rose-500',
  'Image Generation': 'bg-fuchsia-500',
  '3D / VR Worlds': 'bg-amber-500',
  'Image & Material Tools': 'bg-teal-500',
  'Presentation Sheets': 'bg-indigo-500',
  'AI Assessment': 'bg-purple-500',
  'Account Adjustments': 'bg-slate-500',
  Other: 'bg-muted-foreground/50',
};

const TOPUP_LABEL: Record<string, string> = {
  purchase: 'Credit purchase',
  bonus: 'Bonus credits',
  monthly_grant: 'Monthly grant',
};

const formatDay = (value: string) => formatDateValue(value);
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

interface StatementRow {
  key: string;
  date: string;
  description: string;
  amount: number;
  dot?: string;
}

export const CreditUsageHistory: React.FC = () => {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const [pool, setPool] = useState<WorkspaceCreditStatus | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [months, setMonths] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

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
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    const [y, m] = month.split('-').map(Number);
    creditsService.getStatement(y, m)
      .then((s) => {
        if (cancelled) return;
        setStatement(s);
        setMonths(s.months);
      })
      .catch((error) => {
        console.error('Error loading credit statement:', error);
        if (!cancelled) setFailed(true);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, month]);

  const monthOptions = useMemo(
    () => Array.from(new Set([monthKey(new Date()), ...months])).sort().reverse(),
    [months],
  );

  const periodRange = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return `${first.toLocaleDateString(undefined, opts)} – ${last.toLocaleDateString(undefined, opts)}`;
  }, [month]);

  const rows = useMemo<StatementRow[]>(() => {
    if (!statement) return [];
    const topups = statement.topups.map((t) => ({
      key: t.id,
      date: formatDay(t.created_at),
      description: t.description || TOPUP_LABEL[t.transaction_type] || 'Credits added',
      amount: Number(t.amount),
    }));
    const byCategory = new Map<CreditSpendCategoryLabel, { net: number; count: number }>();
    for (const u of statement.usage) {
      const label = creditOperationCategory(u.operation_type);
      const cur = byCategory.get(label) ?? { net: 0, count: 0 };
      byCategory.set(label, { net: cur.net + Number(u.net), count: cur.count + Number(u.txn_count) });
    }
    const usage = Array.from(byCategory.entries())
      .filter(([, v]) => Math.abs(v.net) >= 0.005)
      .sort((a, b) => a[1].net - b[1].net)
      .map(([label, v]) => ({
        key: `usage-${label}`,
        date: periodRange,
        description: v.net < 0
          ? `${label} — ${v.count.toLocaleString()} ${v.count === 1 ? 'operation' : 'operations'}`
          : `${label} — refunds & adjustments`,
        amount: v.net,
        dot: CATEGORY_COLOR[label] || CATEGORY_COLOR.Other,
      }));
    return [...topups, ...usage];
  }, [statement, periodRange]);

  const totals = useMemo(() => {
    const added = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
    const spent = rows.filter((r) => r.amount < 0).reduce((s, r) => s - r.amount, 0);
    return { added, spent };
  }, [rows]);

  const chart = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const byDay = new Map((statement?.daily ?? []).map((d) => [d.day, Number(d.spent)]));
    const bars = Array.from({ length: daysInMonth }, (_, i) => {
      const day = `${month}-${String(i + 1).padStart(2, '0')}`;
      return { day: i + 1, spent: byDay.get(day) ?? 0 };
    });
    return { bars, max: Math.max(...bars.map((b) => b.spent)) };
  }, [statement, month]);

  const handleDownload = () => {
    if (!statement) return;
    const csv = toCsv(
      ['Date', 'Description', 'Amount (credits)'],
      [
        ['', 'Starting balance', statement.starting_balance.toFixed(2)],
        ...rows.map((r) => [r.date, r.description, r.amount.toFixed(2)]),
        ['', 'Ending balance', statement.ending_balance.toFixed(2)],
      ],
    );
    downloadCsv(`credit-statement-${month}.csv`, csv);
  };

  return (
    <div className="space-y-6">
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

      <Card className="rounded-2xl">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Statement</CardTitle>
              <CardDescription>Credits added and spent, month by month</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-44" aria-label="Statement month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((k) => (
                    <SelectItem key={k} value={k}>{monthLabel(k)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleDownload}
                disabled={!statement || loading}
                aria-label="Download statement as CSV"
                title="Download CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : failed || !statement ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Could not load this statement. Try another month or refresh.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-t border-hairline bg-surface-sunken px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Ending balance</span>
                <span className="font-semibold tabular-nums">{fmt(statement.ending_balance)}</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount (credits)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                        No credit activity in {monthLabel(month)}.
                      </TableCell>
                    </TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{r.date}</TableCell>
                      <TableCell className="text-sm">
                        <span className="flex items-center gap-2">
                          {r.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${r.dot}`} />}
                          <span className="min-w-0 truncate">{r.description}</span>
                        </span>
                      </TableCell>
                      <TableCell
                        className={`text-right text-sm font-semibold tabular-nums ${
                          r.amount < 0 ? 'text-red-500' : 'text-green-500'
                        }`}
                      >
                        {signed(r.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between border-t border-hairline bg-surface-sunken px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Starting balance</span>
                <span className="font-semibold tabular-nums">{fmt(statement.starting_balance)}</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle>Daily spend</CardTitle>
          <CardDescription>{monthLabel(month)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-2xl font-bold tabular-nums text-red-500">{fmt(totals.spent)}</div>
              <div className="text-xs text-muted-foreground">Credits spent</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-green-500">{fmt(totals.added)}</div>
              <div className="text-xs text-muted-foreground">Added / refunded</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {(statement?.usage ?? []).reduce((s, u) => s + Number(u.txn_count), 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">Charged operations</div>
            </div>
          </div>
          <div className="flex h-40 items-end gap-0.5 border-b border-hairline" role="img" aria-label="Credits spent per day">
            {chart.bars.map((b) => (
              <div
                key={b.day}
                className="flex h-full flex-1 items-end"
                title={`${monthLabel(month).split(' ')[0]} ${b.day}: ${fmt(b.spent)} credits`}
              >
                <div
                  className="w-full rounded-t-sm bg-primary"
                  style={{ height: b.spent > 0 ? `${Math.max((b.spent / chart.max) * 100, 2)}%` : 0 }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>1</span>
            <span>Peak day {fmt(chart.max)}</span>
            <span>{chart.bars.length}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
