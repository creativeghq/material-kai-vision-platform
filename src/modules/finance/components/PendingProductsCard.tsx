/**
 * Supplier-invoice intake queue. When a myDATA expense is pulled, the inbound sync reads each
 * line and queues it here. The operator reviews and ✓ adds it to the warehouse (matched to
 * existing stock or created new, with cost from the invoice and the sale price DERIVED BY THE
 * PRICING LADDER) or ✗ dismisses it.
 *
 * ── What is a FACT and what is a reading ──────────────────────────────────────────────────
 * A myDATA line is not just a description. It states the unit (`measurementUnit`), the
 * supplier's own article code (`itemCode`), the VAT category and the exact net value, and those
 * are facts about the document — they are read straight through, shown as filled chips, and
 * never re-derived. Only the product NAME needs a model, because that genuinely is prose.
 *
 * This distinction is the whole screen. Before it, the writer read three of those six fields
 * and asked Haiku to infer the rest from the description: 4.1 metres of worktop (measurement
 * unit 4) was filed as 4.1 PIECES, article code 11-3331-60-1 was stored as "H3331" because a
 * regex found something code-shaped in the text, and the VAT category the invoice stated was
 * left blank for the operator to retype. `src/lib/units.ts` had said not to do this in as many
 * words — "wherever a code is present it is the authority — never infer the unit from a product
 * description instead" — and `ReceiveToWarehouseDialog`, the OTHER screen that receives a
 * supplier line, had always got it right. The reading is now one shared module
 * (`utils/intakeLine.ts`) that both call, so the two cannot drift apart again.
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
 * CREATE one — and "None of these — create a new product" is now an ANSWER it honours. It used
 * to `coalesce` an explicit null back onto the queue-time guess, which cannot tell "the operator
 * said create a new one" apart from "the caller said nothing", so approval updated the very
 * product the screen said it would not touch. It also refuses to add stock in a unit the target
 * bin does not count in: 4.1 metres added to a counter holding pieces is a valid number that
 * means neither, and nothing downstream could ever notice.
 *
 * The full write: name, the supplier's own article code as `external_sku`, their wording as
 * `description`, cost + `cost_source='supplier_invoice'`, and the details panel's fields — then
 * attach the supplier (`supplier_products`, `products.supplier_company_id`), derive the sale
 * price through the ladder, and post an `in` stock movement into the chosen warehouse.
 *
 * It is NOT the MIVAA ingest core that `ReceiveToWarehouseDialog` and dealer-add use, on any
 * path, single or bulk. Intake records what a supplier delivered and what it cost — a stock and
 * cost event, not catalogue authoring. A Greek invoice line is not the raw material for an
 * embedded, faceted catalogue entry, and minting one per approval would spend a credit a line to
 * manufacture products nobody asked for. Promoting an intake product to a full catalogue entry
 * is a separate, deliberate action on a product that already exists.
 *
 * What approval does instead is write everything the line knows and flag the row
 * (`metadata.facet_canonicalization`, in the catalog's own facet vocabulary) so the nightly facet
 * sweep and the 15-minute embedding-backfill agent can finish the job. Before that flag those
 * products were invisible to the only pass that would ever give them facets.
 *
 * ── Recognising what we already carry ─────────────────────────────────────────────────────
 * The queue-time matcher stores ONE best guess per line, which hides the interesting cases: two
 * plausible candidates, or one just under the floor that a human would recognise instantly.
 * Approving then silently forks the catalogue. So each row can ask
 * `warehouse_intake_match_candidates` for ranked alternatives — this supplier already selling us
 * the product under the same code, a normalised code match, trigram name similarity, the token
 * scorer — and the operator picks one (or "create a new product"), which sets
 * `matched_product_id` and turns the approval into an UPDATE. On demand, per row: 25 lookups a
 * page is the N+1 this screen exists to have removed.
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
  SlidersHorizontal, UserPlus, AlertTriangle, FileText, Link2, PackageSearch,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  warehouseService, INTAKE_LINE_PAGE_SIZE,
  type IntakeSupplierGroup, type IntakeLine, type IntakeLineDetails, type IntakeIgnoredIssuer,
  type IntakeCandidate,
  type PriceRung, type Warehouse,
} from '@/services/warehouseService';
import { QuickAddCompanyDialog } from '@/components/business/crm/QuickAddCompanyDialog';
import { parseSupplierLine, type ParsedSupplierLine } from '@/modules/finance/utils/parseSupplierLine';
import {
  VAT_PCT_BY_CATEGORY, vatPctForCategory, resolveIntakeUnit, netValueDrift,
  priceFromMarkup, markupFromPrice, netListPrice, unitQuantityIssue,
} from '@/modules/finance/utils/intakeLine';
import { UNITS, unitSuffix } from '@/lib/units';
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
  /** ONE VAT category per line, seeded from the document.
   *
   *  There used to be two — this one in the details panel and a `sale_vat_category` in the
   *  pricing panel — and `detailOverrides` wrote BOTH into the single `mydata_vat_category`
   *  key, so whichever the operator touched last silently overwrote the other. They were never
   *  two facts: `ReceiveToWarehouseDialog` has always carried one, on the reasoning that we
   *  bought the thing at that rate and absent other information we resell it at the same rate. */
  mydata_vat_category: string;
  // Read out of the invoice text by `parseSupplierLine`. They land in products.metadata, the
  // same place createProductViaIngestCore puts them.
  grade: string; color: string; finish: string; series: string;
  // Pricing, matching ReceiveToWarehouseDialog's "Pricing" section. `markup_pct` and
  // `sales_price` are two views of ONE number; either edits the other.
  markup_pct: string; discount_percent: string; prices_include_vat: boolean;
}

