/**
 * Project → invoice(s). Lists the project's invoices and lets the owner bill an
 * accepted project quote either in full or as a progress/milestone/final percentage.
 * Gated on the `finance.manage` capability (end-users never see this).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2, Plus, ArrowRight, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { projectsService, type QuoteBillingProgress } from '../../services/projectsService';
import { formatDate } from '@/utils/datetime';
import { HubEmptyState } from '@/components/core/hub';

const money = (n: number | null, c: string | null) => formatMoney(n, c ?? 'EUR');

export const BillingTab: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [acceptedQuotes, setAcceptedQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [quoteId, setQuoteId] = useState('');
  const [mode, setMode] = useState<'full' | 'progress' | 'milestone' | 'final'>('full');
  const [percent, setPercent] = useState('50');
  const [busy, setBusy] = useState(false);
  const [billing, setBilling] = useState<Record<string, QuoteBillingProgress>>({});

  // What is left to bill on the SELECTED quote. Read from the same SQL function the write
  // gates on — the dialog used to default to 50 every time it opened, with nothing anywhere
  // saying 70 was already billed.
  const progress = quoteId ? billing[quoteId] : undefined;
  const remaining = progress ? Number(progress.remaining_pct) : 100;
  const alreadyBilled = progress ? Number(progress.billed_pct) : 0;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [inv, quotes] = await Promise.all([
        projectsService.listProjectInvoices(projectId),
        projectsService.listProjectQuotes(projectId),
      ]);
      setInvoices(inv);
      const accepted = (quotes as any[]).filter((q) => q.status === 'accepted');
      setAcceptedQuotes(accepted);
      setBilling(await projectsService.quoteBillingProgress(accepted.map((q) => q.id)));
    } catch {
      toast({ title: 'Failed to load billing', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);
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
        // Mirrors the SQL gate rather than restating a constant: over-billing is refused server-side
        // either way, this just says so before the round trip.
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

  if (!can('finance.manage')) {
    return <Card className="dashboard-card"><CardContent className="py-12 text-center text-sm text-muted-foreground">Billing isn’t available for your account.</CardContent></Card>;
  }
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium flex items-center gap-2"><Receipt className="h-4 w-4" /> Invoices</h3>
        <Button
          size="sm"
          onClick={() => {
            const first = acceptedQuotes[0]?.id ?? '';
            const left = first ? Number(billing[first]?.remaining_pct ?? 100) : 100;
            setOpen(true); setQuoteId(first);
            // Part-billed quotes cannot take a full invoice, so do not open on an option the
            // write will refuse.
            setMode(left < 100 ? 'progress' : 'full');
            setPercent(String(left));
          }}
          disabled={acceptedQuotes.length === 0}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> New invoice
        </Button>
      </div>

      {acceptedQuotes.length === 0 && invoices.length === 0 && (
        <Card className="dashboard-card p-0">
          <HubEmptyState
            icon={FileText}
            title="No accepted quotes to invoice yet"
            description="Billing starts from an accepted quote — once one is accepted you can invoice it in full, or by progress percentage as the job runs."
            action={
              <Button size="sm" variant="outline" onClick={() => navigate(`/projects/${projectId}?tab=quotes`)}>
                Go to quotes
              </Button>
            }
          />
        </Card>
      )}

      {invoices.length > 0 && (
        <Card className="dashboard-card"><CardContent className="p-0"><div className="divide-y divide-hairline">
          {invoices.map((inv) => (
            <button key={inv.id} onClick={() => navigate(`/finance/invoices/${inv.id}`)} className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex items-center gap-3">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{inv.internal_number}</p>
                  <span className="text-[10px] text-muted-foreground capitalize">{inv.invoice_kind}{inv.progress_pct ? ` ${inv.progress_pct}%` : ''}</span>
                </div>
                <p className="text-xs text-muted-foreground">{inv.issued_at ? formatDate(inv.issued_at) : 'Draft'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium">{money(inv.total, inv.currency)}</p>
                <span className={`mt-1 inline-block text-[10px] capitalize ${statusTone(inv.status)}`}>{humanizeLabel(inv.status)}</span>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div></CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Invoice from Project</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Source quote (accepted)</Label>
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
              <Label>Billing</Label>
              <Select value={mode} onValueChange={(v: any) => setMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* A quote already part-billed by stage cannot take a 100% invoice on top —
                      `issue_invoice_from_quote` refuses it, so it is not offered. */}
                  <SelectItem value="full" disabled={alreadyBilled > 0}>Full amount</SelectItem>
                  <SelectItem value="progress">Progress (%)</SelectItem>
                  <SelectItem value="milestone">Milestone (%)</SelectItem>
                  <SelectItem value="final">Final (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {/* The running total. A stage-billed job is the whole point of this dialog, so the
                one number the operator needs is how much of it is left. */}
            {quoteId && alreadyBilled > 0 && (
              <p className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs">
                <span className="font-medium tabular-nums">{alreadyBilled}%</span> of this quote is already billed
                across {progress?.invoice_count ?? 0} invoice{(progress?.invoice_count ?? 0) === 1 ? '' : 's'} —{' '}
                <span className="font-medium tabular-nums">{remaining}%</span> remains.
              </p>
            )}
            {mode !== 'full' && (
              <div className="space-y-1">
                <Label>Percent of the quote</Label>
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
