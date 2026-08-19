/**
 * Shipping as a quote extra (Quotes → Extras). "Get shipping quote" fetches freight rates via SeaRates
 * (the tenant's own BYOK key → instant offers; no key → a request to the operator, answered later), and
 * a chosen offer is added to the quote as a shipping line item (quotesService.addCustomItem). Freight
 * quotes are linked to this quote so they show here regardless of BYOK-vs-operator timing.
 */
import React, { useEffect, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Loader2, Ship, Calculator, Plus } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { stockService, type FreightQuote, type FreightOffer } from '@/modules/stock/services/stockService';
import { quotesService } from '../services/QuotesService';
import { HubEmptyState } from '@/components/core/hub';

const CONTAINERS = [
  { value: '20st', label: "20' Standard" }, { value: '40st', label: "40' Standard" },
  { value: '40hq', label: "40' High Cube" }, { value: '20ref', label: "20' Reefer" }, { value: '40ref', label: "40' Reefer" },
];
const money = (a: number | null, c: string | null) => formatMoney(a, c ?? 'EUR', { decimals: 0 });

export const QuoteShippingCard: React.FC<{ quoteId: string; editable: boolean; onAdded: () => void }> = ({ quoteId, editable, onAdded }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const ws = activeWorkspaceId ?? '';
  const [rows, setRows] = useState<FreightQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await stockService.listQuoteFreightQuotes(quoteId)); }
    catch { /* best-effort */ }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [quoteId]);

  const addOfferAsLine = async (q: FreightQuote, o: FreightOffer, key: string) => {
    if (o.amount == null) { toast({ title: 'This offer has no price', variant: 'destructive' }); return; }
    setAdding(key);
    try {
      await quotesService.addCustomItem({
        quote_id: quoteId,
        custom_product_name: `Shipping — ${o.carrier ?? 'freight'}`,
        custom_product_description: `${q.origin} → ${q.destination} (${q.mode.toUpperCase()}${q.container_type ? `, ${q.container_type}` : ''}${o.transit_days ? `, ~${o.transit_days}d` : ''})`,
        custom_unit: 'shipment',
        unit_price: o.amount,
        quantity: 1,
      });
      toast({ title: 'Shipping added to the quote' });
      onAdded();
    } catch (err: any) {
      toast({ title: 'Failed to add', description: err?.message, variant: 'destructive' });
    } finally { setAdding(null); }
  };

  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2 text-primary"><Ship className="h-4 w-4" /> Shipping</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Get a freight cost (compares 100+ forwarders) and add it to the quote.</p>
        </div>
        {editable && (
          <Button size="sm" onClick={() => setModalOpen(true)}><Calculator /> Get shipping quote</Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <HubEmptyState
          icon={Ship}
          title="No shipping quotes yet"
          description="Ask for a freight price on this quote and it lands here for the operator to confirm, so the shipping line on the customer's quote is a real number."
          action={editable ? <Button size="sm" onClick={() => setModalOpen(true)}><Calculator /> Get shipping quote</Button> : undefined}
        />
      ) : (
        <div className="space-y-3">
          {rows.map((q) => (
            <div key={q.id} className="rounded-lg border border-border/60">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/10">
                <div className="text-sm font-medium">{q.origin} → {q.destination} <span className="text-xs text-muted-foreground uppercase">· {q.mode}{q.container_type ? ` · ${q.container_type}` : ''}</span></div>
                {q.status === 'pending' && <span className="text-xs text-amber-500">Awaiting operator</span>}
                {q.status === 'declined' && <span className="text-xs text-muted-foreground">Declined</span>}
                {q.status === 'quoted' && <Badge variant="outline" className="border-emerald-500/50 text-emerald-500">{q.offer_count} offer{q.offer_count === 1 ? '' : 's'}</Badge>}
              </div>
              {q.status === 'quoted' ? (
                <table className="w-full text-sm">
                  <tbody>
                    {q.offers.map((o, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0">
                        <td className="px-3 py-2">{o.carrier ?? '—'}{o.transit_days ? <span className="ml-2 text-xs text-muted-foreground">~{o.transit_days}d</span> : null}</td>
                        <td className="px-3 py-2 text-right font-medium">{money(o.amount, o.currency)}</td>
                        <td className="px-3 py-2 text-right">
                          {editable && (
                            <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" disabled={adding === `${q.id}:${i}`} onClick={() => addOfferAsLine(q, o, `${q.id}:${i}`)}>
                              {adding === `${q.id}:${i}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" /> Add to quote</>}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : q.status === 'declined' ? (
                <div className="px-3 py-2 text-xs text-muted-foreground">Declined by the operator{q.operator_note ? `: ${q.operator_note}` : '.'}</div>
              ) : (
                <div className="px-3 py-2 text-xs text-muted-foreground">Requested from the operator — offers will appear here once they respond.</div>
              )}
            </div>
          ))}
        </div>
      )}

      <GetQuoteModal open={modalOpen} onOpenChange={setModalOpen} workspaceId={ws} quoteId={quoteId} onDone={load} />
    </div>
  );
};

const GetQuoteModal: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; quoteId: string; onDone: () => void }> = ({ open, onOpenChange, workspaceId, quoteId, onDone }) => {
  const { toast } = useToast();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState('fcl');
  const [container, setContainer] = useState('40hq');
  const [readyDate, setReadyDate] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setOrigin(''); setDestination(''); setMode('fcl'); setContainer('40hq'); setReadyDate(''); } }, [open]);

  const submit = async () => {
    if (!origin.trim() || !destination.trim()) { toast({ title: 'Enter origin and destination', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const q = await stockService.getFreightQuote(workspaceId, {
        origin: origin.trim(), destination: destination.trim(), mode,
        container_type: mode === 'fcl' ? container : undefined, ready_date: readyDate || undefined, quote_id: quoteId,
      });
      onDone();
      if (q.status === 'pending') toast({ title: 'Request sent to the operator', description: 'Offers will appear under Shipping once they respond.' });
      else if (q.offer_count === 0) toast({ title: 'No offers found', description: 'Try a different route or mode.' });
      else toast({ title: `${q.offer_count} offer(s) found`, description: 'Add one to the quote below.' });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Quote failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Ship className="h-4 w-4" /> Get a shipping quote</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>From (origin)</Label><Input autoFocus value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="e.g. Shanghai, CN" /></div>
            <div className="space-y-1"><Label>To (destination)</Label><Input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Piraeus, GR" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fcl">Ocean FCL</SelectItem><SelectItem value="lcl">Ocean LCL</SelectItem><SelectItem value="air">Air</SelectItem></SelectContent>
              </Select>
            </div>
            {mode === 'fcl' && (
              <div className="space-y-1">
                <Label>Container</Label>
                <Select value={container} onValueChange={setContainer}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTAINERS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1"><Label>Ready date</Label><Input type="date" value={readyDate} onChange={(e) => setReadyDate(e.target.value)} /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">Your shipping request is sent for pricing — offers appear under Shipping once ready, then add one to the quote.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get quote'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
