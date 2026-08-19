/**
 * Supplier-invoice intake queue. When a myDATA expense is pulled, the inbound sync runs the
 * cheapest AI model over each line, turns it into a clean product and queues it here. The
 * operator reviews and ✓ adds it to the warehouse (matched to existing stock or created new,
 * with cost from the invoice and the sale price DERIVED BY THE PRICING LADDER) or ✗ dismisses it.
 *
 * ── Why this is grouped by SUPPLIER ───────────────────────────────────────────────────────
 * The myDATA feed carries EVERY invoice a workspace receives, so the queue is not a short list
 * of deliveries — it is the whole purchase ledger. One week of real data: 929 lines, 360
 * documents, 94 issuers, mixing board and hinges and tiles with supermarket runs and recycling
 * levies. The previous version fetched all 929 rows, rendered a six-control editor for each,
 * and fired one `preview_pending_item_sell_price` round trip PER ROW — re-firing all of them
 * on every debounced cost edit. That is why the tab took the better part of a minute to become
 * usable and stuttered afterwards.
 *
 * Rendering fewer rows would only have made a slow page a fast page with the same impossible
 * job on it. The queue is only finishable if the DECISION is per supplier: 10 issuers cover
 * half these lines, 30 cover 79%. So the card lists issuers, expands one at a time, pages the
 * lines inside it, and offers the three answers an operator actually has — add them all, drop
 * them all, or never queue this issuer again.
 *
 * "Never queue" is applied at SELECTION time (`inbound_docs_needing_extraction`), so an ignored
 * issuer's documents never reach the AI extractor: the rule saves the credit, it does not
 * merely hide what the credit bought.
 *
 * The suggested price is never computed here. It used to be — `cost * (1 + margin_pct/100)` in
 * the browser, a second answer to "what margin applies" that disagreed with the `pricing_rules`
 * ladder every other pricing path uses, so the number the operator approved could differ from
 * the number the approval then wrote. It now arrives already derived by `_pricing_markup_ladder`,
 * the SAME ladder `_approve_pending_item_core` runs a moment later (#332 step 4) — computed for
 * a whole page inside `warehouse_intake_lines`, and re-asked for a single row only while the
 * operator is typing a different cost into it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import {
  Loader2, Check, X, PackagePlus, ChevronRight, ChevronDown, Search, Ban, Undo2, Building2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  warehouseService, INTAKE_LINE_PAGE_SIZE,
  type IntakeSupplierGroup, type IntakeLine, type IntakeIgnoredIssuer, type Warehouse,
} from '@/services/warehouseService';
import { supabase } from '@/integrations/supabase/client';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { formatMoney } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { TablePagination, clampPage } from '@/components/core/ui/table-pagination';

/** Issuers per page in the collapsed list. */
const GROUP_PAGE_SIZE = 15;

type IntakeMode = 'off' | 'suggest' | 'auto';

/** Per-line operator edits, held only while a group is expanded. */
interface LineEdit { name: string; sku: string; unit: string; quantity: string; unit_cost: string; sales_price: string; category_id: string; }

const editFrom = (l: IntakeLine): LineEdit => ({
  name: l.name,
  sku: l.sku ?? '',
  unit: l.unit ?? '',
  quantity: String(l.quantity ?? 1),
  unit_cost: l.unit_cost != null ? String(l.unit_cost) : '',
  sales_price: l.sales_price != null ? String(l.sales_price) : '',
  category_id: l.category_id ?? '',
});

