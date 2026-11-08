/**
 * Selections — the one record of what the client picked for this project (#549, #431).
 * The client's decision is typed here; how far the order has got is derived from the linked
 * order line by `project_selection_lines`, never chosen from a dropdown.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Link2, Loader2, Lock, Plus, Receipt, Search, Tag,
  Trash2, Unlink, X,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/utils/decimal';
import { projectsService } from '../../services/projectsService';
import {
  selectionsService, POSITION_LABEL, SELECTION_STATUS_LABEL, FULFILMENT_LABEL, FULFILMENT_TONE,
  allowanceIsFrozen, isOverage, isUnderage, overageNeedsBilling, positionNeedsAttention,
  totalIsAFloor, FROZEN_IS_THE_POINT, UNDERAGE_IS_NOT_A_CHANGE_ORDER,
  type SelectionPosition, type ProjectSelectionLine, type SelectionStatus, type SelectionOrderCandidate,
} from '../../services/selectionsService';

interface Props {
  projectId: string;
  workspaceId: string | null;
  currency: string;
  canFinance: boolean;
}

type Room = { id: string; name: string };
type Picked = { id: string; name: string; sku: string | null };

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A price is a non-negative number or nothing; "" is nothing. */
const parsePrice = (raw: string): number | null | 'invalid' => {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 'invalid';
};

