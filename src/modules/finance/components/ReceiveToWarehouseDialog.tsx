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
import { Checkbox } from '@/components/core/ui/checkbox';
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
import type { ManualImageRef } from '@/services/dealerProductsService';
import { parseSupplierLine } from '@/modules/finance/utils/parseSupplierLine';
import { UNITS, unitSuffix, normalizeUnit, unitFromMydataCode, unitDef } from '@/lib/units';
import { invoicingSetupService, type RefRow, type DocTypeSetting } from '@/services/invoicingSetupService';
import { parseDecimalOr } from '@/utils/decimal';
import { supabase } from '@/integrations/supabase/client';
import { TaricCombobox } from '@/components/core/TaricCombobox';
import { productUomService } from '@/services/productUomService';

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
  color: string;
  finish: string;
  series: string;
  markup: string;
  salePrice: string;
  /** Catalog product this line was matched to, if any. */
  match: CatalogMatch | null;
  images: ManualImageRef[];
  /** Catalog products the uploaded photo looks like, from the 7-vector visual search. */
  visualMatches: CatalogMatch[];
  matching: boolean;
  /** Why the unit was pre-selected — surfaced as a tooltip so the guess is never silent. */
  unitReason: string;
  uploading: boolean;

  // ── Fiscal identity (written to `products`, read by invoice-builder / POS / orders) ──
  itemType: string;
  categoryId: string;
  barcode: string;
  cpv: string;
  taric: string;
  /** Sale-side AADE VAT category; seeded from the supplier line's own vatCategory. */
  vatCategory: string;
  incomeCatWholesale: string;
  incomeTypeWholesale: string;
  incomeCatRetail: string;
  incomeTypeRetail: string;
  defaultDiscount: string;
  pricesIncludeVat: boolean;
  warranty: string;
  productUrl: string;
  notes: string;

  // ── Stock-level ──
  location: string;
  reorderPoint: string;
  serialNumber: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * How well an existing stock item matches a supplier line, 0..1.
 *
 * The old test was `a.includes(b) || b.includes(a)`, which matched "TILE" against every tile
 * in the warehouse and missed "AMALFI GRIS 80X80" ↔ "Amalfi Gris" because neither string
 * contains the other. This scores shared distinctive tokens instead: an exact SKU or supplier
 * code is decisive, otherwise it is the proportion of the item's own words that appear in the
 * line. Below `MATCH_MIN` nothing is offered as a likely match.
 */
const MATCH_MIN = 0.5;

const tokenize = (s: string): string[] =>
  (s ?? '').toLowerCase().split(/[^a-z0-9α-ωά-ώ]+/i).filter((t) => t.length >= 2);

function matchScore(item: WarehouseItem, description: string, supplierCode: string | null): number {
  const desc = (description ?? '').toLowerCase();
  // A code the supplier printed is an identity, not a hint.
  const code = (item.sku ?? item.supplier_product_code ?? '').trim().toLowerCase();
  if (code && (code === (supplierCode ?? '').trim().toLowerCase() || desc.includes(code))) return 1;

  const itemTokens = tokenize(item.name ?? '');
  if (itemTokens.length === 0) return 0;
  const lineTokens = new Set(tokenize(description));
  const hits = itemTokens.filter((t) => lineTokens.has(t)).length;
  return hits / itemTokens.length;
}

