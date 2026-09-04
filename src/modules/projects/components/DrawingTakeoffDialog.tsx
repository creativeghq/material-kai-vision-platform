/**
 * The schedules printed on a drawing, proposed as bill-of-quantities lines.
 *
 * A PROPOSAL, and the whole screen is built around that. Every row shows the schedule and row it
 * was transcribed from, because that citation is the only thing separating this from measuring a
 * drawing — and measuring is what the reader is forbidden to do, since a guessed quantity is
 * indistinguishable from a read one and somebody orders materials against it.
 *
 * Rows arrive UNTICKED. A screen that pre-selects everything and offers "Add" turns confirmation
 * into a formality, which is the same as not asking.
 *
 * A row with no printed quantity is kept and shown as "not stated". It is a real finding — the
 * sheet lists the item and gives no count — and it is added as a line with a null quantity so the
 * gap is in the BoQ where somebody has to close it, rather than silently absent or, worse, zero.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, ScanLine, AlertTriangle, Check } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { takeoffService, type TakeoffResult } from '../services/takeoffService';
import { schedulesService, type ProjectSchedule } from '../services/schedulesService';

interface Props {
  revisionId: string;
  projectId: string;
  drawingLabel: string;
  revLabel: string;
  onClose: () => void;
  onAdded?: (scheduleId: string, count: number) => void;
}

export const DrawingTakeoffDialog: React.FC<Props> = ({
  revisionId, projectId, drawingLabel, revLabel, onClose, onAdded,
}) => {
  const { toast } = useToast();
  const [reading, setReading] = useState(true);
  const [result, setResult] = useState<TakeoffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [schedules, setSchedules] = useState<ProjectSchedule[]>([]);
  const [scheduleId, setScheduleId] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [r, s] = await Promise.all([
          takeoffService.read(revisionId),
          schedulesService.list(projectId).catch(() => [] as ProjectSchedule[]),
        ]);
        if (!alive) return;
        setResult(r);
        setSchedules(s);
        // The contract schedule is where a takeoff usually belongs; fall back to the first.
        setScheduleId((s.find((x) => x.is_contract) ?? s[0])?.id ?? '');
      } catch (err: any) {
        if (alive) setError(err?.message || 'The drawing could not be read.');
      } finally {
        if (alive) setReading(false);
      }
    })();
    return () => { alive = false; };
  }, [revisionId, projectId]);

  const items = result?.items ?? [];
  const toggle = (i: number) => setChosen((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const withoutQuantity = useMemo(
    () => [...chosen].filter((i) => items[i]?.quantity == null).length,
    [chosen, items],
  );

  const add = async () => {
    if (!scheduleId || chosen.size === 0) return;
    // The workspace comes from the SCHEDULE the lines are landing in, not from a prop or the
    // active-workspace context. Those can differ from the one that owns the row being written, and
    // the write would be refused by RLS with a raw 42501 rather than by anything readable.
    const workspaceId = schedules.find((s) => s.id === scheduleId)?.workspace_id;
    if (!workspaceId) {
      toast({ title: 'That schedule is no longer available', variant: 'destructive' });
      return;
    }
    setAdding(true);
    let added = 0;
    try {
      // Sequential on purpose: `sort` has to come out in the order the schedule printed them, and
      // a failure part-way through must leave the lines that DID land rather than an unknown
      // subset — the count reported below is what actually reached the schedule.
      const existing = await schedulesService.items(scheduleId);
      let sort = (existing[existing.length - 1]?.sort ?? 0) + 10;
      for (const i of [...chosen].sort((a, b) => a - b)) {
        const it = items[i];
        if (!it) continue;
        await schedulesService.addItem({
          workspace_id: workspaceId,
          schedule_id: scheduleId,
          description: it.description,
          item_ref: it.item_ref,
          unit: it.unit,
          // Null stays null. The line lands in the BoQ with the quantity missing, which is where
          // somebody has to close the gap — rather than a 0 that reads as "none required".
          quantity: it.quantity,
          // No rate: the drawing states what there is, never what it costs.
          rate: null,
          sort,
        });
        sort += 10;
        added += 1;
      }
      onAdded?.(scheduleId, added);
      toast({
        title: `${added} line${added === 1 ? '' : 's'} added`,
        description: withoutQuantity > 0
          ? `${withoutQuantity} of them have no quantity yet — the sheet did not print one.`
          : 'Quantities came from the sheet; rates are still to price.',
      });
      onClose();
    } catch (err: any) {
      toast({
        title: added > 0 ? `Stopped after ${added} line${added === 1 ? '' : 's'}` : 'Nothing was added',
        description: err?.message,
        variant: 'destructive',
      });
    } finally { setAdding(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <ScanLine className="h-4 w-4 text-primary" />
            Schedules on {drawingLabel}
            <span className="text-sm font-normal text-muted-foreground">rev {revLabel}</span>
          </DialogTitle>
        </DialogHeader>

        {reading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> Reading the sheet…
          </div>
        )}

        {!reading && error && (
          <div className="rounded-sm border border-hairline p-6 text-center">
            <p className="text-sm font-medium">The drawing could not be read.</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {!reading && !error && result?.status === 'no_schedules' && (
          <HubEmptyState
            icon={ScanLine}
            title="No schedules printed on this sheet"
            // Not a failure and not an invitation to measure the plan instead — said plainly, so
            // nobody re-runs it hoping for a different answer.
            description="This drawing carries no tabular schedule. Quantities are only taken from schedules the design team printed — nothing here measures a plan."
          />
        )}

        {!reading && !error && result?.status === 'read' && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{items.length} row{items.length === 1 ? '' : 's'} transcribed</span>
              {result.without_quantity > 0 && (
                <Badge variant="warning">{result.without_quantity} with no printed quantity</Badge>
              )}
              {result.truncated && (
                <Badge variant="warning">More rows on the sheet than shown</Badge>
              )}
              {typeof result.confidence === 'number' && result.confidence < 0.6 && (
                <span className="flex items-center gap-1 text-amber-800 dark:text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> the schedules were hard to read — check each row
                </span>
              )}
            </div>

            {result.notes && (
              <p className="text-xs text-muted-foreground">{result.notes}</p>
            )}

            <div className="table-scroll max-h-[45vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <th className="w-8 px-3 py-1.5">
                      <span className="sr-only">Include in the schedule</span>
                    </th>
                    <th className="px-3 py-1.5 text-left">Ref</th>
                    <th className="px-3 py-1.5 text-left">Description</th>
                    <th className="px-3 py-1.5 text-right">Quantity</th>
                    <th className="px-3 py-1.5 text-left">Read from</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={`${it.item_ref ?? ''}-${i}`} className="border-t border-hairline align-top">
                      <td className="px-3 py-1.5">
                        <Checkbox
                          checked={chosen.has(i)}
                          onCheckedChange={() => toggle(i)}
                          aria-label={`Include ${it.item_ref ? `${it.item_ref} ` : ''}${it.description}`}
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                        {it.item_ref ?? '—'}
                      </td>
                      <td className="px-3 py-1.5">
                        {it.description}
                        {it.notes && (
                          <p className="text-[11px] text-amber-800 dark:text-amber-400">{it.notes}</p>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {/* "not stated" rather than a dash or a zero: the sheet lists the item and
                            prints no count, and that is a finding somebody has to close. */}
                        {it.quantity == null ? (
                          <span className="text-xs text-muted-foreground">not stated</span>
                        ) : (
                          <>{it.quantity}{it.unit ? ` ${it.unit}` : ''}</>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{it.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-2 border-t border-hairline pt-3">
              <div className="space-y-1">
                <Label className="text-xs">Add to</Label>
                <Select value={scheduleId} onValueChange={setScheduleId}>
                  <SelectTrigger className="h-8 w-64">
                    <SelectValue placeholder={schedules.length ? 'Pick a schedule' : 'No priced schedule yet'} />
                  </SelectTrigger>
                  <SelectContent>
                    {schedules.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}{s.is_contract ? ' (contract)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="mr-auto text-xs text-muted-foreground">
                {chosen.size === 0
                  ? 'Tick the rows you have checked against the sheet.'
                  : `${chosen.size} selected${withoutQuantity > 0 ? `, ${withoutQuantity} with no quantity` : ''}`}
              </span>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                disabled={adding || chosen.size === 0 || !scheduleId}
                onClick={() => void add()}
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                Add to schedule
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DrawingTakeoffDialog;
