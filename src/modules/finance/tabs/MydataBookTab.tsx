/**
 * myDATA book (ΑΑΔΕ) — what the tax authority holds, and nothing else.
 *
 * This is the platform's copy of the taxpayer's own Συνοπτικό Βιβλίο at
 * www1.aade.gr/saadeapps2/bookkeeper-web — month by month, income against expenses,
 * in AADE's own columns and AADE's own arithmetic.
 *
 * It is deliberately NOT reconciled with anything. Every other figure in Finance is
 * derived from our tables; this one is derived from theirs, so putting them side by
 * side is a real check. Merge them, difference them into a single "correct" number,
 * or let one fall back to the other, and the check stops existing — you would be
 * confirming our arithmetic against itself.
 *
 * A month with no figures renders WHY, never a zero: a plausible 0,00 in a tax book
 * is the exact failure this surface is here to catch.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Download, Loader2, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { formatDate, toLocalISODate, todayLocalISO } from '@/utils/datetime';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import {
  hasFigures,
  mydataBookService,
  type BookMonthRow,
  type BookStatus,
  type BookSyncState,
} from '@/modules/finance/services/mydataBookService';

/** AADE's own columns, in AADE's own order. `key` is the RPC field; the label is the
 *  English rendering of the Greek column heading the taxpayer sees on myAADE. */
const MONEY_COLUMNS: { key: keyof BookMonthRow; label: string; hint: string }[] = [
  { key: 'net_value', label: 'Net value', hint: 'Καθαρή Αξία' },
  { key: 'vat_amount', label: 'VAT', hint: 'ΦΠΑ' },
  { key: 'withheld_amount', label: 'Withheld', hint: 'Φόροι Παρακρ.' },
  { key: 'other_taxes_amount', label: 'Other taxes', hint: 'Λοιποί Φόροι' },
  { key: 'stamp_duty_amount', label: 'Digital fee', hint: 'Ψηφιακό Τέλος Συν.' },
  { key: 'fees_amount', label: 'Fees', hint: 'Τέλη' },
  { key: 'deductions_amount', label: 'Deductions', hint: 'Κρατήσεις' },
  { key: 'third_party_amount', label: 'Third-party', hint: 'Έσοδα/Έξοδα Τρίτων' },
];

/** The stated reason a month carries no figures. An unrecognised status falls through to
 *  "Unknown" rather than to a number — never render a status we cannot explain as fact. */
const STATUS_COPY: Record<string, { text: string; tone: string }> = {
  no_data: { text: 'Nothing filed', tone: 'text-muted-foreground' },
  collector_failed: { text: 'Could not reach AADE', tone: 'text-red-500 dark:text-red-400' },
  not_collected: { text: 'Not fetched yet', tone: 'text-amber-600 dark:text-amber-400' },
  not_connected: { text: 'ΑΑΔΕ codes not set', tone: 'text-amber-600 dark:text-amber-400' },
};
const statusCopy = (s: BookStatus | string) =>
  STATUS_COPY[s] ?? { text: 'Unknown', tone: 'text-amber-600 dark:text-amber-400' };

type Period = 'this_year' | 'last_year' | 'last_quarter' | 'custom';

function rangeForPeriod(p: Period): { from: string; to: string } {
  const today = new Date();
  if (p === 'last_year') {
    return {
      from: toLocalISODate(new Date(today.getFullYear() - 1, 0, 1)),
      to: toLocalISODate(new Date(today.getFullYear() - 1, 11, 31)),
    };
  }
  if (p === 'last_quarter') {
    const start = new Date(today);
    start.setMonth(start.getMonth() - 3);
    return { from: toLocalISODate(start), to: todayLocalISO() };
  }
  return { from: toLocalISODate(new Date(today.getFullYear(), 0, 1)), to: todayLocalISO() };
}