/** AADE VAT-category code → percent. Mirrors the table in `_shared/fiscal/invoice-builder.ts`. */
const VAT_PCT_BY_CATEGORY: Record<number, number> = { 1: 24, 2: 13, 3: 6, 4: 17, 5: 9, 6: 4, 7: 0, 8: 0 };

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
  // AADE reference tables — the codes a line must carry to be transmittable. Loaded from
  // `mydata_reference` so a new AADE code appears without a deploy.
  const [vatCats, setVatCats] = useState<RefRow[]>([]);
  const [incomeCats, setIncomeCats] = useState<RefRow[]>([]);
  const [incomeTypes, setIncomeTypes] = useState<RefRow[]>([]);
  const [productCategories, setProductCategories] = useState<{ id: string; name: string }[]>([]);

  /**
   * Hydrate the TOASTed `lines` on open — the list query omits them (#301 finding 8). This dialog
   * cannot work without them, so a failed hydrate must be VISIBLE rather than silently rendering
   * the 'no goods on this document' empty state.
   */
  const [fullDoc, setFullDoc] = useState<InboundDocument | null>(null);
  const [linesFailed, setLinesFailed] = useState(false);
  useEffect(() => {
    if (!open) { setFullDoc(null); setLinesFailed(false); return; }
    let live = true;
    void inboundService.getFull(doc.id)
      .then((d) => { if (live) { if (d) setFullDoc(d); else setLinesFailed(true); } })
      .catch(() => { if (live) setLinesFailed(true); });
    return () => { live = false; };
  }, [open, doc.id]);

  const lines = (fullDoc ?? doc).lines ?? [];
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
        const [its, whs, pendingRes, settingsRes, crmRes, vatRef, incCatRef, incTypeRef, cats, docTypeDefaults] = await Promise.all([
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
          invoicingSetupService.listReference('vat_category').catch(() => [] as RefRow[]),
          invoicingSetupService.listReference('income_classification_category').catch(() => [] as RefRow[]),
          invoicingSetupService.listReference('income_classification_type').catch(() => [] as RefRow[]),
          supabase.from('material_categories').select('id, name').order('name').limit(200)
            .then((r) => (r.data ?? []) as { id: string; name: string }[], () => []),
          // The workspace's own per-doc-type income-classification defaults — the same ones
          // NewInvoiceDialog seeds a line with, so an intake-created product is classified
          // exactly as the operator's outgoing invoices already are.
          invoicingSetupService.getDocTypeSettings(workspaceId).catch(() => ({})),
        ]);
        if (cancelled) return;

        setItems(its);
        setWarehouses(whs);
        setTargetWh(whs.find((w) => w.is_default)?.id ?? whs[0]?.id ?? '');
        setVatCats(vatRef as RefRow[]);
        setIncomeCats(incCatRef as RefRow[]);
        setIncomeTypes(incTypeRef as RefRow[]);
        setProductCategories(cats as { id: string; name: string }[]);

        // Workspace default markup seeds every line's margin; 0 means "operator decides".
        const markup = settingsRes?.default_markup_pct != null ? String(settingsRes.default_markup_pct) : '';

        // Wholesale defaults from doc type 1.1 (sales invoice), retail from 11.1 (retail
        // receipt) — the two document types these classifications are actually used on.
        const dts = docTypeDefaults as Record<string, DocTypeSetting>;
        const defaults = {
          incomeCatWholesale: dts['1.1']?.default_income_classification_category ?? '',
          incomeTypeWholesale: dts['1.1']?.default_income_classification_type ?? '',
          incomeCatRetail: dts['11.1']?.default_income_classification_category ?? '',
          incomeTypeRetail: dts['11.1']?.default_income_classification_type ?? '',
        };

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
          // Only auto-select an existing item when the match is convincing; otherwise the
          // operator starts on "New stock item" rather than silently topping up the wrong one.
          const scored = its
            .map((it) => ({ it, score: matchScore(it, desc, ln.item_code) }))
            .filter((x) => x.score >= MATCH_MIN)
            .sort((a, b) => b.score - a.score);
          const existing = scored[0]?.it;
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
            // Dictionary hit from the name first; the nightly Haiku pass's free-text
            // `attributes` is the fallback for wording the dictionary doesn't know.
            color: parsed.color ?? '',
            finish: parsed.finish ?? '',
            series: parsed.series ?? '',
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
            itemType: 'good',
            categoryId: '',
            barcode: '',
            cpv: '',
            taric: '',
            // The supplier's own VAT category for this line is the best available default for
            // BOTH sides: we bought it at that rate, and absent other information we resell
            // at the same rate. Editable per line.
            vatCategory: ln.vat_category != null ? String(ln.vat_category) : '',
            incomeCatWholesale: defaults.incomeCatWholesale,
            incomeTypeWholesale: defaults.incomeTypeWholesale,
            incomeCatRetail: defaults.incomeCatRetail,
            incomeTypeRetail: defaults.incomeTypeRetail,
            defaultDiscount: '',
            pricesIncludeVat: false,
            warranty: '',
            productUrl: '',
            notes: '',
            location: '',
            reorderPoint: '',
            serialNumber: '',
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
      const refs = await warehouseService.uploadItemImages(workspaceId, list);
      const already = rows[i]?.images ?? [];
      setRow(i, { images: [...already, ...refs], uploading: false });

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
      let notEmbedded = 0;
      const converted: string[] = [];
      for (const { i, r } of active) {
        const qty = parseDecimalOr(r.qty, 0);
        if (r.mode !== '__create') {
          // Receiving into an EXISTING stock row: the document states one unit, the row counts
          // in another, and `inbound_doc_receive_to_warehouse` takes a bare number. Left alone,
          // a supplier line of 288 m² adds 288 PIECES to a row of gypsum boards — a valid
          // number, off by the area of a board, that nothing downstream can detect.
          const target = items.find((it) => it.id === r.mode);
          const targetUnit = normalizeUnit(target?.unit);
          const lineUnit = normalizeUnit(r.unit);
          if (target?.product_id && targetUnit && lineUnit && targetUnit !== lineUnit) {
            const uom = await productUomService.getUom(target.product_id).catch(() => null);
            const base = uom ? productUomService.convertToBase(uom, qty, lineUnit) : null;
            // A conversion we cannot make is a hard stop, never a 1:1 fallback.
            if (base == null || normalizeUnit(uom?.base_unit) !== targetUnit) {
              toast({
                title: `Cannot receive "${r.name || 'this line'}"`,
                description:
                  `The document bills in ${lineUnit} but "${target.name}" is counted in ${targetUnit}, ` +
                  'and this product has no conversion between them. Set the packaging on the product ' +
                  '(Fiscal & Customs → Packaging & units), or receive it into a matching stock item.',
                variant: 'destructive',
              });
              setBusy(false);
              return;
            }
            converted.push(`${qty} ${lineUnit} → ${base} ${targetUnit} (${r.name || 'line'})`);
            mappings.push({ item_id: r.mode, quantity: base });
            continue;
          }
          mappings.push({ item_id: r.mode, quantity: qty });
          continue;
        }

        const cost = unitCostOf(i);
        const dimensions = {
          width_mm: r.width ? parseDecimalOr(r.width, NaN) : null,
          length_mm: r.length ? parseDecimalOr(r.length, NaN) : null,
          thickness_mm: r.thickness ? parseDecimalOr(r.thickness, NaN) : null,
        };
        const name = r.name.trim() || 'Item';

        // Everything that must reach AADE goes on the PRODUCT — invoice-builder, the POS and
        // order lines all read it from there when they build a line.
        const num = (v: string) => (v.trim() === '' ? null : Number(v));
        const fiscal = {
          barcode: r.barcode.trim() || null,
          cpv_code: r.cpv.trim() || null,
          taric_code: r.taric || null,
          measurement_unit_code: unitDef(r.unit)?.mydataCode ?? null,
          mydata_vat_category: num(r.vatCategory),
          mydata_income_classification_category: r.incomeCatWholesale || null,
          mydata_income_classification_type: r.incomeTypeWholesale || null,
          mydata_income_classification_category_retail: r.incomeCatRetail || null,
          mydata_income_classification_type_retail: r.incomeTypeRetail || null,
          prices_include_vat: r.pricesIncludeVat,
          markup_percent: num(r.markup),
          warranty: r.warranty.trim() || null,
          product_url: r.productUrl.trim() || null,
          notes: r.notes.trim() || null,
          item_type: r.itemType,
          category_id: r.categoryId || null,
        };

        // An operator-confirmed catalog match wins over creating a duplicate product.
        let productId: string | null = r.match?.id ?? null;
        if (!productId && addToCatalog) {
          const res = await warehouseService.createProductViaIngestCore({
            workspaceId, name,
            sku: r.sku.trim() || null,
            externalSku: r.supplierCode.trim() || null,
            unit: r.unit, cost, costCurrency: doc.currency,
            dimensions, manufacturer: r.manufacturer.trim() || null, grade: r.grade,
            color: r.color.trim() || null, finish: r.finish.trim() || null,
            series: r.series.trim() || null,
            images: r.images,
            itemType: r.itemType === 'service' ? 'service' : 'good',
          });
          productId = res.productId;
          if (!res.embedded) notEmbedded += 1;
          // The ingest core doesn't model the fiscal columns, so they are applied after.
          await warehouseService.updateProductFiscal(productId, fiscal);
          created += 1;
        } else if (productId) {
          // Matched an existing product — still push the fiscal codes the operator just set,
          // otherwise editing them here would silently do nothing.
          await warehouseService.updateProductFiscal(productId, fiscal);
        }

        // "The sale price I typed includes VAT": store the NET list price, because that is
        // what every downstream reader (quote/order lines, invoice-builder, marketplace)
        // assumes. Netting here rather than at read time keeps one meaning for list_price.
        const typed = parseDecimalOr(r.salePrice, NaN);
        const saleVatPct = VAT_PCT_BY_CATEGORY[Number(r.vatCategory)] ?? null;
        const price = r.pricesIncludeVat && Number.isFinite(typed) && saleVatPct != null
          ? r2(typed / (1 + saleVatPct / 100))
          : typed;
        const discount = num(r.defaultDiscount);
        if (productId && (Number.isFinite(price) && price > 0 || discount != null)) {
          await marketplacePricingService.setListPrice(
            workspaceId, productId, Number.isFinite(price) && price > 0 ? price : null,
            { currency: doc.currency, unit: r.unit, discountPercent: discount },
          );
        }

        const itemId = await warehouseService.createItem({
          workspaceId, warehouse_id: targetWh, name,
          sku: r.sku.trim() || undefined, unit: r.unit, product_id: productId, qty_on_hand: 0,
          location: r.location.trim() || undefined,
          reorder_point: r.reorderPoint.trim() ? parseDecimalOr(r.reorderPoint, 0) : undefined,
          serial_number: r.serialNumber.trim() || null,
          width_mm: Number.isFinite(dimensions.width_mm as number) ? dimensions.width_mm : null,
          length_mm: Number.isFinite(dimensions.length_mm as number) ? dimensions.length_mm : null,
          thickness_mm: Number.isFinite(dimensions.thickness_mm as number) ? dimensions.thickness_mm : null,
          weight_kg: r.weight ? parseDecimalOr(r.weight, NaN) : null,
          manufacturer: r.manufacturer.trim() || null,
          supplier_product_code: r.supplierCode.trim() || null,
          image_urls: r.images.map((x) => x.storage_url),
        });
        mappings.push({ item_id: itemId, quantity: qty });
      }

      const n = await inboundService.receiveToWarehouse(doc.id, mappings);

      // The nightly AI pass queues these same lines in `warehouse_pending_items`, and that
      // queue is a second, independent way to turn them into stock. Without settling them
      // here the operator could receive the same supplier line twice — once from this modal
      // and once from the pending card. Best-effort: failing to settle must not undo a
      // receipt that already committed.
      try {
        await inboundService.settlePendingForDocument(
          doc.id,
          active.map(({ i }) => String(lines[i]?.item_description ?? '').trim()).filter(Boolean),
        );
      } catch { /* the receipt stands; the queue entry is cosmetic by comparison */ }
      toast({
        title: `Received ${n} line${n === 1 ? '' : 's'}`,
        description: [
          created > 0 ? `${created} new catalog product${created === 1 ? '' : 's'} created.` : null,
          notEmbedded > 0 ? `${notEmbedded} created without embeddings — the ingest service was unreachable.` : null,
          // Never convert silently: the operator typed one number and a different one was
          // recorded, so they get told which and why.
          converted.length > 0 ? `Converted to stock units — ${converted.join('; ')}.` : null,
        ].filter(Boolean).join(' ') || undefined,
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
        ) : linesFailed ? (
          /* The lines could not be loaded. Rendering 'no goods on this document' here would be a
             lie that ends with the operator receiving nothing and believing there was nothing to
             receive. */
          <div className="space-y-2 py-10 text-center text-sm">
            <p className="font-medium text-destructive">Could not load this document&rsquo;s lines.</p>
            <p className="text-muted-foreground">
              This is a loading failure, not an empty document — do <strong>not</strong> treat it as
              nothing to receive. Close and reopen, or reload the page.
            </p>
          </div>
        ) : receivable.length === 0 ? (
          <NoGoodsState doc={doc} lineCount={lines.length} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer" title="Select / deselect every line">
                  <Checkbox
                    checked={
                      includedCount === 0 ? false
                        : includedCount === receivable.length ? true
                        : 'indeterminate'
                    }
                    onCheckedChange={(v) => toggleAll(v === true)}
                  />
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
                <Checkbox checked={addToCatalog} onCheckedChange={(v) => setAddToCatalog(v === true)} />
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
                    vatCats={vatCats}
                    incomeCats={incomeCats}
                    incomeTypes={incomeTypes}
                    productCategories={productCategories}
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
    manufacturer: '', supplierCode: '', grade: null, color: '', finish: '', series: '',
    markup: '', salePrice: '', match: null,
    images: [], visualMatches: [], matching: false, unitReason: '', uploading: false,
    itemType: 'good', categoryId: '', barcode: '', cpv: '', taric: '',
    vatCategory: '',
    incomeCatWholesale: '', incomeTypeWholesale: '', incomeCatRetail: '', incomeTypeRetail: '',
    defaultDiscount: '', pricesIncludeVat: false, warranty: '', productUrl: '', notes: '',
    location: '', reorderPoint: '', serialNumber: '',
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
  vatCats: RefRow[];
  incomeCats: RefRow[];
  incomeTypes: RefRow[];
  productCategories: { id: string; name: string }[];
  onChange: (patch: Partial<LineRow>) => void;
  onMarkup: (v: string) => void;
  onSalePrice: (v: string) => void;
  onImages: (files: FileList | null) => void;
}> = ({
  index, line, row, currency, cost, items, workspaceId,
  vatCats, incomeCats, incomeTypes, productCategories,
  onChange, onMarkup, onSalePrice, onImages,
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const creating = row.mode === '__create';
  const suffix = unitSuffix(row.unit);

  // Split the stock list into "plausibly this item" and everything else, so the select's
  // first entries are the ones worth considering.
  const { rankedItems, otherItems } = useMemo(() => {
    const desc = line.item_description ?? '';
    const scored = items
      .map((it) => ({ it, score: matchScore(it, desc, row.supplierCode || null) }))
      .sort((a, b) => b.score - a.score);
    return {
      rankedItems: scored.filter((x) => x.score >= MATCH_MIN).slice(0, 5).map((x) => x.it),
      otherItems: scored.filter((x) => x.score < MATCH_MIN).map((x) => x.it),
    };
  }, [items, line.item_description, row.supplierCode]);

  return (
    <div className={`rounded-md border ${row.include ? 'border-border/60' : 'border-border/30 opacity-60'}`}>
      {/* Accordion header — one line per product: include it, what it is, where it goes.
          Fixed-width right-hand columns keep every row's controls on the same vertical line
          however long the supplier's description is. */}
      <div className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 p-2.5">
        <Checkbox
          className="justify-self-center"
          checked={row.include}
          onCheckedChange={(v) => onChange({ include: v === true })}
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
          </div>
        </button>
        <div className="flex items-center gap-1">
          {/* "Where does this quantity go?" belongs on the header row next to the quantity it
              governs — it was a lone full-width select in the body, reading as a stray field.
              Existing items are ranked by how well they match the supplier's description, so
              the plausible ones are at the top instead of buried in an alphabetical list. */}
          <Select value={row.mode} onValueChange={(v) => onChange({ mode: v })} disabled={!row.include}>
            <SelectTrigger className="h-8 w-[188px] text-xs">
              <SelectValue placeholder="Add to…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__create">➕ New stock item</SelectItem>
              {rankedItems.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">Likely match</div>
                  {rankedItems.map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</SelectItem>
                  ))}
                </>
              )}
              {otherItems.length > 0 && (
                <>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">All stock</div>
                  {otherItems.map((it) => (
                    <SelectItem key={it.id} value={it.id}>{it.name}{it.sku ? ` (${it.sku})` : ''}</SelectItem>
                  ))}
                </>
              )}
            </SelectContent>
          </Select>
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

      {row.expanded && row.include && creating && (
        <div className="space-y-4 border-t border-border/40 p-3">
          {/* Ordered by how often an operator touches it: what it is → how big → what it
              costs → how it's classified. Codes and reference fields most items never need
              collapse into "More details", so the common path is four short rows rather than
              a wall of twenty inputs. */}

          <Section title="Identity">
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-6">
              <Field className="sm:col-span-3" label="Description">
                <Input className="h-8 text-xs" value={row.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Product name" />
              </Field>
              <Field label="Code (SKU)">
                <Input className="h-8 text-xs" value={row.sku} onChange={(e) => onChange({ sku: e.target.value })} placeholder="optional" />
              </Field>
              <Field label="Type">
                <Select value={row.itemType} onValueChange={(v) => onChange({ itemType: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="good">Merchandise</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Category">
                <Select value={row.categoryId || NONE_OPT} onValueChange={(v) => onChange({ categoryId: v === NONE_OPT ? '' : v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPT}><span className="text-muted-foreground">No category</span></SelectItem>
                    {productCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field className="sm:col-span-2" label="Manufacturer">
                <Input className="h-8 text-xs" value={row.manufacturer} onChange={(e) => onChange({ manufacturer: e.target.value })} placeholder="maker" />
              </Field>
              <Field className="sm:col-span-2" label="Series / collection">
                <Input className="h-8 text-xs" value={row.series} onChange={(e) => onChange({ series: e.target.value })} placeholder="e.g. AMALFI" />
              </Field>
              <Field className="sm:col-span-2" label="Supplier product code">
                <Input className="h-8 text-xs" value={row.supplierCode} onChange={(e) => onChange({ supplierCode: e.target.value })} placeholder="their code" />
              </Field>
              {/* Read out of the name where possible ("GRIS" → grey). Canonical lowercase
                  English, because these are canonicalized facets used by search + filters. */}
              <Field className="sm:col-span-2" label="Colour">
                <Input className="h-8 text-xs" value={row.color} onChange={(e) => onChange({ color: e.target.value })} placeholder="e.g. grey" />
              </Field>
              <Field className="sm:col-span-2" label="Finish">
                <Input className="h-8 text-xs" value={row.finish} onChange={(e) => onChange({ finish: e.target.value })} placeholder="e.g. matt" />
              </Field>
              <Field className="sm:col-span-2" label="Quality grade">
                <Input className="h-8 text-xs" value={row.grade ?? ''} onChange={(e) => onChange({ grade: e.target.value || null })} placeholder="e.g. A" />
              </Field>
            </div>
          </Section>

          <Section title="Size, weight & placement">
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-6">
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
              <Field label="Shelf location">
                <Input className="h-8 text-xs" value={row.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="A-12" />
              </Field>
              <Field label="Stock threshold">
                <Input className="h-8 text-xs" inputMode="decimal" value={row.reorderPoint}
                  onChange={(e) => onChange({ reorderPoint: e.target.value })} placeholder="0" />
              </Field>
            </div>
          </Section>

          {/* Cost is the document's own arithmetic; the operator only chooses the margin. */}
          <Section title="Pricing">
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-6">
              <Field label={`Purchase / ${suffix}`}>
                <div className="h-8 flex items-center rounded-md border border-border/60 bg-muted/40 px-2 text-xs">
                  {cost != null ? formatMoney(cost, currency) : '—'}
                </div>
              </Field>
              <Field label="Markup %">
                <Input className="h-8 text-xs" inputMode="decimal" value={row.markup} onChange={(e) => onMarkup(e.target.value)} placeholder="25" />
              </Field>
              <Field label={`Sale / ${suffix}`}>
                <Input className="h-8 text-xs" inputMode="decimal" value={row.salePrice} onChange={(e) => onSalePrice(e.target.value)} placeholder="—" />
              </Field>
              <Field label="Sale VAT">
                <VatSelect value={row.vatCategory} options={vatCats} onChange={(v) => onChange({ vatCategory: v })} />
              </Field>
              <Field label={
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help underline decoration-dotted underline-offset-4">Catalog discount %</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="text-xs">
                        Shown on the product&apos;s price card. It does <strong>not</strong> discount a quote or
                        order line — the pricing engine takes that from the customer (their
                        override, or their pricing level).
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              }>
                <Input className="h-8 text-xs" inputMode="decimal" value={row.defaultDiscount}
                  onChange={(e) => onChange({ defaultDiscount: e.target.value })} placeholder="0" />
              </Field>
              <div className="sm:col-span-6 flex flex-wrap items-center justify-between gap-3 pt-0.5">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Checkbox checked={row.pricesIncludeVat} onCheckedChange={(v) => onChange({ pricesIncludeVat: v === true })} />
                  <span>The sale price I typed includes VAT</span>
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {row.grade && <>Grade {row.grade} · </>}
                  {cost != null && line.quantity != null && <>{line.quantity} {suffix} × {formatMoney(cost, currency)} = {formatMoney(Number(line.net_value ?? 0), currency)} net</>}
                </span>
              </div>
            </div>
          </Section>

          <Section title="myDATA classification">
            <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-4">
              <Field label="Income category (wholesale)">
                <RefSelect value={row.incomeCatWholesale} options={incomeCats} onChange={(v) => onChange({ incomeCatWholesale: v })} />
              </Field>
              <Field label="Income type (wholesale)">
                <RefSelect value={row.incomeTypeWholesale} options={incomeTypes} onChange={(v) => onChange({ incomeTypeWholesale: v })} />
              </Field>
              <Field label="Income category (retail)">
                <RefSelect value={row.incomeCatRetail} options={incomeCats} onChange={(v) => onChange({ incomeCatRetail: v })} />
              </Field>
              <Field label="Income type (retail)">
                <RefSelect value={row.incomeTypeRetail} options={incomeTypes} onChange={(v) => onChange({ incomeTypeRetail: v })} />
              </Field>
            </div>
          </Section>

          {/* Codes and reference fields most items never need. */}
          <details className="group rounded-md border border-border/40 px-3 py-2">
            <summary className="cursor-pointer list-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground">
              <span className="group-open:hidden">▸ More details — barcode, customs codes, warranty, link, notes</span>
              <span className="hidden group-open:inline">▾ More details</span>
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-4">
              <Field label="Barcode">
                <Input className="h-8 text-xs" value={row.barcode} onChange={(e) => onChange({ barcode: e.target.value })} />
              </Field>
              <Field label="Serial number">
                <Input className="h-8 text-xs" value={row.serialNumber} onChange={(e) => onChange({ serialNumber: e.target.value })} />
              </Field>
              <Field label="CPV code">
                <Input className="h-8 text-xs" value={row.cpv} onChange={(e) => onChange({ cpv: e.target.value })} />
              </Field>
              <Field label="TARIC code">
                <TaricCombobox value={row.taric} onChange={(code) => onChange({ taric: code })}
                  triggerClassName="h-8 text-xs w-full" />
              </Field>
              <Field label="Warranty">
                <Input className="h-8 text-xs" value={row.warranty} onChange={(e) => onChange({ warranty: e.target.value })} placeholder="e.g. 2 years" />
              </Field>
              <Field className="sm:col-span-3" label="Link">
                <Input className="h-8 text-xs" value={row.productUrl} onChange={(e) => onChange({ productUrl: e.target.value })} placeholder="https://" />
              </Field>
              <Field className="sm:col-span-4" label="Notes">
                <Input className="h-8 text-xs" value={row.notes} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Optional notes…" />
              </Field>
            </div>
          </details>

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
                {row.images.map((img) => (
                  <div key={img.storage_path} className="relative">
                    <img src={img.storage_url} alt="" className="h-10 w-10 rounded object-cover border border-border/50" />
                    <button type="button" title="Remove"
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-background border border-border/60 p-0.5 text-muted-foreground hover:text-destructive"
                      onClick={() => onChange({ images: row.images.filter((x) => x.storage_path !== img.storage_path) })}>
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

/** Sentinel for "no selection" — Radix Select forbids an empty-string item value. */
const NONE_OPT = '__none';

const Field: React.FC<{ label: React.ReactNode; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={`space-y-1 min-w-0 ${className ?? ''}`}>
    <Label className="block truncate text-[11px] text-muted-foreground">{label}</Label>
    {children}
  </div>
);

/** A titled block of fields — the ERP form's sections, in the same order. */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-2">
    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
    {children}
  </div>
);

/** AADE VAT category picker. Shows the rate, since that is what an operator recognises. */
const VatSelect: React.FC<{ value: string; options: RefRow[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <Select value={value || NONE_OPT} onValueChange={(v) => onChange(v === NONE_OPT ? '' : v)}>
    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
    <SelectContent>
      <SelectItem value={NONE_OPT}><span className="text-muted-foreground">—</span></SelectItem>
      {options.map((o) => (
        <SelectItem key={o.code} value={o.code}>
          {o.rate != null ? `${o.rate}%` : o.description}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** Generic `mydata_reference` picker (income classification category / type). */
const RefSelect: React.FC<{ value: string; options: RefRow[]; onChange: (v: string) => void }> = ({ value, options, onChange }) => (
  <Select value={value || NONE_OPT} onValueChange={(v) => onChange(v === NONE_OPT ? '' : v)}>
    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
    <SelectContent className="max-w-[420px]">
      <SelectItem value={NONE_OPT}><span className="text-muted-foreground">—</span></SelectItem>
      {options.map((o) => (
        <SelectItem key={o.code} value={o.code}>
          <span className="truncate">{o.description || o.code}</span>
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
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
