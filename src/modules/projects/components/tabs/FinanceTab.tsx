/**
 * Project Finance — attach payables (supplier bills) and receivables (invoices) to a
 * project, scoped to the project's client/supplier. Shows AR/AP totals. Attaching just stamps project_id on
 * the finance row; detaching clears it (the document itself is untouched).
 *
 * Owner-only + finance.manage. End-customer collaborators never reach this tab.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Plus, ArrowDownLeft, ArrowUpRight, Link2Off, FileText, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { OrdersPanel } from '@/modules/finance/components/OrdersPanel';
import { JobCostCard } from '../JobCostCard';
import { PricedScheduleCard } from '../PricedScheduleCard';
import { CvrCard } from '../CvrCard';
import { VariationsCard } from '../VariationsCard';
import { ApplicationsCard } from '../ApplicationsCard';
import { TenderPackagesCard } from '../TenderPackagesCard';
import { ProjectExpensesCard } from '../ProjectExpensesCard';
import { ProjectLabourCard } from '../ProjectLabourCard';
import { ProjectStockCard } from '../ProjectStockCard';
import {
  projectsService,
  type ProjectFinanceRow,
  type ProjectFinanceSummary,
} from '../../services/projectsService';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { formatDate } from '@/utils/datetime';

const money = (n: number | null | undefined, c: string | null | undefined) => formatMoney(n, c ?? 'EUR');

const KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', supplier_bill: 'Supplier bill',
};

export const FinanceTab: React.FC<{ projectId: string; projectName?: string }> = ({ projectId, projectName }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { can, isWorkspaceManager } = usePermissions();
  const { activeWorkspaceId } = useWorkspace();
  const [summary, setSummary] = useState<ProjectFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<'receivable' | 'payable' | null>(null);
  // Bumped when an expense is booked or unlinked, so the job-cost card re-derives.
  const [costToken, setCostToken] = useState(0);
  /** Bumped when a variation changes, so the CVR beside it reloads with the new figures. */
  const [cvrToken, setCvrToken] = useState(0);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setSummary(await projectsService.getProjectFinanceSummary(projectId));
    } catch {
      toast({ title: 'Failed to load finance', variant: 'destructive' });
    } finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { load(); }, [load]);

  const detach = async (row: ProjectFinanceRow) => {
    if (!confirm('Detach this document from the project? The document itself is kept.')) return;
    try {
      await projectsService.setFinanceAttachment(row.kind, row.id, null);
      toast({ title: 'Detached' });
      await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  if (!can('finance.manage')) {
    return <Card className="dashboard-card"><CardContent className="py-12 text-center text-sm text-muted-foreground">Finance isn’t available for your account.</CardContent></Card>;
  }
  if (loading || !summary) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const t = summary.totals;
  // The RPC reports which currencies are behind the totals. More than one means the tiles add
  // different money — say so rather than stamping EUR on it (#358 PQ-11).
  const mixed = summary.currencies.length > 1;
  const currency = summary.currencies[0] ?? 'EUR';

  const Section: React.FC<{
    title: string; icon: React.ReactNode; rows: ProjectFinanceRow[];
    total: number; due: number; kind: 'receivable' | 'payable';
  }> = ({ title, icon, rows, total, due, kind }) => (
    <Card className="dashboard-card">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b border-hairline">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{money(total, currency)}</p>
              <p className="text-[11px] text-muted-foreground">{money(due, currency)} due</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setPicker(kind)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Attach
            </Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nothing attached yet.</div>
        ) : (
          <div className="divide-y divide-hairline">
            {rows.map((r) => (
              <div key={`${r.kind}-${r.id}`} className="p-4 flex items-center gap-3">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{r.label || r.id.slice(0, 8)}</p>
                    <span className="text-[10px] text-muted-foreground capitalize">{KIND_LABEL[r.kind] || r.kind}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.issued_at ? formatDate(r.issued_at) : 'Draft'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-medium">{money(r.total, r.currency)}</p>
                  <span className={`mt-1 inline-block text-[10px] capitalize ${statusTone(r.status)}`}>{humanizeLabel(r.status)}</span>
                </div>
                {r.kind === 'invoice' && (
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/finance/invoices/${r.id}`)}>Open</Button>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Detach" onClick={() => detach(r)}>
                  <Link2Off className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Job cost first: margin is the question this tab exists to answer. AR/AP is the detail. */}
      <JobCostCard projectId={projectId} reloadToken={costToken} workspaceId={activeWorkspaceId} />

      {/* The priced schedule sits above the CVR because it is the value side the CVR reconciles
          against — an accepted contract schedule IS the contract sum. */}
      <PricedScheduleCard
        projectId={projectId}
        workspaceId={activeWorkspaceId}
        currency={currency}
        isOwner={isWorkspaceManager}
        onChanged={() => setCvrToken((t) => t + 1)}
      />

      {/* The CVR supersedes the plain cost-by-code card: cost with no value beside it cannot say
          whether the job is making money. It reads get_project_cvr, which itself selects from
          get_project_cost_by_code, so the cost half has one derivation shared with JobCostCard. */}
      <CvrCard projectId={projectId} currency={currency} reloadToken={cvrToken} />

      <VariationsCard
        projectId={projectId}
        workspaceId={activeWorkspaceId}
        currency={currency}
        isOwner={isWorkspaceManager}
        onChanged={() => setCvrToken((t) => t + 1)}
      />

      <ApplicationsCard
        projectId={projectId}
        workspaceId={activeWorkspaceId}
        currency={currency}
        isOwner={isWorkspaceManager}
      />

      {/* Tendering sits after the money views because awarding a package writes into them: the
          subcontract is a purchase order, so it lands in the CVR as committed cost. */}
      <TenderPackagesCard
        projectId={projectId}
        workspaceId={activeWorkspaceId}
        currency={currency}
        isOwner={isWorkspaceManager}
        onChanged={() => setCvrToken((t) => t + 1)}
      />

      {/* Labour, at the typed rate against what payroll says it actually cost (#378 N1). Sits
          beside the job cost because it is the half of the margin that was an estimate wearing the
          costume of an actual — and `get_project_labor` had no reader in the app at all. */}
      <ProjectLabourCard projectId={projectId} currency={summary.currencies[0] ?? null} />

      {/* What material is held for the job (#378 N3) — derived from the quote and sales order that
          hold it, because a project is not itself a reservation target. */}
      <ProjectStockCard projectId={projectId} />

      {/* Costs booked straight onto the job, plus linking imported card spend to it. */}
      <ProjectExpensesCard
        projectId={projectId}
        projectName={projectName ?? 'this project'}
        workspaceId={activeWorkspaceId ?? ''}
        onChanged={() => setCostToken((t) => t + 1)}
      />

      {mixed && (
        <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          This project mixes {summary.currencies.join(', ')}. The totals below add different
          currencies together and are indicative only.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="dashboard-card"><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ArrowDownLeft className="h-3 w-3" /> Receivable due</p>
          <p className="text-xl font-medium mt-1">{money(t.receivable_due, currency)}</p>
          <p className="text-xs text-muted-foreground">of {money(t.receivable_total, currency)} billed</p>
        </CardContent></Card>
        <Card className="dashboard-card"><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> Payable due</p>
          <p className="text-xl font-medium mt-1">{money(t.payable_due, currency)}</p>
          <p className="text-xs text-muted-foreground">of {money(t.payable_total, currency)} billed</p>
        </CardContent></Card>
      </div>

      <Section title="Receivables" icon={<ArrowDownLeft className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />}
        rows={summary.receivables} total={t.receivable_total} due={t.receivable_due} kind="receivable" />
      <Section title="Payables" icon={<ArrowUpRight className="h-4 w-4 text-amber-800 dark:text-amber-400" />}
        rows={summary.payables} total={t.payable_total} due={t.payable_due} kind="payable" />

      {/* This project's orders (sales & purchase). */}
      <OrdersPanel workspaceId={activeWorkspaceId ?? ''} projectId={projectId} />

      {picker && (
        <AttachDialog
          projectId={projectId}
          direction={picker}
          onClose={() => setPicker(null)}
          onAttached={() => { setPicker(null); load(); }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const AttachDialog: React.FC<{
  projectId: string;
  direction: 'receivable' | 'payable';
  onClose: () => void;
  onAttached: () => void;
}> = ({ projectId, direction, onClose, onAttached }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { receivables, payables } = await projectsService.listAttachableFinance(projectId);
        setCandidates(direction === 'receivable' ? receivables : payables);
      } catch (err: any) {
        toast({ title: 'Failed to load candidates', description: err?.message, variant: 'destructive' });
      } finally { setLoading(false); }
    })();
  }, [projectId, direction, toast]);

  const attach = async (c: any) => {
    setBusy(c.id);
    try {
      await projectsService.setFinanceAttachment(c.kind, c.id, projectId);
      toast({ title: 'Attached' });
      onAttached();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Attach {direction === 'receivable' ? 'a receivable' : 'a payable'}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : candidates.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No unattached {direction === 'receivable' ? 'invoices / receivables for this client' : 'supplier bills / payables'} found.
          </p>
        ) : (
          <div className="max-h-72 overflow-auto rounded-md border border-white/10 divide-y divide-hairline">
            {candidates.map((c, i) => (
              <React.Fragment key={`${c.kind}-${c.id}`}>
                {/* Candidates for THIS project lead; everything else in the workspace sits behind a
                    labelled divider rather than being presented as equally relevant (#358 PQ-13). */}
                {direction === 'payable' && !c.related && (i === 0 || candidates[i - 1]?.related) && (
                  <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/30">
                    Other unattached bills in this workspace
                  </p>
                )}
              <div className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.label || c.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{KIND_LABEL[c.kind] || c.kind} · {c.status}</p>
                </div>
                <span className="text-sm">{money(c.total, c.currency)}</span>
                <Button size="sm" onClick={() => attach(c)} disabled={busy === c.id}>
                  {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Attach'}
                </Button>
              </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
