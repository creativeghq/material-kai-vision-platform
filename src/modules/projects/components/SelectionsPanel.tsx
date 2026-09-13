/**
 * The selection board: what the customer picked, against what the estimate promised (#431).
 *
 * The whole object turns on one rule — an allowance is frozen when the estimate goes out, and
 * after that it cannot move. An overage then becomes a change order rather than work done for
 * nothing; an underage stays the customer's money and is reported, never billed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ClipboardList, Lock, Plus, Receipt } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import {
  selectionsService, POSITION_LABEL, SELECTION_STATUS_LABEL,
  allowanceIsFrozen, isOverage, isUnderage, overageNeedsBilling, positionNeedsAttention,
  totalIsAFloor, FROZEN_IS_THE_POINT, UNDERAGE_IS_NOT_A_CHANGE_ORDER, COMMITTED_VS_PENDING,
  type SelectionPosition, type ProjectSelection, type ClientViewSettings, type SelectionStatus,
} from '@/modules/projects/services/selectionsService';

interface Props {
  workspaceId: string;
  projectId: string;
  rooms?: { id: string; name: string }[];
}

export const SelectionsPanel: React.FC<Props> = ({ workspaceId, projectId, rooms = [] }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<SelectionPosition | null>(null);
  const [selections, setSelections] = useState<ProjectSelection[]>([]);
  const [clientView, setClientView] = useState<ClientViewSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [allowance, setAllowance] = useState({ label: '', amount: '', roomId: '' });
  const [pick, setPick] = useState({ allowanceId: '', description: '', quantity: '1', price: '' });

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [p, s, v] = await Promise.all([
        selectionsService.position(projectId),
        selectionsService.selections(projectId),
        selectionsService.clientView(projectId),
      ]);
      setPosition(p); setSelections(s); setClientView(v); setFailed(false);
    } catch {
      setPosition(null); setSelections([]); setFailed(true);
    } finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const guard = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try { await fn(); await load(); } catch (err: unknown) {
      toast({
        title, description: err instanceof Error ? err.message : String(err), variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const addAllowance = () => guard(async () => {
    if (!allowance.label.trim() || allowance.amount === '') return;
    await selectionsService.createAllowance({
      workspaceId, projectId,
      roomId: allowance.roomId || null,
      label: allowance.label.trim(),
      amount: Number(allowance.amount),
    });
    setAllowance({ label: '', amount: '', roomId: '' });
  }, 'Could not add the allowance');

  const addSelection = () => guard(async () => {
    if (!pick.description.trim()) return;
    await selectionsService.createSelection({
      workspaceId, projectId,
      allowanceId: pick.allowanceId || null,
      description: pick.description.trim(),
      quantity: Number(pick.quantity) || 1,
      unitPrice: pick.price === '' ? null : Number(pick.price),
    });
    setPick({ allowanceId: '', description: '', quantity: '1', price: '' });
  }, 'Could not add the selection');

  const bill = (selectionId: string) => guard(async () => {
    const res = await selectionsService.billOverage(selectionId);
    toast({
      title: res.ok
        ? (res.replayed ? 'Already raised' : `Change order ${res.reference ?? ''}`)
        : 'Nothing to bill',
      description: res.reason,
    });
  }, 'Could not raise the change order');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" /> Selections and allowances
        </CardTitle>
        <CardDescription>{FROZEN_IS_THE_POINT}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the board…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The selections could not be read just now. That is not a statement that every pick is
            inside its budget.
          </p>
        )}

        {!loading && !failed && position && (
          <>
            <div
              className={`space-y-1 rounded-md border p-2 ${
                position.status === 'overage_unbilled'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : positionNeedsAttention(position)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {positionNeedsAttention(position)
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <Badge variant={position.status === 'overage_unbilled' ? 'error' : 'neutral'}>
                  {POSITION_LABEL[position.status]}
                </Badge>
                <span className="tabular-nums">
                  allowed {position.allowance_total} · selected {position.selected_total} · over{' '}
                  {position.overage_total} · under {position.underage_total}
                </span>
              </div>
              <p>{position.reason}</p>
              {totalIsAFloor(position) && (
                <p>These totals are a floor: unpriced selections are missing from them.</p>
              )}
              <p>{UNDERAGE_IS_NOT_A_CHANGE_ORDER}</p>
            </div>

            {position.rows.length === 0 && (
              <HubEmptyState
                title="No allowance yet"
                description="An allowance is what the estimate promised for a room or a category. Without one a selection has nothing to be measured against."
              />
            )}

            {position.rows.length > 0 && (
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Allowance</TableHead>
                      <TableHead className="text-right">Allowed</TableHead>
                      <TableHead className="text-right">Selected</TableHead>
                      <TableHead className="text-right">Variance</TableHead>
                      <TableHead>State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {position.rows.map((a) => (
                      <TableRow key={a.allowance_id}>
                        <TableCell>
                          <span className="font-medium">{a.label}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {a.room_name ?? a.category_key ?? '—'} · {a.selections} selection(s)
                            {a.unpriced > 0 ? `, ${a.unpriced} unpriced` : ''}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.amount}</TableCell>
                        <TableCell className="text-right tabular-nums">{a.selected}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className={isOverage(a) ? 'text-destructive' : isUnderage(a) ? 'text-emerald-700 dark:text-emerald-400' : ''}>
                            {a.variance}
                          </span>
                        </TableCell>
                        <TableCell className="space-x-1">
                          {allowanceIsFrozen(a)
                            ? <Badge variant="neutral"><Lock className="mr-1 h-3 w-3" />frozen</Badge>
                            : (
                              <Button
                                size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy}
                                onClick={() => guard(
                                  () => selectionsService.freezeAllowance(a.allowance_id),
                                  'Could not freeze the allowance',
                                )}
                              >
                                Freeze
                              </Button>
                            )}
                          {overageNeedsBilling(a) && <Badge variant="error">unbilled overage</Badge>}
                          {a.billed_as_variation > 0 && <Badge variant="success">billed</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
              <div>
                <Label htmlFor="alw-label" className="text-[11px]">Allowance</Label>
                <Input id="alw-label" className="mt-1 h-8 w-44 text-xs" value={allowance.label}
                  onChange={(e) => setAllowance((a) => ({ ...a, label: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="alw-room" className="text-[11px]">Room</Label>
                <Select value={allowance.roomId || 'none'} onValueChange={(v) => setAllowance((a) => ({ ...a, roomId: v === 'none' ? '' : v }))}>
                  <SelectTrigger id="alw-room" className="mt-1 h-8 w-40 text-xs">
                    <SelectValue placeholder="Whole project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole project</SelectItem>
                    {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="alw-amount" className="text-[11px]">Amount</Label>
                <Input id="alw-amount" type="number" min="0" className="mt-1 h-8 w-28 text-xs"
                  value={allowance.amount}
                  onChange={(e) => setAllowance((a) => ({ ...a, amount: e.target.value }))} />
              </div>
              <Button size="sm" onClick={addAllowance} disabled={busy || !allowance.label.trim()}>
                <Plus className="mr-1 h-3 w-3" /> Add allowance
              </Button>
            </div>

            {selections.length > 0 && (
              <div className="space-y-1">
                {selections.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 border-b border-hairline pb-1">
                    <span className="font-medium">{s.description}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {s.quantity} × {s.unit_price ?? 'price TBC'}
                    </span>
                    <Select
                      value={s.status}
                      disabled={busy}
                      onValueChange={(v) => guard(
                        () => selectionsService.setSelectionStatus(s.id, v as SelectionStatus),
                        'Could not update the selection',
                      )}
                    >
                      <SelectTrigger className="h-7 w-44 text-[11px]" aria-label={`Status of ${s.description}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(SELECTION_STATUS_LABEL) as SelectionStatus[]).map((k) => (
                          <SelectItem key={k} value={k}>{SELECTION_STATUS_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {s.variation_id
                      ? <Badge variant="success">change order raised</Badge>
                      : (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy}
                          onClick={() => bill(s.id)}
                        >
                          <Receipt className="mr-1 h-3 w-3" /> Bill the overage
                        </Button>
                      )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
              <div>
                <Label htmlFor="sel-alw" className="text-[11px]">Against</Label>
                <Select value={pick.allowanceId || 'none'} onValueChange={(v) => setPick((p) => ({ ...p, allowanceId: v === 'none' ? '' : v }))}>
                  <SelectTrigger id="sel-alw" className="mt-1 h-8 w-48 text-xs">
                    <SelectValue placeholder="No allowance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No allowance</SelectItem>
                    {position.rows.map((a) => (
                      <SelectItem key={a.allowance_id} value={a.allowance_id}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sel-desc" className="text-[11px]">What they picked</Label>
                <Input id="sel-desc" className="mt-1 h-8 w-52 text-xs" value={pick.description}
                  onChange={(e) => setPick((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="sel-qty" className="text-[11px]">Qty</Label>
                <Input id="sel-qty" type="number" min="0" className="mt-1 h-8 w-20 text-xs" value={pick.quantity}
                  onChange={(e) => setPick((p) => ({ ...p, quantity: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="sel-price" className="text-[11px]">Unit price</Label>
                <Input id="sel-price" type="number" min="0" className="mt-1 h-8 w-24 text-xs" value={pick.price}
                  onChange={(e) => setPick((p) => ({ ...p, price: e.target.value }))} />
              </div>
              <Button size="sm" onClick={addSelection} disabled={busy || !pick.description.trim()}>
                <Plus className="mr-1 h-3 w-3" /> Add selection
              </Button>
            </div>

            {clientView && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-hairline p-2 text-[11px]">
                <span className="font-medium">What the client sees</span>
                {(['client_sees_specs', 'client_sees_pricing', 'client_sees_cost'] as const).map((k) => (
                  <Button
                    key={k} size="sm" variant={clientView[k] ? 'secondary' : 'outline'}
                    className="h-7 px-2 text-[11px]" disabled={busy}
                    onClick={() => guard(
                      () => selectionsService.setClientView(projectId, { [k]: !clientView[k] }),
                      'Could not change the client view',
                    )}
                  >
                    {k === 'client_sees_specs' ? 'Specs' : k === 'client_sees_pricing' ? 'Prices' : 'Cost & margin'}
                  </Button>
                ))}
                <span className="text-muted-foreground">{COMMITTED_VS_PENDING}</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
