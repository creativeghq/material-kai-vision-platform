import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Ship, RefreshCw, PackageCheck, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { supabase } from '@/integrations/supabase/client';
import { stockService, type InboundShipment } from '../services/stockService';

// Normalized milestone order → progress + label/colour.
const STAGES = ['pending', 'booked', 'gate_in', 'loaded', 'departed', 'in_transit', 'arrived', 'discharged', 'gate_out', 'delivered'];
const STAGE_LABEL: Record<string, string> = {
  pending: 'Pending', booked: 'Booked', gate_in: 'Gate in', loaded: 'Loaded', departed: 'Departed',
  in_transit: 'In transit', arrived: 'Arrived', discharged: 'Discharged', gate_out: 'Gate out', delivered: 'Delivered', unknown: 'Unknown',
};
const progressPct = (status: string) => {
  const i = STAGES.indexOf(status);
  return i < 0 ? 0 : Math.round((i / (STAGES.length - 1)) * 100);
};
const statusTone = (status: string) =>
  status === 'delivered' ? 'text-emerald-600 dark:text-emerald-400'
    : status === 'arrived' || status === 'discharged' || status === 'gate_out' ? 'text-primary'
    : status === 'unknown' || status === 'pending' ? 'text-muted-foreground'
    : 'text-amber-600 dark:text-amber-400';

