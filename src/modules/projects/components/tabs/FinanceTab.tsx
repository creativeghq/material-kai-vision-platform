/**
 * Project Finance — attach payables (supplier bills + payable manual entries) and
 * receivables (invoices + receivable manual entries) to a project, scoped to the
 * project's client/supplier. Shows AR/AP totals. Attaching just stamps project_id on
 * the finance row; detaching clears it (the document itself is untouched).
 *
 * Owner-only + finance.manage. End-customer collaborators never reach this tab.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, Loader2, Plus, ArrowDownLeft, ArrowUpRight, Link2Off, FileText,
} from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { OrdersPanel } from '@/modules/finance/components/OrdersPanel';
import {
  projectsService,
  type ProjectFinanceRow,
  type ProjectFinanceSummary,
} from '../../services/projectsService';

const money = (n: number | null | undefined, c: string | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'EUR' }).format(n);

const KIND_LABEL: Record<string, string> = {
  invoice: 'Invoice', manual: 'Manual', supplier_bill: 'Supplier bill',
};

export const FinanceTab: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { activeWorkspaceId } = useWorkspace();
  const [summary, setSummary] = useState<ProjectFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<'receivable' | 'payable' | null>(null);

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

  const Section: React.FC<{
    title: string; icon: React.ReactNode; rows: ProjectFinanceRow[];
    total: number; due: number; kind: 'receivable' | 'payable';
  }> = ({ title, icon, rows, total, due, kind }) => (
    <Card className="dashboard-card">
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-4 border-b border-white/8">
          <div className="flex items-center gap-2">
            {icon}
            <h3 className="text-sm font-medium">{title}</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium">{money(total, 'EUR')}</p>
              <p className="text-[11px] text-muted-foreground">{money(due, 'EUR')} due</p>
            </div>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setPicker(kind)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Attach
            </Button>
          </div>
        </div>
        {rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Nothing attached yet.</div>
        ) : (
          <div className="divide-y divide-white/8">
            {rows.map((r) => (
              <div key={`${r.kind}-${r.id}`} className="p-4 flex items-center gap-3">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium truncate">{r.label || r.id.slice(0, 8)}</p>
                    <Badge variant="outline" className="text-[10px]">{KIND_LABEL[r.kind] || r.kind}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.issued_at ? new Date(r.issued_at).toLocaleDateString() : 'Draft'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-medium">{money(r.total, r.currency)}</p>
                  <Badge variant="outline" className="text-[10px] mt-1">{r.status}</Badge>
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
      <div className="grid grid-cols-2 gap-3">
        <Card className="dashboard-card"><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ArrowDownLeft className="h-3 w-3" /> Receivable due</p>
          <p className="text-xl font-medium mt-1">{money(t.receivable_due, 'EUR')}</p>
          <p className="text-xs text-muted-foreground">of {money(t.receivable_total, 'EUR')} billed</p>
        </CardContent></Card>
        <Card className="dashboard-card"><CardContent className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> Payable due</p>
          <p className="text-xl font-medium mt-1">{money(t.payable_due, 'EUR')}</p>
          <p className="text-xs text-muted-foreground">of {money(t.payable_total, 'EUR')} billed</p>
        </CardContent></Card>
      </div>

      <Section title="Receivables" icon={<ArrowDownLeft className="h-4 w-4 text-emerald-400" />}
        rows={summary.receivables} total={t.receivable_total} due={t.receivable_due} kind="receivable" />
      <Section title="Payables" icon={<ArrowUpRight className="h-4 w-4 text-amber-400" />}
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
          <div className="max-h-72 overflow-auto rounded-md border border-white/10 divide-y divide-white/8">
            {candidates.map((c) => (
              <div key={`${c.kind}-${c.id}`} className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.label || c.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{KIND_LABEL[c.kind] || c.kind} · {c.status}</p>
                </div>
                <span className="text-sm">{money(c.total, c.currency)}</span>
                <Button size="sm" className="rounded-full" onClick={() => attach(c)} disabled={busy === c.id}>
                  {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Attach'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
