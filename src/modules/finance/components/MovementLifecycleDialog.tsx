/**
 * ΨΔΑ Phase Β1 — record and read a movement's lifecycle (#407), mandatory 12/10/2026.
 *
 * Each leg is a separate filing with its own MARK, so this is a LEDGER with an add control, not a
 * status field. What may be recorded next comes from `nextEventsFor`, which encodes AADE's own
 * transition table — offering a leg AADE will refuse is a control whose only outcome is an error,
 * and on a phone at a site gate that is worse than offering nothing.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Truck, PackageCheck, Ban, Undo2, WifiOff, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  MYDATA_TRANSPORT_TYPES, MYDATA_DELIVERY_STATUSES, transportTypeLabel,
} from '@/services/fiscal/fiscalVocabulary';
import {
  deliveryLifecycleService, movementStatusLabel,
  type DeliveryLifecycle, type DeliveryEventRow, type MovementPartyRole,
} from '@/modules/finance/services/deliveryLifecycleService';
import { nextEventsFor, type DeliveryEventTypeName } from '@/modules/finance/deliveryLifecycleRules';

const EVENT_LABEL: Record<DeliveryEventTypeName, string> = {
  RegisterTransfer: 'Start / tranship',
  RegisterTransferReturn: 'Return leg',
  ConfirmOutcome: 'Declare outcome',
  Rejection: 'Recipient rejects',
  ConfirmReturn: 'Confirm the return',
};

const EVENT_ICON: Record<DeliveryEventTypeName, React.ElementType> = {
  RegisterTransfer: Truck,
  RegisterTransferReturn: Undo2,
  ConfirmOutcome: PackageCheck,
  Rejection: Ban,
  ConfirmReturn: Undo2,
};

const ROLES: { key: MovementPartyRole; label: string }[] = [
  { key: 'sender', label: 'Sender (us)' },
  { key: 'sender_third', label: 'Third-party sender' },
  { key: 'carrier', label: 'Carrier' },
  { key: 'recipient', label: 'Recipient' },
  { key: 'recipient_third', label: 'Third-party recipient' },
];

export const MovementLifecycleDialog: React.FC<{
  deliveryNoteId: string;
  deliveryNoteNumber: string | null;
  onClose: () => void;
}> = ({ deliveryNoteId, deliveryNoteNumber, onClose }) => {
  const { toast } = useToast();
  const [life, setLife] = useState<DeliveryLifecycle | null>(null);
  const [events, setEvents] = useState<DeliveryEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<DeliveryEventTypeName | null>(null);

  const [role, setRole] = useState<MovementPartyRole>('carrier');
  const [outcome, setOutcome] = useState<'FULL' | 'PARTIAL' | 'NONE'>('FULL');
  const [vehicle, setVehicle] = useState('');
  const [transportType, setTransportType] = useState('2');
  const [carrierVat, setCarrierVat] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, e] = await Promise.all([
        deliveryLifecycleService.lifecycle(deliveryNoteId),
        deliveryLifecycleService.events(deliveryNoteId),
      ]);
      setLife(l); setEvents(e); setFailed(false);
    } catch {
      // A failed read is UNKNOWN. Rendering "no legs recorded" out of an error would say this
      // movement has no obligations outstanding, which is the one reading that must not be wrong.
      setFailed(true);
    } finally { setLoading(false); }
  }, [deliveryNoteId]);

  useEffect(() => { void load(); }, [load]);

  const record = async () => {
    if (!adding) return;
    setBusy(true);
    try {
      await deliveryLifecycleService.record({
        deliveryNoteId,
        eventType: adding,
        actorRole: role,
        outcome: adding === 'ConfirmOutcome' ? outcome : undefined,
        details: {
          vehicle_number: vehicle.trim() || null,
          transport_type: adding === 'RegisterTransfer' ? transportType : null,
          carrier_vat_number: carrierVat.trim() || null,
          rejection_reason: adding === 'Rejection' ? (reason.trim() || null) : null,
        },
      });
      setAdding(null); setVehicle(''); setCarrierVat(''); setReason('');
      await load();
    } catch (e) {
      // The refusals are AADE's own rules stated in words — surfaced verbatim rather than
      // reduced to "could not save", because the operator has to know which rule they hit.
      toast({ title: 'Could not record it', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const offered = nextEventsFor(life);
  const pending = life?.events_pending_transmission ?? 0;

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> Movement lifecycle — {deliveryNoteNumber ?? 'draft'}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : failed ? (
          <div className="flex items-center gap-2 rounded-md border border-hairline bg-surface-sunken p-3 text-sm text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            The lifecycle could not be read — this is not a statement that there is nothing outstanding.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-md bg-surface-sunken px-3 py-2 text-sm">
              <span>
                State{' '}
                <strong>{movementStatusLabel(life?.status_code)}</strong>
              </span>
              {life?.completed_at && (
                <span className="text-muted-foreground">Completed {formatDate(life.completed_at, { withTime: true })}</span>
              )}
              {pending > 0 && (
                <Badge variant="warning">
                  <WifiOff className="mr-1 h-3 w-3" />
                  {pending} leg{pending === 1 ? '' : 's'} not filed
                </Badge>
              )}
            </div>

            {pending > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Recording a leg while the connection is down is allowed and the movement carries a
                distinct marker for it — but the leg still has to reach AADE. These have not yet.
              </p>
            )}

            {events.length === 0 ? (
              <HubEmptyState
                icon={Truck}
                title="No legs recorded"
                description="From 12 October 2026 loading, transhipment and receipt are each filings in their own right, with their own MARK."
                action={offered.length > 0
                  ? <Button size="sm" onClick={() => setAdding(offered[0])}>Record {EVENT_LABEL[offered[0]].toLowerCase()}</Button>
                  : undefined}
              />
            ) : (
              <div className="divide-y divide-hairline rounded-md border border-hairline">
                {events.map((e) => {
                  const Icon = EVENT_ICON[e.event_type] ?? Truck;
                  return (
                    <div key={e.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium">{EVENT_LABEL[e.event_type] ?? e.event_type}</span>
                      {e.outcome && <Badge variant={e.outcome === 'FULL' ? 'success' : e.outcome === 'NONE' ? 'error' : 'warning'}>{e.outcome}</Badge>}
                      {e.vehicle_number && (
                        <span className="text-xs text-muted-foreground">
                          {e.vehicle_number}
                          {e.transport_type ? ` · ${transportTypeLabel(e.transport_type)}` : ''}
                        </span>
                      )}
                      {e.rejection_reason && <span className="text-xs text-muted-foreground">{e.rejection_reason}</span>}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {formatDate(e.event_timestamp, { withTime: true })}
                      </span>
                      {e.mark
                        ? <Badge variant="success" title={`MARK ${e.mark}`}>filed</Badge>
                        : <Badge variant={e.issued_offline ? 'warning' : 'neutral'}>
                            {e.issued_offline ? 'offline' : 'not filed'}
                          </Badge>}
                    </div>
                  );
                })}
              </div>
            )}

            {adding ? (
              <div className="space-y-3 rounded-md border border-hairline p-3">
                <p className="text-sm font-medium">{EVENT_LABEL[adding]}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Declared by</Label>
                    <select
                      className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                      value={role} onChange={(e) => setRole(e.target.value as MovementPartyRole)}
                    >
                      {ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                  {adding === 'ConfirmOutcome' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Outcome</Label>
                      <select
                        className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                        value={outcome} onChange={(e) => setOutcome(e.target.value as 'FULL' | 'PARTIAL' | 'NONE')}
                      >
                        <option value="FULL">FULL — everything arrived</option>
                        <option value="PARTIAL">PARTIAL — part of the load (carrier only)</option>
                        <option value="NONE">NONE — nothing was delivered</option>
                      </select>
                    </div>
                  )}
                  {adding === 'RegisterTransfer' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Vehicle</Label>
                        <Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="ΑΒΓ-1234" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Vehicle type</Label>
                        <select
                          className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                          value={transportType} onChange={(e) => setTransportType(e.target.value)}
                        >
                          {MYDATA_TRANSPORT_TYPES.map((t) => (
                            <option key={t.code} value={String(t.code)}>{t.en}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Carrier VAT</Label>
                        <Input value={carrierVat} onChange={(e) => setCarrierVat(e.target.value)} />
                      </div>
                    </>
                  )}
                  {adding === 'Rejection' && (
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">Reason</Label>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={150} />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => void record()} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Record'}
                  </Button>
                </div>
              </div>
            ) : offered.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {offered.map((t) => {
                  const Icon = EVENT_ICON[t];
                  return (
                    <Button key={t} size="sm" variant="outline" onClick={() => setAdding(t)}>
                      <Icon className="mr-1 h-3.5 w-3.5" /> {EVENT_LABEL[t]}
                    </Button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {life?.status_code === 8
                  ? 'This movement is closed. Nothing further can be filed against it.'
                  : 'Nothing can be recorded against this movement in its current state.'}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Exported for the guard test: every AADE status has a word, and there is no code 6. */
export const KNOWN_STATUS_CODES = MYDATA_DELIVERY_STATUSES.map((s) => s.code);
