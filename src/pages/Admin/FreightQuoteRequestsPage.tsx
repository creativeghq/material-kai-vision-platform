/**
 * Operator queue for tenant freight-quote requests. When a tenant has no SeaRates BYOK key, their
 * "Get quote" becomes a pending request here; the operator fulfils it (fetches rates on the operator's
 * own SeaRates account, or enters offers manually) and the answer flows back to the tenant. Operator-
 * only — the RPCs self-gate on is_platform_operator().
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Ship, Send, XCircle, Plus, Trash2, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { stockService, type PendingQuoteRequest, type FreightOffer } from '@/modules/stock/services/stockService';

type OfferRow = { carrier: string; amount: string; currency: string; transit: string };
const emptyRow = (): OfferRow => ({ carrier: '', amount: '', currency: 'USD', transit: '' });

export default function FreightQuoteRequestsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PendingQuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [answer, setAnswer] = useState<PendingQuoteRequest | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await stockService.listPendingQuotes()); }
    catch (err: any) { toast({ title: 'Failed to load requests', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const decline = async (q: PendingQuoteRequest) => {
    const reason = window.prompt(`Decline the quote request for ${q.origin} → ${q.destination}? Optional reason:`, '');
    if (reason === null) return;
    try { await stockService.declineQuote(q.id, reason || undefined); toast({ title: 'Request declined' }); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <div className="min-h-screen">
      <PageHeader icon={Ship} title="Freight quote requests" subtitle="Tenant requests without their own SeaRates key — fulfil and send back" />
      <div className="p-3 sm:p-6">
        <Card>
          <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm">Pending requests</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">No pending freight-quote requests.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-4 py-2 text-left">Workspace</th>
                    <th className="px-4 py-2 text-left">Route</th>
                    <th className="px-4 py-2 text-left">Mode</th>
                    <th className="px-4 py-2 text-left">Requested</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((q) => (
                    <tr key={q.id} className="border-b border-border/30">
                      <td className="px-4 py-2 font-medium">{q.workspace_name}</td>
                      <td className="px-4 py-2">{q.origin} → {q.destination}{q.container_type ? <span className="ml-2 text-xs text-muted-foreground">{q.container_type}</span> : null}</td>
                      <td className="px-4 py-2 uppercase text-xs text-muted-foreground">{q.mode}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(q.created_at).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" className="rounded-full h-7 text-xs" onClick={() => setAnswer(q)}><Send className="h-3.5 w-3.5 mr-1" /> Answer</Button>
                          <Button size="sm" variant="ghost" onClick={() => decline(q)}><XCircle className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
      <AnswerDialog request={answer} onOpenChange={(v) => { if (!v) setAnswer(null); }} onAnswered={async () => { setAnswer(null); await load(); }} />
    </div>
  );
}

const AnswerDialog: React.FC<{ request: PendingQuoteRequest | null; onOpenChange: (v: boolean) => void; onAnswered: () => void }> = ({ request, onOpenChange, onAnswered }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [offers, setOffers] = useState<OfferRow[]>([emptyRow()]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => { if (request) { setOffers([emptyRow()]); setNote(''); } }, [request?.id]);

  const fetchViaSearates = async () => {
    if (!request || !activeWorkspaceId) return;
    setFetching(true);
    try {
      const q = await stockService.getFreightQuote(activeWorkspaceId, {
        origin: request.origin, destination: request.destination, mode: request.mode,
        container_type: request.container_type ?? undefined, ready_date: request.ready_date ?? undefined,
      });
      if (q.status !== 'quoted' || q.offers.length === 0) {
        toast({ title: 'No offers from your SeaRates account', description: 'Enter offers manually.', variant: 'destructive' });
        return;
      }
      setOffers(q.offers.map((o) => ({ carrier: o.carrier ?? '', amount: o.amount != null ? String(o.amount) : '', currency: o.currency ?? 'USD', transit: o.transit_days != null ? String(o.transit_days) : '' })));
      toast({ title: `Pulled ${q.offers.length} offer(s) from SeaRates` });
    } catch (err: any) {
      toast({ title: 'SeaRates fetch failed', description: err?.message, variant: 'destructive' });
    } finally { setFetching(false); }
  };

  const send = async () => {
    if (!request) return;
    const valid: FreightOffer[] = offers
      .filter((o) => o.carrier.trim() || o.amount.trim())
      .map((o) => ({ carrier: o.carrier.trim() || null, amount: o.amount.trim() ? Number(o.amount) : null, currency: o.currency.trim() || null, transit_days: o.transit.trim() ? Number(o.transit) : null, valid_until: null, mode: request.mode }));
    if (valid.length === 0) { toast({ title: 'Add at least one offer', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await stockService.answerQuote(request.id, valid, note.trim() || undefined);
      toast({ title: 'Quote sent to the tenant' });
      onAnswered();
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (!request) return null;
  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Answer: {request.origin} → {request.destination} ({request.mode.toUpperCase()})</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Enter offers, or pull them from your own SeaRates account.</span>
            <Button size="sm" variant="outline" className="rounded-full" disabled={fetching} onClick={fetchViaSearates}>
              {fetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />} Fetch via SeaRates
            </Button>
          </div>
          <div className="space-y-2">
            {offers.map((o, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5 space-y-1"><Label className="text-xs">Carrier / forwarder</Label><Input value={o.carrier} onChange={(e) => setOffers((r) => r.map((x, j) => j === i ? { ...x, carrier: e.target.value } : x))} /></div>
                <div className="col-span-3 space-y-1"><Label className="text-xs">Price</Label><Input value={o.amount} onChange={(e) => setOffers((r) => r.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} inputMode="decimal" /></div>
                <div className="col-span-2 space-y-1"><Label className="text-xs">Ccy</Label><Input value={o.currency} onChange={(e) => setOffers((r) => r.map((x, j) => j === i ? { ...x, currency: e.target.value } : x))} /></div>
                <div className="col-span-1 space-y-1"><Label className="text-xs">Days</Label><Input value={o.transit} onChange={(e) => setOffers((r) => r.map((x, j) => j === i ? { ...x, transit: e.target.value } : x))} inputMode="numeric" /></div>
                <div className="col-span-1"><Button size="sm" variant="ghost" onClick={() => setOffers((r) => r.length > 1 ? r.filter((_, j) => j !== i) : r)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
              </div>
            ))}
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOffers((r) => [...r, emptyRow()])}><Plus className="h-4 w-4 mr-1" /> Add offer</Button>
          </div>
          <div className="space-y-1"><Label className="text-xs">Note to the tenant (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. rates valid 7 days, incl. THC" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={send} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /> Send quote</>}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
