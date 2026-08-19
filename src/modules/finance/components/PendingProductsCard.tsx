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
 * ── What "Add" actually does ──────────────────────────────────────────────────────────────
 * `_approve_pending_item_core` (SQL, one transaction per line): reuse the matched product or
 * CREATE one — name, supplier SKU as `external_sku`, the supplier's own wording as
 * `description`, cost + `cost_source='supplier_invoice'`, and the details panel's fields — then
 * attach the supplier (`supplier_products`, `products.supplier_company_id`), derive the sale
 * price through the ladder, and post an `in` stock movement into the chosen warehouse.
 *
 * It is NOT the MIVAA ingest core that `ReceiveToWarehouseDialog` and dealer-add use. A Greek
 * invoice line is not enough to build a catalogue entry from, and 900 ingest calls is not a
 * thing to do behind a bulk button. What it does instead is write everything the line knows and
 * flag the row (`metadata.facet_canonicalization`) so the nightly facet sweep and the
 * 15-minute embedding-backfill agent can finish the job. Before that flag those products were
 * invisible to the only pass that would ever give them facets — empty forever, nothing complaining.
 *
 * "Sellable" does NOT decide whether a product is created. It decides whether a `product_prices`
 * row exists, i.e. whether the thing can be quoted. The product is created either way, because
 * stock has to point at one.
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
  SlidersHorizontal, UserPlus, AlertTriangle, FileText,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  warehouseService, INTAKE_LINE_PAGE_SIZE,
  type IntakeSupplierGroup, type IntakeLine, type IntakeLineDetails, type IntakeIgnoredIssuer,
  type PriceRung, type Warehouse,
} from '@/services/warehouseService';
import { QuickAddCompanyDialog } from '@/components/business/crm/QuickAddCompanyDialog';
import { parseSupplierLine, type ParsedSupplierLine } from '@/modules/finance/utils/parseSupplierLine';
import { TaricCombobox } from '@/components/core/TaricCombobox';
import { supabase } from '@/integrations/supabase/client';
import { financeCategoriesService, type FinanceCategory } from '@/modules/finance/services/financeCategoriesService';
import { formatMoney } from '@/modules/finance/services/financeService';
import { parseDecimalOr, round2 } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { TablePagination, clampPage } from '@/components/core/ui/table-pagination';

/** A CRM row read only for the names `parseSupplierLine` can recognise in a description. */
interface MakerRow { name: string; factory_names: string[] | null }

/** Issuers per page in the collapsed list. */
const GROUP_PAGE_SIZE = 15;

type IntakeMode = 'off' | 'suggest' | 'auto';

/** Per-line operator edits, held only while a group is expanded. */
interface LineEdit {
  name: string; sku: string; unit: string; quantity: string;
  unit_cost: string; sales_price: string; category_id: string;
  // Catalog depth. Empty means "not supplied" and is never written over what the line already
  // carries — `_approve_pending_item_core` coalesces each of these onto the pending row.
  manufacturer: string; supplier_product_code: string; material_category: string;
  width_mm: string; length_mm: string; thickness_mm: string; weight_kg: string;
  location: string; reorder_point: string;
  barcode: string; taric_code: string; cpv_code: string;
  mydata_vat_category: string;
  // Read out of the invoice text by `parseSupplierLine`. They land in products.metadata, the
  // same place createProductViaIngestCore puts them.
  grade: string; color: string; finish: string; series: string;
  // Pricing, matching ReceiveToWarehouseDialog's "Pricing" section. `markup_pct` and
  // `sales_price` are two views of ONE number; either edits the other.
  markup_pct: string; sale_vat_category: string; discount_percent: string; prices_include_vat: boolean;
}

/** AADE sale-VAT categories. Same table ReceiveToWarehouseDialog uses. */
const VAT_PCT_BY_CATEGORY: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };

const numStr = (n: number | null | undefined) => (n != null ? String(n) : '');

/**
 * Read what the invoice text actually says.
 *
 * `parseSupplierLine` pulls dimensions, grade, the supplier's article code, the maker, colour,
 * finish and the range out of a line like "AMALFI GRIS 80X80 A' -3 -1", and infers the unit from
 * the shape of the quantity (a 2-D size billed at a fractional quantity is m², not pieces). Its
 * own header says it "is the thing that fills the intake form's fields" — and it only ever ran
 * inside ReceiveToWarehouseDialog. Measured on this queue: 1,079 lines, ZERO with a manufacturer,
 * a supplier code or a dimension. The AI extraction had been doing the whole job alone.
 *
 * It runs here, on read, rather than at queue time in the edge function: it is deterministic and
 * free, so there is nothing to persist and nothing to backfill — every row already queued gets
 * the benefit the moment it is looked at. Everything it returns is a SUGGESTION shown in an
 * editable field with its evidence on screen, which is the contract the parser documents.
 */
const parseLine = (l: IntakeLine, knownManufacturers: string[]): ParsedSupplierLine =>
  parseSupplierLine({
    description: l.raw_description || l.name,
    quantity: l.quantity,
    netValue: l.unit_cost != null ? Number(l.unit_cost) * Number(l.quantity ?? 1) : null,
    knownManufacturers,
    // Deliberately NOT the issuer. ReceiveToWarehouseDialog defaults to "whoever sent the
    // document", which is right when you are receiving a delivery from the maker; here the
    // issuer is already recorded as the SUPPLIER, and a distributor is not the manufacturer.
    defaultManufacturer: null,
  });

