/** The three Channels billing tables, on screen. */
import React, { useCallback, useEffect, useState } from 'react';
import { Receipt, RefreshCw, Loader2, PauseCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  HUB_FILTER_ALL, HubCellEmpty, HubFilterSelect, HubResetFilters, HubSortButton, HubToolbar,
  useHubTable, type HubTableField,
} from '@/components/core/hub';
import { cn } from '@/lib/utils';
import { labelizeValue } from '@/utils/recordDisplay';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney, formatNumber } from '@/utils/decimal';
import { formatDate, timeAgo } from '@/utils/datetime';

interface ReconRow {
  period_start: string; period_end: string; country_code: string; category: string;
  volume: number; cost_usd: number | null; cost_available: boolean;
  billed_messages: number; billed_credits: number; billed_usd: number;
  margin_usd: number | null; fetched_at: string;
}
interface ChargeRow {
  id: string; workspace_name: string | null; charge_type: string; period_month: string;
  quantity: number; credits_charged: number; status: string; attempts: number;
  last_attempt_at: string | null; reason: string | null; is_failed: boolean;
}
interface HoldRow {
  workspace_name: string | null; phone_number: string; country: string | null;
  monthly_cents: number | null; held_at: string | null; held_reason: string | null;
}
interface JobRow { jobname: string; schedule: string; active: boolean; last_run_at: string | null; last_status: string | null }
interface Detail { reconciliation: ReconRow[]; charges: ChargeRow[]; on_hold: HoldRow[]; jobs: JobRow[] }

const usd = (v: number | null | undefined) => (v == null ? '—' : formatMoney(v, 'USD'));

/**
 * A date-only column (`period_month`, `period_start`) is a DATE OF RECORD, and
 * `new Date('2026-08-01')` parses as UTC midnight — which renders as July 31st for any viewer
 * west of Greenwich. Anchoring to local midnight keeps the billing month the month it says.
 */
const formatDateOnly = (v: string) => formatDate(`${v}T00:00:00`);

const CHARGE_FIELDS: HubTableField<ChargeRow>[] = [
  { id: 'workspace', sortValue: (c) => c.workspace_name, searchText: (c) => c.workspace_name, filterValue: (c) => c.workspace_name, filterLabel: 'Workspace' },
  { id: 'month', sortValue: (c) => c.period_month, filterValue: (c) => c.period_month, filterLabel: 'Month', filterOptionLabel: formatDateOnly },
  { id: 'type', sortValue: (c) => c.charge_type, filterValue: (c) => c.charge_type, filterLabel: 'What', filterOptionLabel: labelizeValue },
  { id: 'quantity', sortValue: (c) => c.quantity },
  { id: 'credits', sortValue: (c) => c.credits_charged },
  { id: 'status', sortValue: (c) => c.status, filterValue: (c) => c.status, filterLabel: 'Status', filterOptionLabel: labelizeValue },
  { id: 'attempts', sortValue: (c) => c.attempts },
  { id: 'reason', searchText: (c) => c.reason },
];

const RECON_FIELDS: HubTableField<ReconRow>[] = [
  { id: 'period', sortValue: (r) => r.period_start, filterValue: (r) => r.period_start, filterLabel: 'Period', filterOptionLabel: formatDateOnly },
  { id: 'country', sortValue: (r) => r.country_code, filterValue: (r) => r.country_code, filterLabel: 'Country', searchText: (r) => r.country_code },
  { id: 'category', sortValue: (r) => r.category, filterValue: (r) => r.category, filterLabel: 'Category', filterOptionLabel: labelizeValue, searchText: (r) => r.category },
  { id: 'volume', sortValue: (r) => r.volume },
  { id: 'cost', sortValue: (r) => (r.cost_available ? r.cost_usd : null) },
  { id: 'billed', sortValue: (r) => r.billed_usd },
  { id: 'margin', sortValue: (r) => r.margin_usd },
];

