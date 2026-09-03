/**
 * The priced schedule — a bill of quantities.
 *
 * Line totals come from the database. `amount` is a generated column, so this component displays
 * it and never multiplies quantity by rate itself: that product is a money quantity with exactly
 * one implementation, and a second one in the browser would be free to round differently.
 *
 * The schedule marked CONTRACT is the project's contract sum once accepted, and the CVR then
 * ignores accepted quotes entirely. That is stated on screen rather than left implicit, because
 * "which number is this job worth" having two possible sources is precisely the confusion the
 * precedence rule exists to remove.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, ListOrdered, Check } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub';
import { CostCodePicker } from '@/components/business/costCodes/CostCodePicker';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { formatMoney } from '@/utils/decimal';
import { UNITS } from '@/lib/units';
import {
  schedulesService, isScheduleLive,
  type ProjectSchedule, type ScheduleItem, type ScheduleStatus,
} from '../services/schedulesService';

interface Props {
  projectId: string;
  workspaceId: string | null;
  currency?: string;
  isOwner: boolean;
  /** Called when the contract schedule changes, so the CVR beside it reloads. */
  onChanged?: () => void;
}

const n = (v: number | string | null | undefined) => Number(v ?? 0);

const statusVariant = (s: ScheduleStatus) =>
  s === 'accepted' ? 'success' : s === 'superseded' ? 'neutral' : s === 'issued' ? 'info' : 'neutral';

