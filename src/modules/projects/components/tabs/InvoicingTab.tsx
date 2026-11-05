/** Commercial → Invoicing: everything coming in on this job. Invoices, payment applications, sales orders. */
import React, { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useNavigate } from 'react-router-dom';
import { FileText, Link2Off, Loader2, Paperclip, Plus, ArrowRight, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { OrdersPanel } from '@/modules/finance/components/OrdersPanel';
import { projectsService, type ProjectFinanceSummary, type QuoteBillingProgress } from '../../services/projectsService';
import { goToSectionLabel, projectSectionPath } from '../../projectSections';
import { formatDate } from '@/utils/datetime';
import { HubEmptyState, HubStatGrid, HubStatTile } from '@/components/core/hub';
import { ApplicationsCard } from '../ApplicationsCard';
import { AttachFinanceDialog } from '../AttachFinanceDialog';

const money = (n: number | null, c: string | null) => formatMoney(n, c ?? 'EUR');

export const InvoicingTab: React.FC<{ projectId: string; projectName?: string }> = ({ projectId, projectName }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isWorkspaceManager } = usePermissions();
  const { activeWorkspaceId } = useWorkspace();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [acceptedQuotes, setAcceptedQuotes] = useState<any[]>([]);
  const [summary, setSummary] = useState<ProjectFinanceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [quoteId, setQuoteId] = useState('');
  const [mode, setMode] = useState<'full' | 'progress' | 'milestone' | 'final'>('full');
  const [percent, setPercent] = useState('50');
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState<Record<string, QuoteBillingProgress>>({});

  // Read from the same SQL function the write gates on, so the dialog cannot offer what it refuses.
  const progress = quoteId ? billing[quoteId] : undefined;
  const remaining = progress ? Number(progress.remaining_pct) : 100;
  const alreadyBilled = progress ? Number(progress.billed_pct) : 0;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setFailed(false);
      const [inv, quotes, fin] = await Promise.all([
        projectsService.listProjectInvoices(projectId),
        projectsService.listProjectQuotes(projectId),
        projectsService.getProjectFinanceSummary(projectId),
      ]);
      setInvoices(inv);
      setSummary(fin);
      const accepted = (quotes as any[]).filter((q) => q.status === 'accepted');
      setAcceptedQuotes(accepted);
      setBilling(await projectsService.quoteBillingProgress(accepted.map((q) => q.id)));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!quoteId) { toast({ title: 'Pick a quote to invoice', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      let id: string;
      if (mode === 'full') {
        id = await projectsService.createFullInvoiceFromQuote(quoteId);
      } else {
        const p = parseFloat(percent);
        if (!(p > 0 && p <= remaining)) {
          toast({
            title: remaining < 100 ? `Only ${remaining}% of this quote is left to bill` : 'Percent must be 1–100',
            variant: 'destructive',
          });
          setBusy(false); return;
        }
        id = await projectsService.createProgressInvoice(quoteId, p, mode);
      }
      toast({ title: 'Invoice created' });
      setOpen(false);
      navigate(`/finance/invoices/${id}`);
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const detach = async (id: string) => {
    if (!confirm('Detach this invoice from the project? The invoice itself is kept.')) return;
    try {
      await projectsService.setFinanceAttachment('invoice', id, null);
      await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const openNew = () => {
    const first = acceptedQuotes[0]?.id ?? '';
    const left = first ? Number(billing[first]?.remaining_pct ?? 100) : 100;
    setOpen(true); setQuoteId(first);
    // A part-billed quote cannot take a full invoice, so do not open on an option the write refuses.
    setMode(left < 100 ? 'progress' : 'full');
    setPercent(String(left));
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (failed) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-amber-800 dark:text-amber-300">
        Invoices could not be loaded. What is billed and owed is unknown, not zero.
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </Card>
    );
  }

  const currency = summary?.currencies[0] ?? 'EUR';
  const mixed = (summary?.currencies.length ?? 0) > 1;
  const attachButton = (
    <Button size="sm" variant="outline" onClick={() => setAttaching(true)}>
      <Paperclip className="h-3.5 w-3.5 mr-1" /> Attach an invoice
    </Button>
  );

  return (
    <div className="space-y-4">
      {summary && (
        <HubStatGrid>
          <HubStatTile label="Invoiced" value={mixed ? 'Mixed Currencies' : money(summary.totals.receivable_total, currency)} help="Issued invoices on this project." />
          <HubStatTile label="Customers Owe" value={mixed ? 'Mixed Currencies' : money(summary.totals.receivable_due, currency)} help="What is still unpaid on those invoices." />
        </HubStatGrid>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 flex-wrap">
          <CardTitle className="flex items-center gap-2"><Receipt className="h-4 w-4" /> Invoices</CardTitle>
          {(invoices.length > 0 || acceptedQuotes.length > 0) && (
            <div className="flex gap-2">
              {attachButton}
              <Button size="sm" onClick={openNew} disabled={acceptedQuotes.length === 0}
                title={acceptedQuotes.length === 0 ? 'An invoice starts from an accepted quote' : undefined}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New invoice
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <HubEmptyState
              icon={FileText}
              title={acceptedQuotes.length === 0 ? 'No accepted quotes to invoice yet' : 'Nothing invoiced yet'}
              description={acceptedQuotes.length === 0
                ? 'Invoicing starts from an accepted quote. Once one is accepted you can invoice it in full, or by percentage as the job runs.'
                : 'Invoice an accepted quote in full, or by percentage as the job runs.'}
              action={acceptedQuotes.length === 0 ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => navigate(projectSectionPath(projectId, 'quotes'))}>{goToSectionLabel('quotes')}</Button>
                  {attachButton}
                </>
              ) : undefined}
            />
          ) : (
            <div className="divide-y divide-hairline">
              {invoices.map((inv) => (
                <div key={inv.id} className="flex items-center gap-1 pr-2 hover:bg-muted/40 transition-colors">
                  <button onClick={() => navigate(`/finance/invoices/${inv.id}`)} className="min-w-0 flex-1 text-left p-4 flex items-center gap-3">
                    <FileText className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium truncate">{inv.internal_number ?? 'Draft'}</p>
                        <span className="text-[10px] text-muted-foreground capitalize">{inv.invoice_kind}{inv.progress_pct ? ` ${inv.progress_pct}%` : ''}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{inv.issued_at ? formatDate(inv.issued_at) : 'Not issued yet'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-medium tabular-nums">{money(inv.total, inv.currency)}</p>
                      <span className={`mt-1 inline-block text-[10px] capitalize ${statusTone(inv.status)}`}>{humanizeLabel(inv.status)}</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" title="Detach from this project" aria-label="Detach from this project" onClick={() => void detach(inv.id)}>
                    <Link2Off className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ApplicationsCard projectId={projectId} workspaceId={activeWorkspaceId} currency={currency} isOwner={isWorkspaceManager} />

      <OrdersPanel workspaceId={activeWorkspaceId ?? ''} projectId={projectId} projectName={projectName} orderType="sales" />

      {attaching && (
        <AttachFinanceDialog
          projectId={projectId}
          direction="receivable"
          onClose={() => setAttaching(false)}
          onAttached={() => { setAttaching(false); void load(); }}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New invoice</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Accepted Quote</Label>
              <Select
                value={quoteId}
                onValueChange={(v) => {
                  setQuoteId(v);
                  const left = Number(billing[v]?.remaining_pct ?? 100);
                  setPercent(String(left));
                  if (left < 100) setMode((m) => (m === 'full' ? 'progress' : m));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick an accepted quote…" /></SelectTrigger>
                <SelectContent>
                  {acceptedQuotes.map((q) => <SelectItem key={q.id} value={q.id}>{q.quote_number || q.name || q.id.slice(0, 8)} — {money(q.grand_total, q.currency)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>How much</Label>
              <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full" disabled={alreadyBilled > 0}>Full amount</SelectItem>
                  <SelectItem value="progress">Progress (%)</SelectItem>
                  <SelectItem value="milestone">Milestone (%)</SelectItem>
                  <SelectItem value="final">Final (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {quoteId && alreadyBilled > 0 && (
              <p className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs">
                <span className="font-medium tabular-nums">{alreadyBilled}%</span> of this quote is already billed
                across {progress?.invoice_count ?? 0} invoice{(progress?.invoice_count ?? 0) === 1 ? '' : 's'} —{' '}
                <span className="font-medium tabular-nums">{remaining}%</span> remains.
              </p>
            )}
            {mode !== 'full' && (
              <div className="space-y-1">
                <Label>Percent of the Quote</Label>
                <Input type="number" min="1" max={remaining} value={percent} onChange={(e) => setPercent(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">
                  Every line is billed at this percentage, preserving the itemisation.
                  {remaining < 100 ? ` At most ${remaining}% is left on this quote.` : ''}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={create} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Create draft</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
