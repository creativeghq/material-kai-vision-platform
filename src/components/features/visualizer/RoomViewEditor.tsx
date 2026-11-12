/**
 * Compose a room view (#560): pick a room, lay a product on each of its surfaces, save it on the
 * moodboard as a `room_view` sheet. Drawn in the browser by the deterministic renderer.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Save, ShoppingCart, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { STANDARD_GROUT_COLORS } from '@/constants/groutColors';
import {
  PATTERNS, PATTERN_LABELS, DEFAULT_RENDER_STATE, computeCoverage, wastageFor, normalizeFormat, patternWarning,
  orderQuantityForUnit,
  type Pattern, type Raster, type RoomViewLayer, type RoomViewPin, type WastageRates,
} from '@/lib/surfaceRenderer';
import { tileFormatLabel } from '@/components/features/roomplanner/surfaceFormat';
import {
  visualizerService, SURFACE_KIND_LABELS,
  type VisualizerScene, type VisualizerSurface, type SurfaceProduct,
} from '@/services/visualizerService';
import { roomViewService, type SavedRoomView } from '@/services/roomViewService';
import { AddToQuoteModal } from '@/modules/quotes/components/AddToQuoteModal';
import { unitSuffix } from '@/lib/units';
import { drawRaster, rasterToBlob } from './raster';
import { RoomViewAssets, renderRoomView, type LayerSpec } from './roomViewRender';
import { CoveragePanel } from './CoveragePanel';

interface LayerChoice {
  productId: string | null;
  pattern: Pattern;
  groutWidthMm: number;
  groutColorHex: string;
  rotationDeg: number;
}

const blankLayer = (productId: string | null = null): LayerChoice => ({
  productId,
  pattern: DEFAULT_RENDER_STATE.pattern,
  groutWidthMm: DEFAULT_RENDER_STATE.groutWidthMm,
  groutColorHex: DEFAULT_RENDER_STATE.groutColorHex,
  rotationDeg: 0,
});

const NONE = '__none';

/** "Floor", "Wall", "Wall 2" — a label per surface that stays unique inside one room. */
export function surfaceLabels(surfaces: VisualizerSurface[]): Map<string, string> {
  const seen = new Map<string, number>();
  const out = new Map<string, string>();
  for (const s of surfaces) {
    const base = SURFACE_KIND_LABELS[s.kind] ?? s.kind;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.set(s.key, n === 1 ? base : `${base} ${n}`);
  }
  return out;
}

interface Props {
  workspaceId: string;
  moodboardId: string;
  /** The project room the moodboard is for; the saved view is filed under it. */
  moodboardRoomId?: string | null;
  /** Products on the moodboard — offered first. */
  moodboardProductIds: string[];
  existing?: SavedRoomView | null;
  /** Lay this product on the first surface of a new view ("See it in a room" from an item). */
  initialProductId?: string | null;
  onSaved: (sheetId: string) => void;
  onCancel: () => void;
}

