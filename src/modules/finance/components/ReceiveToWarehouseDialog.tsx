/**
 * #206/#207 — turn a myDATA inbound document's lines into stock.
 *
 * A supplier line is one free-text string plus a quantity and a net value. Everything a
 * stock item needs is in there — "AMALFI GRIS 80X80 A' -3 -1", qty 17.92, net €295.86 is an
 * 80×80 cm tile, sold by the square metre, costing €16.51/m² ex-VAT — so the form parses it
 * (`parseSupplierLine`) and presents the result as editable fields rather than making the
 * operator retype what the document already said.
 *
 * What each line writes on submit:
 *   catalog product  — name, sku, cost, and the parsed size/maker into products.metadata
 *   sale price       — product_prices.list_price, from cost × (1 + markup)
 *   stock item       — physical fields + intake photos, linked to the product
 *   stock movement   — one 'in' movement per line, via inbound_doc_receive_to_warehouse
 *
 * Money deliberately does NOT live on warehouse_items: cost is products.cost and the sale
 * price is product_prices.list_price, which is where the rest of the platform reads them.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, Search, X, ImagePlus, Ruler, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/core/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import {
  warehouseService, type WarehouseItem, type Warehouse, type CatalogMatch, type PendingProduct,
} from '@/services/warehouseService';
import { marketplacePricingService } from '@/services/marketplacePricingService';
import { parseSupplierLine } from '@/modules/finance/utils/parseSupplierLine';
import { UNITS, unitSuffix, normalizeUnit, unitFromMydataCode } from '@/lib/units';
import { parseDecimalOr } from '@/utils/decimal';
import { supabase } from '@/integrations/supabase/client';

type LineMode = 'skip' | '__create' | string /* existing warehouse item id */;