const EMPTY_CHARGES: ChargeRow[] = [];
const EMPTY_RECON: ReconRow[] = [];

interface SortState { sort?: { columnId: string; direction: 'asc' | 'desc' }; toggleSort: (id: string) => void }

const SortHead: React.FC<{ t: SortState; id: string; align?: 'right'; className?: string; children: React.ReactNode }> = ({ t, id, align, className, children }) => {
  const active = t.sort?.columnId === id ? t.sort.direction : undefined;
  return (
    <TableHead
      className={cn(align === 'right' && 'text-right', className)}
      aria-sort={active ? (active === 'asc' ? 'ascending' : 'descending') : undefined}
    >
      <HubSortButton active={active} align={align} onClick={() => t.toggleSort(id)}>{children}</HubSortButton>
    </TableHead>
  );
};

export const ChannelsBillingDetail: React.FC = () => {
  const { toast } = useToast();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Detail | null; error: { message: string } | null }>;
    }).rpc('admin_channels_billing_detail', { p_days: 180 });

    if (error) {
      if (/platform-operator only/i.test(error.message)) setDenied(true);
      else toast({ title: 'Could not read billing detail', description: error.message, variant: 'destructive' });
      setDetail(null);
    } else {
      setDetail(data);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const chargeTable = useHubTable(detail?.charges ?? EMPTY_CHARGES, CHARGE_FIELDS);
  const reconTable = useHubTable(detail?.reconciliation ?? EMPTY_RECON, RECON_FIELDS);

  if (denied) return null;

  const failed = detail?.charges.filter(c => c.is_failed) ?? [];
  const held = detail?.on_hold ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Channels billing detail
          </CardTitle>
          <CardDescription>
            What Meta actually charged against what we billed, the monthly number charges, and any
            line currently on hold for non-payment.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* The jobs strip, first and deliberately: it is what makes every empty table below
            interpretable rather than reassuring. */}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(detail?.jobs ?? []).map(j => {
            const stale = j.last_status && j.last_status !== 'succeeded';
            return (
              <div key={j.jobname} className="rounded-sm border border-hairline bg-surface-sunken p-2.5">
                <p className="truncate text-[11px] font-medium">{j.jobname.replace('channels-', '')}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  {stale
                    ? <AlertTriangle className="h-3 w-3 text-[hsl(var(--error))]" />
                    : j.last_run_at
                      ? <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" />
                      : null}
                  {timeAgo(j.last_run_at)}
                  {j.last_status && j.last_status !== 'succeeded' ? ` · ${j.last_status}` : ''}
                </p>
                <p className="text-[10px] text-muted-foreground/70">{j.schedule}</p>
              </div>
            );
          })}
        </div>

        {/* On hold — the state a customer feels, so it goes above the ledgers. */}
        {held.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <PauseCircle className="h-4 w-4 text-[hsl(var(--error))]" />
              {held.length} number{held.length === 1 ? '' : 's'} on hold
            </h3>
            <div className="overflow-x-auto rounded-sm border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead className="text-right">Costs us</TableHead>
                    <TableHead className="hidden sm:table-cell">Held</TableHead>
                    <TableHead className="hidden md:table-cell">Why</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {held.map(h => (
                    <TableRow key={h.phone_number}>
                      <TableCell className="font-medium">{h.workspace_name ?? <HubCellEmpty />}</TableCell>
                      <TableCell className="font-mono text-sm whitespace-nowrap">{h.phone_number}</TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {h.monthly_cents == null ? <HubCellEmpty /> : `${usd(h.monthly_cents / 100)}/mo`}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground whitespace-nowrap">{timeAgo(h.held_at)}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground break-words">{h.held_reason ?? <HubCellEmpty />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Held, not released — the number is still ours and comes back the moment the workspace
              settles. The nightly retry lifts the hold once no month is outstanding.
            </p>
          </div>
        )}

        {/* Charges, failures first. */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">
            Monthly charges{failed.length > 0 && (
              <span className="ml-2 text-[hsl(var(--error))]">· {failed.length} failed</span>
            )}
          </h3>
          {loading ? (
            <div className="h-20 animate-pulse rounded-sm bg-muted/40" />
          ) : (detail?.charges.length ?? 0) === 0 ? (
            <HubEmptyState
              variant="empty"
              icon={Receipt}
              title="Nothing has been charged yet"
              description={
                detail?.jobs.find(j => j.jobname === 'channels-bill-monthly')?.last_run_at
                  ? 'The monthly run has executed and found nothing to bill — no workspace holds a rented number.'
                  : 'The monthly billing job has never run. It fires on the 1st; until then this is empty because nothing has been attempted, not because nothing is owed.'
              }
            />
          ) : (
            <div className="overflow-hidden rounded-sm border border-hairline">
              {detail!.charges.length > 8 && (
                <HubToolbar
                  search={chargeTable.search}
                  onSearchChange={chargeTable.setSearch}
                  searchPlaceholder="Search workspace or detail"
                  filters={<>
                    <HubFilterSelect label="Status" value={chargeTable.filters.status ?? HUB_FILTER_ALL} options={chargeTable.filterOptions.status} onChange={(v) => chargeTable.setFilter('status', v)} />
                    <HubFilterSelect label="What" value={chargeTable.filters.type ?? HUB_FILTER_ALL} options={chargeTable.filterOptions.type} onChange={(v) => chargeTable.setFilter('type', v)} />
                    <HubFilterSelect label="Month" value={chargeTable.filters.month ?? HUB_FILTER_ALL} options={chargeTable.filterOptions.month} onChange={(v) => chargeTable.setFilter('month', v)} />
                    <HubFilterSelect label="Workspace" value={chargeTable.filters.workspace ?? HUB_FILTER_ALL} options={chargeTable.filterOptions.workspace} onChange={(v) => chargeTable.setFilter('workspace', v)} />
                    <HubResetFilters count={chargeTable.activeFilterCount} onReset={chargeTable.reset} />
                  </>}
                />
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead t={chargeTable} id="workspace">Workspace</SortHead>
                    <SortHead t={chargeTable} id="month">Month</SortHead>
                    <SortHead t={chargeTable} id="type" className="hidden md:table-cell">What</SortHead>
                    <SortHead t={chargeTable} id="quantity" align="right" className="hidden lg:table-cell">Qty</SortHead>
                    <SortHead t={chargeTable} id="credits" align="right">Credits</SortHead>
                    <SortHead t={chargeTable} id="status">Status</SortHead>
                    <SortHead t={chargeTable} id="attempts" align="right" className="hidden lg:table-cell">Tries</SortHead>
                    <TableHead className="hidden md:table-cell">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chargeTable.rows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={8} className="p-0">
                        <HubEmptyState
                          variant="filtered"
                          title="No charges match these filters"
                          action={<Button variant="outline" size="sm" onClick={chargeTable.reset}>Clear filters</Button>}
                        />
                      </TableCell>
                    </TableRow>
                  ) : chargeTable.rows.map(c => (
                    <TableRow key={c.id} className={c.is_failed ? 'bg-[hsl(var(--error-bg))]' : undefined}>
                      <TableCell className="font-medium">{c.workspace_name ?? <HubCellEmpty />}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDateOnly(c.period_month)}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm capitalize">{c.charge_type}</TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums">{c.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.credits_charged)}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'charged' ? 'success' : c.status === 'failed' ? 'error' : 'neutral'}>
                          {labelizeValue(c.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-right tabular-nums">{c.attempts}</TableCell>
                      {/* The reason is the difference between healthy idempotency and a real
                          problem — `skipped` alone shows both the same way. */}
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {c.reason ? <div className="max-w-xs truncate" title={c.reason}>{c.reason}</div> : <HubCellEmpty />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Reconciliation. */}
        <div>
          <h3 className="mb-2 text-sm font-semibold">WhatsApp template cost vs billed</h3>
          {loading ? (
            <div className="h-20 animate-pulse rounded-sm bg-muted/40" />
          ) : (detail?.reconciliation.length ?? 0) === 0 ? (
            <HubEmptyState
              variant="empty"
              icon={Receipt}
              title="No reconciliation rows"
              description={
                detail?.jobs.find(j => j.jobname === 'channels-reconcile-costs-daily')?.last_run_at
                  ? 'The nightly job ran and Meta returned nothing — either no template messages have been sent, or the WABA sits in the provider’s Business Manager, where Meta will not report cost to us at all.'
                  : 'The nightly reconciliation has never run, so this is empty because nothing has asked Meta yet.'
              }
            />
          ) : (
            <div className="overflow-hidden rounded-sm border border-hairline">
              {detail!.reconciliation.length > 8 && (
                <HubToolbar
                  search={reconTable.search}
                  onSearchChange={reconTable.setSearch}
                  searchPlaceholder="Search country or category"
                  filters={<>
                    <HubFilterSelect label="Period" value={reconTable.filters.period ?? HUB_FILTER_ALL} options={reconTable.filterOptions.period} onChange={(v) => reconTable.setFilter('period', v)} />
                    <HubFilterSelect label="Country" value={reconTable.filters.country ?? HUB_FILTER_ALL} options={reconTable.filterOptions.country} onChange={(v) => reconTable.setFilter('country', v)} />
                    <HubFilterSelect label="Category" value={reconTable.filters.category ?? HUB_FILTER_ALL} options={reconTable.filterOptions.category} onChange={(v) => reconTable.setFilter('category', v)} />
                    <HubResetFilters count={reconTable.activeFilterCount} onReset={reconTable.reset} />
                  </>}
                />
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortHead t={reconTable} id="period">Period</SortHead>
                    <SortHead t={reconTable} id="country">Country</SortHead>
                    <SortHead t={reconTable} id="category" className="hidden sm:table-cell">Category</SortHead>
                    <SortHead t={reconTable} id="volume" align="right" className="hidden md:table-cell">Volume</SortHead>
                    <SortHead t={reconTable} id="cost" align="right" className="hidden md:table-cell">Meta cost</SortHead>
                    <SortHead t={reconTable} id="billed" align="right">We billed</SortHead>
                    <SortHead t={reconTable} id="margin" align="right">Margin</SortHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconTable.rows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="p-0">
                        <HubEmptyState
                          variant="filtered"
                          title="No rows match these filters"
                          action={<Button variant="outline" size="sm" onClick={reconTable.reset}>Clear filters</Button>}
                        />
                      </TableCell>
                    </TableRow>
                  ) : reconTable.rows.map((r, i) => (
                    <TableRow key={`${r.period_start}-${r.country_code}-${r.category}-${i}`}>
                      <TableCell className="text-sm whitespace-nowrap">{formatDateOnly(r.period_start)}</TableCell>
                      <TableCell>{r.country_code}</TableCell>
                      <TableCell className="hidden sm:table-cell capitalize text-sm">{r.category}</TableCell>
                      <TableCell className="hidden md:table-cell text-right tabular-nums">{formatNumber(r.volume)}</TableCell>
                      <TableCell className="hidden md:table-cell text-right tabular-nums">
                        {/* Not $0 — Meta withholds cost on a partner credit line, and a zero
                            there would read as a free month. */}
                        {r.cost_available ? usd(r.cost_usd) : <span className="text-muted-foreground">not reported</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{usd(r.billed_usd)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.margin_usd == null
                          ? <HubCellEmpty />
                          : <span className={r.margin_usd < 0 ? 'text-[hsl(var(--error))] font-semibold' : undefined}>
                              {usd(r.margin_usd)}
                            </span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ChannelsBillingDetail;
