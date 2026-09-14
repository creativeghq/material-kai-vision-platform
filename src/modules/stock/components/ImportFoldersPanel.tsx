/**
 * Import folders — freight, duty and demurrage, apportioned over a container (#422).
 *
 * Weight is the default basis for tile. Allocating by value puts the freight on the light,
 * expensive decor pieces and under-costs the heavy floor tile, which is wrong in the one direction
 * that flatters the cheap lines. A basis that cannot be measured is refused, not swapped.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Ship, Plus, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
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
import { todayLocalISO } from '@/utils/datetime';
import {
  landedCostService, BASIS_LABEL, allocationIsForecast, allocationRefused, onCostVariance,
  type ImportFolder, type FolderCost, type FolderAllocation, type AllocationBasis,
} from '@/modules/stock/services/landedCostService';

const BASES: AllocationBasis[] = ['weight', 'volume', 'value', 'quantity', 'equal'];
const KINDS = ['freight', 'duty', 'customs', 'clearance', 'demurrage', 'insurance', 'handling', 'inland', 'other'];

export const ImportFoldersPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [folders, setFolders] = useState<ImportFolder[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [costs, setCosts] = useState<FolderCost[]>([]);
  const [allocation, setAllocation] = useState<FolderAllocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newRef, setNewRef] = useState('');
  const [newBasis, setNewBasis] = useState<AllocationBasis>('weight');
  const [cost, setCost] = useState({ kind: 'freight', stage: 'forecast' as 'forecast' | 'actual', amount: '' });
  const [orders, setOrders] = useState<{ id: string; order_number: string | null }[]>([]);
  const [attachId, setAttachId] = useState('');

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [fs, os] = await Promise.all([
        landedCostService.listFolders(workspaceId),
        landedCostService.attachableOrders(workspaceId).catch(() => []),
      ]);
      setFolders(fs); setOrders(os); setFailed(false);
    } catch {
      setFolders([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const openFolder = async (id: string) => {
    setOpenId(id);
    try {
      const [c, a] = await Promise.all([
        landedCostService.listCosts(id),
        landedCostService.allocation(id),
      ]);
      setCosts(c); setAllocation(a);
    } catch {
      setCosts([]); setAllocation(null);
    }
  };

  const create = async () => {
    if (!newRef.trim()) return;
    setBusy(true);
    try {
      const f = await landedCostService.createFolder({
        workspace_id: workspaceId, reference: newRef.trim(), allocation_basis: newBasis,
      });
      setNewRef('');
      await load();
      await openFolder(f.id);
    } catch (err: unknown) {
      toast({
        title: 'Could not create the folder',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const addCost = async () => {
    if (!openId || !cost.amount.trim()) return;
    setBusy(true);
    try {
      await landedCostService.addCost({
        folder_id: openId, kind: cost.kind, stage: cost.stage,
        amount: Number(cost.amount), incurred_on: todayLocalISO(),
      });
      setCost((c) => ({ ...c, amount: '' }));
      await openFolder(openId);
    } catch (err: unknown) {
      toast({
        title: 'Could not add the cost',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const attach = async () => {
    if (!openId || !attachId) return;
    setBusy(true);
    try {
      await landedCostService.attachOrder(openId, attachId);
      setAttachId('');
      await openFolder(openId);
    } catch (err: unknown) {
      toast({
        title: 'Could not attach that order',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const variance = onCostVariance(allocation);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ship className="h-4 w-4 text-primary" /> Import folders
          </CardTitle>
          <CardDescription>
            The container is what the on-costs attach to — one container often holds several orders,
            and one order can span containers.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading folders…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The import folders could not be read just now. That is not a statement that there are
            none.
          </p>
        )}

        {!loading && !failed && folders.length === 0 && (
          <HubEmptyState
            title="No import folders"
            description="Until a container exists, freight and duty have nowhere to land and never reach cost per m²."
          />
        )}

        {folders.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Container</TableHead>
                  <TableHead>Basis</TableHead>
                  <TableHead>Arrived</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {folders.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.reference}</TableCell>
                    <TableCell className="tabular-nums">{f.container_number ?? '—'}</TableCell>
                    <TableCell>{BASIS_LABEL[f.allocation_basis]}</TableCell>
                    <TableCell className="tabular-nums">{f.arrived_on ?? '—'}</TableCell>
                    <TableCell><Badge variant="neutral">{f.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => openFolder(f.id)}>Open</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
          <div>
            <Label htmlFor="folder-ref" className="text-[11px]">New folder reference</Label>
            <Input
              id="folder-ref" className="mt-1 h-8 w-48 text-xs" value={newRef}
              onChange={(e) => setNewRef(e.target.value)} placeholder="CNT-2026-01"
            />
          </div>
          <div>
            <Label htmlFor="folder-basis" className="text-[11px]">Apportion by</Label>
            <Select value={newBasis} onValueChange={(v) => setNewBasis(v as AllocationBasis)}>
              <SelectTrigger id="folder-basis" className="mt-1 h-8 w-64 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {BASES.map((b) => <SelectItem key={b} value={b}>{BASIS_LABEL[b]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={create} disabled={busy || !newRef.trim()}>
            <Plus className="mr-1 h-3 w-3" /> Create
          </Button>
        </div>

        {openId && (
          <div className="space-y-3 rounded-md border border-hairline p-3">
            {allocation && (
              <div
                className={`rounded-md border p-2 text-xs ${
                  allocationRefused(allocation)
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : allocationIsForecast(allocation)
                      ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                      : 'border-hairline bg-surface-sunken text-muted-foreground'
                }`}
              >
                <p>{allocation.reason}</p>
                {variance != null && (
                  <p className="mt-1 tabular-nums">
                    Actual against forecast: {variance >= 0 ? '+' : ''}{variance}
                  </p>
                )}
              </div>
            )}

            {/* A folder with no orders on it apportions nothing, and the allocation says so
                rather than reporting a confident zero. */}
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="attach-order" className="text-[11px]">Purchase order in this container</Label>
                <Select value={attachId} onValueChange={setAttachId}>
                  <SelectTrigger id="attach-order" className="mt-1 h-8 w-56 text-xs">
                    <SelectValue placeholder="Choose an order" />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.order_number ?? o.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" variant="outline" onClick={attach} disabled={busy || !attachId}>
                <Plus className="mr-1 h-3 w-3" /> Attach
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div>
                <Label htmlFor="cost-kind" className="text-[11px]">Cost</Label>
                <Select value={cost.kind} onValueChange={(v) => setCost((c) => ({ ...c, kind: v }))}>
                  <SelectTrigger id="cost-kind" className="mt-1 h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cost-stage" className="text-[11px]">Stage</Label>
                <Select
                  value={cost.stage}
                  onValueChange={(v) => setCost((c) => ({ ...c, stage: v as 'forecast' | 'actual' }))}
                >
                  <SelectTrigger id="cost-stage" className="mt-1 h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forecast">Forecast</SelectItem>
                    <SelectItem value="actual">Actual invoice</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cost-amount" className="text-[11px]">Amount</Label>
                <Input
                  id="cost-amount" type="number" className="mt-1 h-8 w-32 text-xs"
                  value={cost.amount} onChange={(e) => setCost((c) => ({ ...c, amount: e.target.value }))}
                />
              </div>
              <Button size="sm" onClick={addCost} disabled={busy || !cost.amount.trim()}>
                <Save className="mr-1 h-3 w-3" /> Add
              </Button>
            </div>

            {costs.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {costs.map((c) => (
                  <li key={c.id} className="tabular-nums">
                    {c.stage} · {c.kind} · {c.amount} {c.currency}
                    {c.invoice_reference ? ` · ${c.invoice_reference}` : ''}
                  </li>
                ))}
              </ul>
            )}

            {(allocation?.allocation?.length ?? 0) > 0 && (
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Basis</TableHead>
                      <TableHead className="text-right">On-cost</TableHead>
                      <TableHead className="text-right">Per unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allocation?.allocation?.map((l) => (
                      <TableRow key={l.order_item_id}>
                        <TableCell>{l.description ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.measure ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.on_cost ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{l.on_cost_per_unit ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
