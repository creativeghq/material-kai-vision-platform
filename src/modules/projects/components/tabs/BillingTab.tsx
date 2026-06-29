/**
 * #177 — project → invoice(s). Lists the project's invoices and lets the owner bill an
 * accepted project quote either in full or as a progress/milestone/final percentage.
 * Gated on the `finance.manage` capability (end-users never see this).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Loader2, Plus, ArrowRight, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { humanizeLabel } from '@/utils/humanize';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { projectsService } from '../../services/projectsService';

const money = (n: number | null, c: string | null) =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'EUR' }).format(n);

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [inv, quotes] = await Promise.all([
        projectsService.listProjectInvoices(projectId),
        projectsService.listProjectQuotes(projectId),
      ]);
      setInvoices(inv);
      setAcceptedQuotes((quotes as any[]).filter((q) => q.status === 'accepted'));
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
        if (!(p > 0 && p <= 100)) { toast({ title: 'Percent must be 1–100', variant: 'destructive' }); setBusy(false); return; }
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
        <Button size="sm" className="rounded-full" onClick={() => { setOpen(true); setQuoteId(acceptedQuotes[0]?.id ?? ''); setMode('full'); setPercent('50'); }} disabled={acceptedQuotes.length === 0}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New invoice
        </Button>
      </div>

      {acceptedQuotes.length === 0 && invoices.length === 0 && (
        <Card className="dashboard-card"><CardContent className="py-12 text-center">
          <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No accepted quotes to invoice yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Accept a project quote, then bill it here — in full or by progress %.</p>
        </CardContent></Card>
      )}

      {invoices.length > 0 && (
        <Card className="dashboard-card"><CardContent className="p-0"><div className="divide-y divide-white/8">
          {invoices.map((inv) => (
            <button key={inv.id} onClick={() => navigate(`/finance/invoices/${inv.id}`)} className="w-full text-left p-4 hover:bg-muted/40 transition-colors flex items-center gap-3">
              <FileText className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium truncate">{inv.internal_number}</p>
                  <Badge variant="outline" className="text-[10px]">{inv.invoice_kind}{inv.progress_pct ? ` ${inv.progress_pct}%` : ''}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : 'Draft'}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium">{money(inv.total, inv.currency)}</p>
                <Badge variant="outline" className="text-[10px] mt-1">{humanizeLabel(inv.status)}</Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div></CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New invoice from project</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Source quote (accepted)</Label>
              <Select value={quoteId} onValueChange={setQuoteId}>
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
                  <SelectItem value="full">Full amount</SelectItem>
                  <SelectItem value="progress">Progress (%)</SelectItem>
                  <SelectItem value="milestone">Milestone (%)</SelectItem>
                  <SelectItem value="final">Final (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {mode !== 'full' && (
              <div className="space-y-1">
                <Label>Percent of the quote</Label>
                <Input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} />
                <p className="text-[11px] text-muted-foreground">Every line is billed at this percentage, preserving the itemisation.</p>
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
