/**
 * Proof of delivery and goods-receipt inspection, on the order they belong to (#424, #440).
 *
 * The failure is as first-class an outcome as the success: a short delivery is a reported fact,
 * never a silently reduced quantity, and a rejected receipt exists to produce a claim rather than
 * be absorbed. Recording a delivery here does NOT stamp an invoice — that would put the myDATA
 * filing downstream of a driver's phone.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Camera, Truck, ClipboardCheck, Weight } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  evidenceService, DELIVERY_OUTCOME_LABEL, DISPOSITION_LABEL,
  deliveryFellShort, outcomeNeedsPhoto, inspectionStartsClaim, quantitiesAgree,
  type DeliveryProof, type ReceiptInspection, type DeliveryOutcome, type Disposition,
  type SupplierClaim, type EvidencePhoto,
} from '@/modules/stock/services/evidenceService';

const OUTCOMES = Object.keys(DELIVERY_OUTCOME_LABEL) as DeliveryOutcome[];
const DISPOSITIONS = Object.keys(DISPOSITION_LABEL) as Disposition[];

export const DeliveryEvidenceCard: React.FC<{
  orderId: string;
  workspaceId: string;
  isPurchase: boolean;
}> = ({ orderId, workspaceId, isPurchase }) => {
  const { toast } = useToast();
  const [proofs, setProofs] = useState<DeliveryProof[]>([]);
  const [inspections, setInspections] = useState<ReceiptInspection[]>([]);
  const [claims, setClaims] = useState<SupplierClaim[]>([]);
  const [weight, setWeight] = useState<{ reason: string; status: string } | null>(null);
  // Which proofs carry a photograph. On a short or damaged delivery that is the whole evidence,
  // so its ABSENCE has to be visible rather than inferred from a gap.
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState({ outcome: 'delivered' as DeliveryOutcome, recipient: '', notes: '' });
  const [insp, setInsp] = useState({
    received: '', accepted: '', rejected: '', disposition: '' as Disposition | '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, is, cs, w] = await Promise.all([
        evidenceService.proofsForOrder(orderId).catch(() => [] as DeliveryProof[]),
        evidenceService.inspectionsForOrder(orderId).catch(() => [] as ReceiptInspection[]),
        evidenceService.claimsForOrder(orderId).catch(() => [] as SupplierClaim[]),
        evidenceService.deliveryWeight(orderId).catch(() => null),
      ]);
      setProofs(ps); setInspections(is); setClaims(cs); setWeight(w); setFailed(false);
      const counts = await Promise.all(ps.map(async (p) => [
        p.id,
        (await evidenceService.photosFor('delivery_proof', p.id).catch(() => [] as EvidencePhoto[])).length,
      ] as const));
      setPhotoCounts(Object.fromEntries(counts));
    } catch {
      setProofs([]); setInspections([]); setClaims([]); setFailed(true);
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const recordProof = async () => {
    setBusy(true);
    try {
      await evidenceService.recordProof({
        workspaceId, orderId,
        outcome: proof.outcome,
        recipientName: proof.recipient.trim() || null,
        notes: proof.notes.trim() || null,
      });
      setProof({ outcome: 'delivered', recipient: '', notes: '' });
      await load();
      toast({ title: 'Delivery recorded' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the delivery',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const recordInspection = async () => {
    setBusy(true);
    try {
      const created = await evidenceService.recordInspection({
        workspaceId, orderId,
        received: insp.received.trim() ? Number(insp.received) : null,
        accepted: insp.accepted.trim() ? Number(insp.accepted) : null,
        rejected: insp.rejected.trim() ? Number(insp.rejected) : null,
        disposition: insp.disposition || null,
      });
      // The inspection exists to produce a claim, so raising it is the same action rather than a
      // second thing somebody has to remember.
      if (inspectionStartsClaim(created)) {
        await evidenceService.raiseClaim({
          workspaceId, orderId, inspectionId: created.id,
        });
      }
      setInsp({ received: '', accepted: '', rejected: '', disposition: '' });
      await load();
      toast({
        title: 'Inspection recorded',
        description: inspectionStartsClaim(created)
          ? 'A supplier claim was opened against it.'
          : undefined,
      });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the inspection',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the evidence…
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          The delivery evidence could not be read just now. That is not a statement that there is
          none.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {weight && (
        <p className="flex items-start gap-1.5 rounded-md border border-hairline bg-surface-sunken p-2 text-[11px] text-muted-foreground">
          <Weight className="mt-0.5 h-3 w-3 shrink-0" />
          <span>{weight.reason}</span>
        </p>
      )}

      {!isPurchase && (
        <div className="space-y-2 rounded-md border border-hairline p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Truck className="h-3.5 w-3.5 text-primary" /> Proof of delivery
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor="pod-outcome" className="text-[11px]">Outcome</Label>
              <Select
                value={proof.outcome}
                onValueChange={(v) => setProof((p) => ({ ...p, outcome: v as DeliveryOutcome }))}
              >
                <SelectTrigger id="pod-outcome" className="mt-1 h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OUTCOMES.map((o) => (
                    <SelectItem key={o} value={o}>{DELIVERY_OUTCOME_LABEL[o]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="pod-recipient" className="text-[11px]">Received by</Label>
              <Input
                id="pod-recipient" className="mt-1 h-8 w-44 text-xs" value={proof.recipient}
                onChange={(e) => setProof((p) => ({ ...p, recipient: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="pod-notes" className="text-[11px]">Notes</Label>
              <Input
                id="pod-notes" className="mt-1 h-8 w-56 text-xs" value={proof.notes}
                onChange={(e) => setProof((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
            <Button size="sm" onClick={recordProof} disabled={busy}>Record</Button>
          </div>
          {outcomeNeedsPhoto(proof.outcome) && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-800 dark:text-amber-300">
              <Camera className="mt-0.5 h-3 w-3 shrink-0" />
              A short or damaged delivery is evidenced by the photograph, not by a note written
              afterwards. Attach one before you leave the site.
            </p>
          )}
          {proofs.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {proofs.map((p) => (
                <li key={p.id} className="tabular-nums">
                  {p.delivered_at.slice(0, 16).replace('T', ' ')} —{' '}
                  <Badge variant={deliveryFellShort(p.outcome) ? 'error' : 'success'}>
                    {DELIVERY_OUTCOME_LABEL[p.outcome]}
                  </Badge>
                  {p.recipient_name ? ` · ${p.recipient_name}` : ''}
                  {outcomeNeedsPhoto(p.outcome) && (photoCounts[p.id] ?? 0) === 0 && (
                    <span className="ml-2 text-destructive">no photograph</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isPurchase && (
        <div className="space-y-2 rounded-md border border-hairline p-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <ClipboardCheck className="h-3.5 w-3.5 text-primary" /> Goods-receipt inspection
          </p>
          <p className="text-[11px] text-muted-foreground">
            Breakage on a tile container is the normal case. Rejecting here opens the claim — a
            checkbox recovers nothing.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            {(['received', 'accepted', 'rejected'] as const).map((k) => (
              <div key={k}>
                <Label htmlFor={`insp-${k}`} className="text-[11px]">{k}</Label>
                <Input
                  id={`insp-${k}`} type="number" className="mt-1 h-8 w-24 text-xs"
                  value={insp[k]} onChange={(e) => setInsp((i) => ({ ...i, [k]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <Label htmlFor="insp-disp" className="text-[11px]">Disposition</Label>
              <Select
                value={insp.disposition}
                onValueChange={(v) => setInsp((i) => ({ ...i, disposition: v as Disposition }))}
              >
                <SelectTrigger id="insp-disp" className="mt-1 h-8 w-44 text-xs">
                  <SelectValue placeholder="If anything was rejected" />
                </SelectTrigger>
                <SelectContent>
                  {DISPOSITIONS.map((d) => (
                    <SelectItem key={d} value={d}>{DISPOSITION_LABEL[d]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={recordInspection} disabled={busy}>Record</Button>
          </div>
          {inspections.length > 0 && (
            <ul className="space-y-0.5 text-[11px] text-muted-foreground">
              {inspections.map((i) => {
                const agree = quantitiesAgree(i);
                return (
                  <li key={i.id} className="tabular-nums">
                    {i.inspected_at.slice(0, 10)} — received {i.received_quantity ?? '—'},
                    accepted {i.accepted_quantity ?? '—'}, rejected {i.rejected_quantity ?? '—'}
                    {i.disposition ? ` · ${DISPOSITION_LABEL[i.disposition]}` : ''}
                    {agree === false && (
                      <span className="ml-2 text-destructive">those do not add up</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {claims.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {claims.length} supplier claims raised from these inspections.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
