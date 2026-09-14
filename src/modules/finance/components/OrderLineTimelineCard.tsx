/**
 * The status ladder and the eight dates, per line (#432, #434).
 *
 * A kitchen is paid in stages by the customer and in stages to the supplier, and those schedules
 * do not align — so both sides of the money timeline sit on the same row as the logistics one.
 * Every date means "this happened on": a NULL is "not yet", never a derived guess.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, ListChecks, Check } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  orderLineService, LINE_LADDER, LINE_STATUS_LABEL, FULFILMENT_LABEL, LINE_DATE_FIELDS,
  needsSupplierClaim, isTerminalStatus,
  type LineStatus, type FulfilmentType, type LineDateKey,
} from '@/modules/finance/services/orderLineService';

interface LineRow {
  id: string;
  description: string | null;
  line_status: LineStatus | null;
  fulfilment_type: FulfilmentType | null;
  completed_at: string | null;
  tracking_reference: string | null;
  [key: string]: unknown;
}

const OUTCOMES: LineStatus[] = ['damaged', 'cancelled'];

export const OrderLineTimelineCard: React.FC<{ orderId: string }> = ({ orderId }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(
          'id, description, line_status, fulfilment_type, completed_at, tracking_reference, '
          + 'ordered_on, shipped_on, delivery_on, install_on, '
          + 'client_deposit_on, supplier_deposit_on, client_balance_on, supplier_balance_on',
        )
        .eq('order_id', orderId)
        .order('description');
      if (error) throw error;
      setLines((data ?? []) as LineRow[]);
      setFailed(false);
    } catch {
      setLines([]); setFailed(true);
    } finally { setLoading(false); }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  const guard = async (fn: () => Promise<void>, failure: string) => {
    setBusy(true);
    try { await fn(); await load(); }
    catch (err: unknown) {
      toast({
        title: failure,
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the line timeline…
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>The line timeline could not be read just now. That is not a statement that it is empty.</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-sunken p-2 text-xs">
        <ListChecks className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          Each date means &ldquo;this happened on&rdquo;. Blank is not yet — never a guess derived
          from another date.
        </p>
      </div>

      {lines.map((l) => (
        <div key={l.id} className="space-y-2 rounded-md border border-hairline p-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{l.description ?? 'Line'}</span>
            {l.line_status && (
              <Badge variant={needsSupplierClaim(l.line_status) ? 'error' : 'neutral'}>
                {LINE_STATUS_LABEL[l.line_status]}
              </Badge>
            )}
            {l.completed_at && <Badge variant="success">complete</Badge>}
            {needsSupplierClaim(l.line_status) && (
              <span className="text-destructive">
                Damaged is a claim against the supplier, not a quantity adjustment.
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label htmlFor={`status-${l.id}`} className="text-[11px]">Status</Label>
              <Select
                value={l.line_status ?? ''}
                onValueChange={(v) => guard(
                  () => orderLineService.setStatus(l.id, v as LineStatus),
                  'Could not set the status',
                )}
              >
                <SelectTrigger id={`status-${l.id}`} className="mt-1 h-8 w-40 text-xs">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {LINE_LADDER.map((s) => (
                    <SelectItem key={s} value={s}>{LINE_STATUS_LABEL[s]}</SelectItem>
                  ))}
                  {OUTCOMES.map((s) => (
                    <SelectItem key={s} value={s}>{LINE_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`ff-${l.id}`} className="text-[11px]">Fulfilment</Label>
              <Select
                value={l.fulfilment_type ?? ''}
                onValueChange={(v) => guard(
                  () => orderLineService.setFulfilment(l.id, v as FulfilmentType),
                  'Could not set the fulfilment type',
                )}
              >
                <SelectTrigger id={`ff-${l.id}`} className="mt-1 h-8 w-44 text-xs">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FULFILMENT_LABEL) as FulfilmentType[]).map((t) => (
                    <SelectItem key={t} value={t}>{FULFILMENT_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!l.completed_at && !isTerminalStatus(l.line_status) && (
              <Button
                size="sm" variant="outline" disabled={busy}
                onClick={() => guard(() => orderLineService.markComplete(l.id), 'Could not mark it complete')}
              >
                <Check className="mr-1 h-3 w-3" /> Mark complete
              </Button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {LINE_DATE_FIELDS.map((f) => (
              <div key={f.key}>
                <Label htmlFor={`${f.key}-${l.id}`} className="text-[11px]">
                  {f.label}
                  {f.side === 'money' && <span className="ml-1 text-muted-foreground">(money)</span>}
                </Label>
                <Input
                  id={`${f.key}-${l.id}`} type="date" className="mt-1 h-8 text-xs"
                  value={(l[f.key] as string | null) ?? ''}
                  onChange={(e) => guard(
                    () => orderLineService.setDate(l.id, f.key as LineDateKey, e.target.value || null),
                    'Could not save that date',
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