const editFrom = (l: IntakeLine, parsed?: ParsedSupplierLine): LineEdit => ({
  name: l.name,
  sku: l.sku ?? '',
  // The stored unit wins — Haiku saw the whole line. The parser only answers when nobody did.
  unit: l.unit ?? parsed?.unit ?? '',
  quantity: String(l.quantity ?? 1),
  unit_cost: numStr(l.unit_cost),
  sales_price: numStr(l.sales_price),
  category_id: l.category_id ?? '',
  manufacturer: l.manufacturer ?? parsed?.manufacturer ?? '',
  supplier_product_code: l.supplier_product_code ?? parsed?.supplier_product_code ?? '',
  material_category: '',
  width_mm: numStr(l.width_mm ?? parsed?.dimensions.width_mm ?? null),
  length_mm: numStr(l.length_mm ?? parsed?.dimensions.length_mm ?? null),
  thickness_mm: numStr(l.thickness_mm ?? parsed?.dimensions.thickness_mm ?? null),
  weight_kg: '',
  location: '',
  reorder_point: '',
  barcode: '',
  taric_code: '',
  cpv_code: '',
  mydata_vat_category: '',
  grade: parsed?.grade ?? '',
  color: parsed?.color ?? '',
  finish: parsed?.finish ?? '',
  series: parsed?.series ?? '',
  // Markup and sale price start BLANK on purpose. Seeding the markup would compute a sale price,
  // and a sale price PINS list_price — taking the product off the ladder for good. The ladder's
  // own answer is shown as the placeholder instead, so it stays a suggestion until someone types.
  markup_pct: '',
  sale_vat_category: '',
  discount_percent: '',
  prices_include_vat: false,
});

/** Only the keys the operator actually filled in. Blank must not overwrite a real value. */
const detailOverrides = (e: LineEdit): IntakeLineDetails => {
  const out: IntakeLineDetails = {};
  const txt = (k: keyof IntakeLineDetails, v: string) => { if (v.trim()) (out as Record<string, unknown>)[k] = v.trim(); };
  const num = (k: keyof IntakeLineDetails, v: string) => {
    const n = v.trim() === '' ? null : parseDecimalOr(v, NaN);
    if (n != null && Number.isFinite(n)) (out as Record<string, unknown>)[k] = n;
  };
  txt('manufacturer', e.manufacturer);
  txt('supplier_product_code', e.supplier_product_code);
  txt('material_category', e.material_category);
  txt('location', e.location);
  txt('barcode', e.barcode);
  txt('taric_code', e.taric_code);
  txt('cpv_code', e.cpv_code);
  num('width_mm', e.width_mm);
  num('length_mm', e.length_mm);
  num('thickness_mm', e.thickness_mm);
  num('weight_kg', e.weight_kg);
  num('reorder_point', e.reorder_point);
  num('mydata_vat_category', e.mydata_vat_category);
  txt('grade', e.grade);
  txt('color', e.color);
  txt('finish', e.finish);
  txt('series', e.series);
  num('discount_percent', e.discount_percent);
  num('markup_percent', e.markup_pct);
  num('mydata_vat_category', e.sale_vat_category);
  if (e.prices_include_vat) (out as Record<string, unknown>).prices_include_vat = true;
  return out;
};

/**
 * The ex-VAT figure to store as `list_price`.
 *
 * A Greek operator reads a GROSS price off an invoice. Netting on WRITE rather than on read is
 * what keeps `list_price` meaning exactly one thing everywhere — the same rule (and the same
 * arithmetic) as ReceiveToWarehouseDialog. Without this the queue stored whatever was typed, so
 * a gross figure landed 24% high and every quote built on it was wrong.
 */
const netSalePrice = (e: LineEdit): number | null => {
  const typed = e.sales_price === '' ? null : parseDecimalOr(e.sales_price, NaN);
  if (typed == null || !Number.isFinite(typed)) return null;
  const vatPct = VAT_PCT_BY_CATEGORY[Number(e.sale_vat_category)] ?? null;
  return e.prices_include_vat && vatPct != null ? round2(typed / (1 + vatPct / 100)) : typed;
};

/**
 * Say WHICH pricing rule produced the suggestion.
 *
 * A €7.00 cost suggesting €7.00 is either "the supplier rule says 0%" or "nothing matched and
 * the workspace default is 0%". Same number, opposite meanings — the second one is an UNPRICED
 * product about to be sold at what it cost. `tone: 'warn'` is the second one.
 */
const explainRung = (rung: PriceRung, markupPct: number | null, supplier: string | null):
  { text: string; tone: 'warn' | 'muted' } => {
  const pct = markupPct != null ? `+${markupPct}%` : '';
  switch (rung) {
    case 'no_cost':
      return { text: 'The invoice line carries no cost, so no price can be derived.', tone: 'warn' };
    case 'unpriced':
      return {
        text: 'No pricing rule matches and the workspace default markup is 0% — this would be sold at cost. Set a markup in Finance → Pricing, or type a price.',
        tone: 'warn',
      };
    case 'list_price':
      return { text: 'This product already has a pinned list price; the ladder is not consulted.', tone: 'muted' };
    case 'product':
      return { text: `From this product’s own pricing rule ${pct}.`.trim(), tone: 'muted' };
    case 'brand':
      return { text: `From the brand pricing rule ${pct}.`.trim(), tone: 'muted' };
    case 'supplier':
      return { text: `From the pricing rule for ${supplier ?? 'this supplier'} ${pct}.`.trim(), tone: 'muted' };
    case 'category':
      return { text: `From the category pricing rule ${pct}.`.trim(), tone: 'muted' };
    case 'workspace_default':
    default:
      return { text: `Workspace default markup ${pct}.`.trim(), tone: 'muted' };
  }
};