export const InboundSection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<InboundShipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    // Stop-tracking removes rows, so the current page may no longer exist after a reload.
    try { const next = await stockService.listShipments(workspaceId); setRows(next); setPage((p) => clampPage(p, next.length)); }
    catch (err: any) { toast({ title: 'Failed to load shipments', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const refresh = async (s: InboundShipment) => {
    setBusy(s.id);
    try { await stockService.refreshShipment(workspaceId, s.id); toast({ title: 'Shipment refreshed' }); await load(); }
    catch (err: any) { toast({ title: 'Refresh failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const receive = async (s: InboundShipment) => {
    if (!confirm(`Receive the goods for ${s.reference} into the warehouse? This posts the linked purchase order to stock.`)) return;
    setBusy(s.id);
    try { await stockService.receiveShipment(workspaceId, s.id); toast({ title: 'Received into warehouse' }); await load(); }
    catch (err: any) { toast({ title: 'Receive failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const remove = async (s: InboundShipment) => {
    if (!confirm(`Stop tracking ${s.reference}?`)) return;
    setBusy(s.id);
    try { await stockService.removeShipment(workspaceId, s.id); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2"><Ship className="h-4 w-4" /> Inbound shipments</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">Track containers/BLs in transit and receive them into stock on arrival.</p>
        </div>
        <Button size="sm" className="rounded-full shrink-0" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" /> Track shipment</Button>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">No shipments tracked yet. Add a container or BL number to follow it to your door.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Reference</th>
                <th className="px-4 py-2 text-left">Route</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">ETA</th>
                <th className="px-4 py-2 text-left">PO</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {paginate(rows, page).map((s) => {
                const arrived = ['arrived', 'discharged', 'gate_out', 'delivered'].includes(s.status);
                const open = expanded === s.id;
                return (
                  <React.Fragment key={s.id}>
                    <tr className="border-b border-border/30 align-top">
                      <td className="px-4 py-2 font-medium">
                        <button className="flex items-center gap-1" onClick={() => setExpanded(open ? null : s.id)}>
                          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                          <span className="font-mono">{s.reference}</span>
                        </button>
                        <div className="text-[11px] text-muted-foreground ml-4">{s.tracking_type.toUpperCase()}{s.carrier ? ` · ${s.carrier}` : ''}</div>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{[s.origin, s.destination].filter(Boolean).join(' → ') || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs ${statusTone(s.status)}`}>{STAGE_LABEL[s.status] ?? s.status}</span>
                        <div className="mt-1 h-1 w-28 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary" style={{ width: `${progressPct(s.status)}%` }} /></div>
                      </td>
                      <td className="px-4 py-2 text-xs">{s.eta ?? '—'}</td>
                      <td className="px-4 py-2 text-xs">{s.order?.order_number ?? (s.order_id ? 'linked' : '—')}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" title="Refresh" disabled={busy === s.id} onClick={() => refresh(s)}>{busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
                          {arrived && s.order_id && s.is_active && (
                            <Button size="sm" variant="ghost" title="Receive into warehouse" onClick={() => receive(s)}><PackageCheck className="h-4 w-4 text-emerald-500" /></Button>
                          )}
                          <Button size="sm" variant="ghost" title="Stop tracking" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-border/30 bg-muted/10">
                        <td colSpan={6} className="px-8 py-2">
                          {s.last_event && <div className="text-xs mb-1">Latest: {s.last_event}</div>}
                          {s.milestones.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No milestone detail yet.</div>
                          ) : (
                            <ol className="text-xs space-y-0.5">
                              {s.milestones.map((m, i) => (
                                <li key={i} className="flex gap-2">
                                  <span className="text-muted-foreground w-24 shrink-0">{m.date ? m.date.slice(0, 10) : '—'}</span>
                                  <span>{m.name}{m.location ? ` · ${m.location}` : ''}</span>
                                </li>
                              ))}
                            </ol>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && <TablePagination page={page} total={rows.length} onPageChange={setPage} label="shipments" />}
      </CardContent>
      <AddShipmentDialog open={addOpen} onOpenChange={setAddOpen} workspaceId={workspaceId} onAdded={async () => { setAddOpen(false); await load(); }} />
    </Card>
  );
};

interface PurchaseOrderOpt { id: string; order_number: string | null; }

const AddShipmentDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; onAdded: () => void }> = ({ open, onOpenChange, workspaceId, onAdded }) => {
  const { toast } = useToast();
  const [reference, setReference] = useState('');
  const [type, setType] = useState('container');
  const [carrier, setCarrier] = useState('');
  const [orderId, setOrderId] = useState<string>('none');
  const [pos, setPos] = useState<PurchaseOrderOpt[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setReference(''); setType('container'); setCarrier(''); setOrderId('none'); return; }
    (async () => {
      const { data } = await supabase.from('orders').select('id, order_number')
        .eq('workspace_id', workspaceId).eq('order_type', 'purchase')
        .in('status', ['draft', 'confirmed', 'partially_fulfilled']).order('created_at', { ascending: false }).limit(50);
      setPos((data ?? []) as PurchaseOrderOpt[]);
    })();
  }, [open, workspaceId]);

  const submit = async () => {
    if (!reference.trim()) { toast({ title: 'Enter a container / BL number', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await stockService.addShipment(workspaceId, {
        reference: reference.trim(), tracking_type: type,
        carrier: carrier.trim() || undefined, order_id: orderId !== 'none' ? orderId : undefined,
      });
      toast({ title: 'Tracking started' });
      onAdded();
    } catch (err: any) {
      toast({ title: 'Could not track', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Track an Inbound Shipment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1"><Label>Reference</Label><Input autoFocus value={reference} onChange={(e) => setReference(e.target.value)} placeholder="MSCU1234567" /></div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="container">Container</SelectItem>
                  <SelectItem value="bl">Bill of Lading</SelectItem>
                  <SelectItem value="booking">Booking</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1"><Label>Carrier / Line (optional)</Label><Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. MSC, Maersk" /></div>
          <div className="space-y-1">
            <Label>Link to purchase order (optional)</Label>
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked</SelectItem>
                {pos.map((p) => <SelectItem key={p.id} value={p.id}>{p.order_number ?? p.id.slice(0, 8)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Linking lets you receive the goods into stock in one click on arrival.</p>
          </div>
          <p className="text-[11px] text-muted-foreground">Tracking runs on your own ShipsGo account (set it up in Profile → Keys). The platform doesn't charge credits for it.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start tracking'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