export const PendingProductsCard: React.FC<{ workspaceId: string; warehouses: Warehouse[]; onChanged?: () => void }> =
({ workspaceId, warehouses, onChanged }) => {
  const { toast } = useToast();
  const [groups, setGroups] = useState<IntakeSupplierGroup[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [ignored, setIgnored] = useState<IntakeIgnoredIssuer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [ignoredOpen, setIgnoredOpen] = useState(false);

  /** Where bulk-approved stock lands, and whether it becomes sellable. Card-level on purpose:
   *  these are the two answers that apply to a whole delivery, so asking per line is noise. */
  const [targetWarehouse, setTargetWarehouse] = useState('');
  const [addToCatalog, setAddToCatalog] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');

  /** How supplier lines get here at all. Lives on this card because this card IS the thing it
   *  governs — as a standalone control above the stock table it read as a dropdown from nowhere. */
  const [mode, setMode] = useState<IntakeMode>('suggest');

  const defaultWh = useMemo(
    () => warehouses.find((w) => w.is_default)?.id ?? warehouses[0]?.id ?? '',
    [warehouses],
  );
  useEffect(() => { setTargetWarehouse((cur) => cur || defaultWh); }, [defaultWh]);

  // Debounce the search box: each keystroke would otherwise re-query the whole queue.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchText.trim()), 300);
    return () => window.clearTimeout(t);
  }, [searchText]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [gs, cats, fin, ign] = await Promise.all([
        warehouseService.intakeSupplierGroups(workspaceId),
        financeCategoriesService.list(workspaceId)
          .then((c) => c.filter((x) => x.kind === 'income' || x.kind === 'both')).catch(() => []),
        supabase.from('finance_settings').select('warehouse_autosync_mode').eq('workspace_id', workspaceId).maybeSingle()
          .then((r) => r.data, () => null),
        warehouseService.intakeIgnoredIssuers(workspaceId).catch(() => [] as IntakeIgnoredIssuer[]),
      ]);
      setGroups(gs);
      setCategories(cats);
      setIgnored(ign);
      setMode((((fin as { warehouse_autosync_mode?: IntakeMode } | null)?.warehouse_autosync_mode) ?? 'suggest'));
      setPage((p) => clampPage(p, gs.length, GROUP_PAGE_SIZE));
    } catch (err) {
      toast({ title: 'Failed to load the intake queue', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [workspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  // A group the operator just emptied must not stay expanded onto nothing.
  useEffect(() => {
    if (expanded && !groups.some((g) => g.issuer_key === expanded)) setExpanded(null);
  }, [groups, expanded]);

  const totals = useMemo(() => ({
    lines: groups.reduce((n, g) => n + Number(g.line_count || 0), 0),
    cost: groups.reduce((n, g) => n + Number(g.total_cost || 0), 0),
    unattributed: groups.filter((g) => !g.supplier_attributed).length,
  }), [groups]);

  const saveMode = async (next: IntakeMode) => {
    const prev = mode;
    setMode(next);
    const { error } = await supabase.from('finance_settings')
      .update({ warehouse_autosync_mode: next }).eq('workspace_id', workspaceId);
    if (error) { setMode(prev); toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); }
  };

  /** Run a bulk action over every line of a group, then re-read the groups. */
  const runBulk = async (g: IntakeSupplierGroup, action: 'approve' | 'dismiss') => {
    const who = g.issuer_name || g.issuer_vat || 'this supplier';
    const wh = warehouses.find((w) => w.id === targetWarehouse);
    const ok = action === 'approve'
      ? confirm(`Add all ${g.line_count} queued line(s) from ${who} to ${wh?.name ?? 'the default warehouse'}?\n\nThis creates or tops up ${g.line_count} product(s) and posts a stock movement for each.`)
      : confirm(`Dismiss all ${g.line_count} queued line(s) from ${who}? They will not be added to stock.`);
    if (!ok) return;

    setBusyKey(g.issuer_key);
    try {
      const ids = await warehouseService.intakeLineIds(workspaceId, { issuerKey: g.issuer_key });
      if (ids.length === 0) { await load(); return; }
      if (action === 'approve') {
        const res = await warehouseService.bulkApprovePending(ids, {
          target_warehouse_id: targetWarehouse || null,
          add_to_catalog: addToCatalog,
        });
        toast({
          title: `${res.approved} added to warehouse`,
          description: res.failed > 0 ? `${res.failed} line(s) failed: ${res.errors[0]?.error ?? ''}` : who,
          variant: res.failed > 0 ? 'destructive' : undefined,
        });
      } else {
        const n = await warehouseService.bulkDismissPending(ids);
        toast({ title: `${n} line(s) dismissed`, description: who });
      }
      await load();
      onChanged?.();
    } catch (err) {
      toast({ title: 'Bulk action failed', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBusyKey(null); }
  };

  const neverQueue = async (g: IntakeSupplierGroup) => {
    const who = g.issuer_name || g.issuer_vat || 'this supplier';
    if (!confirm(`Never queue invoice lines from ${who} again?\n\nThe ${g.line_count} line(s) waiting now are dismissed, and future invoices from this VAT skip AI extraction entirely. You can undo this from “Ignored suppliers”.`)) return;
    setBusyKey(g.issuer_key);
    try {
      const n = await warehouseService.setIntakeIssuerIgnored(workspaceId, g.issuer_key, g.issuer_name, true);
      toast({ title: `${who} will no longer be queued`, description: `${n} waiting line(s) dismissed.` });
      await load();
    } catch (err) {
      toast({ title: 'Failed', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBusyKey(null); }
  };

  const header = (
    <CardHeader className="border-b border-hairline px-5 py-3 flex-row flex-wrap items-center gap-2 space-y-0">
      <PackagePlus className={`h-4 w-4 ${totals.lines > 0 ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground'}`} />
      <CardTitle>From Supplier Invoices</CardTitle>
      {totals.lines > 0 && (
        <Badge variant="warning" className="text-[10px] tabular-nums">
          {totals.lines} line{totals.lines === 1 ? '' : 's'} · {groups.length} supplier{groups.length === 1 ? '' : 's'}
        </Badge>
      )}
      <div className="ml-auto flex items-center gap-2">
        {ignored.length > 0 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIgnoredOpen(true)}>
            <Ban className="h-3.5 w-3.5 mr-1" /> Ignored ({ignored.length})
          </Button>
        )}
        <span className="text-[11px] text-muted-foreground">Intake</span>
        <Select value={mode} onValueChange={(v) => saveMode(v as IntakeMode)}>
          <SelectTrigger className="h-7 w-[190px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off — ignore supplier lines</SelectItem>
            <SelectItem value="suggest">Review before adding</SelectItem>
            <SelectItem value="auto">Auto-add exact matches</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </CardHeader>
  );

  const ignoredDialog = (
    <IgnoredIssuersDialog
      open={ignoredOpen} onOpenChange={setIgnoredOpen} workspaceId={workspaceId}
      issuers={ignored} onChanged={load}
    />
  );

  // Both the empty and the populated state below render this card, so this component is never
  // absent once loaded — returning null while it loads therefore popped the whole card into the
  // page a beat late and shoved everything under it down. Hold the shell with a skeleton body.
  if (loading) {
    return (
      <Card>
        {header}
        <CardContent className="px-5 py-6"><div className="h-4 w-2/3 rounded bg-muted animate-pulse" /></CardContent>
      </Card>
    );
  }

  // An empty queue must explain itself. Rendering nothing at all is why this looked broken: the
  // operator sees no products, no queue, and no way to tell whether that means "all clear" or
  // "the pipeline never ran".
  if (groups.length === 0) {
    return (
      <Card>
        {header}
        <CardContent className="px-5 py-6 text-sm text-muted-foreground">
          {mode === 'off'
            ? 'Intake is off, so lines on your suppliers’ myDATA invoices are ignored. Switch to “Review before adding” to start queueing them here.'
            : <>Nothing waiting. Lines from your suppliers&rsquo; myDATA invoices are read once a day and queued here to review. To pull them now, use <strong>Sync from myDATA</strong> in Finance &rarr; Documents &rarr; Expenses.</>}
          {ignored.length > 0 && (
            <>
              {' '}
              <button type="button" className="underline underline-offset-2" onClick={() => setIgnoredOpen(true)}>
                {ignored.length} supplier{ignored.length === 1 ? ' is' : 's are'} ignored.
              </button>
            </>
          )}
        </CardContent>
        {ignoredDialog}
      </Card>
    );
  }

  const pageGroups = groups.slice((page - 1) * GROUP_PAGE_SIZE, page * GROUP_PAGE_SIZE);

  return (
    <Card>
      {header}

      {/* Toolbar: what applies to every bulk approval, and a way to find one item in 900. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline bg-surface-sunken px-4 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs" value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search every queued line — name, SKU, invoice text or supplier…"
          />
          {searchText && (
            <button type="button" onClick={() => setSearchText('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Receive into</span>
          <Select value={targetWarehouse} onValueChange={setTargetWarehouse}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Default" /></SelectTrigger>
            <SelectContent>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? ' (default)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
            <Checkbox className="h-3.5 w-3.5" checked={addToCatalog} onCheckedChange={(v) => setAddToCatalog(v === true)} />
            Sellable
          </label>
        </div>
      </div>

      <CardContent className="p-0">
        {search ? (
          <IntakeLineList
            key={`search:${search}`}
            workspaceId={workspaceId} issuerKey={null} search={search}
            categories={categories} warehouses={warehouses}
            targetWarehouseId={targetWarehouse} addToCatalog={addToCatalog}
            onChanged={async () => { await load(); onChanged?.(); }}
          />
        ) : (
          <>
            <div className="divide-y divide-hairline">
              {pageGroups.map((g) => {
                const open = expanded === g.issuer_key;
                const busy = busyKey === g.issuer_key;
                return (
                  <div key={g.issuer_key}>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : g.issuer_key)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                        <span className="truncate text-sm font-medium">{g.issuer_name || g.issuer_vat || 'Unknown supplier'}</span>
                        {/* Whether approving these lines will record WHO charged for them. A CRM
                            party is never created silently, so an unmatched issuer books cost with
                            no record of the counterparty — which is what leaves multi-supplier
                            sourcing with nothing to compare (#332 step 3). */}
                        {!g.supplier_attributed && (
                          <Badge variant="warning" className="shrink-0 text-[10px]">Not in CRM</Badge>
                        )}
                        {g.matched_count > 0 && (
                          <Badge variant="info" className="shrink-0 text-[10px] tabular-nums">{g.matched_count} top-up</Badge>
                        )}
                      </button>

                      <div className="flex shrink-0 items-center gap-3 text-[11px] tabular-nums text-muted-foreground">
                        <span>{g.line_count} line{g.line_count === 1 ? '' : 's'}</span>
                        <span>{g.doc_count} invoice{g.doc_count === 1 ? '' : 's'}</span>
                        <span className="text-foreground">{formatMoney(g.total_cost, g.currency)}</span>
                        {g.last_seen && <span>{formatDate(g.last_seen)}</span>}
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                          onClick={() => runBulk(g, 'approve')}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                          Add all
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy}
                          onClick={() => runBulk(g, 'dismiss')}>
                          <X className="h-3.5 w-3.5 mr-1" /> Dismiss all
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={busy}
                          title="Never queue lines from this supplier — future invoices skip extraction entirely"
                          onClick={() => neverQueue(g)}>
                          <Ban className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {open && (
                      <IntakeLineList
                        workspaceId={workspaceId} issuerKey={g.issuer_key} search={null}
                        categories={categories} warehouses={warehouses}
                        targetWarehouseId={targetWarehouse} addToCatalog={addToCatalog}
                        onChanged={async () => { await load(); onChanged?.(); }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <TablePagination
              page={page} total={groups.length} pageSize={GROUP_PAGE_SIZE}
              onPageChange={setPage} label="suppliers"
            />
          </>
        )}
      </CardContent>

      {totals.unattributed > 0 && !search && (
        <div className="border-t border-hairline px-4 py-2 text-[11px] text-muted-foreground">
          {totals.unattributed} supplier{totals.unattributed === 1 ? '' : 's'} in this queue {totals.unattributed === 1 ? 'is' : 'are'} not
          a CRM company — their cost will be recorded without a counterparty. Add them under CRM → Companies first if you want
          supplier-level pricing and comparison.
        </div>
      )}

      {ignoredDialog}
    </Card>
  );
};

/**
 * One page of queued lines — for a single supplier, or across the whole queue when searching.
 *
 * Everything here is lazy: the lines exist only while their group is expanded, and the page is
 * `INTAKE_LINE_PAGE_SIZE` rows, so the DOM holds tens of editors rather than hundreds.
 */
const IntakeLineList: React.FC<{
  workspaceId: string;
  issuerKey: string | null;
  search: string | null;
  categories: FinanceCategory[];
  warehouses: Warehouse[];
  targetWarehouseId: string;
  addToCatalog: boolean;
  onChanged: () => void | Promise<void>;
}> = ({ workspaceId, issuerKey, search, categories, warehouses, targetWarehouseId, addToCatalog, onChanged }) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<IntakeLine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  /** The ladder's answer at an operator-typed cost, keyed by line id. Only the row being edited
   *  is re-asked; the rest keep the value `warehouse_intake_lines` already derived for them. */
  const [repriced, setRepriced] = useState<Record<string, number | null>>({});

  const reqSeq = useRef(0);

  const load = useCallback(async (p: number) => {
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await warehouseService.intakeLines(workspaceId, {
        issuerKey, search, limit: INTAKE_LINE_PAGE_SIZE, offset: (p - 1) * INTAKE_LINE_PAGE_SIZE,
      });
      if (seq !== reqSeq.current) return; // a newer page won
      setLines(res.lines);
      setTotal(res.total);
      const e: Record<string, LineEdit> = {};
      for (const l of res.lines) e[l.id] = editFrom(l);
      setEdits(e);
      setRepriced({});
      setSelected(new Set());
    } catch (err) {
      if (seq === reqSeq.current) {
        toast({ title: 'Failed to load lines', description: (err as Error)?.message, variant: 'destructive' });
      }
    } finally { if (seq === reqSeq.current) setLoading(false); }
  }, [workspaceId, issuerKey, search, toast]);

  useEffect(() => { setPage(1); }, [issuerKey, search]);
  useEffect(() => { void load(page); }, [load, page]);

  const setEdit = (id: string, patch: Partial<LineEdit>) =>
    setEdits((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  /**
   * Re-ask the ladder for ONE line, because the operator changed its cost.
   *
   * Debounced, and scoped to the edited row. The old card re-ran every row's preview on every
   * debounce tick, so typing a digit into one cost field fired 929 requests.
   */
  const repriceTimers = useRef<Record<string, number>>({});
  const repriceOne = (id: string, typed: string) => {
    window.clearTimeout(repriceTimers.current[id]);
    repriceTimers.current[id] = window.setTimeout(async () => {
      const cost = typed === '' ? null : parseDecimalOr(typed, 0);
      try {
        const r = await warehouseService.previewIntakeSellPrice(id, cost);
        setRepriced((m) => ({ ...m, [id]: r.sell }));
      } catch { /* no suggestion is better than a wrong one */ }
    }, 400);
  };
  useEffect(() => {
    const timers = repriceTimers.current;
    return () => { Object.values(timers).forEach((t) => window.clearTimeout(t)); };
  }, []);

  const overrides = (id: string): Record<string, unknown> => {
    const e = edits[id];
    const l = lines.find((x) => x.id === id);
    if (!e || !l) return {};
    return {
      name: e.name, sku: e.sku || null, unit: e.unit || null,
      quantity: parseDecimalOr(e.quantity, 0) || l.quantity,
      unit_cost: e.unit_cost === '' ? null : parseDecimalOr(e.unit_cost, 0),
      sales_price: e.sales_price === '' ? null : parseDecimalOr(e.sales_price, 0),
      category_id: e.category_id || null,
      target_warehouse_id: targetWarehouseId || null,
      add_to_catalog: addToCatalog,
    };
  };

  const approveOne = async (l: IntakeLine) => {
    setBusy(l.id);
    try {
      await warehouseService.approvePending(l.id, overrides(l.id));
      toast({ title: 'Added to warehouse', description: edits[l.id]?.name ?? l.name });
      await afterMutation();
    } catch (err) {
      toast({ title: 'Could not add', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const dismissOne = async (l: IntakeLine) => {
    setBusy(l.id);
    try { await warehouseService.dismissPending(l.id); await afterMutation(); }
    catch (err) { toast({ title: 'Failed', description: (err as Error)?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  /** A page that lost rows must not strand the operator on an empty page. */
  const afterMutation = async () => {
    const remaining = total - 1;
    const nextPage = clampPage(page, Math.max(remaining, 0), INTAKE_LINE_PAGE_SIZE);
    if (nextPage !== page) setPage(nextPage); else await load(page);
    await onChanged();
  };

  const runBulkSelected = async (action: 'approve' | 'dismiss') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (action === 'approve' && !confirm(`Add ${ids.length} selected line(s) to the warehouse?`)) return;
    setBulkBusy(true);
    try {
      if (action === 'approve') {
        const res = await warehouseService.bulkApprovePending(ids, {
          target_warehouse_id: targetWarehouseId || null, add_to_catalog: addToCatalog,
        });
        toast({
          title: `${res.approved} added to warehouse`,
          description: res.failed > 0 ? `${res.failed} failed: ${res.errors[0]?.error ?? ''}` : undefined,
          variant: res.failed > 0 ? 'destructive' : undefined,
        });
      } else {
        const n = await warehouseService.bulkDismissPending(ids);
        toast({ title: `${n} line(s) dismissed` });
      }
      const nextPage = clampPage(page, Math.max(total - ids.length, 0), INTAKE_LINE_PAGE_SIZE);
      if (nextPage !== page) setPage(nextPage); else await load(page);
      await onChanged();
    } catch (err) {
      toast({ title: 'Bulk action failed', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBulkBusy(false); setSelected(new Set()); }
  };

  const allOnPageSelected = lines.length > 0 && lines.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allOnPageSelected ? new Set() : new Set(lines.map((l) => l.id)));
  const toggleOne = (id: string) => setSelected((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  if (loading) {
    return (
      <div className="flex justify-center border-t border-hairline bg-surface-sunken py-6">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="border-t border-hairline bg-surface-sunken px-4 py-6 text-center text-xs text-muted-foreground">
        {search ? 'No queued line matches that search.' : 'Nothing left in this supplier’s queue.'}
      </div>
    );
  }

  const warehouseName = warehouses.find((w) => w.id === targetWarehouseId)?.name;

  return (
    <div className="border-t border-hairline bg-surface-sunken/50">
      {/* Selection bar — doubles as the page's column legend. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
          <Checkbox className="h-3.5 w-3.5" checked={allOnPageSelected} onCheckedChange={toggleAll} />
          Select page
        </label>
        {selected.size > 0 ? (
          <>
            <span className="text-[11px] tabular-nums text-foreground">{selected.size} selected</span>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy}
                onClick={() => runBulkSelected('approve')}>
                {bulkBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                Add {selected.size} to {warehouseName ?? 'warehouse'}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={bulkBusy}
                onClick={() => runBulkSelected('dismiss')}>
                <X className="h-3.5 w-3.5 mr-1" /> Dismiss {selected.size}
              </Button>
            </div>
          </>
        ) : (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{total} line{total === 1 ? '' : 's'} queued</span>
        )}
      </div>

      <div className="divide-y divide-hairline">
        {lines.map((l) => {
          const e = edits[l.id]; if (!e) return null;
          // The ladder's number, shown only while the operator has not typed their own.
          const ladder = l.id in repriced ? repriced[l.id] : l.suggested_sell;
          const autoPrice = e.sales_price === '' ? ladder : null;
          const doc = l.inbound_document;
          const rowBusy = busy === l.id;
          return (
            <div key={l.id} className="space-y-1.5 px-4 py-2.5">
              {/* WHO invoiced this and under which document — the queue is "what my partners
                  sent me", so a bare description string isn't enough to act on. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <Checkbox className="h-3.5 w-3.5" checked={selected.has(l.id)} onCheckedChange={() => toggleOne(l.id)} />
                {search && doc?.issuer_name && <span className="font-medium text-foreground/80">{doc.issuer_name}</span>}
                {(doc?.series || doc?.aa) && (
                  <span className="text-muted-foreground">{[doc.series, doc.aa].filter(Boolean).join(' ')}</span>
                )}
                {doc?.issue_date && <span className="text-muted-foreground">{formatDate(doc.issue_date)}</span>}
                {/* What approving will actually DO — top up existing stock, or create a product. */}
                {l.match_score != null && (
                  <span className={Number(l.match_score) >= 0.5
                    ? 'text-[hsl(var(--info))]' : 'text-muted-foreground'}>
                    {Number(l.match_score) >= 0.5 ? 'Tops up existing stock' : 'Creates a new product'}
                    {l.match_reason ? ` · ${l.match_reason}` : ''}
                  </span>
                )}
                {!l.supplier_attributed && (
                  <span className="text-[hsl(var(--warning))]">Supplier not in CRM — cost saved without it</span>
                )}
              </div>
              {l.raw_description && (
                <div className="truncate text-[11px] text-muted-foreground">Invoice line: {l.raw_description}</div>
              )}

              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_70px_80px]">
                <Input className="h-8 text-sm" value={e.name} onChange={(ev) => setEdit(l.id, { name: ev.target.value })} placeholder="Product name" />
                <Input className="h-8 text-sm" value={e.sku} onChange={(ev) => setEdit(l.id, { sku: ev.target.value })} placeholder="SKU" />
                <Input className="h-8 text-sm" value={e.unit} onChange={(ev) => setEdit(l.id, { unit: ev.target.value })} placeholder="unit" />
                <Input className="h-8 text-right text-sm tabular-nums" type="text" inputMode="decimal" value={e.quantity}
                  onChange={(ev) => setEdit(l.id, { quantity: ev.target.value })} placeholder="qty" />
              </div>

              <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_140px_1fr_auto]">
                <div className="space-y-0.5">
                  <label htmlFor={`intake-cost-${l.id}`} className="text-[10px] text-muted-foreground">Unit cost</label>
                  <Input id={`intake-cost-${l.id}`} className="h-8 text-right text-sm tabular-nums" type="text" inputMode="decimal"
                    value={e.unit_cost}
                    onChange={(ev) => { setEdit(l.id, { unit_cost: ev.target.value }); repriceOne(l.id, ev.target.value); }}
                    placeholder="0.00" />
                </div>
                <div className="space-y-0.5">
                  <label htmlFor={`intake-price-${l.id}`} className="text-[10px] text-muted-foreground">Sale price</label>
                  <Input id={`intake-price-${l.id}`} className="h-8 text-right text-sm tabular-nums" type="text" inputMode="decimal"
                    value={e.sales_price} onChange={(ev) => setEdit(l.id, { sales_price: ev.target.value })}
                    placeholder={autoPrice != null ? `auto ${formatMoney(autoPrice, l.currency)}` : 'set price'} />
                </div>
                <div className="space-y-0.5">
                  <label htmlFor={`intake-cat-${l.id}`} className="text-[10px] text-muted-foreground">Category</label>
                  <Select value={e.category_id || '__none'} onValueChange={(v) => setEdit(l.id, { category_id: v === '__none' ? '' : v })}>
                    <SelectTrigger id={`intake-cat-${l.id}`} className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— None —</SelectItem>
                      {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-1">
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={rowBusy} onClick={() => dismissOne(l)}>
                    <X className="h-4 w-4 mr-1" /> Dismiss
                  </Button>
                  <Button size="sm" className="h-8 text-xs" disabled={rowBusy} onClick={() => approveOne(l)}>
                    {rowBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Add
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <TablePagination
        page={page} total={total} pageSize={INTAKE_LINE_PAGE_SIZE}
        onPageChange={setPage} label="lines"
      />
    </div>
  );
};

/** Suppliers whose invoice lines never reach the extractor — and the way back. */
const IgnoredIssuersDialog: React.FC<{
  open: boolean; onOpenChange: (v: boolean) => void;
  workspaceId: string; issuers: IntakeIgnoredIssuer[]; onChanged: () => void | Promise<void>;
}> = ({ open, onOpenChange, workspaceId, issuers, onChanged }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const restore = async (i: IntakeIgnoredIssuer) => {
    setBusy(i.issuer_key);
    try {
      await warehouseService.setIntakeIssuerIgnored(workspaceId, i.issuer_key, i.issuer_name, false);
      toast({
        title: 'Supplier restored',
        description: 'Their NEXT invoice will be queued. Lines already dismissed stay dismissed.',
      });
      await onChanged();
    } catch (err) {
      toast({ title: 'Failed', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ignored suppliers</DialogTitle>
          <DialogDescription>
            Invoices from these VAT numbers skip product extraction entirely — no AI call, no credits, nothing queued.
            Restoring one affects future invoices; lines already dismissed stay dismissed.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-72 divide-y divide-hairline overflow-y-auto rounded-sm border border-hairline">
          {issuers.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No supplier is ignored.</div>
          )}
          {issuers.map((i) => (
            <div key={i.issuer_key} className="flex items-center gap-2 px-3 py-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{i.issuer_name || i.issuer_key}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{i.issuer_key}</div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === i.issuer_key}
                onClick={() => restore(i)}>
                {busy === i.issuer_key ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Undo2 className="h-3.5 w-3.5 mr-1" />}
                Restore
              </Button>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
