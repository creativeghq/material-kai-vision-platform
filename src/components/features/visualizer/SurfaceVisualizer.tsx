/**
 * The deterministic surface visualizer (#447 Phase 1): one scene, one surface, one product, drawn
 * at true scale in the browser. Nothing here calls a model; "Render photoreal" is the one opt-in
 * step that does, and it starts from the finished composition.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Link2, Sparkles, Loader2, RotateCw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import { STANDARD_GROUT_COLORS } from '@/constants/groutColors';
import {
  renderSurface, patternWarning, piecesToCover, normalizeFormat, PATTERNS, PATTERN_LABELS, hexToRgb,
  serializeRenderState, DEFAULT_RENDER_STATE,
  type Pattern, type Raster, type RenderState, type Pt,
} from '@/lib/surfaceRenderer';
import { tileFormatLabel } from '@/components/features/roomplanner/surfaceFormat';
import { SURFACE_KIND_LABELS, type VisualizerScene, type VisualizerSurface, type SurfaceProduct } from '@/services/visualizerService';
import { loadRaster, loadMaskFor, drawRaster, rasterToBlob } from './raster';

interface Props {
  scene: VisualizerScene;
  surfaces: VisualizerSurface[];
  products: SurfaceProduct[];
  workspaceId: string;
  initialState?: Partial<RenderState>;
  /** Fewer controls, no photoreal step — for the chat card. */
  compact?: boolean;
  onStateChange?: (state: RenderState) => void;
}

const ROTATIONS = [0, 45, 90];

