/**
 * Channels cost & margin, per workspace — the operator view for the social/WhatsApp add-on.
 *
 * It exists because the biggest cost line in this integration is invisible per tenant: Zernio
 * bills one monthly total for every connected account on the platform, so no invoice ever says
 * which workspace caused it. Ten tenants averaging three accounts is ~$108/month arriving as a
 * single number with no attribution.
 *
 * Revenue here values credits at the SALE price ($0.085), not the $0.01 the debit engine accounts
 * them at. The Third Party Services table further down this page shows the 1.5× markup only,
 * which understates every margin by roughly 8.5× — that discrepancy is why messaging looked
 * unprofitable until someone checked what a credit actually sells for.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Radio, RefreshCw, Loader2, AlertTriangle, Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/utils/decimal';

interface Row {
  workspace_id: string;
  workspace_name: string;
  social_accounts: number;
  whatsapp_channels: number;
  channels_total: number;
  seat_allowance: number;
  seats_purchased: number;
  over_allowance: boolean;
  phone_numbers: number;
  phone_cost_usd: number;
  phone_billed_usd: number;
  addon_status: string;
  addon_usd: number;
  seats_usd: number;
  usage_raw_usd: number;
  usage_billed_usd: number;
  usage_credits: number;
  total_cost_usd: number;
  total_revenue_usd: number;
  net_usd: number;
}

/** One (period × country × category) group of what Meta charged against what we billed. */
interface ReconRow {
  period_start: string;
  country_code: string | null;
  category: string | null;
  workspace_id: string | null;
  workspace_name: string | null;
  volume: number;
  cost_usd: number | null;
  /**
   * FALSE means Meta did not REPORT a cost, not that it was zero.
   *
   * Meta withholds cost for a WABA on a Solution Partner's credit line, which is our situation
   * today — so rendering a `$0` here would say "a free month" about a month whose cost is simply
   * unknown. That distinction is the entire reason the column exists.
   */
  cost_available: boolean;
  billed_messages: number;
  billed_credits: number;
  billed_usd: number;
  /** NULL when the cost is unknown: a margin against an unknown cost is a guess with a decimal point. */
  margin_usd: number | null;
}

/** One monthly recurring charge attempt. */
interface ChargeRow {
  id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  charge_type: string;
  period_month: string;
  quantity: number;
  unit_cost_usd: number;
  credits_charged: number;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  charged_at: string | null;
  skip_reason: string | null;
  /** Derived in SQL: a failed charge, or a skip that is NOT healthy idempotency. */
  needs_attention: boolean;
}

/**
 * Zernio's account ladder, applied to the PLATFORM total. Not apportioned per workspace on
 * purpose: which tenant owns "the eleventh account" is an accident of ordering, and splitting the
 * ladder between them would invent a number that no invoice supports.
 */
function ladderCost(totalAccounts: number): number {
  const free = Math.min(totalAccounts, 2);
  const tier1 = Math.min(Math.max(totalAccounts - 2, 0), 8);   // accounts 3-10  @ $6
  const tier2 = Math.min(Math.max(totalAccounts - 10, 0), 90); // accounts 11-100 @ $3
  const tier3 = Math.max(totalAccounts - 100, 0);              // 101+            @ $1
  void free;
  return tier1 * 6 + tier2 * 3 + tier3 * 1;
}

const money = (v: number | null | undefined) => formatMoney(v ?? 0, 'USD');