interface LineRow {
  /** Is this line being received at all? The per-product ✓, independent of destination. */
  include: boolean;
  /** Is the detail panel open? Documents routinely carry many lines, so they start collapsed. */
  expanded: boolean;
  mode: LineMode;
  name: string;
  sku: string;
  unit: string;
  qty: string;
  width: string;
  length: string;
  thickness: string;
  weight: string;
  manufacturer: string;
  supplierCode: string;
  grade: string | null;
  markup: string;
  salePrice: string;
  /** Catalog product this line was matched to, if any. */
  match: CatalogMatch | null;
  images: string[];
  /** Catalog products the uploaded photo looks like, from the 7-vector visual search. */
  visualMatches: CatalogMatch[];
  matching: boolean;
  /** Why the unit was pre-selected — surfaced as a tooltip so the guess is never silent. */
  unitReason: string;
  uploading: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Read a File as raw base64 (no data-URL prefix) — what MIVAA's image search expects. */
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export const ReceiveToWarehouseDialog: React.FC<{
  doc: InboundDocument;
  workspaceId: string;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}> = ({ doc, workspaceId, onOpenChange, onDone }) => {
  const { toast } = useToast();
  const [items, setItems] = useState<WarehouseItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [targetWh, setTargetWh] = useState('');
  const [addToCatalog, setAddToCatalog] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Record<number, LineRow>>({});

  const lines = doc.lines ?? [];
  // A line only becomes stock if it says WHAT was supplied. myDATA omits item descriptions on
  // most service invoices (type 2.x carry value lines only), so this is the common case, not
  // an edge case — see the empty state below.
  const receivable = useMemo(
    () => lines.map((ln, i) => ({ ln, i })).filter(({ ln }) => String(ln.item_description ?? '').trim().length > 0),
    [lines],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [its, whs, pendingRes, settingsRes, crmRes] = await Promise.all([
          warehouseService.listItems(workspaceId),
          warehouseService.listWarehouses(workspaceId).catch(() => [] as Warehouse[]),
          // The nightly sync may already have run Haiku over these very lines. Reuse that
          // work instead of running a second, dumber extraction over the same text.
          supabase.from('warehouse_pending_items').select('*')
            .eq('workspace_id', workspaceId).eq('inbound_document_id', doc.id)
            .then((r) => (r.data ?? []) as PendingProduct[], () => [] as PendingProduct[]),
          supabase.from('finance_settings').select('default_markup_pct').eq('workspace_id', workspaceId)
            .maybeSingle().then((r) => r.data, () => null),
          supabase.from('crm_companies').select('name').eq('workspace_id', workspaceId).limit(500)
            .then((r) => r.data ?? [], () => []),
        ]);
        if (cancelled) return;

        setItems(its);
        setWarehouses(whs);
        setTargetWh(whs.find((w) => w.is_default)?.id ?? whs[0]?.id ?? '');
        // Workspace default markup seeds every line's margin; 0 means "operator decides".
        const markup = settingsRes?.default_markup_pct != null ? String(settingsRes.default_markup_pct) : '';

        // Maker names we can recognise inside a description: existing stock, the CRM, and the
        // issuer itself (which is the right default — they sent us the document).
        const known = [
          ...new Set([
            ...its.map((it) => it.manufacturer).filter(Boolean) as string[],
            ...(crmRes as { name: string }[]).map((c) => c.name).filter(Boolean),
          ]),
        ];
        const pendingByDesc = new Map(
          (pendingRes as PendingProduct[]).map((p) => [String(p.raw_description ?? '').trim(), p]),
        );

        const init: Record<number, LineRow> = {};
        const receivableCount = lines.filter((l) => String(l.item_description ?? '').trim()).length;
        lines.forEach((ln, i) => {
          const desc = String(ln.item_description ?? '').trim();
          if (!desc) {
            init[i] = blankRow('skip');
            return;
          }
          const parsed = parseSupplierLine({
            description: desc,
            quantity: ln.quantity,
            netValue: ln.net_value,
            knownManufacturers: known,
            defaultManufacturer: doc.issuer_name,
          });
          const ai = pendingByDesc.get(desc);
          const existing = its.find((it) => {
            const n = (it.name ?? '').toLowerCase();
            return n && (n.includes(desc.toLowerCase()) || desc.toLowerCase().includes(n));
          });
          // AADE states the unit on the line (`measurementUnit`). When it does, that IS the
          // unit — the description heuristic is only a fallback for lines that omit it.
          const aadeUnit = unitFromMydataCode(ln.measurement_unit);
          const unit = aadeUnit ?? normalizeUnit(ai?.unit ?? parsed.unit);
          const cost = parsed.unit_cost;
          const markupPct = markup && Number(markup) > 0 ? markup : '';
          init[i] = {
            // Every describable line is included by default — the operator unticks the ones
            // they don't stock. Only the first opens, so a 30-line invoice stays readable.
            include: true,
            expanded: receivableCount === 1,
            mode: existing ? existing.id : '__create',
            name: ai?.name?.trim() || parsed.name,
            sku: ai?.sku ?? '',
            unit,
            qty: ln.quantity != null ? String(ln.quantity) : '',
            width: parsed.dimensions.width_mm != null ? String(parsed.dimensions.width_mm) : '',
            length: parsed.dimensions.length_mm != null ? String(parsed.dimensions.length_mm) : '',
            thickness: parsed.dimensions.thickness_mm != null ? String(parsed.dimensions.thickness_mm) : '',
            weight: '',
            manufacturer: parsed.manufacturer ?? '',
            // Same rule: the supplier's own `itemCode` beats anything scraped out of the text.
            supplierCode: ln.item_code ?? parsed.supplier_product_code ?? '',
            grade: parsed.grade,
            markup: markupPct,
            salePrice: cost != null && markupPct ? String(r2(cost * (1 + Number(markupPct) / 100))) : '',
            match: null,
            images: [],
            visualMatches: [],
            matching: false,
            unitReason: aadeUnit
              ? 'Unit stated by AADE on this line (myDATA measurementUnit).'
              : parsed.unit_reason,
            uploading: false,
          };
        });
        setRows(init);
      } catch (e: any) {
        toast({ title: 'Failed to load', description: e?.message, variant: 'destructive' });
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, doc.id]);

  const setRow = (i: number, patch: Partial<LineRow>) =>
    setRows((m) => ({ ...m, [i]: { ...(m[i] ?? blankRow('skip')), ...patch } }));

  const includedCount = receivable.filter(({ i }) => rows[i]?.include).length;