export const SurfaceVisualizer: React.FC<Props> = ({
  scene, surfaces, products, workspaceId, initialState, compact = false, onStateChange,
}) => {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A key or id carried over from another scene's URL must not select nothing: fall back to the first.
  const [surfaceKey, setSurfaceKey] = useState<string | null>(() => {
    const wanted = initialState?.surfaceKey;
    return wanted && surfaces.some((s) => s.key === wanted) ? wanted : surfaces[0]?.key ?? null;
  });
  const [productId, setProductId] = useState<string | null>(() => {
    const wanted = initialState?.productId;
    return wanted && products.some((p) => p.id === wanted) ? wanted : products[0]?.id ?? null;
  });
  const linkedProductMissing = !!initialState?.productId && !products.some((p) => p.id === initialState.productId);
  const [pattern, setPattern] = useState<Pattern>(initialState?.pattern ?? DEFAULT_RENDER_STATE.pattern);
  const [groutWidthMm, setGroutWidthMm] = useState(initialState?.groutWidthMm ?? DEFAULT_RENDER_STATE.groutWidthMm);
  const [groutColorHex, setGroutColorHex] = useState(initialState?.groutColorHex ?? DEFAULT_RENDER_STATE.groutColorHex);
  const [rotationDeg, setRotationDeg] = useState(initialState?.rotationDeg ?? 0);

  const [base, setBase] = useState<Raster | null>(null);
  const [mask, setMask] = useState<Raster | null>(null);
  const [face, setFace] = useState<Raster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [rendered, setRendered] = useState<Raster | null>(null);
  const [photoreal, setPhotoreal] = useState<{ url: string; credits: number } | null>(null);
  const [photorealBusy, setPhotorealBusy] = useState(false);

  const surface = useMemo(() => surfaces.find((s) => s.key === surfaceKey) ?? null, [surfaces, surfaceKey]);
  const product = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
  const format = useMemo(
    () => (product ? normalizeFormat(product.texture.tileWidthM * 100, product.texture.tileLengthM * 100) : null),
    [product],
  );

  const state: RenderState = useMemo(() => ({
    sceneId: scene.id, surfaceKey, productId, pattern, groutWidthMm, groutColorHex, rotationDeg,
  }), [scene.id, surfaceKey, productId, pattern, groutWidthMm, groutColorHex, rotationDeg]);
  useEffect(() => { onStateChange?.(state); }, [state, onStateChange]);

  // The photo, once per scene.
  useEffect(() => {
    let live = true;
    setBase(null);
    setLoadError(null);
    loadRaster(scene.imageUrl, compact ? 900 : 1400)
      .then((r) => { if (live) setBase(r); })
      .catch((e: Error) => { if (live) setLoadError(`Scene photo: ${e.message}`); });
    return () => { live = false; };
  }, [scene.imageUrl, compact]);

  // The mask, at the photo's working size.
  useEffect(() => {
    let live = true;
    setMask(null);
    if (!surface?.maskUrl || !base) return;
    loadMaskFor(surface.maskUrl, base.width, base.height)
      .then((m) => { if (live) setMask(m); })
      .catch(() => { if (live) setMask(null); });
    return () => { live = false; };
  }, [surface?.maskUrl, base]);

  // The product face.
  useEffect(() => {
    let live = true;
    setFace(null);
    if (!product?.texture.url) return;
    loadRaster(product.texture.url, 512)
      .then((r) => { if (live) setFace(r); })
      .catch((e: Error) => { if (live) setLoadError(`Product photo: ${e.message}`); });
    return () => { live = false; };
  }, [product?.texture.url]);

  // The render. Deferred a tick so the controls stay responsive while a 1.3 MP pass runs.
  useEffect(() => {
    if (!base || !surface || !face || !format) { setRendered(null); return; }
    let live = true;
    setRendering(true);
    const handle = window.setTimeout(() => {
      try {
        const quad = surface.quad.map((p: Pt) => ({ x: p.x * base.width, y: p.y * base.height })) as [Pt, Pt, Pt, Pt];
        const out = renderSurface(
          base,
          { quad, widthCm: surface.width_cm, depthCm: surface.depth_cm, mask },
          {
            face,
            format,
            pattern,
            groutWidthMm,
            groutColor: hexToRgb(groutColorHex),
            rotationDeg,
          },
          { supersample: compact ? 1 : 2 },
        );
        if (live) { setRendered(out); setPhotoreal(null); }
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : 'Render failed');
      } finally {
        if (live) setRendering(false);
      }
    }, 30);
    return () => { live = false; window.clearTimeout(handle); };
  }, [base, mask, face, surface, format, pattern, groutWidthMm, groutColorHex, rotationDeg, compact]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const r = rendered ?? base;
    if (r) drawRaster(canvas, r);
  }, [rendered, base]);

  const warning = format && patternWarning(format, pattern);
  const pieces = format && surface ? piecesToCover(surface.width_cm, surface.depth_cm, format, groutWidthMm / 10) : null;

  const download = useCallback(async () => {
    if (!rendered) return;
    const blob = await rasterToBlob(rendered);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${scene.name}-${product?.name ?? 'surface'}.png`.replace(/[^\w.-]+/g, '_');
    a.click();
    URL.revokeObjectURL(a.href);
  }, [rendered, scene.name, product?.name]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}/visualizer?${serializeRenderState(state).toString()}`;
    await navigator.clipboard.writeText(url);
    toast({ title: 'Link copied', description: 'Anyone in the workspace can open this exact render.' });
  }, [state, toast]);

  /** The one model step: the finished composition, asked to become a photograph and change nothing. */
  const renderPhotoreal = useCallback(async () => {
    if (!rendered) return;
    setPhotorealBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const blob = await rasterToBlob(rendered);
      const path = `u/${user.id}/visualizer/${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from('generation-images').upload(path, blob, { contentType: 'image/png', upsert: true });
      if (upErr) throw upErr;
      const compositeUrl = supabase.storage.from('generation-images').getPublicUrl(path).data.publicUrl;
      const { data: body, error } = await supabase.functions.invoke('generate-interior-gemini', {
        body: {
          mode: 'image-edit',
          reference_image_url: compositeUrl,
          edit_instruction:
            'Make this image photographic. Keep every surface, its tile pattern, joints and colour, every object, ' +
            'the room and the camera exactly as they are; only refine lighting, reflections, shadows and material realism.',
          model_tier: 'fast',
          workspace_id: workspaceId,
        },
      });
      if (error) throw await edgeError(error, 'Photoreal render failed');
      if (!body?.success || !body?.image_url) throw new Error(body?.error || 'Generation returned no image');
      setPhotoreal({ url: body.image_url, credits: Number(body.credits_used ?? 0) });
    } catch (e) {
      toast({ title: 'Photoreal render failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPhotorealBusy(false);
    }
  }, [rendered, workspaceId, toast]);

  return (
    <div className={compact ? 'grid gap-3' : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]'}>
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-lg border border-border/60 bg-muted/20">
          <canvas ref={canvasRef} className="block h-auto w-full" aria-label={`${scene.name}, ${product?.name ?? 'no product'} on the ${surface ? SURFACE_KIND_LABELS[surface.kind] : 'surface'}`} />
          {(rendering || (!base && !loadError)) && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-sm bg-background/80 px-2 py-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> {base ? 'Rendering' : 'Loading photo'}
            </div>
          )}
        </div>
        {loadError && <p className="mt-2 text-xs text-destructive">{loadError}</p>}
        {photoreal && (
          <div className="mt-3">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">AI render · {photoreal.credits} credits · a model's interpretation, not the exact product</p>
            <img src={photoreal.url} alt="Photoreal AI render of the composition" className="w-full rounded-lg border border-border/60" />
          </div>
        )}
        {!compact && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={download} disabled={!rendered}><Download className="mr-1.5 h-3.5 w-3.5" />Download</Button>
            <Button size="sm" variant="outline" onClick={copyLink} disabled={!rendered}><Link2 className="mr-1.5 h-3.5 w-3.5" />Copy link</Button>
            <Button size="sm" variant="secondary" onClick={renderPhotoreal} disabled={!rendered || photorealBusy}>
              {photorealBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
              Render photoreal (AI)
            </Button>
          </div>
        )}
      </div>

      <div className="grid content-start gap-3">
        <div>
          <Label className="text-xs">Surface</Label>
          <Select value={surfaceKey ?? ''} onValueChange={setSurfaceKey}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a surface" /></SelectTrigger>
            <SelectContent>
              {surfaces.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {SURFACE_KIND_LABELS[s.kind]} · {Math.round(s.width_cm / 100 * 10) / 10} × {Math.round(s.depth_cm / 100 * 10) / 10} m
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {surfaces.length === 0 && <p className="mt-1 text-[11px] text-muted-foreground">This scene has no surfaces yet.</p>}
        </div>
        <div>
          <Label className="text-xs">Product</Label>
          <Select value={productId ?? ''} onValueChange={setProductId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick a product" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {product && (
            <p className="mt-1 text-[11px] text-muted-foreground">{tileFormatLabel(product.texture)}</p>
          )}
          {products.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">No product in this workspace has an image to tile yet.</p>
          )}
          {linkedProductMissing && (
            <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">The linked product has no image to tile, so another is shown.</p>
          )}
        </div>
        <div>
          <Label className="text-xs">Pattern</Label>
          <Select value={pattern} onValueChange={(v) => setPattern(v as Pattern)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PATTERNS.map((p) => <SelectItem key={p} value={p}>{PATTERN_LABELS[p]}</SelectItem>)}
            </SelectContent>
          </Select>
          {warning && <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">{warning}</p>}
        </div>
        <div>
          <Label className="text-xs">Joint {groutWidthMm} mm</Label>
          <input
            type="range" min={0} max={10} step={0.5} value={groutWidthMm}
            onChange={(e) => setGroutWidthMm(Number(e.target.value))}
            className="mt-1 w-full" aria-label="Joint width in millimetres"
          />
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {STANDARD_GROUT_COLORS.slice(0, 8).map((c) => {
              const hex = c.hex.toLowerCase();
              return (
                <button
                  key={c.name} type="button" title={c.name} aria-label={`Joint colour ${c.name}`}
                  onClick={() => setGroutColorHex(hex)}
                  className={`h-5 w-5 rounded-sm border ${groutColorHex === hex ? 'border-foreground' : 'border-border'}`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
            <input type="color" value={groutColorHex} onChange={(e) => setGroutColorHex(e.target.value)} aria-label="Joint colour" className="h-6 w-8 cursor-pointer border-0 bg-transparent p-0" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Rotation</Label>
          <div className="mt-1 flex gap-1">
            {ROTATIONS.map((r) => (
              <Button key={r} size="sm" variant={rotationDeg === r ? 'secondary' : 'outline'} className="h-7 px-2 text-xs" onClick={() => setRotationDeg(r)}>
                <RotateCw className="mr-1 h-3 w-3" />{r}°
              </Button>
            ))}
          </div>
        </div>
        {pieces !== null && surface && (
          <p className="text-[11px] text-muted-foreground">
            {(surface.width_cm * surface.depth_cm / 10_000).toFixed(2)} m² · about {pieces} pieces before cuts
          </p>
        )}
      </div>
    </div>
  );
};
