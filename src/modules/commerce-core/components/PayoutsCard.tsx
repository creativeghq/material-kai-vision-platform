import React, { useCallback, useEffect, useState } from 'react';
import { Banknote, Plus, Trash2, Wand2, Check, AlertTriangle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import { todayLocalISO } from '@/utils/datetime';
import {
  storePayoutsService, type StorePayout, type PayoutOrderLine,
} from '@/services/commerce/storePayoutsService';
import type { StoreConnection } from '@/services/commerce/storeConnectionsService';

const TONE: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  draft: 'neutral', reconciled: 'success', discrepancy: 'warning',
};

export const PayoutsCard: React.FC<{ workspaceId: string; connections: StoreConnection[] }> = ({
  workspaceId, connections,
}) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<StorePayout[]>([]);
  const [lines, setLines] = useState<Record<string, PayoutOrderLine[]>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    connection_id: '', external_payout_id: '', period_start: '', period_end: '',
    paid_on: todayLocalISO(), gross: '', fees: '', net: '',
  });

  const load = useCallback(async () => {
    try { setRows(await storePayoutsService.list(workspaceId)); }
    catch (err) { toast({ title: 'Could not load payouts', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  }, [workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const loadLines = async (id: string) => {
    try {
      const got = await storePayoutsService.orders(id);
      setLines((m) => ({ ...m, [id]: got }));
    }
    catch (err) { toast({ title: 'Could not load the covered orders', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const toggle = async (id: string) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    await loadLines(id);
  };

  const submit = async () => {
    const conn = connections.find((c) => c.id === form.connection_id);
    if (!conn) { toast({ title: 'Pick the channel this payout came from', variant: 'destructive' }); return; }
    const gross = Number(form.gross) || 0;
    const fees = Number(form.fees) || 0;
    const net = form.net === '' ? gross - fees : Number(form.net);
    try {
      const id = await storePayoutsService.create(workspaceId, {
        connection_id: conn.id, platform: conn.platform,
        external_payout_id: form.external_payout_id,
        period_start: form.period_start, period_end: form.period_end, paid_on: form.paid_on,
        gross, fees, net,
      });
      setAdding(false);
      await load();
      const s = await storePayoutsService.suggest(id);
      await loadLines(id);
      setOpen(id);
      toast({
        title: `Attached ${s.added} order${s.added === 1 ? '' : 's'}`,
        description: s.note ?? undefined,
      });
    } catch (err) {
      toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const suggest = async (p: StorePayout) => {
    try {
      const s = await storePayoutsService.suggest(p.id);
      await loadLines(p.id);
      toast({ title: `Attached ${s.added} more`, description: s.note ?? undefined });
    } catch (err) {
      toast({ title: 'Could not match orders', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const detach = async (p: StorePayout, orderId: string) => {
    try { await storePayoutsService.detach(p.id, orderId); await loadLines(p.id); }
    catch (err) { toast({ title: 'Could not remove', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const reconcile = async (p: StorePayout) => {
    try {
      const r = await storePayoutsService.reconcile(p.id);
      await load();
      toast({
        title: r.outcome === 'reconciled' ? 'Settled' : r.outcome.replace(/_/g, ' '),
        description: r.notes ?? r.reason
          ?? `${r.settled_orders ?? 0} order(s) settled, and the commission is booked to eCommerce Fees.`,
        variant: r.outcome === 'reconciled' ? undefined : 'destructive',
      });
    } catch (err) {
      toast({ title: 'Could not settle', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const remove = async (p: StorePayout) => {
    try { await storePayoutsService.remove(p.id); await load(); }
    catch (err) { toast({ title: 'Could not remove', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Banknote className="h-4 w-4" aria-hidden="true" /> Payouts</CardTitle>
          <CardDescription>
            A channel pays in one lump, net of commission, covering many orders. Recording it here settles
            those orders and books the commission as a cost — not as a discount off revenue.
          </CardDescription>
        </div>
        {!adding && connections.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => { setAdding(true); setForm((f) => ({ ...f, connection_id: connections[0].id })); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Record a payout
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="grid gap-3 rounded-sm border border-hairline p-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Channel</Label>
              <Select value={form.connection_id} onValueChange={(v) => setForm((f) => ({ ...f, connection_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>
                  {connections.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Their reference</Label>
              <Input value={form.external_payout_id} onChange={(e) => setForm((f) => ({ ...f, external_payout_id: e.target.value }))} placeholder="Payout id" />
            </div>
            <div className="space-y-1">
              <Label>Paid on</Label>
              <Input type="date" value={form.paid_on} onChange={(e) => setForm((f) => ({ ...f, paid_on: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Period from</Label>
              <Input type="date" value={form.period_start} onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Period to</Label>
              <Input type="date" value={form.period_end} onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Gross collected</Label>
              <Input type="number" step="0.01" value={form.gross} onChange={(e) => setForm((f) => ({ ...f, gross: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Commission and fees</Label>
              <Input type="number" step="0.01" value={form.fees} onChange={(e) => setForm((f) => ({ ...f, fees: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Net received</Label>
              <Input type="number" step="0.01" value={form.net} onChange={(e) => setForm((f) => ({ ...f, net: e.target.value }))} placeholder="gross − fees" />
            </div>
            <div className="flex items-end gap-2">
              <Button size="sm" onClick={submit}>Save and match</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding ? (
          <HubEmptyState
            icon={Banknote}
            title="No payout recorded yet"
            description={connections.length === 0
              ? 'Connect a sales channel first — a payout belongs to one.'
              : 'When the channel transfers your money, record the gross, the commission and the net. The orders it covers settle, and the commission lands as a cost instead of quietly reducing your margin.'}
            action={connections.length > 0
              ? <Button size="sm" onClick={() => { setAdding(true); setForm((f) => ({ ...f, connection_id: connections[0].id })); }}><Plus className="mr-1 h-3.5 w-3.5" /> Record a payout</Button>
              : undefined}
          />
        ) : rows.map((p) => (
          <div key={p.id} className="space-y-2 border-t border-hairline pt-3 first:border-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="font-medium hover:underline" onClick={() => toggle(p.id)}>
                {p.external_payout_id || `Payout ${p.id.slice(0, 8)}`}
              </button>
              <Badge variant="neutral" className="text-[10px]">{p.platform}</Badge>
              <Badge variant={TONE[p.status] ?? 'neutral'} className="text-[10px]">{p.status}</Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatMoney(p.gross, p.currency)} gross · {formatMoney(p.fees, p.currency)} fees · {formatMoney(p.net, p.currency)} net
              </span>
              <span className="text-xs text-muted-foreground">{p.paid_on ? formatDate(p.paid_on) : '—'}</span>
              <div className="ml-auto flex items-center gap-1">
                {p.status !== 'reconciled' && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => suggest(p)}>
                      <Wand2 className="mr-1 h-3 w-3" /> Match orders
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => reconcile(p)}>
                      <Check className="mr-1 h-3 w-3" /> Settle
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="h-7 px-1" onClick={() => remove(p)} aria-label="Remove payout">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>

            {p.notes && (
              <p className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{p.notes}</span>
              </p>
            )}

            {open === p.id && (
              <div className="table-scroll">
                <table className="w-full text-xs">
                  <thead className="bg-surface-sunken">
                    <tr className="text-left">
                      <th className="px-2 py-1 text-[11px] font-semibold">Order</th>
                      <th className="px-2 py-1 text-[11px] font-semibold">Document</th>
                      <th className="px-2 py-1 text-right text-[11px] font-semibold">Gross</th>
                      <th className="px-2 py-1"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lines[p.id] ?? []).length === 0 ? (
                      <tr><td colSpan={4} className="px-2 py-3 text-muted-foreground">
                        No orders attached. Use <em>Match orders</em>, or widen the period.
                      </td></tr>
                    ) : (lines[p.id] ?? []).map((l) => (
                      <tr key={l.order_id} className="border-t border-hairline">
                        <td className="px-2 py-1">{l.order_number ?? l.order_id.slice(0, 8)}</td>
                        <td className="px-2 py-1">
                          {l.issued
                            ? <span className="font-mono">{l.invoice_number}</span>
                            : <Badge variant="warning" className="text-[10px]">not issued</Badge>}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{formatMoney(l.gross, p.currency)}</td>
                        <td className="px-2 py-1 text-right">
                          {p.status !== 'reconciled' && (
                            <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => detach(p, l.order_id)} aria-label="Remove from payout">
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