const numStr = (n: number | null | undefined) => (n != null ? String(n) : '');

/**
 * Read what the invoice text actually says.
 *
 * `parseSupplierLine` pulls dimensions, grade, the maker, colour, finish and the range out of a
 * line like "AMALFI GRIS 80X80 A' -3 -1". Its own header says it "is the thing that fills the
 * intake form's fields" — and it only ever ran inside ReceiveToWarehouseDialog. Measured on this
 * queue before it ran here: 1,079 lines, ZERO with a manufacturer or a dimension.
 *
 * It is the FALLBACK, never the authority. Where the document states something — the unit, the
 * article code — that is used instead and this is not consulted; the parser's unit inference in
 * particular is a heuristic over the shape of the quantity, which is a reasonable guess for a
 * line that omits the code and simply wrong for one that carries it.
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
  // Resolved at queue time from the AADE code when the document stated one; this re-resolves so
  // a row queued before that read (or a document that omitted the code) still gets an answer.
  unit: resolveIntakeUnit({
    code: l.measurement_unit_code,
    modelUnit: l.unit,
    parsedUnit: parsed?.unit,
    parsedReason: parsed?.unit_reason,
  }).unit,
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
  // The document said which VAT rate this was bought at. Leaving the field blank asked the
  // operator to retype a fact that arrived with the invoice — and blank is also what made
  // "the price I typed includes VAT" silently store the gross figure.
  mydata_vat_category: numStr(l.mydata_vat_category),
  grade: parsed?.grade ?? '',
  color: parsed?.color ?? '',
  finish: parsed?.finish ?? '',
  series: parsed?.series ?? '',
  // Markup and sale price start BLANK on purpose. Seeding the markup would compute a sale price,
  // and a sale price PINS list_price — taking the product off the ladder for good. The ladder's
  // own answer is shown as the placeholder instead, so it stays a suggestion until someone types.
  markup_pct: '',
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
  if (e.prices_include_vat) (out as Record<string, unknown>).prices_include_vat = true;
  return out;
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
          + 'the background passes, not at this moment.')
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
  /** Existing products this line might BE, per row, loaded on demand. Never on page load: 25
   *  lookups per page is the N+1 this screen was rebuilt to remove. */
  const [candidates, setCandidates] = useState<Record<string, IntakeCandidate[]>>({});
  const [candBusy, setCandBusy] = useState<string | null>(null);
  /** The operator's answer to "is this an existing product?" — a product id, or '' for "no,
   *  create a new one". Overrides whatever the queue-time matcher decided. */
  const [chosen, setChosen] = useState<Record<string, string>>({});

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
      setCandidates({});
      setChosen({});
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
   *  (pricingChain.test.ts fails the build on the latter, and rightly). Shared with
   *  ReceiveToWarehouseDialog, which had its own copy of exactly this pair. */
  const costOf = (e: LineEdit): number | null => {
    if (e.unit_cost === '') return null;
    const n = parseDecimalOr(e.unit_cost, NaN);
    return Number.isFinite(n) ? n : null;
  };
  const applyMarkup = (id: string, markup: string) => {
    const e = edits[id]; if (!e) return;
    const next = markup === '' ? null : priceFromMarkup(costOf(e), Number(markup));
    setEdit(id, { markup_pct: markup, sales_price: next != null ? String(next) : e.sales_price });
  };
  const applySalePrice = (id: string, salePrice: string) => {
    const e = edits[id]; if (!e) return;
    const next = markupFromPrice(costOf(e), parseDecimalOr(salePrice, NaN));
    setEdit(id, { sales_price: salePrice, markup_pct: next != null ? String(next) : e.markup_pct });
  };

  /** The ex-VAT figure this row would store, or a refusal. */
  const pricedOf = (e: LineEdit) => netListPrice({
    typed: e.sales_price === '' ? null : parseDecimalOr(e.sales_price, NaN),
    vatCategory: e.mydata_vat_category,
    pricesIncludeVat: e.prices_include_vat,
  });

  const findSimilar = async (l: IntakeLine) => {
    setCandBusy(l.id);
    try {
      const rows = await warehouseService.intakeMatchCandidates(workspaceId, l.id, 5);
      setCandidates((m) => ({ ...m, [l.id]: rows }));
      if (rows.length === 0) toast({ title: 'Nothing similar in the catalog', description: 'Approving will create a new product.' });
    } catch (err) {
      toast({ title: 'Could not check the catalog', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setCandBusy(null); }
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
      sales_price: (() => { const p = pricedOf(e); return p.ok ? p.net : null; })(),
      category_id: e.category_id || null,
      target_warehouse_id: targetWarehouseId || null,
      add_to_catalog: addToCatalog,
      ...detailOverrides(e),
      // '' is a real answer — "no, create a new product" — and must beat the stored match, so
      // this is only spread when the operator actually chose.
      ...(chosen[id] !== undefined ? { matched_product_id: chosen[id] || null } : {}),
    };
  };

  /** A page that lost rows must not strand the operator on an empty page. */
  const afterMutation = async (removed: number) => {
    const nextPage = clampPage(page, Math.max(total - removed, 0), INTAKE_LINE_PAGE_SIZE);
    if (nextPage !== page) setPage(nextPage); else await load(page);
    await onChanged();
  };

  /**
   * Add ONE line.
   *
   * This path deliberately does NOT run the MIVAA ingest core. Warehouse intake records what a
   * supplier delivered and what it cost — it is a stock and cost event, not a catalogue
   * authoring tool. A Greek invoice line is not the raw material for an embedded, faceted
   * catalogue entry, and making every approval mint one would spend a credit per line to
   * manufacture products nobody asked for.
   *
   * So: reuse the matched product when there is one, otherwise the SQL RPC creates a plain row
   * carrying everything the invoice knows. Turning an intake product into a full catalogue entry
   * is a separate, deliberate action — not a side effect of receiving stock.
   */
  const approveOne = async (l: IntakeLine) => {
    setBusy(l.id);
    try {
      await warehouseService.approvePending(l.id, overrides(l.id));
      toast({ title: 'Added to warehouse', description: edits[l.id]?.name ?? l.name });
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
    // Same refusal as the per-row Add: a VAT-inclusive price with no rate to net it by would be
    // stored gross. Named rather than silently skipped — dropping rows out of a bulk the
    // operator asked for is how you get a "12 added" toast for 15 selected lines.
    if (action === 'approve') {
      const blocked = ids.filter((id) => edits[id] && !pricedOf(edits[id]).ok);
      if (blocked.length > 0) {
        toast({
          title: `${blocked.length} selected line(s) cannot be priced`,
          description: 'They are marked as VAT-inclusive with no VAT category set. Set it, or untick “includes VAT”, then add them.',
          variant: 'destructive',
        });
        return;
      }
    }
    // Bulk deliberately does NOT run the ingest core: that is one MIVAA call per line, each
    // debiting credits, and a thousand of them is not a thing to put behind one button. The
    // products are real and the background passes do finish them — but say so, don't assume it.
    if (action === 'approve' && !confirm(
      `Add ${ids.length} selected line(s) to the warehouse?\n\n`
      + 'They are created from the invoice data only. The text embedding and facets are filled in '
      + 'by the background passes (embeddings within ~15 min, facets overnight).')) return;
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
              const cands = candidates[l.id];
              const pick = chosen[l.id];
              // What approving will actually do, after the operator's override.
              const willUpdateId = pick !== undefined ? (pick || null) : l.matched_product_id;
              const willUpdateName = willUpdateId
                ? (cands?.find((c) => c.product_id === willUpdateId)?.name ?? null)
                : null;
              const matched = willUpdateId != null;
              const priced = pricedOf(e);
              const vatPct = vatPctForCategory(e.mydata_vat_category);
              const netPrice = priced.ok ? priced.net : null;
              const costNum = e.unit_cost === '' ? null : parseDecimalOr(e.unit_cost, NaN);
              const margin = netPrice != null && costNum != null && Number.isFinite(costNum)
                ? round2(netPrice - costNum) : null;
              const marginPct = margin != null && costNum != null && costNum > 0
                ? round2((margin / costNum) * 100) : null;
              const rowBusy = busy === l.id;
              const detailsOpen = openDetails.has(l.id);
              const detailCount = Object.keys(detailOverrides(e)).length;
              const qtyNum = parseDecimalOr(e.quantity, NaN);
              const costShown = costNum != null && Number.isFinite(costNum) ? costNum : null;
              // What the DOCUMENT says this line came to, against what the fields on screen
              // multiply out to. The stated net is the authority; a difference means somebody
              // edited the cost or the quantity, which is allowed but must not be invisible.
              const stated = l.net_value;
              const lineTotal = costNum != null && Number.isFinite(costNum) && Number.isFinite(qtyNum)
                ? round2(costNum * qtyNum) : null;
              const drift = netValueDrift(stated, Number.isFinite(qtyNum) ? qtyNum : null, costNum);
              const unitIssue = unitQuantityIssue(e.unit, Number.isFinite(qtyNum) ? qtyNum : null);
              const unitStated = l.measurement_unit_code != null;

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
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {/* Stated by the document — facts, not readings. They come first because
                            the difference is the whole point: everything after this is a guess
                            about what the supplier's prose meant. */}
                        {l.supplier_product_code && (
                          <Detected label={`code ${l.supplier_product_code}`} stated title="The supplier's own article code, as printed on their document" />
                        )}
                        {unitStated && (
                          <Detected label={`billed in ${unitSuffix(e.unit) || e.unit}`} stated
                            title={`Unit stated by AADE on this line (myDATA measurementUnit ${l.measurement_unit_code}).`} />
                        )}
                        {l.mydata_vat_category != null && (
                          <Detected label={`VAT ${vatPctForCategory(l.mydata_vat_category) ?? '?'}%`} stated
                            title={`AADE VAT category ${l.mydata_vat_category} on this line`} />
                        )}
                        {/* What the AI extraction split out, kept as its own facts rather than
                            glued onto the end of the product name. */}
                        {l.size && <Detected label={l.size} title="Size, as the extraction read it" />}
                        {l.attributes && <Detected label={l.attributes} title="Attributes, as the extraction read them" />}
                        {pl && (
                          <>
                            {pl.dimensions.label && <Detected label={pl.dimensions.label} title={`Read from "${pl.dimensions.matched}"`} />}
                            {pl.manufacturer && <Detected label={pl.manufacturer} title="Maker recognised from a name your CRM already knows" />}
                            {pl.series && <Detected label={pl.series} title="Range / collection" />}
                            {pl.color && <Detected label={pl.color} title="Colour" />}
                            {pl.finish && <Detected label={pl.finish} title="Surface finish" />}
                            {pl.grade && <Detected label={`grade ${pl.grade}`} title="Quality grade" />}
                            {!unitStated && pl.unit && <Detected label={pl.unit} title={pl.unit_reason} />}
                          </>
                        )}
                      </div>
                    </div>
                    {/* What approving will actually DO. */}
                    <Badge variant={matched ? 'info' : 'neutral'} className="shrink-0 text-[10px]"
                      title={willUpdateName ?? l.match_reason ?? undefined}>
                      {matched ? (willUpdateName ? `Updates ${willUpdateName}` : 'Updates existing') : 'New product'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_110px_70px_80px]">
                    <Input className="h-8 text-sm" value={e.name} onChange={(ev) => setEdit(l.id, { name: ev.target.value })} placeholder="Product name" />
                    <Input className="h-8 text-sm" value={e.sku} onChange={(ev) => setEdit(l.id, { sku: ev.target.value })} placeholder="SKU" />
                    {/* A Select, not a text box. Free text is how the queue came to hold 'ml',
                        'gr', 'ltr', 'BIG BAG' and 'σάκι' — none of which any reader normalises
                        and none of which has an AADE code, so a line priced in one cannot be
                        transmitted on an invoice. */}
                    <Select value={e.unit || 'pcs'} onValueChange={(v) => setEdit(l.id, { unit: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
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
                      <Button size="sm" className="h-8 text-xs" disabled={rowBusy || !priced.ok}
                        title={priced.ok ? undefined : 'Set the VAT category, or untick “includes VAT”'}
                        onClick={() => approveOne(l)}>
                        {rowBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />} Add
                      </Button>
                    </div>
                  </div>

                  {/* What this line comes to, against what the invoice says it came to.
                      `unit_cost` is stored rounded to the cent, so it cannot reproduce the
                      stated net exactly (100.48 over 4.1 is 24.5073…, and 24.51 × 4.1 is
                      100.491) — and neither number was on screen, so an edited cost or quantity
                      silently moved what the warehouse recorded away from what was paid. */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="tabular-nums">
                      {e.quantity || '—'} {unitSuffix(e.unit) || e.unit} × {formatMoney(costShown, l.currency)}
                      {' = '}
                      <span className="font-medium text-foreground">{formatMoney(lineTotal, l.currency)}</span>
                    </span>
                    {stated != null && (
                      <span className="tabular-nums">
                        invoice says <span className="font-medium text-foreground">{formatMoney(stated, l.currency)}</span> net
                      </span>
                    )}
                    {drift != null && (
                      <span className="tabular-nums text-[hsl(var(--warning))]">
                        off by {formatMoney(drift, l.currency)}
                      </span>
                    )}
                  </div>

                  {unitIssue && (
                    <div className="flex items-start gap-1.5 text-[11px] text-[hsl(var(--warning))]">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                      <span>
                        {unitIssue}
                        {unitStated && ' The document itself states pieces, so the supplier’s own line disagrees with itself.'}
                      </span>
                    </div>
                  )}

                  {!priced.ok && (
                    <div className="flex items-start gap-1.5 text-[11px] text-destructive">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                      <span>
                        The price is marked as VAT-inclusive but no VAT category is set, so there is no rate to
                        net it by. Set the VAT category, or untick “includes VAT” — storing the gross figure as
                        the list price would make every quote built on it {vatPct ?? 24}% high.
                      </span>
                    </div>
                  )}

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
                          <Select value={e.mydata_vat_category || '__none'}
                            onValueChange={(vv) => setEdit(l.id, { mydata_vat_category: vv === '__none' ? '' : vv })}>
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

                  {/* "Do we already carry this?" — asked per row, on demand. The queue-time
                      matcher stores one best guess; two plausible candidates, or one at 0.48 a
                      human would recognise instantly, are exactly the cases it cannot show. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]"
                      disabled={candBusy === l.id} onClick={() => findSimilar(l)}>
                      {candBusy === l.id
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <PackageSearch className="h-3.5 w-3.5 mr-1" />}
                      {cands ? `Similar products (${cands.length})` : 'Check for an existing product'}
                    </Button>
                    {pick !== undefined && (
                      <span className="text-[11px] text-muted-foreground">
                        {pick ? 'will update the product below' : 'will create a new product'}
                        {' · '}
                        <button type="button" className="underline underline-offset-2"
                          onClick={() => setChosen((m) => { const n = { ...m }; delete n[l.id]; return n; })}>
                          undo
                        </button>
                      </span>
                    )}
                  </div>

                  {cands && cands.length > 0 && (
                    <div className="divide-y divide-hairline rounded-sm border border-hairline bg-surface-sunken">
                      {cands.map((c) => {
                        const active = pick === c.product_id
                          || (pick === undefined && l.matched_product_id === c.product_id);
                        return (
                          <button key={c.product_id} type="button"
                            onClick={() => setChosen((m) => ({ ...m, [l.id]: c.product_id }))}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left ${active ? 'bg-primary/[0.06]' : 'hover:bg-muted/40'}`}>
                            <Link2 className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-medium">{c.name}</div>
                              <div className="truncate text-[10px] text-muted-foreground">
                                {c.reason}
                                {c.sku && <> · <span className="font-mono">{c.sku}</span></>}
                                {c.qty_on_hand > 0 && <> · {c.qty_on_hand} on hand</>}
                                {c.cost != null && <> · cost {formatMoney(c.cost, c.cost_currency ?? l.currency)}</>}
                              </div>
                            </div>
                            {c.same_supplier && <Badge variant="success" className="shrink-0 text-[10px]">same supplier</Badge>}
                            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                              {Math.round(Number(c.score) * 100)}%
                            </span>
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => setChosen((m) => ({ ...m, [l.id]: '' }))}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${pick === '' ? 'bg-primary/[0.06]' : 'hover:bg-muted/40'}`}>
                        <PackagePlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        None of these — create a new product
                      </button>
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

                        <div className="space-y-0.5">
                          <label htmlFor={`vc-${l.id}`} className="text-[10px] text-muted-foreground">
                            VAT category{l.mydata_vat_category != null ? ' · from the invoice' : ''}
                          </label>
                          <Select value={e.mydata_vat_category || '__none'}
                            onValueChange={(v) => setEdit(l.id, { mydata_vat_category: v === '__none' ? '' : v })}>
                            <SelectTrigger id={`vc-${l.id}`} className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none">— not set —</SelectItem>
                              {Object.entries(VAT_PCT_BY_CATEGORY).map(([cat, pct]) => (
                                <SelectItem key={cat} value={cat}>{pct}% (cat {cat})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

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
/**
 * One thing we know about this line.
 *
 * `stated` distinguishes a FACT the document carries (the unit AADE coded, the supplier's own
 * article code, the VAT category) from a READING of its description. They look different because
 * they are different: a reading is what the operator is here to check, a fact is not.
 */
const Detected: React.FC<{ label: string; title: string; stated?: boolean }> = ({ label, title, stated }) => (
  <span title={title}
    className={`inline-flex items-center rounded-sm border px-1.5 py-px text-[10px] ${
      stated
        ? 'border-primary/30 bg-primary/[0.06] text-foreground'
        : 'border-hairline bg-surface-sunken text-muted-foreground'
    }`}>
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