  /**
   * What is actually being received, per unit — "17.92 m²" is the number the operator is
   * reconciling against the delivery, and it was nowhere on screen before. Grouped by unit
   * because one document can mix m², pieces and metres, which must never be summed together.
   */
  const totalsByUnit = useMemo(() => {
    const acc = new Map<string, { qty: number; net: number }>();
    for (const { i, ln } of receivable) {
      const r = rows[i];
      if (!r?.include) continue;
      const unit = r.unit || 'pcs';
      const qty = parseDecimalOr(r.qty, 0);
      const cur = acc.get(unit) ?? { qty: 0, net: 0 };
      cur.qty += qty;
      cur.net += Number(ln.net_value ?? 0);
      acc.set(unit, cur);
    }
    return [...acc.entries()].map(([unit, v]) => ({
      unit, qty: Math.round(v.qty * 1000) / 1000, net: Math.round(v.net * 100) / 100,
    }));
  }, [receivable, rows]);
  const toggleAll = (on: boolean) =>
    setRows((m) => {
      const next = { ...m };
      for (const { i } of receivable) next[i] = { ...(next[i] ?? blankRow('skip')), include: on };
      return next;
    });

  /** Cost per unit is always net ÷ quantity — the document's own arithmetic, ex-VAT. */
  const unitCostOf = (i: number): number | null => {
    const ln = lines[i];
    const qty = parseDecimalOr(rows[i]?.qty ?? '', 0);
    if (!qty || ln?.net_value == null) return null;
    return r2(Number(ln.net_value) / qty);
  };

  /** Markup and sale price are two views of one number — editing either updates the other. */
  const applyMarkup = (i: number, markup: string) => {
    const cost = unitCostOf(i);
    const pct = Number(markup);
    setRow(i, {
      markup,
      salePrice: cost != null && markup !== '' && Number.isFinite(pct) ? String(r2(cost * (1 + pct / 100))) : rows[i]?.salePrice ?? '',
    });
  };
  const applySalePrice = (i: number, salePrice: string) => {
    const cost = unitCostOf(i);
    const price = parseDecimalOr(salePrice, NaN);
    setRow(i, {
      salePrice,
      markup: cost != null && cost > 0 && Number.isFinite(price) ? String(r2(((price - cost) / cost) * 100)) : rows[i]?.markup ?? '',
    });
  };

  /**
   * Upload the photos, then run visual search on the first one. The picture is usually a far
   * better matcher than the supplier's abbreviated description — "AMALFI GRIS 80X80 A' -3 -1"
   * tells a text search very little, while the tile itself is exactly what the 7-vector index
   * was built for. Suggestions are offered, never auto-applied.
   */
  const pickImages = async (i: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setRow(i, { uploading: true });
    try {
      const urls = await warehouseService.uploadItemImages(workspaceId, list);
      const already = rows[i]?.images ?? [];
      setRow(i, { images: [...already, ...urls], uploading: false });

      if (already.length === 0) {
        setRow(i, { matching: true });
        const base64 = await fileToBase64(list[0]);
        const suggestions = await warehouseService.matchCatalogByImage(
          workspaceId, base64, rows[i]?.name ?? '',
        );
        setRow(i, { visualMatches: suggestions, matching: false });
      }
    } catch (e: any) {
      setRow(i, { uploading: false, matching: false });
      toast({ title: 'Upload failed', description: e?.message, variant: 'destructive' });
    }
  };

