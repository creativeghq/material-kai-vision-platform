import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Loader2, Search, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { MoneyInput } from '@/components/core/ui/money-input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Checkbox } from '@/components/core/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/core/ui/radio-group';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  embedKeysService, normalizeOriginList, listScopeCategories, listScopeBlueprints, embedReadiness,
  listEmbedProducts, originListAllows, productCutouts,
  MAX_RATE_LIMIT_PER_MINUTE, DEFAULT_GENERATION_DAILY_CAP, MAX_GENERATION_DAILY_CAP,
  DEFAULT_DAILY_USD_CAP, MAX_DAILY_USD_CAP,
  type EmbedKey, type EmbedScopeType, type EmbedScopeOption, type EmbedBlueprintOption,
  type EmbedProductOption, type EmbedReadiness, type ProductCutout,
} from '@/services/embedKeysService';
import { storefrontService } from '@/modules/finance/services/storefrontService';
import { visualizerService, type VisualizerScene } from '@/services/visualizerService';
import { blueprintsService } from '@/services/blueprintsService';
import { WastageRatesCard } from '@/components/features/visualizer/WastageRatesCard';
import { formatMoney } from '@/utils/decimal';
import {
  EMBED_WIDGETS, widgetDef, widgetsForKey, widgetReadiness, widgetSnippet, keyKindForWidget,
  type EmbedWidgetId, type WidgetOptions,
} from './embedWidgets';
import { EmbedWidgetPreview } from './EmbedWidgetPreview';

type Step = 'widget' | 'content' | 'site' | 'code';

const READINESS_BADGE = {
  ready: { variant: 'success', label: 'Ready' },
  needs_setup: { variant: 'warning', label: 'Needs setup' },
  missing: { variant: 'neutral', label: 'Not available yet' },
} as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** Set to get code for a key that already exists; unset to create a new widget and its key. */
  existingKey?: EmbedKey | null;
  onSaved: () => void;
}

const emptyForm = () => ({
  name: '', origins: '', allowAny: false, rate: 60,
  scopeType: 'all' as EmbedScopeType, scopeValues: [] as string[],
  allowGeneration: false, dailyCap: DEFAULT_GENERATION_DAILY_CAP,
  chat: false, usdCap: DEFAULT_DAILY_USD_CAP, placeAi: true,
});

