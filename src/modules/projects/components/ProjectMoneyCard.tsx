import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Wallet } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/decimal';
import {
  parseProjectPnl,
  projectsService,
  type CommandCentreFlagKey,
  type CostSnapshot,
  type ProjectCommandCentre,
  type ProjectFinanceSummary,
} from '../services/projectsService';

type Money = (v: number) => string;

const FLAG_TEXT: Record<CommandCentreFlagKey, (v: number, money: Money) => string> = {
  negative_forecast_margin: (v, m) => `Forecast margin is ${m(v)} — costs to date plus open orders exceed the contract.`,
  over_budget: (v, m) => `Over budget by ${m(-v)} once open purchase orders are counted.`,
  billed_exceeds_contract: (v, m) => `Billed ${m(v)} more than the contract plus approved variations.`,
  pending_variations_exposure: (v, m) => `${m(v)} of variations await a decision — more than 10% of the contract.`,
  certified_unpaid_overdue: (v) => `${v} certified application${v === 1 ? ' is' : 's are'} past the due date and unpaid.`,
  late_deliveries: (v) => `${v} purchase order${v === 1 ? ' is' : 's are'} past the supplier ETA.`,
  critical_snags_open: (v) => `${v} critical snag${v === 1 ? ' is' : 's are'} still open.`,
  overdue_requests: (v) => `${v} RFI/request${v === 1 ? ' is' : 's are'} past the due date.`,
  mixed_currencies: (v) => `Figures add amounts across ${v} currencies.`,
};

const FLAG_SECTION: Partial<Record<CommandCentreFlagKey, string>> = {
  pending_variations_exposure: 'changes',
  certified_unpaid_overdue: 'billing',
  billed_exceeds_contract: 'billing',
  late_deliveries: 'purchases',
  critical_snags_open: 'site',
  overdue_requests: 'requests',
  negative_forecast_margin: 'finance',
  over_budget: 'finance',
};

const SEVERITY_VARIANT = { high: 'error', medium: 'warning', info: 'neutral' } as const;

/** The project's money on one card. Every figure is read from one RPC and formatted here. */
export const ProjectMoneyCard: React.FC<{
  projectId: string;
  onOpenSection: (tab: string) => void;
}> = ({ projectId, onOpenSection }) => {
  const [centre, setCentre] = useState<ProjectCommandCentre | null>(null);
  const [centreFailed, setCentreFailed] = useState(false);
  const [owed, setOwed] = useState<ProjectFinanceSummary | null | 'failed'>(null);
  const [snaps, setSnaps] = useState<CostSnapshot[] | null | 'failed'>(null);

  useEffect(() => {
    let cancelled = false;
    setCentre(null);
    setCentreFailed(false);
    setOwed(null);
    setSnaps(null);
    projectsService.getProjectCommandCentre(projectId)
      .then((d) => { if (!cancelled) setCentre(d); })
      .catch(() => { if (!cancelled) setCentreFailed(true); });
    projectsService.getProjectFinanceSummary(projectId)
      .then((s) => { if (!cancelled) setOwed(s); })
      .catch(() => { if (!cancelled) setOwed('failed'); });
    projectsService.getCostSnapshots(projectId)
      .then((s) => { if (!cancelled) setSnaps(s); })
      .catch(() => { if (!cancelled) setSnaps('failed'); });
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 font-medium"><Wallet className="h-4 w-4 text-primary" />Money</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Contract, billing and cost on this project, net of VAT unless stated.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => onOpenSection('finance')}>
          Costs<ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {centreFailed ? (
          <p className="text-sm text-amber-800 dark:text-amber-300">
            The project&apos;s figures could not be loaded. They are unknown, not zero.
          </p>
        ) : !centre ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <Body centre={centre} owed={owed} snaps={snaps} onOpenSection={onOpenSection} />
        )}
      </CardContent>
    </Card>
  );
};