  const submit = async () => {
    const active = receivable
      .map(({ i }) => ({ i, r: rows[i] }))
      .filter(({ r }) => r && r.include && r.mode !== 'skip' && parseDecimalOr(r.qty, 0) > 0);
    if (active.length === 0) {
      toast({
        title: 'Nothing to receive',
        description: includedCount === 0 ? 'Tick at least one product.' : 'The selected products need a quantity.',
        variant: 'destructive',
      });
      return;
    }
    if (active.some(({ r }) => r.mode === '__create') && !targetWh) {
      toast({ title: 'Pick a target warehouse', description: 'New stock items need a warehouse.', variant: 'destructive' });
      return;
    }

    setBusy(true);
    try {
      const mappings: { item_id: string; quantity: number }[] = [];
      let created = 0;
      for (const { i, r } of active) {
        const qty = parseDecimalOr(r.qty, 0);
        if (r.mode !== '__create') { mappings.push({ item_id: r.mode, quantity: qty }); continue; }

        const cost = unitCostOf(i);
        const dimensions = {
          width_mm: r.width ? parseDecimalOr(r.width, NaN) : null,
          length_mm: r.length ? parseDecimalOr(r.length, NaN) : null,
          thickness_mm: r.thickness ? parseDecimalOr(r.thickness, NaN) : null,
        };
        const name = r.name.trim() || 'Item';

        // An operator-confirmed catalog match wins over creating a duplicate product.
        let productId: string | null = r.match?.id ?? null;
        if (!productId && addToCatalog) {
          productId = await warehouseService.createProduct({
            workspaceId, name,
            sku: r.sku.trim() || null,
            externalSku: r.supplierCode.trim() || null,
            unit: r.unit, cost, costCurrency: doc.currency,
            dimensions, manufacturer: r.manufacturer.trim() || null, grade: r.grade,
          });
          created += 1;
        }

        const price = parseDecimalOr(r.salePrice, NaN);
        if (productId && Number.isFinite(price) && price > 0) {
          await marketplacePricingService.setListPrice(workspaceId, productId, price, {
            currency: doc.currency, unit: r.unit,
          });
        }

        const itemId = await warehouseService.createItem({
          workspaceId, warehouse_id: targetWh, name,
          sku: r.sku.trim() || undefined, unit: r.unit, product_id: productId, qty_on_hand: 0,
          width_mm: Number.isFinite(dimensions.width_mm as number) ? dimensions.width_mm : null,
          length_mm: Number.isFinite(dimensions.length_mm as number) ? dimensions.length_mm : null,
          thickness_mm: Number.isFinite(dimensions.thickness_mm as number) ? dimensions.thickness_mm : null,
          weight_kg: r.weight ? parseDecimalOr(r.weight, NaN) : null,
          manufacturer: r.manufacturer.trim() || null,
          supplier_product_code: r.supplierCode.trim() || null,
          image_urls: r.images,
        });
        mappings.push({ item_id: itemId, quantity: qty });
      }

      const n = await inboundService.receiveToWarehouse(doc.id, mappings);
      toast({
        title: `Received ${n} line${n === 1 ? '' : 's'}`,
        description: created > 0 ? `${created} new catalog product${created === 1 ? '' : 's'} created.` : undefined,
      });
      onDone();
    } catch (e: any) {
      toast({ title: 'Failed to receive', description: e?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const issuer = doc.issuer_name ?? doc.issuer_vat ?? doc.mark;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display">Receive into warehouse — {issuer}</DialogTitle>
          <DialogDescription>
            Sizes, unit and cost are read from each supplier line. Check them, then receive.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
        ) : receivable.length === 0 ? (
          <NoGoodsState doc={doc} lineCount={lines.length} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer" title="Select / deselect every line">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded"
                    checked={includedCount === receivable.length && receivable.length > 0}
                    ref={(el) => { if (el) el.indeterminate = includedCount > 0 && includedCount < receivable.length; }}
                    onChange={(e) => toggleAll(e.target.checked)} />
                  <span>{includedCount} of {receivable.length} selected</span>
                </label>
                <span className="text-muted-foreground/60">·</span>
                <span className="text-muted-foreground">New items → warehouse</span>
                <Select value={targetWh} onValueChange={setTargetWh}>
                  <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Default warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map((w) => (
                      <SelectItem key={w.id} value={w.id}>{w.name}{w.is_default ? ' (default)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="h-3.5 w-3.5 rounded" checked={addToCatalog}
                  onChange={(e) => setAddToCatalog(e.target.checked)} />
                <span>Also add new items to the sellable catalog</span>
              </label>
            </div>

            <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
              {receivable.map(({ ln, i }) => {
                const r = rows[i] ?? blankRow('skip');
                const cost = unitCostOf(i);
                return (
                  <LineCard
                    key={i}
                    index={i}
                    line={ln}
                    row={r}
                    currency={doc.currency}
                    cost={cost}
                    items={items}
                    workspaceId={workspaceId}
                    onChange={(patch) => setRow(i, patch)}
                    onMarkup={(v) => applyMarkup(i, v)}
                    onSalePrice={(v) => applySalePrice(i, v)}
                    onImages={(files) => pickImages(i, files)}
                  />
                );
              })}
            </div>
          </>
        )}

        {!loading && receivable.length > 0 && totalsByUnit.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <span className="text-muted-foreground">Receiving</span>
            {totalsByUnit.map((t) => (
              <span key={t.unit}>
                <span className="font-medium">{t.qty}</span> {unitSuffix(t.unit)}
                <span className="text-muted-foreground"> · {formatMoney(t.net, doc.currency)} net</span>
              </span>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={busy || loading || includedCount === 0}>
            {busy
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Receiving…</>
              : `Receive ${includedCount || ''} ${includedCount === 1 ? 'product' : 'products'}`.replace(/\s+/g, ' ').trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function blankRow(mode: LineMode): LineRow {
  return {
    include: false, expanded: false,
    mode, name: '', sku: '', unit: 'pcs', qty: '', width: '', length: '', thickness: '', weight: '',
    manufacturer: '', supplierCode: '', grade: null, markup: '', salePrice: '', match: null,
    images: [], visualMatches: [], matching: false, unitReason: '', uploading: false,
  };
}

/**
 * What to say when a document carries no goods. AADE's feed gives value lines only for most
 * service invoices, so "nothing here" is a property of the document type — telling the
 * operator that is more useful than an empty list they'll assume is a bug.
 */
const NoGoodsState: React.FC<{ doc: InboundDocument; lineCount: number }> = ({ doc, lineCount }) => (
  <div className="py-8 px-4 text-center space-y-2">
    <p className="text-sm">This document has no item lines to receive.</p>
    <p className="text-xs text-muted-foreground max-w-md mx-auto">
      {lineCount > 0
        ? `myDATA sent ${lineCount} value line${lineCount === 1 ? '' : 's'} for this document but no item descriptions. `
        : 'myDATA sent no line detail for this document. '}
      {String(doc.doc_type ?? '').startsWith('2.')
        ? 'Type 2.x is a services invoice — services are not stock, so there is nothing to put in a warehouse.'
        : 'The issuer transmitted totals only. Record it as a supplier bill instead, or add the stock manually in Finance → Warehouse.'}
    </p>
  </div>
);

/** One supplier line: what was billed, where it goes, and the product it becomes. */
const LineCard: React.FC<{
  index: number;
  line: { line_number: number | null; item_description: string | null; quantity: number | null; net_value: number | null };
  row: LineRow;
  currency: string;
  cost: number | null;
  items: WarehouseItem[];
  workspaceId: string;
  onChange: (patch: Partial<LineRow>) => void;
  onMarkup: (v: string) => void;
  onSalePrice: (v: string) => void;
  onImages: (files: FileList | null) => void;
}> = ({ index, line, row, currency, cost, items, workspaceId, onChange, onMarkup, onSalePrice, onImages }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = row.mode === '__create';
  const suffix = unitSuffix(row.unit);
  const destination = row.mode === '__create'
    ? (row.match ? `New stock · ${row.match.name}` : 'New stock item')
    : (items.find((it) => it.id === row.mode)?.name ?? 'Existing item');

  return (
    <div className={`rounded-md border ${row.include ? 'border-border/60' : 'border-border/30 opacity-60'}`}>
      {/* Accordion header — one line per product: include it, what it is, where it goes.
          Fixed-width right-hand columns keep every row's controls on the same vertical line
          however long the supplier's description is. */}
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 p-2.5">
        <input
          type="checkbox" className="h-4 w-4 rounded justify-self-center"
          checked={row.include} onChange={(e) => onChange({ include: e.target.checked })}
          title={row.include ? 'Receiving this line' : 'Not receiving this line'}
        />
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => onChange({ expanded: !row.expanded })}
        >
          <div className="flex items-center gap-1.5 text-xs font-medium">
            {row.expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate" title={line.item_description ?? ''}>
              #{line.line_number ?? index + 1} · {row.name || line.item_description}
            </span>
          </div>
          <div className="pl-5 text-[11px] text-muted-foreground truncate">
            net {formatMoney(line.net_value ?? 0, currency)}
            {row.qty ? ` · ${row.qty} ${suffix}` : ''}
            {cost != null && <> · <span className="text-foreground">{formatMoney(cost, currency)}/{suffix}</span></>}
            {' · '}{destination}
          </div>
        </button>
        <div className="flex items-center gap-1">
          <Input className="h-8 w-24 text-xs text-right" type="text" inputMode="decimal" placeholder="qty"
            value={row.qty} onChange={(e) => onChange({ qty: e.target.value })} disabled={!row.include} />
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select value={row.unit} onValueChange={(v) => onChange({ unit: v })} disabled={!row.include}>
                    <SelectTrigger className="h-8 w-[92px] text-xs px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              {row.unitReason && <TooltipContent side="top" className="max-w-xs"><p className="text-xs">{row.unitReason}</p></TooltipContent>}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {row.expanded && row.include && (
        <div className="space-y-3 border-t border-border/40 p-3">
          <Field label="Destination">
            <Select value={row.mode} onValueChange={(v) => onChange({ mode: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__create">➕ Create new stock item</SelectItem>
                {items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      {row.expanded && row.include && creating && (
        <div className="space-y-3 border-t border-border/40 p-3">
          {/* Identity */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="Product name">
              <Input className="h-8 text-xs" value={row.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Product name" />
            </Field>
            <Field label="SKU">
              <Input className="h-8 text-xs" value={row.sku} onChange={(e) => onChange({ sku: e.target.value })} placeholder="optional" />
            </Field>
            <Field label="Supplier code">
              <Input className="h-8 text-xs" value={row.supplierCode} onChange={(e) => onChange({ supplierCode: e.target.value })} placeholder="their code" />
            </Field>
          </div>

          {/* Physical metadata read out of the description */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.5fr)]">
            <Field label={<span className="flex items-center gap-1"><Ruler className="h-3 w-3" /> Width (mm)</span>}>
              <Input className="h-8 text-xs" inputMode="decimal" value={row.width} onChange={(e) => onChange({ width: e.target.value })} />
            </Field>
            <Field label="Length (mm)">
              <Input className="h-8 text-xs" inputMode="decimal" value={row.length} onChange={(e) => onChange({ length: e.target.value })} />
            </Field>
            <Field label="Thickness (mm)">
              <Input className="h-8 text-xs" inputMode="decimal" value={row.thickness} onChange={(e) => onChange({ thickness: e.target.value })} />
            </Field>
            <Field label="Weight (kg)">
              <Input className="h-8 text-xs" inputMode="decimal" value={row.weight} onChange={(e) => onChange({ weight: e.target.value })} />
            </Field>
            <Field label="Manufacturer">
              <Input className="h-8 text-xs" value={row.manufacturer} onChange={(e) => onChange({ manufacturer: e.target.value })} placeholder="maker" />
            </Field>
          </div>

          {/* Pricing — cost is the document's, the operator only chooses the margin */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
            <Field label={`Cost / ${suffix} (ex. VAT)`}>
              <div className="h-8 flex items-center rounded-md border border-border/60 bg-muted/40 px-2 text-xs">
                {cost != null ? formatMoney(cost, currency) : '—'}
              </div>
            </Field>
            <Field label="Markup %">
              <Input className="h-8 text-xs" inputMode="decimal" value={row.markup} onChange={(e) => onMarkup(e.target.value)} placeholder="25" />
            </Field>
            <Field label={`Sale price / ${suffix}`}>
              <Input className="h-8 text-xs" inputMode="decimal" value={row.salePrice} onChange={(e) => onSalePrice(e.target.value)} placeholder="—" />
            </Field>
            <div className="text-[11px] text-muted-foreground pb-2">
              {row.grade && <>Grade {row.grade} · </>}
              {cost != null && line.quantity != null && <>{line.quantity} {suffix} × {formatMoney(cost, currency)}</>}
            </div>
          </div>

          {/* Catalog match + photos */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CatalogMatchPicker
              workspaceId={workspaceId}
              query={row.name}
              value={row.match}
              onChange={(m) => onChange({ match: m })}
            />
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Photos</Label>
              <div className="flex flex-wrap items-center gap-2">
                {row.images.map((url) => (
                  <div key={url} className="relative">
                    <img src={url} alt="" className="h-10 w-10 rounded object-cover border border-border/50" />
                    <button type="button" title="Remove"
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-background border border-border/60 p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => onChange({ images: row.images.filter((u) => u !== url) })}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { onImages(e.target.files); e.currentTarget.value = ''; }} />
                <Button type="button" size="sm" variant="outline" className="rounded-full h-8"
                  disabled={row.uploading} onClick={() => fileRef.current?.click()}>
                  {row.uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  <span className="ml-1 text-xs">Add photo</span>
                </Button>
              </div>
              {row.matching ? (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Looking for catalog products that look like this…
                </p>
              ) : row.visualMatches.length > 0 && !row.match ? (
                <div className="space-y-1">
                  <p className="text-[10px] text-muted-foreground">Looks like these catalog products:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {row.visualMatches.slice(0, 4).map((m) => (
                      <button key={m.id} type="button" title={`${m.name} — use as the catalog product`}
                        className="flex items-center gap-1.5 rounded-full border border-border/60 py-0.5 pl-0.5 pr-2 hover:border-primary"
                        onClick={() => onChange({ match: m })}>
                        {m.image_url
                          ? <img src={m.image_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                          : <span className="h-5 w-5 rounded-full bg-muted" />}
                        <span className="max-w-[110px] truncate text-[10px]">{m.name}</span>
                        {m.score != null && <span className="text-[9px] text-muted-foreground">{Math.round(m.score * 100)}%</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Stored on the stock item; the first photo is searched against the catalog.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1">
    <Label className="text-[11px] text-muted-foreground">{label}</Label>
    {children}
  </div>
);

/**
 * Link the line to a product that already exists rather than creating a near-duplicate.
 * Text search over name/sku/external_sku with the product's image alongside — the picture is
 * what actually tells an operator whether "AMALFI GRIS" is the same tile they already sell.
 */
const CatalogMatchPicker: React.FC<{
  workspaceId: string;
  query: string;
  value: CatalogMatch | null;
  onChange: (m: CatalogMatch | null) => void;
}> = ({ workspaceId, query, value, onChange }) => {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CatalogMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = (term || query).trim();
    if (!open || q.length < 2) { setResults([]); return; }
    let live = true;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await warehouseService.searchCatalogProducts(workspaceId, q);
        if (live) setResults(res);
      } catch { if (live) setResults([]); }
      finally { if (live) setSearching(false); }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [term, query, open, workspaceId]);

  if (value) {
    return (
      <div className="space-y-1">
        <Label className="text-[11px] text-muted-foreground">Catalog product</Label>
        <div className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5">
          {value.image_url
            ? <img src={value.image_url} alt="" className="h-8 w-8 rounded object-cover" />
            : <div className="h-8 w-8 rounded bg-muted" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{value.name}</div>
            <div className="truncate text-[10px] text-muted-foreground">{value.sku ?? 'no SKU'}</div>
          </div>
          <Check className="h-3.5 w-3.5 text-emerald-500" />
          <button type="button" className="text-muted-foreground hover:text-destructive" title="Unlink"
            onClick={() => { onChange(null); setOpen(false); }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">Catalog product</Label>
      {!open ? (
        <Button type="button" size="sm" variant="outline" className="rounded-full h-8 w-full justify-start"
          onClick={() => setOpen(true)}>
          <Search className="h-3.5 w-3.5 mr-1" />
          <span className="text-xs">Match to an existing product…</span>
        </Button>
      ) : (
        <>
          <div className="relative">
            <Input className="h-8 text-xs pr-7" autoFocus placeholder={query || 'Search the catalog…'}
              value={term} onChange={(e) => setTerm(e.target.value)} />
            {searching && <Loader2 className="h-3.5 w-3.5 animate-spin absolute right-2 top-2 text-muted-foreground" />}
          </div>
          <div className="max-h-32 overflow-y-auto rounded-md border border-border/50 divide-y divide-border/40">
            {results.length === 0 ? (
              <p className="px-2 py-2 text-[11px] text-muted-foreground">
                {searching ? 'Searching…' : 'No catalog product matches — a new one will be created.'}
              </p>
            ) : results.map((p) => (
              <button key={p.id} type="button" className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40"
                onClick={() => { onChange(p); setOpen(false); }}>
                {p.image_url
                  ? <img src={p.image_url} alt="" className="h-7 w-7 rounded object-cover" />
                  : <div className="h-7 w-7 rounded bg-muted flex items-center justify-center"><Plus className="h-3 w-3 text-muted-foreground" /></div>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{p.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">{p.sku ?? 'no SKU'}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
