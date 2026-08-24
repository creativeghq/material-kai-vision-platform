/**
 * The three Channels billing tables, on screen.
 *
 * `whatsapp_cost_reconciliation`, `channel_recurring_charges` and the held numbers were all
 * written on a schedule and rendered nowhere — the same shape as the leak this subsystem was built
 * to close: a number sitting somewhere no one looks. A held number's only trace was a console
 * warning.
 *
 * The jobs strip is the part that stops this screen lying. Every table here can be empty for two
 * opposite reasons — nothing happened, or the job that records it stopped — and they look
 * identical. So the last run of each cron sits above the tables, and an empty table says which
 * kind of empty it is instead of leaving the reader to assume the happy one.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Receipt, RefreshCw, Loader2, PauseCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
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
                    <TableHead>Held</TableHead>
                    <TableHead>Why</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {held.map(h => (
                    <TableRow key={h.phone_number}>
                      <TableCell className="font-medium">{h.workspace_name ?? '—'}</TableCell>
                      <TableCell className="font-mono text-sm">{h.phone_number}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {h.monthly_cents == null ? '—' : `${usd(h.monthly_cents / 100)}/mo`}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{timeAgo(h.held_at)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{h.held_reason ?? '—'}</TableCell>
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
            <div className="overflow-x-auto rounded-sm border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Month</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Tries</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail!.charges.map(c => (
                    <TableRow key={c.id} className={c.is_failed ? 'bg-[hsl(var(--error-bg))]' : undefined}>
                      <TableCell className="font-medium">{c.workspace_name ?? '—'}</TableCell>
                      <TableCell className="text-sm">{formatDateOnly(c.period_month)}</TableCell>
                      <TableCell className="text-sm capitalize">{c.charge_type}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(c.credits_charged)}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'charged' ? 'success' : c.status === 'failed' ? 'error' : 'neutral'}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{c.attempts}</TableCell>
                      {/* The reason is the difference between healthy idempotency and a real
                          problem — `skipped` alone shows both the same way. */}
                      <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{c.reason ?? '—'}</TableCell>
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
            <div className="overflow-x-auto rounded-sm border border-hairline">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Meta cost</TableHead>
                    <TableHead className="text-right">We billed</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail!.reconciliation.map((r, i) => (
                    <TableRow key={`${r.period_start}-${r.country_code}-${r.category}-${i}`}>
                      <TableCell className="text-sm">{formatDateOnly(r.period_start)}</TableCell>
                      <TableCell>{r.country_code}</TableCell>
                      <TableCell className="capitalize text-sm">{r.category}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(r.volume)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {/* Not $0 — Meta withholds cost on a partner credit line, and a zero
                            there would read as a free month. */}
                        {r.cost_available ? usd(r.cost_usd) : <span className="text-muted-foreground">not reported</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{usd(r.billed_usd)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.margin_usd == null
                          ? <span className="text-muted-foreground">—</span>
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