/**
 * "Jan 2026" — a month heading, so `formatDate` (which always carries a day) does not fit.
 * The locale is written out rather than left `undefined` for the same reason `formatDate`
 * pins its own: the browser's language would otherwise decide, and the same book would read
 * "Jan 2026" for one user and "Ιαν 2026" for another on the same screen. `T00:00:00` parses
 * the date-only string as LOCAL midnight — as UTC it renders the previous month for anyone
 * west of Greenwich, and a book row filed under the wrong month is a valid-looking row.
 */
const monthLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

const money = (v: number | null | undefined) => formatMoney(v ?? null, 'EUR');

interface Props { workspaceId: string }

export const MydataBookTab: React.FC<Props> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>('this_year');
  const [customFrom, setCustomFrom] = useState(() => rangeForPeriod('this_year').from);
  const [customTo, setCustomTo] = useState(() => rangeForPeriod('this_year').to);
  const [rows, setRows] = useState<BookMonthRow[]>([]);
  const [sync, setSync] = useState<BookSyncState | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const range = period === 'custom' ? { from: customFrom, to: customTo } : rangeForPeriod(period);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [book, state] = await Promise.all([
        mydataBookService.getBook(workspaceId, range.from, range.to),
        mydataBookService.getSyncState(workspaceId).catch(() => null),
      ]);
      setRows(book);
      setSync(state);
    } catch (err) {
      toast({ title: 'Could not read the myDATA book', description: (err as Error)?.message, variant: 'destructive' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, range.from, range.to, toast]);

  useEffect(() => { void load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await mydataBookService.refresh({ dateFrom: range.from, dateTo: range.to });
      const mine = res.workspaces?.find((w) => w.workspaceId === workspaceId) ?? res.workspaces?.[0];
      if (res.skipped === 'not_connected') {
        toast({ title: 'No ΑΑΔΕ credentials', description: 'Add them in Settings → Documents first.', variant: 'destructive' });
      } else if (mine?.error) {
        // AADE rate-limits these endpoints hard and the retry window is longer than a
        // request may live, so the wait is reported rather than absorbed by a spinner.
        toast({
          title: 'AADE refused the refresh',
          description: mine.retry_after_s
            ? `${mine.error}. Try again in about ${mine.retry_after_s}s.`
            : mine.error,
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Book refreshed from AADE' });
      }
      await load();
    } catch (err) {
      toast({ title: 'Refresh failed', description: (err as Error)?.message, variant: 'destructive' });
    } finally {
      setRefreshing(false);
    }
  };

  const months = useMemo(() => {
    const seen: string[] = [];
    for (const r of rows) if (!seen.includes(r.month)) seen.push(r.month);
    return seen;
  }, [rows]);

  const byKey = useMemo(() => {
    const m = new Map<string, BookMonthRow>();
    for (const r of rows) m.set(`${r.month}|${r.direction}`, r);
    return m;
  }, [rows]);

  /**
   * Totals over the rows that actually carry figures, plus a count of the ones that do not.
   * A total silently summing 6 of 8 months is the same defect as a zero: it is a valid
   * number that answers a question nobody asked.
   */
  const totals = useMemo(() => {
    const blank = () => Object.fromEntries(MONEY_COLUMNS.map((c) => [c.key, 0])) as Record<string, number>;
    const acc = { income: blank(), expense: blank(), incomeDocs: 0, expenseDocs: 0, unknown: 0 };
    for (const r of rows) {
      if (!hasFigures(r.status)) { acc.unknown++; continue; }
      const side = r.direction === 'income' ? acc.income : acc.expense;
      for (const c of MONEY_COLUMNS) side[c.key as string] += Number(r[c.key] ?? 0);
      if (r.direction === 'income') acc.incomeDocs += r.doc_count ?? 0;
      else acc.expenseDocs += r.doc_count ?? 0;
    }
    return acc;
  }, [rows]);

  const notConnected = rows.length > 0 && rows.every((r) => r.status === 'not_connected');
  const neverCollected = rows.length > 0 && rows.every((r) => r.status === 'not_collected');

  const unknownSubtypes = Array.isArray(sync?.source_errors?.unknown_subtypes)
    ? (sync.source_errors.unknown_subtypes as string[])
    : [];
  const hasUnknownSubtypes = unknownSubtypes.length > 0;

  const exportCsv = () => {
    const head = ['month', 'direction', ...MONEY_COLUMNS.map((c) => String(c.key)), 'doc_count', 'balance', 'status'];
    const body = rows.map((r) => [
      r.month, r.direction,
      ...MONEY_COLUMNS.map((c) => (hasFigures(r.status) ? String(r[c.key] ?? 0) : '')),
      hasFigures(r.status) ? String(r.doc_count ?? 0) : '',
      r.balance != null ? String(r.balance) : '',
      r.status,
    ]);
    const csv = [head, ...body].map((line) => line.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `mydata-book-${range.from}-to-${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* What this is, said plainly — the whole value of the surface is that it is NOT ours —
          and the controls that scope it, on the same line. Two stacked cards for one sentence
          and one dropdown pushed the book itself below the fold. */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0" />
            {/* Two sentences, two lines: what the book IS, then what to do with it. Reflowed as
                one paragraph they read as a single caveat and the instruction gets skimmed. */}
            <div>
              <div>AADE's own aggregate book (Συνοπτικό Βιβλίο), exactly as myAADE reports it.</div>
              <div>
                These figures are never mixed with the platform's — hold them up against{' '}
                <span className="text-foreground">Reports → VAT</span> to see whether the two agree.
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-9 w-[168px]" aria-label="Period"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="this_year">This year</SelectItem>
                <SelectItem value="last_quarter">Last 3 months</SelectItem>
                <SelectItem value="last_year">Last year</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {period === 'custom' && (
              <>
                <Input
                  type="date"
                  aria-label="From"
                  title="From"
                  className="h-9 w-[148px]"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
                <Input
                  type="date"
                  aria-label="To"
                  title="To"
                  className="h-9 w-[148px]"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </>
            )}
            <Button size="sm" variant="secondary" onClick={refresh} disabled={refreshing || loading}>
              {refreshing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
              Refresh from AADE
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Freshness. Stale-but-real figures stay on screen and say they are stale — blanking
          them would lose the last thing AADE actually told us. The date itself rides in the
          book's own subtitle; this band exists only when something actually went wrong, so a
          healthy mirror costs no vertical space at all. */}
      {sync && (sync.last_status === 'collector_failed' || hasUnknownSubtypes) && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 text-xs">
            {sync.last_status === 'collector_failed' && (
              <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Last refresh failed
                {sync.retry_after_s ? ` — AADE rate-limited us, retry in ~${sync.retry_after_s}s` : ''}
                {typeof sync.source_errors?.error === 'string' ? ` (${sync.source_errors.error})` : ''}
              </span>
            )}
            {hasUnknownSubtypes && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5" />
                Unrecognised AADE document type(s): {unknownSubtypes.join(', ')} — counted at face value
              </span>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Aggregate book</CardTitle>
            <CardDescription>
              {formatDate(range.from)} — {formatDate(range.to)} · {totals.incomeDocs.toLocaleString()} income and{' '}
              {totals.expenseDocs.toLocaleString()} expense documents filed with AADE
              {/* Freshness sits with the figures it qualifies. Absent state says so rather than
                  dropping the phrase — a book with no stated confirmation date reads as current. */}
              {sync?.last_success_at ? (
                <>
                  {' · Last confirmed against AADE on '}
                  <span className="text-foreground">{formatDate(sync.last_success_at)}</span>
                </>
              ) : (
                ' · Never confirmed against AADE'
              )}
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={rows.length === 0} onClick={exportCsv}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading the book…
            </div>
          ) : notConnected ? (
            <HubEmptyState
              icon={BookOpen}
              title="No ΑΑΔΕ credentials for this workspace"
              description="The book is read with your own Special Access Codes. Add them and the mirror fills in."
              action={<Button asChild size="sm"><Link to={financeTabUrl(FINANCE_TAB.settings)}>Open Settings → Documents</Link></Button>}
            />
          ) : neverCollected ? (
            <HubEmptyState
              icon={BookOpen}
              title="Not fetched from AADE yet"
              description="Nothing has been read for this period. Pull it and the months fill in."
              action={<Button size="sm" onClick={refresh} disabled={refreshing}>Refresh from AADE</Button>}
            />
          ) : rows.length === 0 ? (
            <HubEmptyState
              icon={BookOpen}
              title="No months in this range"
              description="Widen the period to see AADE's book."
              variant="filtered"
              action={<Button size="sm" variant="outline" onClick={() => setPeriod('this_year')}>Reset to this year</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">{MONEY_COLUMNS[0].label}</TableHead>
                  <TableHead className="text-right" title="Income net less expense net, for the month">
                    Balance
                  </TableHead>
                  {MONEY_COLUMNS.slice(1).map((c) => (
                    <TableHead key={String(c.key)} className="text-right" title={c.hint}>{c.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Docs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (['income', 'expense'] as const).map((dir) => {
                  const r = byKey.get(`${m}|${dir}`);
                  if (!r) return null;
                  const known = hasFigures(r.status);
                  const reason = statusCopy(r.status);
                  return (
                    <TableRow key={`${m}|${dir}`}>
                      <TableCell className="whitespace-nowrap">{dir === 'income' ? monthLabel(m) : ''}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {dir === 'income' ? 'Income' : 'Expenses'}
                      </TableCell>
                      {known ? (
                        <>
                          <TableCell className="text-right tabular-nums">{money(r.net_value)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.balance == null ? '—' : (
                              <span className={r.balance < 0 ? 'text-red-500 dark:text-red-400' : undefined}>
                                {money(r.balance)}
                              </span>
                            )}
                          </TableCell>
                          {MONEY_COLUMNS.slice(1).map((c) => (
                            <TableCell key={String(c.key)} className="text-right tabular-nums">
                              {money(r[c.key] as number | null)}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums text-muted-foreground">{r.doc_count ?? 0}</TableCell>
                        </>
                      ) : (
                        // One stated reason spanning the money columns. Rendering 0,00 across
                        // them would be a confident claim about a tax book we have not read.
                        <TableCell colSpan={MONEY_COLUMNS.length + 2} className={`text-right text-xs ${reason.tone}`}>
                          {reason.text}
                        </TableCell>
                      )}
                    </TableRow>
                  );
                }))}

                <TableRow className="bg-surface-sunken font-semibold">
                  <TableCell colSpan={2}>Total income</TableCell>
                  <TableCell className="text-right tabular-nums">{money(totals.income.net_value)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(totals.income.net_value - totals.expense.net_value)}
                  </TableCell>
                  {MONEY_COLUMNS.slice(1).map((c) => (
                    <TableCell key={String(c.key)} className="text-right tabular-nums">{money(totals.income[c.key as string])}</TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{totals.incomeDocs}</TableCell>
                </TableRow>
                <TableRow className="bg-surface-sunken font-semibold">
                  <TableCell colSpan={2}>Total expenses</TableCell>
                  <TableCell className="text-right tabular-nums">{money(totals.expense.net_value)}</TableCell>
                  <TableCell />
                  {MONEY_COLUMNS.slice(1).map((c) => (
                    <TableCell key={String(c.key)} className="text-right tabular-nums">{money(totals.expense[c.key as string])}</TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{totals.expenseDocs}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
        {totals.unknown > 0 && rows.length > 0 && (
          <CardContent className="border-t border-hairline pt-3 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            {totals.unknown} of {rows.length} month-rows in this range carry no figures, so the totals
            above cover only part of the period.
          </CardContent>
        )}
      </Card>
    </div>
  );
};