export const PendingProductsCard: React.FC<{ workspaceId: string; warehouses: Warehouse[]; onChanged?: () => void }> =
({ workspaceId, warehouses, onChanged }) => {
  const { toast } = useToast();
  const [groups, setGroups] = useState<IntakeSupplierGroup[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [ignored, setIgnored] = useState<IntakeIgnoredIssuer[]>([]);
  /** `material_categories` for the details panel. Fetched once, shared by every expanded row. */
  const [materialCategories, setMaterialCategories] = useState<{ id: string; name: string }[]>([]);
  /** The issuer the operator is putting into the CRM, if any. */
  const [crmFor, setCrmFor] = useState<IntakeSupplierGroup | null>(null);
  /** Maker names `parseSupplierLine` can recognise inside a description. A maker is only ever
   *  matched against a name we already know — the parser never invents one from a stray word. */
  const [knownManufacturers, setKnownManufacturers] = useState<string[]>([]);
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
      const [gs, cats, fin, ign, mats, companies] = await Promise.all([
        warehouseService.intakeSupplierGroups(workspaceId),
        financeCategoriesService.list(workspaceId)
          .then((c) => c.filter((x) => x.kind === 'income' || x.kind === 'both')).catch(() => []),
        supabase.from('finance_settings').select('warehouse_autosync_mode').eq('workspace_id', workspaceId).maybeSingle()
          .then((r) => r.data, () => null),
        warehouseService.intakeIgnoredIssuers(workspaceId).catch(() => [] as IntakeIgnoredIssuer[]),
        supabase.from('material_categories').select('id, name').order('name').limit(300)
          .then((r) => (r.data ?? []) as { id: string; name: string }[], () => []),
        // Brands and manufacturers the workspace already knows, plus the factory names they
        // trade under — `factory_names` is where "Blum" lives when the CRM row is the distributor.
        supabase.from('crm_companies').select('name, factory_names')
          .eq('workspace_id', workspaceId).limit(1000)
          .then(
            (r) => (r.data ?? []) as MakerRow[],
            () => [] as MakerRow[],
          ),
      ]);
      setGroups(gs);
      setCategories(cats);
      setIgnored(ign);
      setMaterialCategories(mats);
      // Annotated rather than inferred: the Supabase client is untyped, so `companies` widens to
      // `any` and `new Set(any)` would infer Set<unknown>.
      const makerNames: string[] = (companies as MakerRow[])
        .flatMap((c) => [c.name, ...(c.factory_names ?? [])])
        .filter((n) => typeof n === 'string' && n.trim().length > 0);
      setKnownManufacturers([...new Set(makerNames)]);
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
      ? confirm(
          `Add all ${g.line_count} queued line(s) from ${who} to ${wh?.name ?? 'the default warehouse'}?\n\n`
          + `This creates or tops up ${g.line_count} product(s) and posts a stock movement for each. `
          + 'They are built from the invoice data only — the text embedding and facets are filled in by '
          + 'the background passes, not at this moment. Use Add on a single row for a full catalog product.')
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
            categories={categories} materialCategories={materialCategories} warehouses={warehouses}
            knownManufacturers={knownManufacturers}
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
                        {/* A supplier the CRM does not know books cost with no counterparty, so
                            spend-per-supplier and the supplier pricing rung both stay dark. The
                            VAT is right there on the invoice — offer the fix where the problem
                            is reported, not as a trip to another module. */}
                        {!g.supplier_attributed && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-[hsl(var(--warning))]" disabled={busy}
                            title="Add this issuer to the CRM so cost, pricing rules and supplier comparison attach to it"
                            onClick={() => setCrmFor(g)}>
                            <UserPlus className="h-3.5 w-3.5 mr-1" /> Add to CRM
                          </Button>
                        )}
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
                        categories={categories} materialCategories={materialCategories} warehouses={warehouses}
                        knownManufacturers={knownManufacturers}
                        supplierName={g.issuer_name}
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

      {/* VAT is the authoritative identity and myDATA already gave it to us — seed it, so the
          registry lookup and the duplicate probe both run off the real key rather than a name
          the operator would otherwise retype. */}
      <QuickAddCompanyDialog
        open={!!crmFor}
        onOpenChange={(v) => { if (!v) setCrmFor(null); }}
        workspaceId={workspaceId}
        initialName={crmFor?.issuer_name ?? ''}
        initialVat={crmFor?.issuer_vat ?? ''}
        role="supplier"
        title="Add supplier to CRM"
        description="This issuer invoices you but is not a CRM company, so their cost is recorded with no counterparty. Look up the ΑΦΜ to pull the official name, address and registry details."
        onCreated={async () => {
          setCrmFor(null);
          // Re-read: attribution flips, and the supplier rung of the pricing ladder becomes
          // reachable, so every suggested price in this group may change.
          await load();
        }}
      />
    </Card>
  );
};

