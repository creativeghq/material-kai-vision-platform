import React, { useCallback, useEffect, useState } from 'react';
import { Truck, Plus, ExternalLink, Trash2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { CARRIERS, carrierName, trackingUrlFor } from '@/modules/stock/carrierVocabulary';
import {
  shipmentsService, SHIPMENT_STATUSES, SHIPMENT_STATUS_LABEL,
  type Shipment, type ShipmentStatus,
} from '@/services/commerce/shipmentsService';

const TONE: Record<ShipmentStatus, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  ready: 'neutral', handed_over: 'info', in_transit: 'info',
  delivered: 'success', returned: 'warning', lost: 'error', cancelled: 'neutral',
};

export const OrderShipmentsCard: React.FC<{
  orderId: string;
  workspaceId: string;
  readOnly?: boolean;
}> = ({ orderId, workspaceId, readOnly = false }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<Shipment[]>([]);
  const [adding, setAdding] = useState(false);
  const [carrier, setCarrier] = useState(CARRIERS[0].code);
  const [tracking, setTracking] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [parcels, setParcels] = useState('1');

  const load = useCallback(async () => {
    try { setRows(await shipmentsService.forOrder(orderId)); }
    catch (err) { toast({ title: 'Could not load shipments', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  }, [orderId, toast]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    try {
      await shipmentsService.create(workspaceId, {
        order_id: orderId,
        carrier_code: carrier,
        tracking_number: tracking || null,
        tracking_url: customUrl || null,
        parcels: Math.max(1, parseInt(parcels, 10) || 1),
      });
      setAdding(false); setTracking(''); setCustomUrl(''); setParcels('1');
      await load();
    } catch (err) {
      toast({ title: 'Could not add the shipment', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  const setStatus = async (s: Shipment, status: ShipmentStatus) => {
    try { await shipmentsService.setStatus(s.id, status); await load(); }
    catch (err) { toast({ title: 'Could not update', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const remove = async (s: Shipment) => {
    try { await shipmentsService.remove(s.id); await load(); }
    catch (err) { toast({ title: 'Could not remove', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Truck className="h-4 w-4" aria-hidden="true" /> Shipments</CardTitle>
          <CardDescription>Which carrier has the goods, and the number the customer can follow.</CardDescription>
        </div>
        {!readOnly && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <div className="grid gap-3 rounded-sm border border-hairline p-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Carrier</Label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tracking number</Label>
              <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. 1234567890" />
            </div>
            <div className="space-y-1">
              <Label>Parcels</Label>
              <Input type="number" min="1" value={parcels} onChange={(e) => setParcels(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Tracking link (optional)</Label>
              <Input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="Leave blank to use the carrier's own page" />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button size="sm" onClick={submit}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {rows.length === 0 && !adding ? (
          <HubEmptyState
            icon={Truck}
            title="Nothing has shipped yet"
            description="Record the carrier and tracking number when the goods leave, so the customer can follow the parcel and you can see what is still out."
            action={readOnly ? undefined : <Button size="sm" onClick={() => setAdding(true)}><Plus className="mr-1 h-3.5 w-3.5" /> Add a shipment</Button>}
          />
        ) : rows.map((s) => {
          const url = trackingUrlFor(s.carrier_code, s.tracking_number, s.tracking_url);
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-sm first:border-0 first:pt-0">
              <span className="font-medium">{s.carrier_code === 'other' && s.carrier_name_other ? s.carrier_name_other : carrierName(s.carrier_code)}</span>
              {s.tracking_number && (
                url
                  ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline">
                      {s.tracking_number}<ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  : <span className="font-mono text-xs">{s.tracking_number}</span>
              )}
              {s.parcels > 1 && <Badge variant="neutral" className="text-[10px]">{s.parcels} parcels</Badge>}
              {readOnly ? (
                <Badge variant={TONE[s.status]} className="text-[10px]">{SHIPMENT_STATUS_LABEL[s.status]}</Badge>
              ) : (
                <Select value={s.status} onValueChange={(v) => setStatus(s, v as ShipmentStatus)}>
                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SHIPMENT_STATUSES.map((st) => <SelectItem key={st} value={st}>{SHIPMENT_STATUS_LABEL[st]}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <span className="text-xs text-muted-foreground">
                {s.delivered_at ? `Delivered ${formatDate(s.delivered_at)}`
                  : s.shipped_at ? `Shipped ${formatDate(s.shipped_at)}`
                    : `Created ${formatDate(s.created_at)}`}
              </span>
              {!readOnly && (
                <Button size="sm" variant="ghost" className="ml-auto h-7 px-1" onClick={() => remove(s)} aria-label="Remove shipment">
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
