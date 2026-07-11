import React, { useEffect, useState } from 'react';
import { Loader2, Calculator, Ship, ChevronDown, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { stockService, type FreightQuote, type FreightOffer } from '../services/stockService';

const CONTAINERS = [
  { value: '20st', label: "20' Standard" },
  { value: '40st', label: "40' Standard" },
  { value: '40hq', label: "40' High Cube" },
  { value: '20ref', label: "20' Reefer" },
  { value: '40ref', label: "40' Reefer" },
];
const money = (a: number | null, c: string | null) => a == null ? '—' : `${c === 'USD' ? '$' : c === 'GBP' ? '£' : c === 'EUR' ? '€' : `${c ?? ''} `}${Number(a).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const OffersTable: React.FC<{ offers: FreightOffer[] }> = ({ offers }) => (
  <table className="w-full text-sm">
    <thead className="text-xs text-muted-foreground">
      <tr className="border-b border-border/60">
        <th className="px-3 py-2 text-left">Carrier / forwarder</th>
        <th className="px-3 py-2 text-right">Price</th>
        <th className="px-3 py-2 text-right">Transit</th>
        <th className="px-3 py-2 text-left">Valid</th>
      </tr>
    </thead>
    <tbody>
      {offers.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No offers returned.</td></tr>}
      {offers.map((o, i) => (
        <tr key={i} className="border-b border-border/30">
          <td className="px-3 py-2">{o.carrier ?? '—'}{i === 0 && o.amount != null && <Badge variant="outline" className="ml-2 border-emerald-500/50 text-emerald-500">cheapest</Badge>}</td>
          <td className="px-3 py-2 text-right font-medium">{money(o.amount, o.currency)}</td>
          <td className="px-3 py-2 text-right text-muted-foreground">{o.transit_days ? <span className="inline-flex items-center"><Clock className="h-3 w-3 mr-0.5" />{o.transit_days}d</span> : '—'}</td>
          <td className="px-3 py-2 text-xs text-muted-foreground">{o.valid_until ?? '—'}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const FreightQuotesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<FreightQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setRows(await stockService.listFreightQuotes(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load quotes', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="text-sm flex items-center gap-2"><Calculator className="h-4 w-4" /> Freight quotes</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Compare shipping cost across 100+ forwarders (via SeaRates).</p>
        </div>
        <Button size="sm" className="rounded-full shrink-0" onClick={() => setOpen(true)}><Calculator className="h-4 w-4 mr-1" /> Get quote</Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No quotes yet. Get a quote to compare shipping cost from many carriers.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Route</th>
                <th className="px-4 py-2 text-left">Mode</th>
                <th className="px-4 py-2 text-right">From</th>
                <th className="px-4 py-2 text-right">Offers</th>
                <th className="px-4 py-2 text-left">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const isOpen = expanded === q.id;
                return (
                  <React.Fragment key={q.id}>
                    <tr className="border-b border-border/30 cursor-pointer hover:bg-muted/20" onClick={() => setExpanded(isOpen ? null : q.id)}>
                      <td className="px-4 py-2 font-medium">
                        <span className="inline-flex items-center gap-1">{isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}{q.origin} → {q.destination}</span>
                        {q.container_type && <span className="ml-2 text-xs text-muted-foreground">{q.container_type}</span>}
                        {q.status === 'pending' && <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-500">Awaiting operator</Badge>}
                        {q.status === 'declined' && <Badge variant="outline" className="ml-2 border-muted-foreground/40 text-muted-foreground">Declined</Badge>}
                      </td>
                      <td className="px-4 py-2 uppercase text-xs text-muted-foreground">{q.mode}</td>
                      <td className="px-4 py-2 text-right font-medium">{q.status === 'quoted' ? money(q.cheapest_amount, q.cheapest_currency) : '—'}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{q.status === 'quoted' ? q.offer_count : '—'}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/30 bg-muted/10">
                        <td colSpan={5} className="px-6 py-2">
                          {q.status === 'quoted' ? <OffersTable offers={q.offers} />
                            : q.status === 'declined' ? <div className="text-xs text-muted-foreground py-2">Declined by the operator{q.operator_note ? `: ${q.operator_note}` : '.'}</div>
                            : <div className="text-xs text-muted-foreground py-2">Requested from the operator — you'll see offers here once they respond.</div>}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
      <GetQuoteModal open={open} onOpenChange={setOpen} workspaceId={workspaceId} onQuoted={async () => { await load(); }} />
    </Card>
  );
};

const GetQuoteModal: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; onQuoted: () => void }> = ({ open, onOpenChange, workspaceId, onQuoted }) => {
  const { toast } = useToast();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [mode, setMode] = useState('fcl');
  const [container, setContainer] = useState('40hq');
  const [readyDate, setReadyDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FreightQuote | null>(null);

  useEffect(() => {
    if (!open) { setOrigin(''); setDestination(''); setMode('fcl'); setContainer('40hq'); setReadyDate(''); setResult(null); }
  }, [open]);

  const submit = async () => {
    if (!origin.trim() || !destination.trim()) { toast({ title: 'Enter origin and destination', variant: 'destructive' }); return; }
    setBusy(true); setResult(null);
    try {
      const q = await stockService.getFreightQuote(workspaceId, {
        origin: origin.trim(), destination: destination.trim(), mode,
        container_type: mode === 'fcl' ? container : undefined,
        ready_date: readyDate || undefined,
      });
      onQuoted();
      if (q.status === 'pending') {
        setResult(null);
        toast({ title: 'Request sent to the operator', description: "You'll see the offers here once they respond." });
        onOpenChange(false);
        return;
      }
      setResult(q);
      if (q.offer_count === 0) toast({ title: 'No offers found', description: 'Try a different route or mode.' });
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
                <SelectContent>
                  <SelectItem value="fcl">Ocean FCL</SelectItem>
                  <SelectItem value="lcl">Ocean LCL</SelectItem>
                  <SelectItem value="air">Air</SelectItem>
                </SelectContent>
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

          {result && (
            <div className="rounded-md border border-border/60">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border/60">{result.offer_count} offer(s) · {result.origin} → {result.destination}</div>
              <div className="max-h-64 overflow-y-auto"><OffersTable offers={result.offers} /></div>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">With your own SeaRates key (Profile → Keys) you get instant offers from 100+ forwarders. Without one, the request is sent to the operator, who sends you a quote.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Get quote'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