const Body: React.FC<{
  centre: ProjectCommandCentre;
  owed: ProjectFinanceSummary | null | 'failed';
  snaps: CostSnapshot[] | null | 'failed';
  onOpenSection: (tab: string) => void;
}> = ({ centre, owed, snaps, onOpenSection }) => {
  const pnl = parseProjectPnl(centre.dashboard?.pnl);
  const currency: string = pnl.currencies[0] ?? centre.dashboard?.budget_currency ?? 'EUR';
  const money: Money = (v) => formatMoney(v ?? 0, currency);
  const { contract, retention } = centre;
  const onContract = pnl.contracted_revenue > 0;

  const billedHint = [
    centre.certified > 0 ? `${money(centre.certified)} certified` : null,
    retention?.outstanding > 0 ? `${money(retention.outstanding)} retention held` : null,
  ].filter(Boolean).join(' · ') || 'Issued invoices, less credit notes';

  let owedValue = '…';
  let owedHint = 'Unpaid on issued invoices, incl. VAT';
  let owedTone: 'unknown' | undefined;
  if (owed === 'failed') {
    owedValue = 'Unknown';
    owedHint = 'Could not be loaded — unknown, not zero';
    owedTone = 'unknown';
  } else if (owed) {
    owedValue = owed.currencies.length > 1
      ? 'Mixed Currencies'
      : formatMoney(owed.totals.receivable_due, owed.currencies[0] ?? currency);
  }

  return (
    <div className="space-y-5">
      {centre.flags.length > 0 && (
        <ul className="space-y-2">
          {centre.flags.map((f) => {
            const tab = FLAG_SECTION[f.key];
            const text = FLAG_TEXT[f.key]?.(f.value, money) ?? f.key;
            return (
              <li key={f.key} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <Badge variant={SEVERITY_VARIANT[f.severity]}>{f.severity}</Badge>
                {tab ? (
                  <button type="button" className="text-left hover:underline" onClick={() => onOpenSection(tab)}>{text}</button>
                ) : (
                  <span>{text}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat
          label="Contract incl. Variations"
          value={contract.total > 0 ? money(contract.total) : '—'}
          hint={contract.variations_approved !== 0
            ? `${money(contract.variations_approved)} approved variations`
            : contract.variations_pending_count > 0
              ? `${contract.variations_pending_count} variation${contract.variations_pending_count === 1 ? '' : 's'} awaiting a decision`
              : 'Accepted quotes'}
        />
        <Stat label="Billed" value={money(pnl.billed_revenue)} hint={billedHint} />
        <Stat label="Customers Owe" value={owedValue} hint={owedHint} tone={owedTone} onClick={() => onOpenSection('billing')} />
        <Stat label="Spent" value={money(pnl.actual_cost)} hint="Supplier bills, labour and approved expenses" />
        <Stat label="On Order" value={money(pnl.committed_cost)} hint="Purchase orders not billed yet" onClick={() => onOpenSection('purchases')} />
        <Stat
          label="Forecast Margin"
          value={onContract ? money(pnl.forecast_margin_amount) : '—'}
          hint={!onContract
            ? 'Needs an accepted quote'
            : `${pnl.forecast_margin_pct !== null ? `${pnl.forecast_margin_pct}% of ` : 'Against '}accepted quotes${contract.variations_approved !== 0 ? ', before variations' : ''}`}
          tone={onContract && pnl.forecast_margin_amount < 0 ? 'bad' : undefined}
        />
      </div>

      {pnl.pending_expense_cost > 0 && (
        <p className="text-xs text-muted-foreground">
          {money(pnl.pending_expense_cost)} of expense claims await approval and are not in Spent yet.
        </p>
      )}

      <CostTrend snaps={snaps} money={money} />
    </div>
  );
};

const CostTrend: React.FC<{ snaps: CostSnapshot[] | null | 'failed'; money: Money }> = ({ snaps, money }) => {
  if (snaps === null) return null;
  if (snaps === 'failed') {
    return <p className="text-xs text-amber-800 dark:text-amber-300">The cost history could not be loaded. It is unknown, not empty.</p>;
  }
  if (snaps.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        The cost trend starts with the first nightly snapshot — {snaps.length === 1 ? 'a second point appears tomorrow.' : 'none is recorded yet.'}
      </p>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">Spent plus on order, against the cost budget</p>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={snaps.map((s) => ({
          day: new Date(`${s.snapshot_date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          'Spent + on order': s.actual_cost + s.committed_cost,
          Budget: s.budget_cost > 0 ? s.budget_cost : null,
        }))}>
          <CartesianGrid vertical={false} stroke="hsl(var(--hairline))" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
          <Tooltip formatter={(v: number) => money(v)} />
          <Line type="monotone" dataKey="Spent + on order" stroke="hsl(var(--chart-2))" dot={false} strokeWidth={2} />
          <Line type="stepAfter" dataKey="Budget" stroke="hsl(var(--chart-3))" dot={false} strokeDasharray="4 3" connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const Stat: React.FC<{
  label: string;
  value: string;
  hint?: string;
  tone?: 'bad' | 'unknown';
  onClick?: () => void;
}> = ({ label, value, hint, tone, onClick }) => {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-1 truncate text-xl font-semibold tabular-nums',
        tone === 'bad' && 'text-destructive',
        tone === 'unknown' && 'text-amber-800 dark:text-amber-300',
      )}>{value}</p>
      {hint && <p className="truncate text-[11px] text-muted-foreground" title={hint}>{hint}</p>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="min-w-0 rounded-sm text-left hover:bg-surface-sunken">{body}</button>
  ) : (
    <div className="min-w-0">{body}</div>
  );
};

export default ProjectMoneyCard;