export const RoomViewEditor: React.FC<Props> = ({
  workspaceId, moodboardId, moodboardRoomId, moodboardProductIds, existing, initialProductId, onSaved, onCancel,
}) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scenes, setScenes] = useState<VisualizerScene[]>([]);
  const [products, setProducts] = useState<SurfaceProduct[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(existing?.data.scene_id ?? null);
  const [scene, setScene] = useState<VisualizerScene | null>(null);
  const [surfaces, setSurfaces] = useState<VisualizerSurface[]>([]);
  const [layers, setLayers] = useState<Record<string, LayerChoice>>(() => {
    const out: Record<string, LayerChoice> = {};
    for (const l of existing?.data.layers ?? []) {
      out[l.surface_key] = {
        productId: l.product_id, pattern: l.pattern, groutWidthMm: l.grout_width_mm,
        groutColorHex: l.grout_color_hex, rotationDeg: l.rotation_deg,
      };
    }
    return out;
  });
  const [title, setTitle] = useState(existing?.title ?? '');
  const [assets, setAssets] = useState<RoomViewAssets | null>(null);
  const [rendered, setRendered] = useState<{ raster: Raster; pins: RoomViewPin[] } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [wastage, setWastage] = useState<WastageRates>({});
  const [quoteFor, setQuoteFor] = useState<{ product: SurfaceProduct; quantity: number; notes: string } | null>(null);

  const onBoard = useMemo(() => new Set(moodboardProductIds), [moodboardProductIds]);

  useEffect(() => {
    let live = true;
    Promise.all([
      visualizerService.listScenes(workspaceId),
      visualizerService.listSurfaceProducts(workspaceId, [...moodboardProductIds, ...(initialProductId ? [initialProductId] : [])]),
      visualizerService.wastageRates(workspaceId).catch(() => ({} as WastageRates)),
    ])
      .then(([s, p, w]) => {
        if (!live) return;
        setScenes(s);
        setProducts(p);
        setWastage(w);
        setSceneId((cur) => cur ?? s[0]?.id ?? null);
      })
      .catch((e: unknown) => { if (live) setFailure(e instanceof Error ? e.message : 'Could not load rooms'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (!sceneId) return;
    let live = true;
    setAssets(null);
    setRendered(null);
    visualizerService.getScene(sceneId)
      .then(async ({ scene: s, surfaces: sf }) => {
        if (!live) return;
        setScene(s);
        setSurfaces(sf);
        if (!existing && initialProductId && sf[0]) {
          setLayers((cur) => (Object.keys(cur).length ? cur : { [sf[0].key]: blankLayer(initialProductId) }));
        }
        if (!title) setTitle(s.name);
        const a = await RoomViewAssets.load(s.imageUrl);
        if (live) setAssets(a);
      })
      .catch((e: unknown) => { if (live) setFailure(e instanceof Error ? e.message : 'Could not load the room'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId]);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const specs = useMemo((): LayerSpec[] => surfaces.flatMap((surface) => {
    const choice = layers[surface.key];
    const product = choice?.productId ? productById.get(choice.productId) : undefined;
    if (!choice || !product) return [];
    return [{ surface, product, ...choice }];
  }), [surfaces, layers, productById]);

  useEffect(() => {
    if (!assets) return;
    let live = true;
    setRendering(true);
    const handle = window.setTimeout(() => {
      renderRoomView(assets, specs, { supersample: 1 })
        .then((r) => { if (live) { setRendered(r); setFailure(null); } })
        .catch((e: unknown) => { if (live) setFailure(e instanceof Error ? e.message : 'Render failed'); })
        .finally(() => { if (live) setRendering(false); });
    }, 30);
    return () => { live = false; window.clearTimeout(handle); };
  }, [assets, specs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const r = rendered?.raster ?? assets?.base;
    if (canvas && r) drawRaster(canvas, r);
  }, [rendered, assets]);

  const labels = useMemo(() => surfaceLabels(surfaces), [surfaces]);
  const setLayer = useCallback((key: string, patch: Partial<LayerChoice>) => {
    setLayers((cur) => ({ ...cur, [key]: { ...(cur[key] ?? blankLayer()), ...patch } }));
  }, []);

  const save = useCallback(async () => {
    if (!assets || !scene || specs.length === 0) return;
    setSaving(true);
    try {
      const final = await renderRoomView(assets, specs, { supersample: 2 });
      const png = await rasterToBlob(final.raster);
      const layerRecords: RoomViewLayer[] = specs.map((s) => ({
        surface_key: s.surface.key,
        surface_kind: s.surface.kind,
        surface_label: labels.get(s.surface.key) ?? s.surface.kind,
        width_cm: s.surface.width_cm,
        depth_cm: s.surface.depth_cm,
        product_id: s.product.id,
        product_name: s.product.name,
        pattern: s.pattern,
        pattern_label: PATTERN_LABELS[s.pattern],
        grout_width_mm: s.groutWidthMm,
        grout_color_hex: s.groutColorHex,
        rotation_deg: s.rotationDeg,
        format_label: tileFormatLabel(s.product.texture),
        format_assumed: s.product.texture.formatSource === 'default',
      }));
      const res = await roomViewService.save({
        moodboardId,
        sheetId: existing?.id ?? null,
        title: title.trim() || scene.name,
        data: {
          scene_id: scene.id,
          scene_name: scene.name,
          rendered_at: new Date().toISOString(),
          layers: layerRecords,
          pins: final.pins,
        },
        png,
        roomId: moodboardRoomId ?? null,
      });
      toast({
        title: existing ? 'Room view updated' : 'Room view saved',
        description: res.creditsCharged ? `Added to this moodboard's sheets · ${res.creditsCharged} cr` : 'The sheet and its PDF are up to date.',
      });
      onSaved(res.sheetId);
    } catch (e) {
      toast({ title: 'Could not save the room view', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [assets, scene, specs, labels, moodboardId, existing, title, moodboardRoomId, toast, onSaved]);

  const productOptions = (
    <>
      <SelectItem value={NONE}>None</SelectItem>
      {products.some((p) => onBoard.has(p.id)) && (
        <SelectGroup>
          <SelectLabel>On This Moodboard</SelectLabel>
          {products.filter((p) => onBoard.has(p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectGroup>
      )}
      {products.some((p) => !onBoard.has(p.id)) && (
        <SelectGroup>
          <SelectLabel>Other Products</SelectLabel>
          {products.filter((p) => !onBoard.has(p.id)).map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectGroup>
      )}
    </>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-sm border border-hairline bg-surface-sunken">
          <canvas ref={canvasRef} className="block h-auto w-full" aria-label={scene ? `${scene.name}, room view` : 'Room view'} />
          {rendered?.pins.map((pin) => {
            const n = specs.findIndex((s) => s.surface.key === pin.surface_key) + 1;
            return (
              <span
                key={pin.surface_key}
                className="absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground shadow-overlay"
                style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
                aria-hidden
              >
                {n}
              </span>
            );
          })}
          {(rendering || !assets) && !failure && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-sm bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {assets ? 'Rendering' : 'Loading the room'}
            </div>
          )}
        </div>
        {failure && <p className="mt-2 text-xs text-destructive">{failure}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Each product is drawn from its face at its recorded size. A visualisation, not a photograph.
        </p>
      </div>

      <div className="grid content-start gap-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">Room</Label>
          <Select value={sceneId ?? ''} onValueChange={(v) => { setSceneId(v); setLayers({}); }} disabled={!!existing}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a room" /></SelectTrigger>
            <SelectContent>
              {scenes.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}{s.workspace_id ? '' : ' · Library'}</SelectItem>)}
            </SelectContent>
          </Select>
          {existing && <p className="mt-1 text-[11px] text-muted-foreground">A saved view keeps its room. Start a new view for another.</p>}
        </div>

        {surfaces.length === 0 && scene && (
          <p className="text-[11px] text-muted-foreground">This room has no surfaces marked. Mark one in the Surface Visualizer first.</p>
        )}
        {products.length === 0 && (
          <p className="text-[11px] text-muted-foreground">No product here has a face image to lay yet.</p>
        )}

        {surfaces.map((surface, i) => {
          const choice = layers[surface.key] ?? blankLayer();
          const product = choice.productId ? productById.get(choice.productId) : undefined;
          const format = product ? normalizeFormat(product.texture.tileWidthM * 100, product.texture.tileLengthM * 100) : null;
          const warning = format && patternWarning(format, choice.pattern);
          const coverage = product ? computeCoverage({
            surfaceWidthCm: surface.width_cm,
            surfaceDepthCm: surface.depth_cm,
            format,
            formatAssumed: product.texture.formatSource === 'default',
            groutCm: choice.groutWidthMm / 10,
            pattern: choice.pattern,
            rotationDeg: choice.rotationDeg,
            wastagePercent: wastageFor(wastage, choice.pattern),
            m2PerBox: product.texture.packM2 ?? null,
          }) : null;
          const order = coverage && product ? orderQuantityForUnit(coverage, product.unit) : null;
          const n = specs.findIndex((s) => s.surface.key === surface.key) + 1;
          return (
            <div key={surface.key} className="grid gap-2 rounded-sm border border-hairline p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {n > 0 && <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{n}</span>}
                  {labels.get(surface.key)} · {(surface.width_cm / 100).toFixed(1)} × {(surface.depth_cm / 100).toFixed(1)} m
                </span>
                {product && (
                  <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={`Clear the ${labels.get(surface.key)}`}
                    onClick={() => setLayer(surface.key, { productId: null })}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Select value={choice.productId ?? NONE} onValueChange={(v) => setLayer(surface.key, { productId: v === NONE ? null : v })}>
                <SelectTrigger className="h-8 text-xs" aria-label={`Product for surface ${i + 1}`}><SelectValue /></SelectTrigger>
                <SelectContent>{productOptions}</SelectContent>
              </Select>
              {product && (
                <>
                  <p className="text-[11px] text-muted-foreground">{tileFormatLabel(product.texture)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={choice.pattern} onValueChange={(v) => setLayer(surface.key, { pattern: v as Pattern })}>
                      <SelectTrigger className="h-8 text-xs" aria-label="Pattern"><SelectValue /></SelectTrigger>
                      <SelectContent>{PATTERNS.map((p) => <SelectItem key={p} value={p}>{PATTERN_LABELS[p]}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(choice.rotationDeg)} onValueChange={(v) => setLayer(surface.key, { rotationDeg: Number(v) })}>
                      <SelectTrigger className="h-8 text-xs" aria-label="Rotation"><SelectValue /></SelectTrigger>
                      <SelectContent>{[0, 45, 90].map((r) => <SelectItem key={r} value={String(r)}>{r}°</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  {warning && <p className="text-[11px] text-amber-800 dark:text-amber-300">{warning}</p>}
                  <div>
                    <Label className="text-xs">Joint {choice.groutWidthMm} mm</Label>
                    <input type="range" min={0} max={10} step={0.5} value={choice.groutWidthMm}
                      onChange={(e) => setLayer(surface.key, { groutWidthMm: Number(e.target.value) })}
                      className="mt-1 w-full" aria-label="Joint width in millimetres" />
                    <div className="mt-1 flex flex-wrap gap-1">
                      {STANDARD_GROUT_COLORS.slice(0, 8).map((c) => {
                        const hex = c.hex.toLowerCase();
                        return (
                          <button key={c.name} type="button" title={c.name} aria-label={`Joint colour ${c.name}`}
                            onClick={() => setLayer(surface.key, { groutColorHex: hex })}
                            className={`h-5 w-5 rounded-sm border ${choice.groutColorHex === hex ? 'border-foreground' : 'border-border'}`}
                            style={{ backgroundColor: hex }} />
                        );
                      })}
                    </div>
                  </div>
                  {coverage && (
                    <CoveragePanel
                      coverage={coverage}
                      compact
                      priceLine={order ? (
                        <Button size="sm" variant="outline" className="mt-1 h-7 w-full text-xs"
                          onClick={() => setQuoteFor({
                            product,
                            quantity: order.quantity,
                            notes: `${labels.get(surface.key)}, ${PATTERN_LABELS[choice.pattern]}, ${choice.groutWidthMm} mm joint (${coverage.wastagePercent}% cutting allowance)`,
                          })}>
                          <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />Add {order.quantity} {unitSuffix(order.unit)} to a quote
                        </Button>
                      ) : (
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          This product's selling unit is not recorded as m², box or piece, so this cannot become a quote line yet.
                        </p>
                      )}
                    />
                  )}
                </>
              )}
            </div>
          );
        })}

        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving || specs.length === 0 || !assets}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
            {existing ? 'Save changes' : 'Save to moodboard'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        </div>
      </div>

      {quoteFor && (
        <AddToQuoteModal
          productId={quoteFor.product.id}
          productName={quoteFor.product.name}
          productImage={quoteFor.product.texture.url ?? undefined}
          defaultQuantity={quoteFor.quantity}
          defaultNotes={quoteFor.notes}
          roomId={moodboardRoomId ?? null}
          onClose={() => setQuoteFor(null)}
          onSuccess={(name) => { toast({ title: 'Added to quote', description: `${quoteFor.product.name} added to "${name}"` }); setQuoteFor(null); }}
        />
      )}
    </div>
  );
};
