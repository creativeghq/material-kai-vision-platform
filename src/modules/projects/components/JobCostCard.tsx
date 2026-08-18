/**
 * Project job costing (WS2 #285) — revenue vs committed vs actual cost, margin, and WIP,
 * plus the per-user labor breakdown (WS1).
 *
 * Every number rendered here comes from `get_project_pnl`; this component formats and does not
 * derive. In particular it never adds `contracted_revenue` to `billed_revenue` (an invoice
 * normally derives from a quote — summing them double-counts) and never recomputes labor.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, TrendingUp, AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { formatMoney } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { projectsService, type ProjectPnl } from '../services/projectsService';

const money = (n: number | null | undefined, c: string) => formatMoney(n, c);
const hoursOf = (minutes: number) => Math.round((minutes / 60) * 100) / 100;

/** Positive margin reads as good, negative as a problem. Plain coloured text, never a pill. */
const marginTone = (n: number) => (n < 0 ? 'text-destructive' : 'text-emerald-400');

const Stat: React.FC<{ label: string; value: string; hint?: string; tone?: string }> = ({ label, value, hint, tone }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-xl font-medium mt-1 ${tone ?? ''}`}>{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

export const JobCostCard: React.FC<{ projectId: string; reloadToken?: number }> = ({ projectId, reloadToken }) => {
  const { toast } = useToast();
  const [pnl, setPnl] = useState<ProjectPnl | null>(null);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await projectsService.getProjectPnl(projectId);
      setPnl(result);

      const ids = result.labor.by_user.map((u) => u.user_id).filter(Boolean) as string[];
      if (ids.length) {
        const { data } = await supabase.from('user_profiles').select('id, full_name, email').in('id', ids);
        const names: Record<string, string> = {};
        for (const u of data ?? []) names[(u as any).id] = (u as any).full_name || (u as any).email || (u as any).id;
        setUserNames(names);
      }
    } catch (err: any) {
      toast({ title: 'Failed to load job cost', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
    // reloadToken is a deliberate dependency: booking an expense from the panel below must move
    // the margin above it, or the two cards sit on the same screen disagreeing.
  }, [projectId, toast, reloadToken]);
  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }
  if (!pnl) return null;

  // The RPC reports which currencies are actually behind the figures. More than one means the
  // totals mix money — say so rather than presenting a confidently wrong single number.
  const mixed = pnl.currencies.length > 1;
  const currency = pnl.currencies[0] ?? 'EUR';

  return (
    <Card className="dashboard-card">
      <CardHeader className="border-b border-hairline px-5 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <TrendingUp className="h-4 w-4 text-primary" /> Job cost
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Margin on billed work, and the forecast against what the client has agreed to.
        </p>
      </CardHeader>
      <CardContent className="p-5 space-y-5">
        {mixed && (
          <p className="flex items-start gap-2 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            This project mixes {pnl.currencies.join(', ')}. Totals below add different currencies
            together and are indicative only.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Contracted" value={money(pnl.contracted_revenue, currency)} hint="accepted quotes" />
          <Stat label="Billed" value={money(pnl.billed_revenue, currency)} hint="issued invoices" />
          <Stat label="Actual cost" value={money(pnl.actual_cost, currency)} hint="bills + labor + expenses" />
          <Stat
            label="Margin"
            value={money(pnl.margin_amount, currency)}
            tone={marginTone(pnl.margin_amount)}
            hint={pnl.margin_pct == null ? 'nothing billed yet' : `${pnl.margin_pct}% of billed`}
          />
        </div>

        {/* Cost breakdown — what makes up actual, plus the commitment still outstanding. */}
        <div className="rounded-lg border border-hairline divide-y divide-hairline text-sm">
          <Row label="Supplier bills" value={money(pnl.supplier_cost, currency)} />
          <Row label="Labor" value={money(pnl.labor_cost, currency)}
            hint={pnl.labor.total_minutes > 0 ? `${hoursOf(pnl.labor.total_minutes)}h logged` : 'no time logged'} />
          <Row label="Expenses" value={money(pnl.expense_cost, currency)}
            hint={pnl.expense_count > 0 ? 'approved claims' : 'no claims on this project'} />
          {/* Pending claims are shown but excluded from cost: an unreviewed claim should be
              visible without silently moving the margin. */}
          {pnl.pending_expense_cost > 0 && (
            <Row label="Pending claims" value={money(pnl.pending_expense_cost, currency)}
              hint="awaiting approval — not counted yet" muted />
          )}
          <Row label="Committed (open POs)" value={money(pnl.committed_cost, currency)}
            hint="ordered, not yet billed" muted />
          <Row
            label="Forecast margin"
            value={money(pnl.forecast_margin_amount, currency)}
            hint={pnl.forecast_margin_pct == null ? 'no accepted quote' : `${pnl.forecast_margin_pct}% of contracted`}
            tone={marginTone(pnl.forecast_margin_amount)}
          />
          <Row
            label="WIP"
            value={money(pnl.wip, currency)}
            hint="cost incurred, not yet billed"
            muted
          />
        </div>

        {/* WS1 labor strip — who spent the hours. */}
        {pnl.labor.by_user.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              <Clock className="h-3 w-3" /> Labor by person
            </p>
            <div className="rounded-lg border border-hairline divide-y divide-hairline text-sm">
              {pnl.labor.by_user.map((u) => (
                <div key={u.user_id ?? 'unassigned'} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    {u.user_id ? (userNames[u.user_id] || u.user_id.slice(0, 8)) : 'Unassigned'}
                  </span>
                  <span className="w-16 text-right text-xs text-muted-foreground">{hoursOf(u.minutes)}h</span>
                  <span className="w-24 text-right tabular-nums">{money(u.cost, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Row: React.FC<{ label: string; value: string; hint?: string; tone?: string; muted?: boolean }> = ({
  label, value, hint, tone, muted,
}) => (
  <div className="flex items-center gap-3 px-4 py-2.5">
    <div className="min-w-0 flex-1">
      <p className={muted ? 'text-muted-foreground' : ''}>{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
    <span className={`tabular-nums ${tone ?? (muted ? 'text-muted-foreground' : '')}`}>{value}</span>
  </div>
);

export default JobCostCard;
