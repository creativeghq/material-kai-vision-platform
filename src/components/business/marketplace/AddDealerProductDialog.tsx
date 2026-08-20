/**
 * dealer/supplier "Add Product" dialog.
 *
 * Creates a product in the dealer's workspace through the shared MIVAA ingest core. The
 * attribute form is category-driven: descriptive facets (whitelist) + spec fields pulled
 * from material_metadata_fields for the chosen category, each with canonical-value
 * autocomplete. Images upload to storage and run the full embedding suite server-side.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, X, Upload, ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { warehouseService, type OperatorCatalogMatch } from '@/services/warehouseService';
import { catalogGrantsService } from '@/services/catalogGrantsService';
import {
  dealerProductsService, type CategoryField, type ManualImageRef,
} from '@/services/dealerProductsService';

const CATEGORY_SUGGESTIONS = [
  'tiles', 'wood', 'stone', 'furniture', 'lighting', 'textiles', 'wallpaper',
  'paint', 'flooring', 'sanitary', 'kitchen', 'outdoor', 'metal', 'glass',
];

export const AddDealerProductDialog: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (productId: string) => void;
}> = ({ open, onOpenChange, onCreated }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [supplyMode, setSupplyMode] = useState<'platform_sold' | 'reference_only'>('platform_sold');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [unit, setUnit] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [sku, setSku] = useState('');

  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [categoryFields, setCategoryFields] = useState<CategoryField[]>([]);
  const [facetOptions, setFacetOptions] = useState<Record<string, string[]>>({});
  const [customKey, setCustomKey] = useState('');

  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  // "We already carry this" — the operator catalog is invisible to a dealer workspace (RLS
  // is workspace-scoped), so without this check a dealer re-creates a product we already
  // stock, with none of our identity, images or embeddings behind it.
  const [dupes, setDupes] = useState<OperatorCatalogMatch[]>([]);
  const [dupeDismissed, setDupeDismissed] = useState(false);
  const [requested, setRequested] = useState<string | null>(null);

  /** Ask the operator for this factory. RLS only lets a dealer insert status='requested',
   *  so this cannot self-grant — the operator approves. */
  const requestAccess = async (factory: string | null) => {
    if (!activeWorkspaceId) return;
    try {
      await catalogGrantsService.request(activeWorkspaceId, factory);
      setRequested(factory ?? '*');
      toast({ title: 'Access requested', description: factory ? `Asked for ${factory}.` : 'Asked for the full catalog.' });
    } catch (err: any) {
      toast({ title: 'Could not send the request', description: err?.message, variant: 'destructive' });
    }
  };
  useEffect(() => {
    if (!open || !activeWorkspaceId || dupeDismissed) { setDupes([]); return; }
    const q = name.trim();
    if (q.length < 3 && !sku.trim()) { setDupes([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      const res = await warehouseService.findOperatorCatalogMatches(activeWorkspaceId, q, { sku: sku.trim() || null });
      if (live) setDupes(res);
    }, 400);
    return () => { live = false; clearTimeout(t); };
  }, [open, activeWorkspaceId, name, sku, dupeDismissed]);

  useEffect(() => {
    if (open) {
      setName(''); setDescription(''); setCategory(''); setSupplyMode('platform_sold');
      setPrice(''); setCurrency('EUR'); setUnit(''); setDimensions(''); setSku('');
      setAttrs({}); setCategoryFields([]); setFacetOptions({}); setCustomKey(''); setFiles([]);
      setDupes([]); setDupeDismissed(false);
    }
  }, [open]);

  // Load category spec fields + facet autocomplete when the category changes.
  useEffect(() => {
    if (!category) { setCategoryFields([]); return; }
    let cancelled = false;
    (async () => {
      const fields = await dealerProductsService.loadCategoryFields(category);
      if (cancelled) return;
      setCategoryFields(fields);
    })();
    return () => { cancelled = true; };
  }, [category]);

  // The full set of attribute keys shown: everything the registry says applies to this
  // category (global + category-scoped) plus whatever custom keys the user added.
  //
  // There used to be a hardcoded COMMON_FACET_KEYS list here, unioned on top. It was a
  // second copy of registry knowledge that drifted from it: it named `finish` and `style`
  // as universal when the registry scopes them to 8 and 2 categories, and it omitted
  // `application_areas`, which the registry marks global and canonicalizable. One registry,
  // one read — #347 phase 3.4.
  const attrKeys = useMemo(() => {
    const keys = new Set<string>(categoryFields.map((f) => f.field_name));
    Object.keys(attrs).forEach((k) => keys.add(k));
    return Array.from(keys);
  }, [categoryFields, attrs]);

  // Lazy-load canonical-value autocomplete for the facets the registry marks canonicalize.
  useEffect(() => {
    categoryFields.filter((f) => f.canonicalize).forEach(async (f) => {
      if (facetOptions[f.field_name]) return;
      const vals = await dealerProductsService.loadFacetValues(f.field_name);
      if (vals.length) setFacetOptions((prev) => ({ ...prev, [f.field_name]: vals }));
    });
  }, [open, categoryFields]); // eslint-disable-line react-hooks/exhaustive-deps

  const labelFor = (key: string) =>
    categoryFields.find((f) => f.field_name === key)?.label
    || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const setAttr = (k: string, v: string) => setAttrs((prev) => ({ ...prev, [k]: v }));
  const removeAttr = (k: string) => setAttrs((prev) => { const n = { ...prev }; delete n[k]; return n; });

  const addCustom = () => {
    const k = customKey.trim().toLowerCase().replace(/\s+/g, '_');
    if (!k) return;
    setAttrs((prev) => ({ ...prev, [k]: '' }));
    setCustomKey('');
  };

  const handleSave = async () => {
    if (!activeWorkspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      // Upload images first.
      const images: ManualImageRef[] = [];
      for (let i = 0; i < files.length; i++) {
        images.push(await dealerProductsService.uploadImage(activeWorkspaceId, files[i], i));
      }

      // Build dynamic metadata from the attribute rows (skip empties). available_colors
      // accepts a comma list → array (matches the catalog metadata shape).
      const metadata: Record<string, any> = {};
      for (const [k, v] of Object.entries(attrs)) {
        const val = (v ?? '').trim();
        if (!val) continue;
        metadata[k] = (k === 'available_colors' || k === 'colors' || k === 'available_sizes')
          ? val.split(',').map((s) => s.trim()).filter(Boolean)
          : val;
      }

      const productId = await dealerProductsService.createManualProduct(activeWorkspaceId, {
        name: name.trim(),
        description: description.trim(),
        material_category: category || undefined,
        supply_mode: supplyMode,
        price: price ? Number(price) : null,
        currency,
        unit: unit || undefined,
        dimensions: dimensions || undefined,
        external_sku: sku || undefined,
        metadata,
        images,
      });

      toast({ title: 'Product created', description: 'Embeddings are generating in the background.' });
      onCreated?.(productId);
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: 'Create failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>

        <div className="space-y-4">
          {/* Basics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Calacatta Lux" />
              {dupes.length > 0 && (
                <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium">
                      {dupes[0].hasCatalogAccess
                        ? 'This is already in the catalog you sell from — add it from there instead of creating a copy. You get their images and specs, and their updates.'
                        : 'The operator already carries this product. Request access instead of creating a duplicate.'}
                    </p>
                    <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={() => { setDupeDismissed(true); setDupes([]); }}>
                      It&apos;s different
                    </button>
                  </div>
                  {!dupes[0].hasCatalogAccess && (
                    <Button type="button" size="sm" variant="outline" className="h-7"
                      disabled={requested === (dupes[0].factoryName ?? '*')}
                      onClick={() => requestAccess(dupes[0].factoryName)}>
                      <span className="text-xs">
                        {requested === (dupes[0].factoryName ?? '*')
                          ? 'Request sent'
                          : `Request access${dupes[0].factoryName ? ` to ${dupes[0].factoryName}` : ''}`}
                      </span>
                    </Button>
                  )}
                  {dupes.slice(0, 3).map((d) => (
                    <div key={d.id} className="flex items-center gap-2">
                      {d.image_url
                        ? <img src={d.image_url} alt="" className="h-8 w-8 rounded object-cover" />
                        : <span className="h-8 w-8 rounded bg-muted" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs">{d.name}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {[d.sku, d.factoryName].filter(Boolean).join(' · ') || 'no SKU'}
                          {d.score != null && ` · ${Math.round(d.score * 100)}% match`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Input list="dealer-cat-suggestions" value={category} onChange={(e) => setCategory(e.target.value.toLowerCase())} placeholder="tiles, wood…" />
              <datalist id="dealer-cat-suggestions">
                {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label>SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="optional" />
            </div>
            <div className="space-y-1">
              <Label>Price</Label>
              <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['EUR', 'USD', 'GBP'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="m², pcs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Dimensions</Label>
              <Input value={dimensions} onChange={(e) => setDimensions(e.target.value)} placeholder="60×60 cm" />
            </div>
            <div className="space-y-1">
              <Label>Supply mode</Label>
              <Select value={supplyMode} onValueChange={(v: any) => setSupplyMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform_sold">Platform-sold</SelectItem>
                  <SelectItem value="reference_only">Reference only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          {/* Dynamic attributes */}
          <div className="space-y-2 rounded-md border border-border/60 p-3">
            <div className="text-sm font-medium">
              Attributes {category && <span className="text-xs text-muted-foreground">— for {category}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {attrKeys.map((k) => (
                <div key={k} className="space-y-1">
                  <Label className="text-xs flex items-center justify-between">
                    {labelFor(k)}
                    {!categoryFields.some((f) => f.field_name === k) && (
                      <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => removeAttr(k)}><X className="h-3 w-3" /></button>
                    )}
                  </Label>
                  <Input
                    className="h-8 text-xs"
                    list={facetOptions[k] ? `facet-${k}` : undefined}
                    value={attrs[k] ?? ''}
                    onChange={(e) => setAttr(k, e.target.value)}
                    placeholder={k === 'available_colors' ? 'comma,separated' : ''}
                  />
                  {facetOptions[k] && (
                    <datalist id={`facet-${k}`}>
                      {facetOptions[k].map((v) => <option key={v} value={v} />)}
                    </datalist>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Input className="h-8 text-xs" value={customKey} onChange={(e) => setCustomKey(e.target.value)}
                placeholder="add attribute key…" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} />
              <Button type="button" size="sm" variant="outline" onClick={addCustom}><Plus className="h-3 w-3" /></Button>
            </div>
          </div>

          {/* Images */}
          <div className="space-y-2">
            <Label className="text-sm">Images</Label>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative h-16 w-16 rounded-md overflow-hidden border border-border/60">
                  <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                  <button type="button" className="absolute top-0 right-0 bg-black/60 p-0.5" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              ))}
              <label className="h-16 w-16 rounded-md border border-dashed border-border/60 flex items-center justify-center cursor-pointer hover:bg-muted/30">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
              </label>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <ImageIcon className="h-3 w-3" /> Images run the full visual-search embedding suite, same as catalog products.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} Create product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