/**
 * One page of queued lines — for a single supplier, or across the whole queue when searching.
 *
 * Everything here is lazy: the lines exist only while their group is expanded, and the page is
 * `INTAKE_LINE_PAGE_SIZE` rows, so the DOM holds tens of editors rather than hundreds.
 *
 * Lines are grouped by the INVOICE they arrived on and each one is its own bordered card with a
 * number and a bold title. The flat `divide-y` list this replaced put six unlabelled inputs
 * between one product and the next, so there was no visual answer to "where does this item end".
 */
const IntakeLineList: React.FC<{
  workspaceId: string;
  issuerKey: string | null;
  search: string | null;
  categories: FinanceCategory[];
  materialCategories: { id: string; name: string }[];
  warehouses: Warehouse[];
  knownManufacturers: string[];
  targetWarehouseId: string;
  addToCatalog: boolean;
  supplierName?: string | null;
  onChanged: () => void | Promise<void>;
}> = ({
  workspaceId, issuerKey, search, categories, materialCategories, warehouses,
  knownManufacturers, targetWarehouseId, addToCatalog, supplierName, onChanged,
}) => {
  const { toast } = useToast();
  const [lines, setLines] = useState<IntakeLine[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openDetails, setOpenDetails] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  /** The ladder's answer at an operator-typed cost, keyed by line id. Only the row being edited
   *  is re-asked; the rest keep the value `warehouse_intake_lines` already derived for them. */
  const [repriced, setRepriced] = useState<Record<string, { sell: number | null; rung: PriceRung; markupPct: number | null }>>({});
  /** What the deterministic parser read out of each line's text, kept so the row can show its
   *  evidence. A silently applied guess is the thing this screen must never do again. */
  const [parsed, setParsed] = useState<Record<string, ParsedSupplierLine>>({});

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
      const pp: Record<string, ParsedSupplierLine> = {};
      for (const l of res.lines) {
        pp[l.id] = parseLine(l, knownManufacturers);
        e[l.id] = editFrom(l, pp[l.id]);
      }
      setParsed(pp);
      setEdits(e);
      setRepriced({});
      setSelected(new Set());
      setOpenDetails(new Set());
    } catch (err) {
      if (seq === reqSeq.current) {
        toast({ title: 'Failed to load lines', description: (err as Error)?.message, variant: 'destructive' });
      }
    } finally { if (seq === reqSeq.current) setLoading(false); }
  }, [workspaceId, issuerKey, search, knownManufacturers, toast]);

  useEffect(() => { setPage(1); }, [issuerKey, search]);
  useEffect(() => { void load(page); }, [load, page]);

  const setEdit = (id: string, patch: Partial<LineEdit>) =>
    setEdits((m) => ({ ...m, [id]: { ...m[id], ...patch } }));

  /** Markup and sale price are two views of one number — editing either updates the other.
   *  Arithmetic on a markup the OPERATOR TYPED, never on a policy fetched from the DB
   *  (pricingChain.test.ts fails the build on the latter, and rightly). */
  const applyMarkup = (id: string, markup: string) => {
    const e = edits[id]; if (!e) return;
    const cost = e.unit_cost === '' ? null : parseDecimalOr(e.unit_cost, NaN);
    const pct = Number(markup);
    setEdit(id, {
      markup_pct: markup,
      sales_price: cost != null && Number.isFinite(cost) && markup !== '' && Number.isFinite(pct)
        ? String(round2(cost * (1 + pct / 100))) : e.sales_price,
    });
  };
  const applySalePrice = (id: string, salePrice: string) => {
    const e = edits[id]; if (!e) return;
    const cost = e.unit_cost === '' ? null : parseDecimalOr(e.unit_cost, NaN);
    const price = parseDecimalOr(salePrice, NaN);
    setEdit(id, {
      sales_price: salePrice,
      markup_pct: cost != null && Number.isFinite(cost) && cost > 0 && Number.isFinite(price)
        ? String(round2(((price - cost) / cost) * 100)) : e.markup_pct,
    });
  };

  const toggleDetails = (id: string) => setOpenDetails((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

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
        setRepriced((m) => ({ ...m, [id]: { sell: r.sell, rung: r.rung, markupPct: r.markupPct } }));
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
      sales_price: netSalePrice(e),
      category_id: e.category_id || null,
      target_warehouse_id: targetWarehouseId || null,
      add_to_catalog: addToCatalog,
      ...detailOverrides(e),
    };
  };

  /** A page that lost rows must not strand the operator on an empty page. */
  const afterMutation = async (removed: number) => {
    const nextPage = clampPage(page, Math.max(total - removed, 0), INTAKE_LINE_PAGE_SIZE);
    if (nextPage !== page) setPage(nextPage); else await load(page);
    await onChanged();
  };

  /**
   * Add ONE line, through the real catalog pipeline.
   *
   * A new product is created by `createProductViaIngestCore` — the SAME MIVAA
   * `/api/products/create-manual` core that dealer-add and ReceiveToWarehouseDialog use — so it
   * gets `external_sku_folded` dedupe, facet canonicalization into `attributes`/`attributes_raw`,
   * `resolve_brand_company` (without which the BRAND rung of the pricing ladder is structurally
   * unreachable) and its Voyage `text_embedding_1024`, all before it exists. Only then does the
   * SQL RPC run, with `matched_product_id` set, so it takes the existing-product branch and does
   * stock, supplier attribution, pricing and the movement.
   *
   * That ordering is not ours — it is what ReceiveToWarehouseDialog has always done, for the
   * reason its header gives: product creation goes through the ingest service for embeddings and
   * cannot be folded into the SQL transaction.
   *
   * `embedded: false` means MIVAA was unreachable and the local fallback insert ran. Say so —
   * a product silently created without a vector is invisible to every search that matters.
   */
  const approveOne = async (l: IntakeLine) => {
    setBusy(l.id);
    try {
      const e = edits[l.id];
      const ov = overrides(l.id);
      let embedded = true;

      if (!l.matched_product_id && e) {
        const res = await warehouseService.createProductViaIngestCore({
          workspaceId,
          name: e.name || l.name,
          sku: e.sku || null,
          externalSku: e.supplier_product_code || e.sku || null,
          unit: e.unit || null,
          cost: e.unit_cost === '' ? null : parseDecimalOr(e.unit_cost, 0),
          costCurrency: l.currency,
          price: netSalePrice(e),
          materialCategory: e.material_category || null,
          dimensions: {
            width_mm: e.width_mm === '' ? null : parseDecimalOr(e.width_mm, NaN),
            length_mm: e.length_mm === '' ? null : parseDecimalOr(e.length_mm, NaN),
            thickness_mm: e.thickness_mm === '' ? null : parseDecimalOr(e.thickness_mm, NaN),
          },
          manufacturer: e.manufacturer || null,
          grade: e.grade || null,
          color: e.color || null,
          finish: e.finish || null,
          series: e.series || null,
          itemType: 'good',
        });
        ov.matched_product_id = res.productId;
        embedded = res.embedded;
      }

      await warehouseService.approvePending(l.id, ov);
      toast({
        title: 'Added to warehouse',
        description: embedded
          ? (e?.name ?? l.name)
          : `${e?.name ?? l.name} — created WITHOUT an embedding (the ingest service was unreachable). It will be picked up by the backfill agent.`,
        variant: embedded ? undefined : 'destructive',
      });
      await afterMutation(1);
    } catch (err) {
      toast({ title: 'Could not add', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const dismissOne = async (l: IntakeLine) => {
    setBusy(l.id);
    try { await warehouseService.dismissPending(l.id); await afterMutation(1); }
    catch (err) { toast({ title: 'Failed', description: (err as Error)?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const runBulkSelected = async (action: 'approve' | 'dismiss') => {
    const ids = [...selected];
    if (ids.length === 0) return;
    // Bulk deliberately does NOT run the ingest core: that is one MIVAA call per line, each
    // debiting credits, and a thousand of them is not a thing to put behind one button. The
    // products are real and the background passes do finish them — but say so, don't assume it.
    if (action === 'approve' && !confirm(
      `Add ${ids.length} selected line(s) to the warehouse?\n\n`
      + 'They are created from the invoice data only. The text embedding and facets are filled in '
      + 'by the background passes (embeddings within ~15 min, facets overnight). '
      + 'Use Add on a single row to build a full catalog product immediately.')) return;
    setBulkBusy(true);
    try {
      if (action === 'approve') {
        // Carry each selected row's edits. Without this the shared-override call re-reads the
        // stored row, so a corrected name or a typed cost is discarded and the toast still says
        // it worked.
        const perItem: Record<string, Record<string, unknown>> = {};
        for (const id of ids) perItem[id] = overrides(id);
        const res = await warehouseService.bulkApprovePending(ids, {
          target_warehouse_id: targetWarehouseId || null, add_to_catalog: addToCatalog,
        }, perItem);
        toast({
          title: `${res.approved} added to warehouse`,
          description: res.failed > 0 ? `${res.failed} failed: ${res.errors[0]?.error ?? ''}` : undefined,
          variant: res.failed > 0 ? 'destructive' : undefined,
        });
      } else {
        const n = await warehouseService.bulkDismissPending(ids);
        toast({ title: `${n} line(s) dismissed` });
      }
      setSelected(new Set());
      await afterMutation(ids.length);
    } catch (err) {
      toast({ title: 'Bulk action failed', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBulkBusy(false); }
  };

  const allOnPageSelected = lines.length > 0 && lines.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allOnPageSelected ? new Set() : new Set(lines.map((l) => l.id)));
  const toggleOne = (id: string) => setSelected((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  /** Consecutive lines from the same invoice, in the order SQL returned them. */
  const docGroups = useMemo(() => {
    const out: { key: string; doc: IntakeLine['inbound_document']; items: { line: IntakeLine; n: number }[] }[] = [];
    lines.forEach((line, i) => {
      const key = line.inbound_document?.id ?? 'no-document';
      const last = out[out.length - 1];
      const entry = { line, n: (page - 1) * INTAKE_LINE_PAGE_SIZE + i + 1 };
      if (last && last.key === key) last.items.push(entry);
      else out.push({ key, doc: line.inbound_document, items: [entry] });
    });
    return out;
  }, [lines, page]);

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
    <div className="border-t border-hairline bg-surface-sunken">
      {/* Selection bar */}
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

      {/* The two money fields are not two views of the same number, and the difference decides
          whether this product is priced by your rules or by a figure typed here once. */}
      <p className="border-b border-hairline px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
        <strong className="text-foreground">Unit cost</strong> is what the supplier charged — it writes the product’s
        cost and this supplier’s price list, and it is what every margin is measured against.{' '}
        <strong className="text-foreground">Sale price</strong> is what you charge. Leave it blank and every quote and
        order re-derives it from your pricing rules; type a number and it is pinned as the product’s list price and the
        rules stop applying to it.
      </p>

      <div className="space-y-3 px-3 py-3">
        {docGroups.map((g) => (
          <div key={g.key} className="space-y-2">
            {/* Which invoice these arrived on. In search mode the issuer matters too, because
                consecutive results can come from different suppliers. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[11px] text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              {search && g.doc?.issuer_name && <span className="font-medium text-foreground/80">{g.doc.issuer_name}</span>}
              <span className="font-mono">{[g.doc?.series, g.doc?.aa].filter(Boolean).join(' ') || 'No document'}</span>
              {g.doc?.issue_date && <span>{formatDate(g.doc.issue_date)}</span>}
              <span>· {g.items.length} line{g.items.length === 1 ? '' : 's'} on this invoice</span>
            </div>

            {g.items.map(({ line: l, n }) => {
              const e = edits[l.id]; if (!e) return null;
              const pl = parsed[l.id];
              const rep = repriced[l.id];
              const ladder = rep ? rep.sell : l.suggested_sell;
              const rung = rep ? rep.rung : l.price_rung;
              const markup = rep ? rep.markupPct : l.markup_pct;
              // The ladder's number, shown only while the operator has not typed their own.
              const autoPrice = e.sales_price === '' ? ladder : null;
              const pinned = e.sales_price !== '';
              const why = explainRung(rung, markup, supplierName ?? l.inbound_document?.issuer_name ?? null);
              const matched = l.match_score != null && Number(l.match_score) >= 0.5;
              const vatPct = VAT_PCT_BY_CATEGORY[Number(e.sale_vat_category)] ?? null;
              const netPrice = netSalePrice(e);
              const costNum = e.unit_cost === '' ? null : parseDecimalOr(e.unit_cost, NaN);
              const margin = netPrice != null && costNum != null && Number.isFinite(costNum)
                ? round2(netPrice - costNum) : null;
              const marginPct = margin != null && costNum != null && costNum > 0
                ? round2((margin / costNum) * 100) : null;
              const rowBusy = busy === l.id;
              const detailsOpen = openDetails.has(l.id);
              const detailCount = Object.keys(detailOverrides(e)).length;

              return (
                <div key={l.id} className="space-y-2 rounded-sm border border-hairline bg-card px-3 py-2.5">
                  {/* Title block — the anchor that says "this is one product". */}
                  <div className="flex items-start gap-2">
                    <Checkbox className="mt-1 h-3.5 w-3.5 shrink-0" checked={selected.has(l.id)} onCheckedChange={() => toggleOne(l.id)} />
                    <span className="mt-0.5 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-sm bg-surface-sunken px-1 text-[10px] font-semibold tabular-nums text-muted-foreground">
                      {n}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.name || l.name}</div>
                      {l.raw_description && (
                        <div className="truncate font-mono text-[10px] text-muted-foreground" title={l.raw_description}>
                          {l.raw_description}
                        </div>
                      )}
                      {/* What was READ out of that text, and therefore already filled in below.
                          Shown rather than applied silently — a guess the operator cannot see is
                          a guess they cannot correct. */}
                      {pl && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {pl.dimensions.label && <Detected label={pl.dimensions.label} title={`Read from "${pl.dimensions.matched}"`} />}
                          {pl.manufacturer && <Detected label={pl.manufacturer} title="Maker recognised from a name your CRM already knows" />}
                          {pl.supplier_product_code && <Detected label={`code ${pl.supplier_product_code}`} title="The supplier's own article code" />}
                          {pl.series && <Detected label={pl.series} title="Range / collection" />}
                          {pl.color && <Detected label={pl.color} title="Colour" />}
                          {pl.finish && <Detected label={pl.finish} title="Surface finish" />}
                          {pl.grade && <Detected label={`grade ${pl.grade}`} title="Quality grade" />}
                          {!l.unit && pl.unit && <Detected label={pl.unit} title={pl.unit_reason} />}
                        </div>
                      )}
                    </div>
                    {/* What approving will actually DO. */}
                    <Badge variant={matched ? 'info' : 'neutral'} className="shrink-0 text-[10px]" title={l.match_reason ?? undefined}>
                      {matched ? 'Tops up existing' : 'New product'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_70px_80px]">
                    <Input className="h-8 text-sm" value={e.name} onChange={(ev) => setEdit(l.id, { name: ev.target.value })} placeholder="Product name" />
                    <Input className="h-8 text-sm" value={e.sku} onChange={(ev) => setEdit(l.id, { sku: ev.target.value })} placeholder="SKU" />
                    <Input className="h-8 text-sm" value={e.unit} onChange={(ev) => setEdit(l.id, { unit: ev.target.value })} placeholder="unit" />
                    <Input className="h-8 text-right text-sm tabular-nums" type="text" inputMode="decimal" value={e.quantity}
                      onChange={(ev) => setEdit(l.id, { quantity: ev.target.value })} placeholder="qty" />
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[120px_150px_1fr_auto]">
                    <div className="space-y-0.5">
                      <label htmlFor={`intake-cost-${l.id}`} className="text-[10px] text-muted-foreground">Unit cost (paid)</label>
                      <Input id={`intake-cost-${l.id}`} className="h-8 text-right text-sm tabular-nums" type="text" inputMode="decimal"
                        value={e.unit_cost}
                        onChange={(ev) => { setEdit(l.id, { unit_cost: ev.target.value }); repriceOne(l.id, ev.target.value); }}
                        placeholder="0.00" />
                    </div>
                    <div className="space-y-0.5">
                      <label htmlFor={`intake-price-${l.id}`} className="text-[10px] text-muted-foreground">
                        Sale price {pinned ? <span className="text-[hsl(var(--warning))]">· pinned</span> : '· auto'}
                      </label>
                      <Input id={`intake-price-${l.id}`} className="h-8 text-right text-sm tabular-nums" type="text" inputMode="decimal"
                        value={e.sales_price} onChange={(ev) => applySalePrice(l.id, ev.target.value)}
                        placeholder={autoPrice != null ? `auto ${formatMoney(autoPrice, l.currency)}` : 'set price'} />
                    </div>
                    <div className="space-y-0.5">
                      <label htmlFor={`intake-cat-${l.id}`} className="text-[10px] text-muted-foreground">Finance category</label>
                      <Select value={e.category_id || '__none'} onValueChange={(v) => setEdit(l.id, { category_id: v === '__none' ? '' : v })}>
                        <SelectTrigger id={`intake-cat-${l.id}`} className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">— None —</SelectItem>
                          {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-1">
                      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => toggleDetails(l.id)}
                        title="Manufacturer, dimensions, codes and myDATA classification">
                        <SlidersHorizontal className="h-3.5 w-3.5 mr-1" />
                        Details{detailCount > 0 ? ` (${detailCount})` : ''}
                        {detailsOpen ? <ChevronDown className="h-3.5 w-3.5 ml-1" /> : <ChevronRight className="h-3.5 w-3.5 ml-1" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive" disabled={rowBusy} onClick={() => dismissOne(l)}>
                        <X className="h-4 w-4 mr-1" /> Dismiss
                      </Button>
                      <Button size="sm" className="h-8 text-xs" disabled={rowBusy} onClick={() => approveOne(l)}>
                        {rowBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Add
                      </Button>
                    </div>
                  </div>

                  {/* WHICH rule produced the suggestion. Without this a cost-equals-price row is
                      indistinguishable from a deliberate 0% margin. */}
                  {!pinned && (
                    <div className={`flex items-start gap-1.5 text-[11px] ${why.tone === 'warn' ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground'}`}>
                      {why.tone === 'warn' && <AlertTriangle className="mt-px h-3 w-3 shrink-0" />}
                      <span>{why.text}</span>
                    </div>
                  )}
                  {/* The rest of the pricing decision — the same four controls the receive
                      modal has always had. Only meaningful once a price is being set by hand,
                      so it appears with one. */}
                  {pinned && (
                    <div className="space-y-1.5 rounded-sm border border-hairline bg-surface-sunken px-3 py-2">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <div className="space-y-0.5">
                          <label htmlFor={`mk-${l.id}`} className="text-[10px] text-muted-foreground">Markup %</label>
                          <Input id={`mk-${l.id}`} className="h-8 text-right text-xs tabular-nums" type="text" inputMode="decimal"
                            value={e.markup_pct} onChange={(ev) => applyMarkup(l.id, ev.target.value)}
                            placeholder={markup != null ? `auto ${markup}%` : '0'} />
                        </div>
                        <div className="space-y-0.5">
                          <label htmlFor={`vat-${l.id}`} className="text-[10px] text-muted-foreground">Sale VAT</label>
                          <Select value={e.sale_vat_category || '__none'}
                            onValueChange={(vv) => setEdit(l.id, { sale_vat_category: vv === '__none' ? '' : vv })}>
                            <SelectTrigger id={`vat-${l.id}`} className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">— not set —</SelectItem>
                              {Object.entries(VAT_PCT_BY_CATEGORY).map(([cat, pct]) => (
                                <SelectItem key={cat} value={cat}>{pct}% (cat {cat})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-0.5">
                          <label htmlFor={`disc-${l.id}`} className="text-[10px] text-muted-foreground">Catalog discount %</label>
                          <Input id={`disc-${l.id}`} className="h-8 text-right text-xs tabular-nums" type="text" inputMode="decimal"
                            value={e.discount_percent} onChange={(ev) => setEdit(l.id, { discount_percent: ev.target.value })}
                            placeholder="0" />
                        </div>
                        <label className="flex cursor-pointer items-end gap-1.5 pb-1.5 text-[11px] text-muted-foreground">
                          <Checkbox className="h-3.5 w-3.5" checked={e.prices_include_vat}
                            onCheckedChange={(vv) => setEdit(l.id, { prices_include_vat: vv === true })} />
                          Price I typed includes VAT
                        </label>
                      </div>
                      {/* What will actually be stored, and what it earns. list_price is ex-VAT
                          everywhere in the platform, so a gross figure has to be netted BEFORE
                          it is written or every quote built on it is 24% wrong. */}
                      <div className="text-[11px] text-muted-foreground">
                        Stored as <span className="font-medium text-foreground tabular-nums">{formatMoney(netPrice, l.currency)}</span> ex-VAT
                        {e.prices_include_vat && vatPct != null && <> (netted from the {vatPct}% gross you typed)</>}
                        {margin != null && (
                          <> · margin <span className={`font-medium tabular-nums ${margin < 0 ? 'text-destructive' : 'text-foreground'}`}>
                            {formatMoney(margin, l.currency)}{marginPct != null ? ` (${marginPct}%)` : ''}
                          </span></>
                        )}
                        {' '}· pins the list price, so the pricing rules stop applying to this product.
                      </div>
                    </div>
                  )}

                  {!l.supplier_attributed && (
                    <div className="text-[11px] text-[hsl(var(--warning))]">
                      Supplier is not a CRM company — cost is recorded without a counterparty, and no supplier pricing rule can apply.
                    </div>
                  )}

                  {detailsOpen && (
                    <div className="space-y-2 rounded-sm border border-hairline bg-surface-sunken px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground">
                        Everything here is written onto the product when you add it. Blank means “leave whatever is
                        already there” — nothing below overwrites an existing product’s values.
                      </p>
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <DetailField label="Manufacturer" id={`mfr-${l.id}`} value={e.manufacturer}
                          onChange={(v) => setEdit(l.id, { manufacturer: v })} placeholder="e.g. Jowat" />
                        <DetailField label="Supplier item code" id={`sup-${l.id}`} value={e.supplier_product_code}
                          onChange={(v) => setEdit(l.id, { supplier_product_code: v })} placeholder="their code" />
                        <div className="space-y-0.5">
                          <label htmlFor={`mat-${l.id}`} className="text-[10px] text-muted-foreground">Material category</label>
                          <Select value={e.material_category || '__none'}
                            onValueChange={(v) => setEdit(l.id, { material_category: v === '__none' ? '' : v })}>
                            <SelectTrigger id={`mat-${l.id}`} className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">— None —</SelectItem>
                              {materialCategories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <DetailField label="Shelf / location" id={`loc-${l.id}`} value={e.location}
                          onChange={(v) => setEdit(l.id, { location: v })} placeholder="Aisle 3 / Shelf B" />

                        <DetailField label="Width (mm)" id={`w-${l.id}`} value={e.width_mm} numeric
                          onChange={(v) => setEdit(l.id, { width_mm: v })} />
                        <DetailField label="Length (mm)" id={`l-${l.id}`} value={e.length_mm} numeric
                          onChange={(v) => setEdit(l.id, { length_mm: v })} />
                        <DetailField label="Thickness (mm)" id={`t-${l.id}`} value={e.thickness_mm} numeric
                          onChange={(v) => setEdit(l.id, { thickness_mm: v })} />
                        <DetailField label="Weight (kg)" id={`kg-${l.id}`} value={e.weight_kg} numeric
                          onChange={(v) => setEdit(l.id, { weight_kg: v })} />

                        <DetailField label="Reorder point" id={`rp-${l.id}`} value={e.reorder_point} numeric
                          onChange={(v) => setEdit(l.id, { reorder_point: v })} />
                        <DetailField label="Barcode" id={`bc-${l.id}`} value={e.barcode}
                          onChange={(v) => setEdit(l.id, { barcode: v })} placeholder="EAN / UPC" />
                        <div className="space-y-0.5">
                          {/* TaricCombobox puts `id` on its trigger button, so this really is an
                              associated label even though the control is a combobox, not an input. */}
                          <label htmlFor={`taric-${l.id}`} className="text-[10px] text-muted-foreground">TARIC code</label>
                          <TaricCombobox id={`taric-${l.id}`} value={e.taric_code} onChange={(v) => setEdit(l.id, { taric_code: v })}
                            triggerClassName="w-full h-8 text-xs" />
                        </div>
                        <DetailField label="CPV code" id={`cpv-${l.id}`} value={e.cpv_code}
                          onChange={(v) => setEdit(l.id, { cpv_code: v })} placeholder="procurement" />

                        <DetailField label="myDATA VAT category" id={`vc-${l.id}`} value={e.mydata_vat_category} numeric
                          onChange={(v) => setEdit(l.id, { mydata_vat_category: v })} placeholder="1 = 24%" />

                        <DetailField label="Range / collection" id={`ser-${l.id}`} value={e.series}
                          onChange={(v) => setEdit(l.id, { series: v })} placeholder="e.g. AMALFI" />
                        <DetailField label="Colour" id={`col-${l.id}`} value={e.color}
                          onChange={(v) => setEdit(l.id, { color: v })} placeholder="e.g. grey" />
                        <DetailField label="Finish" id={`fin-${l.id}`} value={e.finish}
                          onChange={(v) => setEdit(l.id, { finish: v })} placeholder="e.g. lappato" />
                        <DetailField label="Grade" id={`grd-${l.id}`} value={e.grade}
                          onChange={(v) => setEdit(l.id, { grade: v })} placeholder="e.g. A" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <TablePagination
        page={page} total={total} pageSize={INTAKE_LINE_PAGE_SIZE}
        onPageChange={setPage} label="lines"
      />
    </div>
  );
};

/** One thing the parser read out of the invoice text, with its evidence in the tooltip. */
const Detected: React.FC<{ label: string; title: string }> = ({ label, title }) => (
  <span title={title}
    className="inline-flex items-center rounded-sm border border-hairline bg-surface-sunken px-1.5 py-px text-[10px] text-muted-foreground">
    {label}
  </span>
);

/** A labelled input in the details grid. Exists so the grid reads as data, not as markup. */
const DetailField: React.FC<{
  label: string; id: string; value: string; onChange: (v: string) => void;
  placeholder?: string; numeric?: boolean;
}> = ({ label, id, value, onChange, placeholder, numeric }) => (
  <div className="space-y-0.5">
    <label htmlFor={id} className="text-[10px] text-muted-foreground">{label}</label>
    <Input
      id={id} className={`h-8 text-xs${numeric ? ' text-right tabular-nums' : ''}`}
      type="text" inputMode={numeric ? 'decimal' : undefined}
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    />
  </div>
);

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
