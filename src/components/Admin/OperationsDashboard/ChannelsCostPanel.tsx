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
import { Radio, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
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
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

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
          template messages are billed by Meta directly to the WABA and never reach any figure
          here; reconcile that invoice monthly against the template spend.
        </p>
      </CardContent>
    </Card>
  );
};

export default ChannelsCostPanel;
