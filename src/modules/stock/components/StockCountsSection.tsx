import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, Plus, ClipboardList, CheckCircle2, XCircle, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { parseDecimal } from '@/utils/decimal';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { warehouseService, type Warehouse } from '@/services/warehouseService';
import { stockService, type StockCount, type StockCountLine } from '../services/stockService';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildStockCountFilters } from './stockCountFilters';
import { formatDate } from '@/utils/datetime';
import { HubEmptyState } from '@/components/core/hub';

const STATUS_META: Record<string, { cls: string; label: string }> = {
  draft: { cls: 'text-amber-600 dark:text-amber-400', label: 'Draft' },
  posted: { cls: 'text-emerald-600 dark:text-emerald-400', label: 'Posted' },
  cancelled: { cls: 'text-muted-foreground', label: 'Cancelled' },
};

export const StockCountsSection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [counts, setCounts] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [openCountId, setOpenCountId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  // App Launcher deep-link: /warehouse?tab=counts&new=count opens the New stocktake dialog.
  useEffect(() => {
    if (searchParams.get('new') === 'count') {
      setNewOpen(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const load = async () => {
    setLoading(true);
    // Cancelling a count drops it from the list, so re-clamp after every reload.
    try { const next = await stockService.listCounts(workspaceId); setCounts(next); setPage((p) => clampPage(p, next.length)); }
    catch (err: any) { toast({ title: 'Failed to load counts', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const filterGroups = useMemo(() => buildStockCountFilters(counts), [counts]);
  const { values: filterValues, setValues: setFilterValues, reset: resetFilters, filtered, previewCount, activeCount } =
    useFilters<StockCount>(counts, filterGroups);
  // A narrowed list is a different list — restart at the first page.
  useEffect(() => { setPage(1); }, [filterValues]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Stock counts (stocktake)</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {counts.length > 0 && (
            <FilterBar
              groups={filterGroups}
              values={filterValues}
              onChange={setFilterValues}
              previewCount={previewCount}
              title="Filter stock counts"
              searchPlaceholder="Search counts…"
            />
          )}
          <Button size="sm" onClick={() => setNewOpen(true)}><Plus /> New count</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          activeCount > 0 ? (
            <HubEmptyState
              variant="filtered"
              icon={ClipboardList}
              title="No stock counts match your filters"
              description="Widen the filter to see the counts you have already run."
              action={<Button size="sm" variant="outline" onClick={resetFilters}>Clear filters</Button>}
            />
          ) : (
            <HubEmptyState
              icon={ClipboardList}
              title="No stock counts yet"
              description="A stock count reconciles what is physically on the shelf against what the system thinks is there, and posts the difference as an adjustment."
              action={<Button size="sm" onClick={() => setNewOpen(true)}><Plus /> Start a count</Button>}
            />
          )
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Created</th>
                <th className="px-4 py-2 text-left">Warehouse</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Note</th>
                <th className="px-4 py-2 text-right">Adjusted</th>
                <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {paginate(filtered, page).map((c) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.draft;
                return (
                  <tr key={c.id} className="border-b border-border/30">
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">{formatDate(c.created_at)}</td>
                    <td className="px-4 py-2">{c.warehouse?.name ?? '—'}</td>
                    <td className="px-4 py-2"><span className={`text-sm ${meta.cls}`}>{meta.label}</span></td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-[16rem]">{c.note ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{c.adjusted_lines ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setOpenCountId(c.id)}>
                        {c.status === 'draft' ? 'Open' : 'View'}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="counts" />}
      </CardContent>

      <NewCountDialog open={newOpen} onOpenChange={setNewOpen} workspaceId={workspaceId}
        onCreated={async (id) => { setNewOpen(false); await load(); setOpenCountId(id); }} />
      <CountSheetDialog countId={openCountId} workspaceId={workspaceId}
        onOpenChange={(v) => { if (!v) setOpenCountId(null); }} onChanged={load} />
    </Card>
  );
};

const NewCountDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void; workspaceId: string; onCreated: (id: string) => void }> = ({ open, onOpenChange, workspaceId, onCreated }) => {
  const { toast } = useToast();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [whId, setWhId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setNote(''); return; }
    (async () => {
      try {
        await warehouseService.ensureDefaultWarehouse(workspaceId);
        const whs = await warehouseService.listWarehouses(workspaceId);
        setWarehouses(whs);
        setWhId(whs.find((w) => w.is_default)?.id || whs[0]?.id || '');
      } catch (err: any) { toast({ title: 'Failed to load warehouses', description: err?.message, variant: 'destructive' }); }
    })();
  }, [open, workspaceId, toast]);

  const submit = async () => {
    if (!whId) { toast({ title: 'Pick a warehouse', variant: 'destructive' }); return; }
    try {
      setBusy(true);
      const id = await stockService.createCount(workspaceId, whId, note.trim() || undefined);
      toast({ title: 'Count started — enter physical quantities' });
      onCreated(id);
    } catch (err: any) { toast({ title: 'Failed to start count', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Stock Count</DialogTitle>
          <DialogDescription>Start a physical stocktake for a warehouse and reconcile counted quantities.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Warehouse</Label>
            <Select value={whId} onValueChange={setWhId}>
              <SelectTrigger><SelectValue placeholder="Choose a warehouse" /></SelectTrigger>
              <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? ' (default)' : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional — e.g. Q3 physical count" /></div>
          <p className="text-xs text-muted-foreground">Every item in the warehouse is snapshotted into a blind count sheet. Enter the physical quantities, then post to reconcile.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !whId}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Start count'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CountSheetDialog: React.FC<{ countId: string | null; workspaceId: string; onOpenChange: (v: boolean) => void; onChanged: () => void }> = ({ countId, workspaceId, onOpenChange, onChanged }) => {
  const { toast } = useToast();
  const open = !!countId;
  const [count, setCount] = useState<StockCount | null>(null);
  const [lines, setLines] = useState<StockCountLine[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!countId) { setCount(null); setLines([]); setDrafts({}); return; }
    (async () => {
      setLoading(true);
      try {
        const res = await stockService.getCount(workspaceId, countId);
        setCount(res.count);
        setLines(res.lines);
        setDrafts(Object.fromEntries(res.lines.map((l) => [l.id, l.counted_qty == null ? '' : String(l.counted_qty)])));
      } catch (err: any) { toast({ title: 'Failed to load count', description: err?.message, variant: 'destructive' }); }
      finally { setLoading(false); }
    })();
  }, [countId, workspaceId, toast]);

  const readOnly = count?.status !== 'draft';

  /**
   * The latest persisted lines, readable after an `await` (#355 WH-1).
   *
   * `flushPendingEdits` waits on in-flight blur saves and must then compare drafts against what
   * those saves stored. A closure over `lines` captures the value from the render that created
   * it, so it would re-send edits that had just landed.
   */
  const linesRef = useRef<StockCountLine[]>(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  /** Blur saves currently in flight, so Post can wait for them rather than race them. */
  const inFlight = useRef<Set<Promise<unknown>>>(new Set());

  /**
   * Persist one line. Returns false if the value did not reach the database.
   *
   * ON FAILURE THE INPUT IS ROLLED BACK. It used to keep the typed value, and `variance()` reads
   * `drafts` — so a failed save left the screen showing `92` and a variance of `−8` while the
   * durable line held neither. A stock count is the mechanism for correcting drift in a conserved
   * quantity; showing a correction that was never stored is the worst possible lie for it to tell.
   */
  const saveLine = async (line: StockCountLine): Promise<boolean> => {
    if (readOnly) return true;
    const raw = drafts[line.id] ?? '';
    const parsed = raw.trim() === '' ? null : parseDecimal(raw);
    if (raw.trim() !== '' && (parsed == null || parsed < 0)) { toast({ title: 'Invalid quantity', variant: 'destructive' }); return false; }
    // No change vs persisted → skip the round-trip.
    if ((line.counted_qty ?? null) === (parsed ?? null)) return true;
    const p = (async () => {
      try {
        const updated = await stockService.updateCountLine(workspaceId, line.id, { counted_qty: parsed });
        setLines((prev) => prev.map((l) => (l.id === line.id ? updated : l)));
        return true;
      } catch (err: any) {
        toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
        setDrafts((d) => ({ ...d, [line.id]: line.counted_qty == null ? '' : String(line.counted_qty) }));
        return false;
      }
    })();
    inFlight.current.add(p);
    try { return await p; } finally { inFlight.current.delete(p); }
  };

  /**
   * Make the durable count match what is on screen. Returns false if anything failed.
   *
   * Counted quantities used to persist ONLY on the input's `onBlur`, so clicking Post while a
   * field still had focus raced that save: the count could post with the old or null quantity and
   * no adjustment movement was ever created. `post_stock_count` cannot catch this — it correctly
   * refuses a *second* post, but it cannot know the first one carried stale data. A count that
   * silently posts the wrong number is worse than no count, because it closes the discrepancy in
   * the audit trail without fixing the stock.
   *
   * This also covers the case blur never handled at all: a value typed and then submitted by
   * keyboard, where no blur fires before the click.
   */
  const flushPendingEdits = async (): Promise<boolean> => {
    // Blur saves already running: let them finish before diffing, or the diff re-sends them.
    await Promise.allSettled([...inFlight.current]);
    const stale = linesRef.current.filter((l) => {
      const raw = drafts[l.id] ?? '';
      const parsed = raw.trim() === '' ? null : parseDecimal(raw);
      return (l.counted_qty ?? null) !== (parsed ?? null);
    });
    if (stale.length === 0) return true;
    const results = await Promise.all(stale.map((l) => saveLine(l)));
    return results.every(Boolean);
  };

  const post = async () => {
    if (!count) return;
    if (!confirm('Post this count? It records adjustment movements for every counted line that differs from the system.')) return;
    try {
      setBusy(true);
      // Before the post, not after: an unsaved line posts as "not counted" and produces no
      // adjustment, so the physical shortfall is never recorded.
      if (!(await flushPendingEdits())) {
        toast({
          title: 'Not posted — some counted quantities did not save',
          description: 'The count is unchanged. Check the highlighted lines and try again.',
          variant: 'destructive',
        });
        return;
      }
      const res = await stockService.postCount(workspaceId, count.id);
      toast({ title: `Count posted — ${res.adjusted_lines} item(s) adjusted` });
      onChanged();
      onOpenChange(false);
    } catch (err: any) { toast({ title: 'Post failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!count) return;
    if (!confirm('Cancel this count? No stock is changed.')) return;
    try {
      setBusy(true);
      await stockService.cancelCount(workspaceId, count.id);
      toast({ title: 'Count cancelled' });
      onChanged();
      onOpenChange(false);
    } catch (err: any) { toast({ title: 'Cancel failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const variance = (line: StockCountLine): number | null => {
    const raw = drafts[line.id] ?? '';
    if (raw.trim() === '') return null;
    const parsed = parseDecimal(raw);
    if (parsed == null) return null;
    return parsed - Number(line.system_qty);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Count sheet
            {count && <Badge variant="outline" className={STATUS_META[count.status]?.cls}>{STATUS_META[count.status]?.label}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground sticky top-0 bg-background">
                <tr className="border-b border-border/60">
                  <th className="px-3 py-2 text-left">Item</th>
                  <th className="px-3 py-2 text-right">System</th>
                  <th className="px-3 py-2 text-right">Counted</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No items in this warehouse.</td></tr>}
                {lines.map((l) => {
                  const v = variance(l);
                  return (
                    <tr key={l.id} className="border-b border-border/30">
                      <td className="px-3 py-2">
                        {l.name} <span className="text-xs text-muted-foreground">/ {l.unit}</span>
                        {l.sku && <div className="font-mono text-[11px] text-muted-foreground">{l.sku}</div>}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{l.system_qty}</td>
                      <td className="px-3 py-2 text-right">
                        {readOnly ? (l.counted_qty ?? '—') : (
                          <Input
                            type="text" inputMode="decimal" value={drafts[l.id] ?? ''}
                            onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                            onBlur={() => saveLine(l)}
                            className="h-8 w-24 text-right text-xs ml-auto" placeholder="—"
                          />
                        )}
                      </td>
                      <td className={`px-3 py-2 text-right ${v == null || v === 0 ? 'text-muted-foreground' : v > 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        {v == null ? '—' : v > 0 ? `+${v}` : v}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter className="gap-2">
          {!readOnly && count && (
            <>
              <Button variant="ghost" className="text-destructive" onClick={cancel} disabled={busy}><XCircle className="h-4 w-4 mr-1" /> Cancel count</Button>
              <Button onClick={post} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Post count</>}</Button>
            </>
          )}
          {readOnly && <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