export const ChannelsCostPanel: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [recon, setRecon] = useState<ReconRow[]>([]);
  const [charges, setCharges] = useState<ChargeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  /**
   * Whether the two nightly jobs have EVER written a row.
   *
   * `null` while loading. An empty table and a job that has never run are opposite facts —
   * "no charges yet" is healthy in month one and alarming in month six — so the empty state
   * says which, rather than one reassuring sentence for both.
   */
  const [everRan, setEverRan] = useState<{ recon: boolean; charges: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setDenied(false);
    // Cast: the RPC postdates the last types.ts generation, which cannot be regenerated locally.
    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
    }).rpc('admin_channels_cost_overview', { p_days: 30 });

    if (error) {
      // The function self-guards on platform-operator, so a refusal is expected for anyone else
      // and is not worth a red toast.
      if (/platform-operator only/i.test(error.message)) setDenied(true);
      else toast({ title: 'Could not read channel costs', description: error.message, variant: 'destructive' });
      setRows([]);
    } else {
      setRows((data ?? []).map(r => ({
        ...r,
        phone_cost_usd: Number(r.phone_cost_usd), phone_billed_usd: Number(r.phone_billed_usd),
        addon_usd: Number(r.addon_usd), seats_usd: Number(r.seats_usd),
        usage_raw_usd: Number(r.usage_raw_usd), usage_billed_usd: Number(r.usage_billed_usd),
        usage_credits: Number(r.usage_credits),
        total_cost_usd: Number(r.total_cost_usd), total_revenue_usd: Number(r.total_revenue_usd),
        net_usd: Number(r.net_usd),
      })));
    }
    // The two billing tables, read through their own self-guarding RPCs. Failures here must not
    // blank the cost table above — a reconciliation outage is not a reason to stop showing margin.
    const rpc = supabase as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
    };
    const [rec, chg] = await Promise.all([
      rpc.rpc('admin_whatsapp_reconciliation', { p_months: 3 }),
      rpc.rpc('admin_channel_charges', { p_months: 6 }),
    ]);
    const recRows = (rec.error ? [] : (rec.data as ReconRow[] | null) ?? []).map((r) => ({
      ...r,
      volume: Number(r.volume),
      cost_usd: r.cost_usd == null ? null : Number(r.cost_usd),
      billed_messages: Number(r.billed_messages),
      billed_credits: Number(r.billed_credits),
      billed_usd: Number(r.billed_usd),
      margin_usd: r.margin_usd == null ? null : Number(r.margin_usd),
    }));
    const chgRows = (chg.error ? [] : (chg.data as ChargeRow[] | null) ?? []).map((c) => ({
      ...c,
      quantity: Number(c.quantity),
      unit_cost_usd: Number(c.unit_cost_usd),
      credits_charged: Number(c.credits_charged),
      attempts: Number(c.attempts),
    }));
    setRecon(recRows);
    setCharges(chgRows);
    // Distinguishing "nothing yet" from "the job never ran" needs to know whether the RPC answered
    // at all. An error is not evidence of an empty table.
    setEverRan({ recon: !rec.error, charges: !chg.error });

    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const totalAccounts = rows.reduce((n, r) => n + r.channels_total, 0);
  const accountLadder = ladderCost(totalAccounts);
  const attributedCost = rows.reduce((n, r) => n + r.total_cost_usd, 0);
  const revenue = rows.reduce((n, r) => n + r.total_revenue_usd, 0);
  // The ladder is a platform cost with no per-workspace home, so it is added at the bottom line
  // rather than smeared across the rows above it.
  const net = revenue - attributedCost - accountLadder;
  const overCount = rows.filter(r => r.over_allowance).length;
  const attentionCount = charges.filter(c => c.needs_attention).length;

  if (denied) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4" /> Channels — cost &amp; margin by workspace
          </CardTitle>
          <CardDescription>
            Last 30 days. Revenue values credits at their SALE price ($0.085), not the $0.01 the
            debit engine accounts them at — the Third Party Services table below shows the 1.5×
            markup only and understates margin by roughly 8.5×.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          {[
            { label: 'Connected accounts', value: String(totalAccounts), note: 'across all workspaces' },
            { label: 'Account ladder cost', value: money(accountLadder), note: '2 free · $6 · $3 · $1' },
            { label: 'Channels revenue', value: money(revenue), note: 'add-on + seats + numbers + credits' },
            { label: 'Net', value: money(net), note: 'after the unattributed ladder' },
          ].map(s => (
            <div key={s.label} className="rounded-sm border border-hairline bg-surface-sunken p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>

        {overCount > 0 && (
          <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--warning))]" />
            <span>
              {overCount} workspace{overCount === 1 ? '' : 's'} {overCount === 1 ? 'is' : 'are'} over
              the included allowance without buying seats — connected before the cap existed. Their
              accounts are billed to us and to nobody else.
            </span>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-sm bg-muted/40" />)}
          </div>
        ) : rows.length === 0 ? (
          <HubEmptyState
            variant="empty"
            icon={Radio}
            title="No workspace has connected a channel"
            description="Once a workspace connects a social account or a WhatsApp number, its cost and margin appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead className="text-right">Social</TableHead>
                  <TableHead className="text-right">WhatsApp</TableHead>
                  <TableHead className="text-right">Allowance</TableHead>
                  <TableHead className="text-right">Numbers</TableHead>
                  <TableHead>Add-on</TableHead>
                  <TableHead className="text-right">Our cost</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.workspace_id}>
                    <TableCell className="font-medium">{r.workspace_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.social_accounts}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.whatsapp_channels}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={r.over_allowance ? 'text-[hsl(var(--error))]' : undefined}>
                        {r.channels_total} / {r.seat_allowance}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.phone_numbers === 0 ? '—' : `${r.phone_numbers} · ${money(r.phone_cost_usd)}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.addon_status === 'active' ? 'success' : r.addon_status === 'none' ? 'neutral' : 'warning'}>
                        {r.addon_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.total_cost_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(r.total_revenue_usd)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={r.net_usd < 0 ? 'text-[hsl(var(--error))] font-semibold' : 'text-[hsl(var(--success))]'}>
                        {money(r.net_usd)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          The account ladder is charged platform-wide and is not divided between the rows — which
          workspace owns &ldquo;the eleventh account&rdquo; is an accident of ordering. WhatsApp
          template messages are billed by Meta directly to the WABA and never reach the figures
          above; the reconciliation section below is where that invoice is checked against what we
          billed.
        </p>

        {/* ── Recurring charges (#383 1b) ──────────────────────────────────────────────────────
            Failures FIRST, and not sorted into a chronological list. A `failed` row is a workspace
            that could not pay for its numbers, and while it sits unread the platform keeps paying
            Zernio for them. `needs_attention` is derived in SQL so this list and any future alert
            cannot disagree about what counts as a problem. */}
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Receipt className="h-4 w-4" /> Monthly charges
            {attentionCount > 0 && (
              <Badge variant="error">{attentionCount} need{attentionCount === 1 ? 's' : ''} attention</Badge>
            )}
          </h3>
          {charges.length === 0 ? (
            <HubEmptyState
              variant="empty"
              icon={Receipt}
              title={everRan?.charges === false ? 'Charges could not be read' : 'No charges billed yet'}
              description={everRan?.charges === false
                ? 'The billing reader refused or failed. That is not the same as an empty month — check the function and the cron before concluding nothing was charged.'
                : 'bill-channels-monthly runs on the 1st at 05:10. Rows appear here the first time a workspace is charged for a number or a seat.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>What for</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Credits</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Attempts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {charges.map((c) => (
                    <TableRow key={c.id} className={c.needs_attention ? 'bg-[hsl(var(--error))]/[0.06]' : undefined}>
                      <TableCell className="tabular-nums">{c.period_month?.slice(0, 7) ?? '—'}</TableCell>
                      <TableCell className="font-medium">{c.workspace_name ?? '—'}</TableCell>
                      <TableCell className="capitalize">{c.charge_type.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(c.unit_cost_usd)}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.credits_charged}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === 'charged' ? 'success' : c.status === 'failed' ? 'error' : 'neutral'}>
                          {c.status}
                        </Badge>
                        {/* "already billed this month" is healthy idempotency; "no owner to bill" is a
                            workspace nobody can charge. The status column shows both as `skipped`. */}
                        {c.skip_reason && (
                          <span className="ml-2 text-xs text-muted-foreground">{c.skip_reason}</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-xs text-muted-foreground">
                        {c.attempts}
                        {c.last_attempt_at && ` · ${c.last_attempt_at.slice(0, 10)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* ── WhatsApp reconciliation (#383 1a) ────────────────────────────────────────────────
            Billed against actual, per country × category. Margin is derived from the two stored
            figures and never stored — one derivation per money quantity. */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">WhatsApp — billed vs actual</h3>
          {recon.length === 0 ? (
            <HubEmptyState
              variant="empty"
              icon={Radio}
              title={everRan?.recon === false ? 'Reconciliation could not be read' : 'Nothing reconciled yet'}
              description={everRan?.recon === false
                ? 'The reconciliation reader refused or failed — which is not the same as a month with no template traffic.'
                : 'reconcile-whatsapp-costs runs nightly at 04:20. Rows appear once template messages have been sent.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Meta cost</TableHead>
                    <TableHead className="text-right">We billed</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recon.map((r, i) => (
                    <TableRow key={`${r.period_start}-${r.country_code}-${r.category}-${r.workspace_id ?? i}`}>
                      <TableCell className="tabular-nums">{r.period_start?.slice(0, 7)}</TableCell>
                      <TableCell>{r.country_code ?? '—'}</TableCell>
                      <TableCell className="capitalize">{r.category ?? '—'}</TableCell>
                      <TableCell>{r.workspace_name ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.volume}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {/* NOT $0. Meta withholds cost for a WABA on a Solution Partner's credit
                            line, so a zero here would read as a free month. */}
                        {r.cost_available
                          ? money(r.cost_usd ?? 0)
                          : <span className="text-muted-foreground">not reported</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.billed_usd)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.margin_usd == null
                          ? <span className="text-muted-foreground">unknown</span>
                          : (
                            <span className={r.margin_usd < 0 ? 'text-[hsl(var(--error))] font-semibold' : 'text-[hsl(var(--success))]'}>
                              {money(r.margin_usd)}
                            </span>
                          )}
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

export default ChannelsCostPanel;