export const PricedScheduleCard: React.FC<Props> = ({
  projectId, workspaceId, currency = 'EUR', isOwner, onChanged,
}) => {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<ProjectSchedule[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const loadSchedules = useCallback(async () => {
    try {
      const list = await schedulesService.list(projectId);
      setSchedules(list);
      setActiveId((cur) => cur && list.some((s) => s.id === cur) ? cur : (list[0]?.id ?? null));
    } catch (e) {
      toast({ title: 'Failed to load schedules', description: (e as Error).message, variant: 'destructive' });
      setSchedules([]);
    }
  }, [projectId, toast]);

  useEffect(() => { void loadSchedules(); }, [loadSchedules]);

  const loadItems = useCallback(async () => {
    if (!activeId) { setItems([]); return; }
    try { setItems(await schedulesService.items(activeId)); }
    catch (e) { toast({ title: 'Failed to load the schedule', description: (e as Error).message, variant: 'destructive' }); }
  }, [activeId, toast]);

  useEffect(() => { void loadItems(); }, [loadItems]);

  const act = async (label: string, fn: () => Promise<unknown>, alsoSchedules = false) => {
    setBusy(true);
    try {
      await fn();
      if (alsoSchedules) await loadSchedules();
      await loadItems();
      onChanged?.();
    } catch (e) {
      toast({ title: label, description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const active = schedules?.find((s) => s.id === activeId) ?? null;
  const money = (v: number | string | null | undefined) => formatMoney(n(v), active?.currency ?? currency);

  /** The sum of what the database returned. Never a re-multiplication of quantity by rate. */
  const total = useMemo(() => items.reduce((s, i) => s + n(i.amount), 0), [items]);
  const provisional = useMemo(
    () => items.filter((i) => i.is_provisional).reduce((s, i) => s + n(i.amount), 0),
    [items],
  );

  const createSchedule = async () => {
    if (!workspaceId || !newName.trim()) return;
    await act('Could not create the schedule', async () => {
      const created = await schedulesService.createSchedule({
        workspace_id: workspaceId,
        project_id: projectId,
        name: newName.trim(),
        // The first schedule on a project is the contract one by default — that is what somebody
        // pricing a job is making. Later ones are alternatives until marked otherwise.
        is_contract: (schedules ?? []).length === 0,
        currency,
      });
      setNewName('');
      setActiveId(created.id);
    }, true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 px-5 py-3">
        <div className="min-w-0">
          <CardTitle>Priced schedule</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Measured quantities against rates. The accepted contract schedule is what this job is
            worth — while one exists, accepted quotes are ignored by the cost report.
          </p>
        </div>
      </CardHeader>

      <CardContent className="px-0 py-0">
        {schedules === null ? (
          <div className="flex items-center gap-2 px-5 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : schedules.length === 0 ? (
          <div className="px-5 py-4">
            <HubEmptyState
              icon={ListOrdered}
              title="No priced schedule yet"
              description="Build a bill of quantities — described items of work with a unit, a quantity and a rate. Once accepted it becomes the contract sum the cost report reconciles against."
              action={isOwner && workspaceId ? (
                <div className="flex gap-2">
                  <Input
                    value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="Contract BoQ" className="h-9 w-48"
                  />
                  <Button size="sm" onClick={() => void createSchedule()} disabled={busy || !newName.trim()}>
                    <Plus className="h-3.5 w-3.5" /> Create
                  </Button>
                </div>
              ) : undefined}
            />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-2">
              {schedules.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveId(s.id)}
                  className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${
                    s.id === activeId ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.name}
                  {s.is_contract && <Badge variant="info">contract</Badge>}
                  <Badge variant={statusVariant(s.status)}>{humanizeLabel(s.status)}</Badge>
                </button>
              ))}
              {isOwner && workspaceId && (
                <div className="ml-auto flex items-center gap-2">
                  <Input
                    value={newName} onChange={(e) => setNewName(e.target.value)}
                    placeholder="New schedule" className="h-8 w-40"
                  />
                  <Button size="sm" variant="ghost" onClick={() => void createSchedule()} disabled={busy || !newName.trim()}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {active && isOwner && (
              <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-surface-sunken px-5 py-2 text-xs">
                <span className="text-muted-foreground">
                  {active.is_contract
                    ? isScheduleLive(active.status)
                      ? 'This is the contract sum. The cost report reconciles against it.'
                      : 'Marked as the contract schedule — accept it to make it the contract sum.'
                    : 'An alternative pricing. Not the contract sum.'}
                </span>
                <div className="ml-auto flex gap-2">
                  {!isScheduleLive(active.status) && (
                    <Button size="sm" variant="secondary" disabled={busy}
                      onClick={() => void act('Could not accept', () => schedulesService.setStatus(active.id, 'accepted'), true)}>
                      <Check className="h-3.5 w-3.5" /> Accept
                    </Button>
                  )}
                  {!active.is_contract && (
                    <Button size="sm" variant="outline" disabled={busy}
                      onClick={() => void act('Could not mark as contract', () => schedulesService.setIsContract(active.id, true), true)}>
                      Make contract
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => void act('Could not delete', () => schedulesService.removeSchedule(active.id), true)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            )}

            {items.length === 0 && !adding ? (
              <HubEmptyState
                icon={ListOrdered}
                title="Nothing priced yet"
                description="Add described items of work with a unit, a quantity and a rate. The line totals are worked out for you."
                action={isOwner && workspaceId
                  ? <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-3.5 w-3.5" /> Add item</Button>
                  : undefined}
              />
            ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <th className="px-5 py-2 text-left">Ref</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Unit</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-5 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-t border-border/60">
                      <td className="px-5 py-2 font-mono text-xs tabular-nums text-muted-foreground">{i.item_ref ?? '—'}</td>
                      <td className="px-3 py-2">
                        {i.description}
                        {i.is_provisional && <Badge variant="warning" className="ml-2">provisional</Badge>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {i.cost_code_id ? '✓' : <span className="text-amber-800 dark:text-amber-300">none</span>}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{i.unit ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i.quantity ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{i.rate === null ? '—' : money(i.rate)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {/* NULL means no rate yet. Showing 0.00 would read as "free" rather than
                            "not priced", which is a different fact to somebody pricing a job. */}
                        {i.amount === null
                          ? <span className="text-muted-foreground">&mdash;</span>
                          : money(i.amount)}
                      </td>
                      <td className="px-5 py-2 text-right">
                        {isOwner && (
                          <Button size="sm" variant="ghost" disabled={busy}
                            onClick={() => void act('Could not delete', () => schedulesService.removeItem(i.id))}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {items.length > 0 && (
                    <tr className="border-t border-border/60 bg-surface-sunken font-medium">
                      <td className="px-5 py-2" colSpan={6}>
                        Total
                        {provisional > 0 && (
                          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                            includes {money(provisional)} provisional
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(total)}</td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            )}

            {isOwner && activeId && workspaceId && items.length > 0 && (
              adding ? (
                <NewItemRow
                  workspaceId={workspaceId}
                  scheduleId={activeId}
                  nextSort={(items[items.length - 1]?.sort ?? 0) + 10}
                  currency={active?.currency ?? currency}
                  onClose={() => setAdding(false)}
                  onSaved={() => { setAdding(false); void loadItems(); onChanged?.(); }}
                />
              ) : (
                <div className="border-t border-border/60 px-5 py-3">
                  <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
                    <Plus className="h-3.5 w-3.5" /> Add item
                  </Button>
                </div>
              )
            )}

            {/* While the schedule is empty the add row is rendered by itself, so the empty state's
                own action has somewhere to go. */}
            {isOwner && activeId && workspaceId && items.length === 0 && adding && (
              <NewItemRow
                workspaceId={workspaceId}
                scheduleId={activeId}
                nextSort={10}
                currency={active?.currency ?? currency}
                onClose={() => setAdding(false)}
                onSaved={() => { setAdding(false); void loadItems(); onChanged?.(); }}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const NewItemRow: React.FC<{
  workspaceId: string; scheduleId: string; nextSort: number; currency: string;
  onClose: () => void; onSaved: () => void;
}> = ({ workspaceId, scheduleId, nextSort, currency, onClose, onSaved }) => {
  const { toast } = useToast();
  const [itemRef, setItemRef] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [rate, setRate] = useState('');
  const [costCodeId, setCostCodeId] = useState<string | null>(null);
  const [provisional, setProvisional] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!description.trim()) { toast({ title: 'Describe the item', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await schedulesService.addItem({
        workspace_id: workspaceId,
        schedule_id: scheduleId,
        item_ref: itemRef,
        description,
        unit: unit || null,
        quantity: quantity === '' ? null : Number(quantity),
        rate: rate === '' ? null : Number(rate),
        cost_code_id: costCodeId,
        is_provisional: provisional,
        sort: nextSort,
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Could not add the item', description: (e as Error).message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-border/60 bg-surface-sunken px-5 py-4">
      <div className="grid grid-cols-6 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Ref</Label>
          <Input value={itemRef} onChange={(e) => setItemRef(e.target.value)} placeholder="1.1" className="h-9" />
        </div>
        <div className="col-span-3 space-y-1">
          <Label className="text-[11px]">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Supply and fix soil pipe" className="h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Unit</Label>
          <Select value={unit || 'none'} onValueChange={(v) => setUnit(v === 'none' ? '' : v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Qty</Label>
          <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="h-9" />
        </div>
      </div>
      <div className="grid grid-cols-6 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Rate ({currency})</Label>
          <Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="h-9" />
        </div>
        <div className="col-span-3 space-y-1">
          <Label className="text-[11px]">Cost code</Label>
          <CostCodePicker value={costCodeId} onChange={setCostCodeId} className="h-9" />
        </div>
        <div className="col-span-2 flex items-end gap-2 pb-1">
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={provisional} onCheckedChange={(v) => setProvisional(!!v)} />
            Provisional sum
          </label>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        The line total is worked out by the database from quantity and rate — there is no field for
        it, because a second place to type it is a second answer.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={() => void save()} disabled={saving || !description.trim()}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
        </Button>
      </div>
    </div>
  );
};