export const EmbedWidgetDialog: React.FC<Props> = ({ open, onOpenChange, workspaceId, existingKey, onSaved }) => {
  const { toast } = useToast();
  const { workspaceRole } = useWorkspace();
  const appOrigin = window.location.origin;

  const [step, setStep] = useState<Step>('widget');
  const [widget, setWidget] = useState<EmbedWidgetId | null>(null);
  const [options, setOptions] = useState<WidgetOptions>({});
  const [form, setForm] = useState(emptyForm);
  const [key, setKey] = useState<EmbedKey | null>(existingKey ?? null);
  const [saving, setSaving] = useState(false);

  const [readiness, setReadiness] = useState<EmbedReadiness | null>(null);
  const [products, setProducts] = useState<EmbedProductOption[] | null>(null);
  const [blueprints, setBlueprints] = useState<EmbedBlueprintOption[] | null>(null);
  const [scenes, setScenes] = useState<VisualizerScene[] | null>(null);
  const [categories, setCategories] = useState<EmbedScopeOption[]>([]);
  const [productTerm, setProductTerm] = useState('');
  const [cutouts, setCutouts] = useState<ProductCutout[] | null>(null);
  const [cutting, setCutting] = useState(false);

  const creating = !existingKey;
  const servable = useMemo(
    () => (existingKey ? widgetsForKey(existingKey) : EMBED_WIDGETS.map((w) => w.id)),
    [existingKey],
  );

  useEffect(() => {
    if (!open) return;
    setStep('widget');
    setWidget(null);
    setOptions({});
    setForm(emptyForm());
    setKey(existingKey ?? null);
    setProductTerm('');
    setProducts(null);
    setBlueprints(null);
    setScenes(null);
    setCategories([]);
    setReadiness(null);
    embedReadiness(workspaceId).then(setReadiness).catch(() => setReadiness(null));
  }, [open, existingKey, workspaceId]);

  const fail = useCallback((title: string, err: unknown) => {
    toast({ title, description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
  }, [toast]);

  useEffect(() => {
    if (!open || step !== 'content' || !widget) return;
    if (widget === 'configurator' && blueprints === null) {
      listScopeBlueprints(workspaceId).then(setBlueprints).catch((e) => { setBlueprints([]); fail('Could not load blueprints', e); });
    }
    if (widget === 'visualizer' && scenes === null) {
      visualizerService.listScenes(workspaceId).then(setScenes).catch((e) => { setScenes([]); fail('Could not load room photos', e); });
    }
    if (widget === 'builder' && form.scopeType === 'categories' && categories.length === 0) {
      listScopeCategories().then(setCategories).catch(() => setCategories([]));
    }
  }, [open, step, widget, workspaceId, blueprints, scenes, form.scopeType, categories.length, fail]);

  const productScope = useMemo(
    () => (existingKey && existingKey.scope_type !== 'all'
      ? { type: existingKey.scope_type as EmbedScopeType, values: existingKey.scope_values ?? [] }
      : null),
    [existingKey],
  );

  useEffect(() => {
    if (!open || step !== 'content' || !widget || !['builder', 'product', 'place', 'visualizer'].includes(widget)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      listEmbedProducts(workspaceId, productTerm, productScope)
        .then((rows) => { if (!cancelled) setProducts(rows); })
        .catch((e) => { if (!cancelled) { setProducts([]); fail('Could not load products', e); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, step, widget, workspaceId, productTerm, productScope, fail]);

  const scopedBlueprints = useMemo(() => {
    if (!blueprints) return null;
    if (existingKey?.scope_type === 'blueprints') return blueprints.filter((b) => existingKey.scope_values?.includes(b.id));
    return blueprints;
  }, [blueprints, existingKey]);

  useEffect(() => {
    if (widget === 'configurator' && !options.blueprintId && scopedBlueprints?.length === 1 && scopedBlueprints[0].published) {
      setOptions((o) => ({ ...o, blueprintId: scopedBlueprints[0].id }));
    }
  }, [widget, options.blueprintId, scopedBlueprints]);

  const pickWidget = (id: EmbedWidgetId) => {
    setWidget(id);
    setOptions({});
    setForm((f) => ({
      ...f,
      name: !f.name || EMBED_WIDGETS.some((w) => w.title === f.name) ? widgetDef(id).title : f.name,
    }));
    const nothingToPick = !creating && (id === 'builder' || id === 'assistant');
    setStep(nothingToPick ? 'code' : 'content');
  };

  const togglePublished = async (p: EmbedProductOption) => {
    try {
      await storefrontService.setPublished(workspaceId, p.product_id, !p.storefront_published);
      setProducts((ps) => ps?.map((x) => x.product_id === p.product_id ? { ...x, storefront_published: !x.storefront_published } : x) ?? null);
      if (p.storefront_published && options.productId === p.product_id) setOptions((o) => ({ ...o, productId: null }));
      embedReadiness(workspaceId).then(setReadiness).catch(() => undefined);
    } catch (e) { fail('Could not change publishing', e); }
  };

  const publishBlueprint = async (b: EmbedBlueprintOption) => {
    try {
      await blueprintsService.update(b.id, { is_embed_published: !b.published });
      setBlueprints((bs) => bs?.map((x) => x.id === b.id ? { ...x, published: !x.published } : x) ?? null);
      if (b.published && options.blueprintId === b.id) setOptions((o) => ({ ...o, blueprintId: null }));
    } catch (e) { fail('Could not change publishing', e); }
  };

  const shareScene = async (s: VisualizerScene) => {
    try {
      await visualizerService.setSceneEmbeddable(s.id, !s.is_embeddable);
      setScenes((ss) => ss?.map((x) => x.id === s.id ? { ...x, is_embeddable: !x.is_embeddable } : x) ?? null);
      if (s.is_embeddable && options.sceneId === s.id) setOptions((o) => ({ ...o, sceneId: null }));
    } catch (e) { fail('Could not change sharing', e); }
  };

  const contentProblem = (): string | null => {
    if (widget === 'product' && !options.productId) return 'Pick the product this widget shows.';
    if (widget === 'configurator' && !options.blueprintId) return 'Pick the blueprint visitors build from.';
    if (creating && widget === 'builder' && form.scopeType !== 'all' && form.scopeValues.length === 0) {
      return form.scopeType === 'categories' ? 'Pick at least one category.' : 'Pick at least one product.';
    }
    return null;
  };

  const goNextFromContent = () => {
    const problem = contentProblem();
    if (problem) { toast({ title: problem, variant: 'destructive' }); return; }
    setStep(creating ? 'site' : 'code');
  };

  const handleCreate = async () => {
    if (!widget) return;
    const typed = normalizeOriginList(form.origins);
    if (!form.name.trim()) { toast({ title: 'Name the widget', variant: 'destructive' }); return; }
    if (!form.allowAny && typed.length === 0) {
      toast({ title: 'Add at least one website', description: 'The widget only loads on the websites listed here.', variant: 'destructive' });
      return;
    }
    const origins = form.allowAny ? ['*'] : (typed.includes(appOrigin) ? typed : [...typed, appOrigin]);
    const kind = keyKindForWidget(widget);
    const scope: { scope_type: EmbedScopeType; scope_values: string[] } =
      widget === 'configurator' ? { scope_type: 'blueprints', scope_values: [options.blueprintId as string] }
        : widget === 'builder' ? { scope_type: form.scopeType, scope_values: form.scopeValues }
          : widget === 'place' && options.productIds?.length ? { scope_type: 'products', scope_values: options.productIds }
          : { scope_type: 'all', scope_values: [] };
    setSaving(true);
    try {
      const created = await embedKeysService.create(workspaceId, {
        key_name: form.name,
        key_kind: kind,
        tools_enabled: kind === 'tools',
        chat_enabled: widget === 'assistant' && form.chat,
        paid_tools_enabled: widget === 'place' && form.placeAi,
        daily_usd_cap: form.usdCap,
        allowed_origins: origins,
        rate_limit_per_minute: form.rate,
        ...scope,
        allow_generation: widget === 'builder' && form.allowGeneration,
        generation_daily_cap: form.dailyCap,
      });
      setKey(created);
      setStep('code');
      onSaved();
    } catch (e) { fail('Could not create the widget', e); } finally { setSaving(false); }
  };

  const allowPreviewHere = async () => {
    if (!key) return;
    const next = [...(key.allowed_origins ?? []), appOrigin];
    try {
      await embedKeysService.update(key.id, { allowed_origins: next });
      setKey({ ...key, allowed_origins: next });
      onSaved();
    } catch (e) { fail('Could not update the key', e); }
  };

  const copySnippet = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: 'Code copied' });
    } catch { toast({ title: 'Could not copy', variant: 'destructive' }); }
  };

  const publishedProducts = (products ?? []).filter((p) => p.storefront_published);
  const cutoutTargets = options.productIds?.length ? options.productIds : publishedProducts.map((p) => p.product_id);
  const cutoutKey = cutoutTargets.join(',');

  useEffect(() => {
    if (!open || step !== 'content' || widget !== 'place' || !cutoutKey) { setCutouts(null); return; }
    let cancelled = false;
    productCutouts(workspaceId, cutoutKey.split(','), 'status')
      .then((r) => { if (!cancelled) setCutouts(r.cutouts); })
      .catch(() => { if (!cancelled) setCutouts(null); });
    return () => { cancelled = true; };
  }, [open, step, widget, workspaceId, cutoutKey]);

  const prepareCutouts = async () => {
    setCutting(true);
    try {
      for (let round = 0; round < 12; round++) {
        const r = await productCutouts(workspaceId, cutoutTargets, 'prepare');
        setCutouts(r.cutouts);
        if (!r.cutouts.some((c) => c.status === 'pending')) break;
      }
    } catch (e) { fail('Could not make the cut-outs', e); } finally { setCutting(false); }
  };

  const renderProductList = (mode: 'publish' | 'pick-one' | 'pick-optional' | 'pick-many') => (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Search your products…" value={productTerm} onChange={(e) => setProductTerm(e.target.value)} />
      </div>
      <div className="max-h-64 divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
        {products === null ? (
          <p className="p-3 text-sm text-muted-foreground">Loading products…</p>
        ) : products.length === 0 && productTerm.trim() ? (
          <p className="p-3 text-sm text-muted-foreground">No products match “{productTerm}”.</p>
        ) : products.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            {productScope
              ? 'None of the products this key covers has a list price yet.'
              : 'No priced products yet. A product appears here once it has a list price.'}{' '}
            <Link to="/finance?tab=settings" className="text-primary underline underline-offset-2">Open the online store settings</Link>
          </p>
        ) : products.map((p) => {
          const selected = options.productId === p.product_id;
          return (
            <div key={p.product_id} className={`flex items-center gap-3 px-3 py-2 ${selected ? 'bg-primary/[0.08]' : ''}`}>
              {mode === 'pick-many' && (
                <Checkbox
                  aria-label={`Offer ${p.name}`}
                  checked={!!options.productIds?.includes(p.product_id)}
                  disabled={!p.storefront_published}
                  onCheckedChange={() => setOptions((o) => {
                    const ids = o.productIds ?? [];
                    return { ...o, productIds: ids.includes(p.product_id) ? ids.filter((v) => v !== p.product_id) : [...ids, p.product_id] };
                  })}
                />
              )}
              {(mode === 'pick-one' || mode === 'pick-optional') && (
                <input
                  type="radio"
                  name="embed-product"
                  aria-label={`Show ${p.name}`}
                  checked={selected}
                  disabled={!p.storefront_published}
                  onChange={() => setOptions((o) => ({ ...o, productId: p.product_id }))}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.name}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {p.price != null ? formatMoney(p.price, p.currency) : '—'}
                  {!p.storefront_published && mode !== 'publish' ? ' · publish it to use it here' : ''}
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                Published
                <Switch checked={p.storefront_published} onCheckedChange={() => togglePublished(p)} aria-label={`Publish ${p.name}`} />
              </label>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        {readiness ? `${readiness.publishedProducts} published in total. ` : ''}Showing up to 50 — search to find others. Published products are also listed in your online store — it is one switch for both.
        {mode === 'pick-optional' && options.productId && (
          <> <button type="button" className="text-primary underline underline-offset-2" onClick={() => setOptions((o) => ({ ...o, productId: null }))}>Let the visitor choose instead</button></>
        )}
      </p>
    </div>
  );

  const renderBuilderScope = () => (
    <div className="space-y-2">
      <Label>Which products it may show</Label>
      <RadioGroup
        className="space-y-1.5"
        value={form.scopeType}
        onValueChange={(v) => setForm((f) => ({ ...f, scopeType: v as EmbedScopeType, scopeValues: [] }))}
      >
        {([
          ['all', 'Everything published'],
          ['categories', 'Only certain categories'],
          ['products', 'Only specific products'],
        ] as [EmbedScopeType, string][]).map(([value, label]) => (
          <label key={value} className="flex cursor-pointer items-center gap-3 text-sm">
            <RadioGroupItem value={value} />{label}
          </label>
        ))}
      </RadioGroup>
      {form.scopeType === 'categories' && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-hairline p-3">
          {categories.length === 0 ? <p className="text-xs text-muted-foreground">Loading categories…</p> : categories.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.scopeValues.includes(c.id)}
                onCheckedChange={() => setForm((f) => ({
                  ...f,
                  scopeValues: f.scopeValues.includes(c.id) ? f.scopeValues.filter((v) => v !== c.id) : [...f.scopeValues, c.id],
                }))}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
      {form.scopeType === 'products' && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-hairline p-3">
          {publishedProducts.length === 0 ? <p className="text-xs text-muted-foreground">Publish products above first, or search for them.</p> : publishedProducts.map((p) => (
            <label key={p.product_id} className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.scopeValues.includes(p.product_id)}
                onCheckedChange={() => setForm((f) => ({
                  ...f,
                  scopeValues: f.scopeValues.includes(p.product_id) ? f.scopeValues.filter((v) => v !== p.product_id) : [...f.scopeValues, p.product_id],
                }))}
              />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const renderScenes = () => (
    <div className="space-y-2">
      <Label>Room photo</Label>
      {scenes === null ? <p className="text-sm text-muted-foreground">Loading room photos…</p> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setOptions((o) => ({ ...o, sceneId: null }))}
            className={`rounded-md border p-3 text-left text-sm ${!options.sceneId ? 'border-primary' : 'border-hairline'}`}
          >
            Let the visitor choose
            <span className="block text-xs text-muted-foreground">From every photo shared below</span>
          </button>
          {scenes.map((s) => {
            const own = s.workspace_id !== null;
            const usable = !own || s.is_embeddable;
            return (
              <div key={s.id} className={`overflow-hidden rounded-md border ${options.sceneId === s.id ? 'border-primary' : 'border-hairline'}`}>
                <button
                  type="button"
                  disabled={!usable}
                  onClick={() => setOptions((o) => ({ ...o, sceneId: s.id }))}
                  className="block w-full text-left disabled:opacity-50"
                >
                  <img src={s.imageUrl} alt={s.name} className="aspect-video w-full object-cover" loading="lazy" />
                  <span className="block truncate px-2 pt-1.5 text-xs">{s.name}</span>
                </button>
                <div className="px-2 pb-1.5 text-xs text-muted-foreground">
                  {own ? (
                    <label className="flex items-center justify-between gap-2">
                      Shared on websites
                      <Switch checked={s.is_embeddable} onCheckedChange={() => shareScene(s)} aria-label={`Share ${s.name}`} />
                    </label>
                  ) : 'Platform photo'}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Your own photos stay private until you share them — they are often a customer’s home.{' '}
        <Link to="/visualizer" className="text-primary underline underline-offset-2">Add or mark up room photos</Link>
      </p>
    </div>
  );

  const renderBlueprints = () => (
    <div className="space-y-2">
      <Label>Blueprint</Label>
      {scopedBlueprints === null ? <p className="text-sm text-muted-foreground">Loading blueprints…</p>
        : scopedBlueprints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No blueprints yet. <Link to="/blueprints" className="text-primary underline underline-offset-2">Build one</Link>, then come back here.
          </p>
        ) : (
          <div className="divide-y divide-hairline rounded-md border border-hairline">
            {scopedBlueprints.map((b) => (
              <div key={b.id} className={`flex items-center gap-3 px-3 py-2 ${options.blueprintId === b.id ? 'bg-primary/[0.08]' : ''}`}>
                <input
                  type="radio"
                  name="embed-blueprint"
                  aria-label={`Use ${b.label}`}
                  checked={options.blueprintId === b.id}
                  disabled={!b.published}
                  onChange={() => setOptions((o) => ({ ...o, blueprintId: b.id }))}
                />
                <span className="min-w-0 flex-1 truncate text-sm">{b.label}</span>
                <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  Published
                  <Switch checked={b.published} onCheckedChange={() => publishBlueprint(b)} aria-label={`Publish ${b.label}`} />
                </label>
              </div>
            ))}
          </div>
        )}
    </div>
  );

  const renderContent = () => {
    switch (widget) {
      case 'builder':
        return (
          <div className="space-y-5">
            <div className="space-y-2"><Label>Products on your website</Label>{renderProductList('publish')}</div>
            {renderBuilderScope()}
          </div>
        );
      case 'product':
        return <div className="space-y-2"><Label>The product it shows</Label>{renderProductList('pick-one')}</div>;
      case 'place':
        return (
          <div className="space-y-2">
            <Label>Products visitors can place</Label>
            <p className="text-xs text-muted-foreground">
              Tick the ones to offer, or tick none to offer every published product with a picture. Products photographed
              on a plain background are cut out automatically; others are shown as they are.
            </p>
            {renderProductList('pick-many')}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline p-3">
              <div className="space-y-0.5">
                <Label>Clean cut-outs</Label>
                <p className="text-xs text-muted-foreground">
                  {cutoutTargets.length === 0
                    ? 'Publish or pick products first.'
                    : `${cutouts?.filter((c) => c.status === 'ready').length ?? 0} of ${cutoutTargets.length} ready`
                      + (cutouts?.some((c) => c.status === 'failed') ? ` · ${cutouts.filter((c) => c.status === 'failed').length} failed` : '')
                      + '. AI removes each photo’s background once, so pieces sit cleanly in any room. 1 credit per product.'}
                </p>
              </div>
              <Button size="sm" variant="outline" disabled={cutting || cutoutTargets.length === 0} onClick={() => void prepareCutouts()}>
                {cutting && <Loader2 className="animate-spin" />}{cutting ? 'Making cut-outs…' : 'Prepare cut-outs'}
              </Button>
            </div>
            <div className="space-y-2 rounded-md border border-hairline p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="embed-place-ai" className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />Place it for me</Label>
                  <p className="text-xs text-muted-foreground">
                    The visitor taps one button and AI reads their room once: where the floor is and how big things are. Pieces then
                    stand on the floor at their real size and shrink as they are moved back. A few US cents per room (an estimate until we
                    have measured real rooms), from the daily budget below, triggered by your visitors. The photo is not stored.
                  </p>
                </div>
                <Switch id="embed-place-ai" checked={form.placeAi} onCheckedChange={(v) => setForm((f) => ({ ...f, placeAi: v }))} />
              </div>
              {form.placeAi && (
                <div className="space-y-1.5">
                  <Label htmlFor="embed-place-usd">Most per day (USD)</Label>
                  <MoneyInput
                    id="embed-place-usd"
                    value={form.usdCap}
                    onValueChange={(v) => setForm((f) => ({ ...f, usdCap: Math.min(MAX_DAILY_USD_CAP, Math.max(0, v ?? 0)) }))}
                  />
                </div>
              )}
            </div>
            {!!options.productIds?.length && (
              <p className="text-xs text-muted-foreground">
                {options.productIds.length} picked.{' '}
                <button type="button" className="text-primary underline underline-offset-2" onClick={() => setOptions((o) => ({ ...o, productIds: [] }))}>
                  Offer all instead
                </button>
              </p>
            )}
          </div>
        );
      case 'visualizer':
        return (
          <div className="space-y-5">
            {renderScenes()}
            <div className="space-y-2">
              <Label>Products visitors can lay</Label>
              <p className="text-xs text-muted-foreground">Every published product with a size and a photo. Pick one to open the widget on it.</p>
              {renderProductList('pick-optional')}
            </div>
            <WastageRatesCard
              workspaceId={workspaceId}
              canEdit={workspaceRole === 'admin' || workspaceRole === 'owner'}
              onChanged={() => embedReadiness(workspaceId).then(setReadiness).catch(() => undefined)}
            />
          </div>
        );
      case 'configurator':
        return renderBlueprints();
      case 'assistant':
        return (
          <div className="space-y-3 rounded-md border border-hairline p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5">
                <Label htmlFor="embed-chat">Written answers</Label>
                <p className="text-xs text-muted-foreground">
                  Lets a visitor ask for a result to be explained in plain words. The calculators are free and always work; each answer costs a fraction of a cent and is triggered by your visitors.
                </p>
              </div>
              <Switch id="embed-chat" checked={form.chat} onCheckedChange={(v) => setForm((f) => ({ ...f, chat: v }))} />
            </div>
            {form.chat && (
              <div className="space-y-1.5">
                <Label htmlFor="embed-usd">Most per day (USD)</Label>
                <MoneyInput
                  id="embed-usd"
                  value={form.usdCap}
                  onValueChange={(v) => setForm((f) => ({ ...f, usdCap: Math.min(MAX_DAILY_USD_CAP, Math.max(0, v ?? 0)) }))}
                />
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const renderSite = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="embed-name">Name</Label>
        <Input id="embed-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="embed-origins">Websites it may run on</Label>
        <Textarea
          id="embed-origins"
          rows={3}
          placeholder={'https://www.acme.com\nhttps://*.acme.com'}
          value={form.origins}
          disabled={form.allowAny}
          onChange={(e) => setForm((f) => ({ ...f, origins: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          One per line; <code className="font-mono">https://*.acme.com</code> covers every subdomain. On Shopify, add your
          <code className="font-mono"> .myshopify.com</code> address too. This app is added as well, so the preview works.
        </p>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-hairline p-3">
        <Switch checked={form.allowAny} onCheckedChange={(v) => setForm((f) => ({ ...f, allowAny: v }))} />
        <span className="space-y-0.5">
          <span className="block text-sm">Allow any website</span>
          <span className="block text-xs text-muted-foreground">Only for something you want partners to embed anywhere.</span>
        </span>
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="embed-rate">Requests per minute</Label>
        <Input
          id="embed-rate"
          type="number"
          min={1}
          max={MAX_RATE_LIMIT_PER_MINUTE}
          value={form.rate}
          onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))}
        />
      </div>
      {widget === 'builder' && (
        <div className="space-y-2 rounded-md border border-hairline p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-0.5">
              <Label htmlFor="embed-generation" className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" />AI impressions</Label>
              <p className="text-xs text-muted-foreground">
                When a visitor asks for something you don’t stock, draw a picture of it. Each one costs credits from this workspace.
              </p>
            </div>
            <Switch id="embed-generation" checked={form.allowGeneration} onCheckedChange={(v) => setForm((f) => ({ ...f, allowGeneration: v }))} />
          </div>
          {form.allowGeneration && (
            <div className="space-y-1.5">
              <Label htmlFor="embed-cap">Most per day</Label>
              <Input
                id="embed-cap"
                type="number"
                min={1}
                max={MAX_GENERATION_DAILY_CAP}
                value={form.dailyCap}
                onChange={(e) => setForm((f) => ({ ...f, dailyCap: Number(e.target.value) }))}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderCode = () => {
    if (!key || !widget) return null;
    const snippet = widgetSnippet(appOrigin, key.api_key, widget, options);
    const previewAllowed = originListAllows(key.allowed_origins, appOrigin);
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Preview</Label>
          {previewAllowed ? (
            <EmbedWidgetPreview apiKey={key.api_key} widget={widget} options={options} />
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline p-3 text-sm">
              <span className="text-muted-foreground">This key only runs on your own websites, so it cannot preview here.</span>
              <Button size="sm" variant="outline" onClick={allowPreviewHere}>Allow preview here</Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="embed-snippet">Code to paste into your website</Label>
          <Textarea id="embed-snippet" readOnly rows={4} value={snippet} className="font-mono text-xs" />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => copySnippet(snippet)}><Copy />Copy code</Button>
            <a href="/documentation/api-embed.html#shopify" target="_blank" rel="noreferrer" className="text-xs text-primary underline underline-offset-2">
              Where to paste it on Shopify or WordPress
            </a>
          </div>
        </div>
      </div>
    );
  };

  const stepTitle: Record<Step, string> = {
    widget: creating ? 'Add a widget to your website' : `Get code — ${existingKey?.key_name ?? ''}`,
    content: widget ? `${widgetDef(widget).title}: what it shows` : '',
    site: 'Where it runs',
    code: 'Preview and code',
  };

  const back = () => {
    if (step === 'content') setStep('widget');
    else if (step === 'site') setStep('content');
    else if (step === 'code' && creating) onOpenChange(false);
    else setStep(widget && (widget === 'builder' || widget === 'assistant') ? 'widget' : 'content');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stepTitle[step]}</DialogTitle>
          {step === 'widget' && (
            <DialogDescription>
              {creating
                ? 'Pick what you want on your website. Each widget gets its own key, limited to the websites you list.'
                : 'Pick the widget to paste. Only the ones this key can serve are offered.'}
            </DialogDescription>
          )}
        </DialogHeader>

        {step === 'widget' && (
          <div className="grid gap-2 sm:grid-cols-2">
            {EMBED_WIDGETS.map((w) => {
              const verdict = widgetReadiness(w.id, readiness);
              const allowed = servable.includes(w.id);
              const badge = READINESS_BADGE[verdict.state];
              return (
                <button
                  key={w.id}
                  type="button"
                  disabled={!allowed}
                  onClick={() => pickWidget(w.id)}
                  className="panel-interactive flex flex-col gap-1.5 rounded-md border border-hairline bg-card p-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{w.title}</span>
                    {allowed && <Badge variant={badge.variant}>{badge.label}</Badge>}
                  </span>
                  <span className="text-xs text-muted-foreground">{w.summary}</span>
                  {!allowed ? (
                    <span className="text-xs text-muted-foreground">This key cannot serve it — add it as a new widget.</span>
                  ) : verdict.note && (
                    <span className="text-xs text-muted-foreground">
                      {verdict.note}
                      {w.id === 'configurator' && verdict.state === 'missing' && (
                        <> <Link to="/blueprints" className="text-primary underline underline-offset-2">Open blueprints</Link></>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {step === 'content' && renderContent()}
        {step === 'site' && renderSite()}
        {step === 'code' && renderCode()}

        <DialogFooter className="gap-2 sm:justify-between">
          {step !== 'widget' ? (
            <Button variant="ghost" onClick={back}>
              {step === 'code' && creating ? 'Close' : <><ArrowLeft />Back</>}
            </Button>
          ) : <span />}
          {step === 'content' && <Button onClick={goNextFromContent}>{creating ? 'Next' : 'Show code'}</Button>}
          {step === 'site' && (
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}Create widget
            </Button>
          )}
          {step === 'code' && !creating && <Button variant="outline" onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