export const SelectionsTab: React.FC<Props> = ({ projectId, workspaceId, currency, canFinance }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<ProjectSelectionLine[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [position, setPosition] = useState<SelectionPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [linking, setLinking] = useState<ProjectSelectionLine | null>(null);
  const [allowance, setAllowance] = useState({ label: '', amount: '', roomId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, r, p] = await Promise.all([
        selectionsService.lines(projectId),
        projectsService.listRooms(projectId),
        canFinance ? selectionsService.position(projectId) : Promise.resolve(null),
      ]);
      setLines(l);
      setRooms(r.map((x) => ({ id: x.id, name: x.name })));
      setPosition(p);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally { setLoading(false); }
  }, [projectId, canFinance]);

  useEffect(() => { void load(); }, [load]);

  const guard = async (key: string, fn: () => Promise<unknown>, title: string) => {
    setBusy(key);
    try { await fn(); await load(); } catch (err) {
      toast({ title, description: errText(err), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const savePrice = (line: ProjectSelectionLine, raw: string) => {
    const price = parsePrice(raw);
    if (price === 'invalid') { toast({ title: 'Enter a price of 0 or more', variant: 'destructive' }); return; }
    if (price === line.unit_price) return;
    void guard(line.id, () => selectionsService.updateSelection(line.id, { unitPrice: price }), 'Could not save the price');
  };

  const saveQuantity = (line: ProjectSelectionLine, raw: string) => {
    const q = Number(raw);
    if (!Number.isFinite(q) || q <= 0) { toast({ title: 'Quantity must be greater than zero', variant: 'destructive' }); return; }
    if (q === line.quantity) return;
    void guard(line.id, () => selectionsService.updateSelection(line.id, { quantity: q }), 'Could not save the quantity');
  };

  const fetchPrice = (line: ProjectSelectionLine) => guard(line.id, async () => {
    if (!line.product_id || !workspaceId) return;
    const p = await projectsService.resolveProductPrice(workspaceId, line.product_id, {
      quantity: line.quantity, unit: line.unit,
    });
    const ref = p.suggested_sell ?? p.base_price;
    if (p.ask_for_quote || ref == null) {
      toast({ title: 'No catalogue price for this product', description: 'Ask the supplier for a quote and enter the price by hand.' });
      return;
    }
    await selectionsService.updateSelection(line.id, { unitPrice: ref, currency: p.currency });
    toast({ title: `Price set to ${formatMoney(ref, p.currency)}` });
  }, 'Price lookup failed');

  const remove = (line: ProjectSelectionLine) => {
    if (!confirm(`Remove "${line.product_name ?? line.description}" from the selections?`)) return;
    void guard(line.id, () => selectionsService.deleteSelection(line.id), 'Could not remove the selection');
  };

  const bill = (line: ProjectSelectionLine) => guard(line.id, async () => {
    const res = await selectionsService.billOverage(line.id);
    toast({
      title: res.ok ? (res.replayed ? 'Already raised' : `Change order ${res.reference ?? ''}`) : 'Nothing to bill',
      description: res.reason,
    });
  }, 'Could not raise the change order');

  const addAllowance = () => guard('allowance', async () => {
    if (!workspaceId) return;
    const amount = parsePrice(allowance.amount);
    if (amount === null || amount === 'invalid') throw new Error('Enter an amount of 0 or more.');
    await selectionsService.createAllowance({
      workspaceId, projectId, roomId: allowance.roomId || null,
      label: allowance.label.trim(), amount, currency,
    });
    setAllowance({ label: '', amount: '', roomId: '' });
  }, 'Could not add the allowance');

  const overAllowance = useMemo(
    () => new Set((position?.rows ?? []).filter(overageNeedsBilling).map((a) => a.allowance_id)),
    [position],
  );

  const addButton = (
    <Button size="sm" onClick={() => setAddOpen(true)} disabled={!workspaceId}>
      <Plus /> Add selection
    </Button>
  );

  if (loading && lines.length === 0) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-4">
      {failed && (
        <p className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          The selections could not be read just now. That is not a statement that every pick is
          inside its budget.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-primary" /> Selections
            </CardTitle>
            <CardDescription>
              What the client picked, room by room. Order progress comes from the linked order line.
            </CardDescription>
          </div>
          {lines.length > 0 && addButton}
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <HubEmptyState
              icon={ClipboardList}
              title="No selections yet"
              description="A selection records what the client picked for a room, at what price, and — once it is on an order — how far that order has got."
              action={addButton}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Room</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="w-[1%]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="min-w-[180px]">
                      <span className="font-medium">{l.product_name ?? l.description}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {[l.product_sku, l.product_name && l.description !== l.product_name ? l.description : null,
                          canFinance ? l.allowance_label : null].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={l.room_id ?? 'none'}
                        disabled={busy === l.id}
                        onValueChange={(v) => void guard(l.id,
                          () => selectionsService.updateSelection(l.id, { roomId: v === 'none' ? null : v }),
                          'Could not move the selection')}
                      >
                        <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Room of ${l.description}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Whole Project</SelectItem>
                          {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        key={`q-${l.id}-${l.quantity}`}
                        type="number" min="0" step="any" defaultValue={l.quantity}
                        aria-label={`Quantity of ${l.description}`}
                        className="ml-auto h-8 w-20 text-right tabular-nums"
                        onBlur={(e) => saveQuantity(l, e.target.value)}
                      />
                      {l.unit && <span className="text-[11px] text-muted-foreground">{l.unit}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Input
                          key={`p-${l.id}-${l.unit_price ?? ''}`}
                          type="number" min="0" step="0.01" defaultValue={l.unit_price ?? ''} placeholder="—"
                          aria-label={`Unit price of ${l.description}`}
                          className="h-8 w-24 text-right tabular-nums"
                          onBlur={(e) => savePrice(l, e.target.value)}
                        />
                        {l.product_id && workspaceId && (
                          <Button
                            size="icon" variant="ghost" className="h-8 w-8" title="Fetch the catalogue price"
                            onClick={() => void fetchPrice(l)} disabled={busy === l.id}
                          >
                            <Tag className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.line_total == null ? <span className="text-muted-foreground">Price TBC</span> : formatMoney(l.line_total, l.currency)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={l.status}
                        disabled={busy === l.id}
                        onValueChange={(v) => void guard(l.id,
                          () => selectionsService.setSelectionStatus(l.id, v as SelectionStatus),
                          'Could not update the selection')}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs" aria-label={`Client decision on ${l.description}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(SELECTION_STATUS_LABEL) as SelectionStatus[]).map((k) => (
                            <SelectItem key={k} value={k}>{SELECTION_STATUS_LABEL[k]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Badge variant={FULFILMENT_TONE[l.fulfilment]}>{FULFILMENT_LABEL[l.fulfilment]}</Badge>
                        {l.order_number && <span className="text-[11px] text-muted-foreground">{l.order_number}</span>}
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          title={l.order_item_id ? 'Change the linked order line' : 'Link an order line'}
                          onClick={() => setLinking(l)} disabled={busy === l.id}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {canFinance && (l.variation_id || overAllowance.has(l.allowance_id ?? '')) && (l.variation_id
                          ? <Badge variant="success">Change Order Raised</Badge>
                          : (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy === l.id} onClick={() => void bill(l)}>
                              <Receipt className="mr-1 h-3 w-3" /> Bill overage
                            </Button>
                          ))}
                        <Button
                          size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Remove"
                          onClick={() => remove(l)} disabled={busy === l.id}
                        >
                          {busy === l.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canFinance && position && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allowances</CardTitle>
            <CardDescription>{FROZEN_IS_THE_POINT}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div
              className={`space-y-1 rounded-sm border p-2 ${
                position.status === 'overage_unbilled'
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : positionNeedsAttention(position)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {positionNeedsAttention(position) ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                <Badge variant={position.status === 'overage_unbilled' ? 'error' : 'neutral'}>{POSITION_LABEL[position.status]}</Badge>
                <span className="tabular-nums">
                  Allowed {formatMoney(position.allowance_total, currency)} · selected {formatMoney(position.selected_total, currency)}
                  {' '}· over {formatMoney(position.overage_total, currency)} · under {formatMoney(position.underage_total, currency)}
                </span>
              </div>
              <p>{position.reason}</p>
              {totalIsAFloor(position) && <p>These totals are a floor: unpriced selections are missing from them.</p>}
              <p>{UNDERAGE_IS_NOT_A_CHANGE_ORDER}</p>
            </div>

            {position.rows.length > 0 && (
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
                          {a.room_name ?? a.category_key ?? 'Whole Project'} · {a.selections} selection(s)
                          {a.unpriced > 0 ? `, ${a.unpriced} unpriced` : ''}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(a.amount, a.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(a.selected, a.currency)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <span className={isOverage(a) ? 'text-destructive' : isUnderage(a) ? 'text-emerald-700 dark:text-emerald-400' : ''}>
                          {formatMoney(a.variance, a.currency)}
                        </span>
                      </TableCell>
                      <TableCell className="space-x-1">
                        {allowanceIsFrozen(a)
                          ? <Badge variant="neutral"><Lock className="mr-1 h-3 w-3" />Frozen</Badge>
                          : (
                            <Button
                              size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy !== null}
                              onClick={() => void guard('allowance', () => selectionsService.freezeAllowance(a.allowance_id), 'Could not freeze the allowance')}
                            >
                              Freeze
                            </Button>
                          )}
                        {overageNeedsBilling(a) && <Badge variant="error">Unbilled Overage</Badge>}
                        {a.billed_as_variation > 0 && <Badge variant="success">Billed</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div className="flex flex-wrap items-end gap-2 rounded-sm border border-hairline p-2">
              <FormField label="Allowance" className="w-44">
                <Input className="h-8 text-xs" value={allowance.label} placeholder="e.g. Bathroom Tiles"
                  onChange={(e) => setAllowance((a) => ({ ...a, label: e.target.value }))} />
              </FormField>
              <FormField label="Room" className="w-40">
                <Select value={allowance.roomId || 'none'} onValueChange={(v) => setAllowance((a) => ({ ...a, roomId: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole Project</SelectItem>
                    {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label={`Amount (${currency})`} className="w-28">
                <Input type="number" min="0" className="h-8 text-xs" value={allowance.amount}
                  onChange={(e) => setAllowance((a) => ({ ...a, amount: e.target.value }))} />
              </FormField>
              <Button size="sm" variant="outline" onClick={() => void addAllowance()} disabled={busy !== null || !allowance.label.trim() || !workspaceId}>
                <Plus /> Add allowance
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {workspaceId && (
        <AddSelectionDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          projectId={projectId}
          workspaceId={workspaceId}
          currency={currency}
          rooms={rooms}
          allowances={canFinance ? (position?.rows ?? []).map((a) => ({ id: a.allowance_id, label: a.label })) : []}
          onAdded={() => { setAddOpen(false); void load(); }}
        />
      )}

      <LinkOrderDialog
        line={linking}
        onClose={() => setLinking(null)}
        onLinked={() => { setLinking(null); void load(); }}
      />
    </div>
  );
};

const AddSelectionDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  projectId: string;
  workspaceId: string;
  currency: string;
  rooms: Room[];
  allowances: { id: string; label: string }[];
  onAdded: () => void;
}> = ({ open, onClose, projectId, workspaceId, currency, rooms, allowances, onAdded }) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<'catalog' | 'custom'>('catalog');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Picked[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [description, setDescription] = useState('');
  const [roomId, setRoomId] = useState('');
  const [allowanceId, setAllowanceId] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [priceCurrency, setPriceCurrency] = useState(currency);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const reset = () => {
    setMode('catalog'); setQuery(''); setResults([]); setPicked(null); setDescription('');
    setRoomId(''); setAllowanceId(''); setQty('1'); setUnit(''); setPrice(''); setPriceCurrency(currency);
  };
  const close = () => { reset(); onClose(); };
  /** A fetched price belongs to the product it was fetched for — changing product drops it. */
  const choose = (next: Picked | null) => {
    if (next?.id !== picked?.id) { setPrice(''); setPriceCurrency(currency); }
    setPicked(next);
  };

  const search = (val: string) => {
    setQuery(val);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!val.trim()) { setResults([]); return; }
      setSearching(true);
      try { setResults(await projectsService.searchProducts(val)); } catch { setResults([]); } finally { setSearching(false); }
    }, 250);
  };

  const quantity = useMemo(() => Number(qty), [qty]);

  const lookUpPrice = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      const p = await projectsService.resolveProductPrice(workspaceId, picked.id, {
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null, unit: unit.trim() || null,
      });
      const ref = p.suggested_sell ?? p.base_price;
      if (p.ask_for_quote || ref == null) {
        toast({ title: 'No catalogue price for this product', description: 'Ask the supplier for a quote and enter the price by hand.' });
      } else {
        setPrice(String(ref)); setPriceCurrency(p.currency);
      }
    } catch (err) {
      toast({ title: 'Price lookup failed', description: errText(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const add = async () => {
    const unitPrice = parsePrice(price);
    if (unitPrice === 'invalid') { toast({ title: 'Enter a price of 0 or more', variant: 'destructive' }); return; }
    if (!Number.isFinite(quantity) || quantity <= 0) { toast({ title: 'Quantity must be greater than zero', variant: 'destructive' }); return; }
    const text = description.trim() || picked?.name || '';
    if (mode === 'catalog' && !picked) { toast({ title: 'Pick a product', variant: 'destructive' }); return; }
    if (!text) { toast({ title: 'Describe what the client picked', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await selectionsService.createSelection({
        workspaceId, projectId,
        allowanceId: allowanceId || null,
        roomId: roomId || null,
        productId: mode === 'catalog' ? picked?.id ?? null : null,
        description: text,
        quantity,
        unit: unit.trim() || null,
        unitPrice,
        currency: priceCurrency,
      });
      toast({ title: 'Selection added' });
      reset();
      onAdded();
    } catch (err) {
      toast({ title: 'Could not add the selection', description: errText(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Selection</DialogTitle>
          <DialogDescription>Record what the client picked. Link it to an order line once it is ordered.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <FormSection title="What They Picked">
            <div className="flex gap-2">
              <Button size="sm" variant={mode === 'catalog' ? 'secondary' : 'outline'} className="flex-1" onClick={() => setMode('catalog')}>From catalogue</Button>
              <Button size="sm" variant={mode === 'custom' ? 'secondary' : 'outline'} className="flex-1" onClick={() => { setMode('custom'); choose(null); }}>Custom item</Button>
            </div>
            {mode === 'catalog' && (picked ? (
              <div className="flex items-center justify-between rounded-sm border border-hairline p-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{picked.name}</p>
                  {picked.sku && <p className="text-xs text-muted-foreground">{picked.sku}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Clear product" onClick={() => choose(null)}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Search products by name or SKU…" value={query} onChange={(e) => search(e.target.value)} />
                </div>
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                {results.length > 0 && (
                  <div className="max-h-48 divide-y divide-hairline overflow-auto rounded-sm border border-hairline">
                    {results.map((p) => (
                      <button key={p.id} type="button" className="w-full p-2 text-left hover:bg-muted/40" onClick={() => { choose(p); setResults([]); setQuery(''); }}>
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        {p.sku && <p className="text-xs text-muted-foreground">{p.sku}</p>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <FormField label="Description" optional={mode === 'catalog'}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={mode === 'catalog' ? 'e.g. Matt finish, 60x120' : 'e.g. Bespoke oak door'} />
            </FormField>
          </FormSection>

          <FormSection title="Where and How Much">
            <FormGrid cols={2}>
              <FormField label="Room">
                <Select value={roomId || 'none'} onValueChange={(v) => setRoomId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole Project</SelectItem>
                    {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              {allowances.length > 0 && (
                <FormField label="Against Allowance" optional>
                  <Select value={allowanceId || 'none'} onValueChange={(v) => setAllowanceId(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Allowance</SelectItem>
                      {allowances.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
              )}
              <FormField label="Quantity">
                <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
              </FormField>
              <FormField label="Unit" optional>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. m2" />
              </FormField>
              <FormField label={`Unit Price (${priceCurrency})`} optional>
                <div className="flex gap-1">
                  <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="—" />
                  {mode === 'catalog' && picked && (
                    <Button size="icon" variant="outline" title="Fetch the catalogue price" onClick={() => void lookUpPrice()} disabled={busy}>
                      <Tag className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </FormField>
            </FormGrid>
          </FormSection>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>Cancel</Button>
          <Button onClick={() => void add()} disabled={busy}>{busy && <Loader2 className="animate-spin" />} Add selection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const LinkOrderDialog: React.FC<{
  line: ProjectSelectionLine | null;
  onClose: () => void;
  onLinked: () => void;
}> = ({ line, onClose, onLinked }) => {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<SelectionOrderCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!line) return;
    let live = true;
    setLoading(true);
    setCandidates([]);
    setReadFailed(false);
    selectionsService.orderCandidates(line.id)
      .then((c) => { if (live) setCandidates(c); })
      .catch((err) => {
        if (!live) return;
        setReadFailed(true);
        toast({ title: 'Could not read the project orders', description: errText(err), variant: 'destructive' });
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [line, toast]);

  const link = async (orderItemId: string | null) => {
    if (!line) return;
    setBusy(true);
    try {
      await selectionsService.linkOrderItem(line.id, orderItemId);
      onLinked();
    } catch (err) {
      toast({ title: 'Could not link the order line', description: errText(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!line} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link an Order Line</DialogTitle>
          <DialogDescription>
            The order line this selection was ordered on. Its progress then shows here.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : readFailed ? (
          <p className="py-6 text-center text-sm text-amber-800 dark:text-amber-300">
            The project's orders could not be read, so nothing can be linked right now.
          </p>
        ) : candidates.length === 0 ? (
          <HubEmptyState
            title="No orders on this project"
            description="Raise a sales or purchase order for this project first; its lines appear here to link."
          />
        ) : (
          <div className="max-h-80 divide-y divide-hairline overflow-auto rounded-sm border border-hairline">
            {candidates.map((c) => {
              const current = c.order_item_id === line?.order_item_id;
              const taken = !!c.linked_selection_id;
              return (
                <button
                  key={c.order_item_id} type="button" disabled={busy || current || taken}
                  className="flex w-full items-center justify-between gap-2 p-2 text-left hover:bg-muted/40 disabled:opacity-60"
                  onClick={() => void link(c.order_item_id)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.description ?? 'Untitled line'}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.order_number ?? 'Draft'} · {c.order_type === 'purchase' ? 'Purchase Order' : 'Sales Order'} · Qty {c.quantity}
                      {taken ? ' · linked to another selection' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {c.product_match && <Badge variant="info">Same Product</Badge>}
                    {current ? <Badge variant="success">Linked</Badge> : <Badge variant={FULFILMENT_TONE[c.fulfilment]}>{FULFILMENT_LABEL[c.fulfilment]}</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <DialogFooter>
          {line?.order_item_id && (
            <Button variant="outline" onClick={() => void link(null)} disabled={busy}><Unlink /> Unlink</Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
