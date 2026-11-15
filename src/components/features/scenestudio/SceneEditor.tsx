/** The editable 3D room, hosted in the interior designer's canvas (#564). Renders go back into the conversation. */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Eye, Footprints, Grid3x3, Hand, Layers, Loader2, Map as MapIcon, Move, Package, Paintbrush, Plus,
  RefreshCw, RotateCw, Sparkles, Trash2, Undo2, X, Box as BoxIcon, PersonStanding,
} from 'lucide-react';

import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/core/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { loadVocabulary, type VocabularyTerm } from '@/services/vocabularies';
import { VR_CREDIT_COSTS } from '@/services/vrWorldService';
import {
  publicUrl, sceneStudioService,
  type LayoutEntry, type SceneData, type SceneObject, type SceneProduct, type SceneRender, type SceneSurface,
} from '@/services/sceneStudioService';
import { describeBox, describeObject, effectiveSize, polygonCentroid } from '@/lib/scene/sceneGeometry';
import { compositeMasked, loadImage, objectMask } from '@/lib/scene/sceneCompositing';
import { SCENE_OBJECT_KINDS } from '@/lib/scene/sceneReadSchema';
import { SCENE_READ_STATUS, SCENE_SOURCE_LABEL } from '@/lib/scene/sceneLabels';
import type { SceneCanvasHandle, SceneTool } from '@/components/features/scenestudio/SceneCanvas';
import {
  ColourRow, ObjectInspector, PinnedProductsContext, ProductPicker, StylePanel, type StyleChoice,
} from '@/components/features/scenestudio/ScenePanels';

const SceneCanvas = lazy(() => import('@/components/features/scenestudio/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));

const TOOLS: Array<{ id: SceneTool; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { id: 'view', label: 'View', icon: Eye, hint: 'Drag to turn the view · right-drag to pan · scroll to zoom · double-click a floor to go to that room · click an object to select it' },
  { id: 'move', label: 'Move', icon: Move, hint: 'Drag an object across the floor · right-drag to pan' },
  { id: 'turn', label: 'Turn', icon: RotateCw, hint: 'Drag around an object to turn it (15° steps, hold Shift for free) · right-drag to pan' },
  { id: 'remove', label: 'Remove', icon: Trash2, hint: 'Click an object to take it out of the room — it waits in the tray to be put back' },
  { id: 'paint', label: 'Paint', icon: Paintbrush, hint: 'Pick a colour or product, then click a floor or a wall' },
];

export interface SceneRenderedEvent {
  image_url: string;
  label: string;
  credits_used: number;
  kind: 'full' | 'object_edit';
}

export interface SceneEditorProps {
  sceneId: string;
  pinned?: SceneProduct[];
  onRendered?(event: SceneRenderedEvent): void;
  onWalkThrough?(imageUrl: string, prompt: string): void;
}

interface Snapshot { objects: SceneObject[]; surfaces: SceneSurface[] }

const layoutOf = (objects: SceneObject[]): Record<string, LayoutEntry> =>
  Object.fromEntries(objects.map((o) => [o.id, {
    colour_hex: o.colour_hex, product_id: o.product_id, x_mm: o.x_mm, y_mm: o.y_mm, rotation_deg: o.rotation_deg, removed: !!o.removed_at,
  }]));

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const roomArea = (outline: Array<[number, number]>) => {
  let sum = 0;
  for (let i = 0; i < outline.length; i++) {
    const [x1, y1] = outline[i];
    const [x2, y2] = outline[(i + 1) % outline.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2 / 1e6;
};

const DockButton: React.FC<{ label: string; hint?: string; active?: boolean; disabled?: boolean; side?: 'right' | 'left' | 'top' | 'bottom'; onClick(): void; children: React.ReactNode }> = ({ label, hint, active, disabled, side = 'bottom', onClick, children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={`flex h-9 w-9 items-center justify-center rounded-sm transition-colors disabled:opacity-40 ${active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-surface-sunken'}`}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side={side} className="max-w-[220px]">
      <p className="text-xs font-semibold">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </TooltipContent>
  </Tooltip>
);

const SpaceCard: React.FC<{ title: string; meta: string; active: boolean; onOpen(): void; onStand?(): void }> = ({ title, meta, active, onOpen, onStand }) => (
  <div className={`flex w-48 shrink-0 items-stretch overflow-hidden rounded-md border bg-card ${active ? 'border-primary ring-1 ring-primary' : 'border-hairline'}`}>
    <button type="button" onClick={onOpen} className="min-w-0 flex-1 px-3 py-2 text-left hover:bg-surface-sunken">
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="block truncate text-[11px] text-muted-foreground">{meta}</span>
    </button>
    {onStand && (
      <button type="button" onClick={onStand} className="flex items-center border-l border-hairline px-2.5 text-muted-foreground hover:bg-surface-sunken hover:text-foreground" title="Walk in" aria-label={`Walk in ${title}`}>
        <Footprints className="h-4 w-4" />
      </button>
    )}
  </div>
);

const hasWebGL2 = () => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
};

export default function SceneEditor({ sceneId: id, pinned = [], onRendered, onWalkThrough }: SceneEditorProps) {
  const { toast } = useToast();
  const canvasRef = useRef<SceneCanvasHandle>(null);

  const [data, setData] = useState<SceneData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [surfaces, setSurfaces] = useState<SceneSurface[]>([]);
  const [products, setProducts] = useState<Record<string, SceneProduct>>({});
  const [renders, setRenders] = useState<SceneRender[]>([]);
  const [history, setHistory] = useState<Snapshot[]>([]);
  const openedWith = useRef<SceneObject[]>([]);
  const dragStart = useRef<Snapshot | null>(null);

  const [tool, setTool] = useState<SceneTool>('view');
  const [wireframe, setWireframe] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeRenderId, setActiveRenderId] = useState<string | null>(null);
  const [showRender, setShowRender] = useState(false);
  const [styleChoice, setStyleChoice] = useState<StyleChoice | null>(null);
  const [rendering, setRendering] = useState(false);
  const [applying, setApplying] = useState(false);
  const [styles, setStyles] = useState<VocabularyTerm[]>([]);
  const [paintColour, setPaintColour] = useState<string | null>('#efebe4');
  const [paintProduct, setPaintProduct] = useState<SceneProduct | null>(null);
  const [pickingPaint, setPickingPaint] = useState(false);
  const [adding, setAdding] = useState<null | 'form' | 'product'>(null);
  const [newObj, setNewObj] = useState({ label: '', kind: 'other' });
  const [focusRoomId, setFocusRoomId] = useState<string | null>(null);
  const [eyeLevel, setEyeLevel] = useState(false);
  const [making3d, setMaking3d] = useState<string | null>(null);
  const [walkRoomId, setWalkRoomId] = useState<string | null | undefined>(undefined);
  const walking = walkRoomId !== undefined;
  const startWalk = (roomId: string | null) => { setShowRender(false); setSelectedId(null); setTool('view'); setWalkRoomId(roomId ?? focusRoomId ?? data?.rooms[0]?.id ?? null); };
  const webgl = useMemo(hasWebGL2, []);

  const apply = useCallback((d: SceneData) => {
    setData(d);
    setObjects(d.objects);
    setSurfaces(d.surfaces);
    setProducts(d.products);
    setRenders(d.renders);
    openedWith.current = d.objects;
    setHistory([]);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await sceneStudioService.load(id);
      if (!d) { setLoadError('This 3D room does not exist or you cannot open it.'); return; }
      apply(d);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'The 3D room could not be loaded.');
    }
  }, [id, apply]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { loadVocabulary('interior_styles').then(setStyles).catch(() => setStyles([])); }, []);

  const reading = data?.scene.extract_status === 'extracting';
  useEffect(() => {
    if (!reading) return;
    const t = setInterval(async () => {
      try {
        const s = await sceneStudioService.getScene(id);
        if (s && s.extract_status !== 'extracting') void load();
      } catch { /* the next tick tries again */ }
    }, 3000);
    return () => clearInterval(t);
  }, [reading, id, load]);

  const fail = (title: string, e: unknown) => toast({ title, description: e instanceof Error ? e.message : undefined, variant: 'destructive' });

  const remember = () => setHistory((h) => [...h.slice(-49), { objects, surfaces }]);

  const persistObjects = async (next: SceneObject[], prev: SceneObject[]) => {
    const before = new Map(prev.map((o) => [o.id, JSON.stringify(o)]));
    const changed = next.filter((o) => before.get(o.id) !== JSON.stringify(o));
    try { await sceneStudioService.saveObjects(changed); } catch (e) { fail('The change could not be saved', e); }
  };

  const changeObjects = (fn: (list: SceneObject[]) => SceneObject[]) => {
    remember();
    const next = fn(objects);
    setObjects(next);
    void persistObjects(next, objects);
  };

  const patchObject = (objId: string, patch: Partial<SceneObject>) =>
    changeObjects((list) => list.map((o) => (o.id === objId ? { ...o, ...patch } : o)));

  const onMoveObject = (objId: string, patch: Partial<SceneObject>, commit: boolean) => {
    if (!dragStart.current) dragStart.current = { objects, surfaces };
    setObjects((list) => list.map((o) => (o.id === objId ? { ...o, ...patch } : o)));
    if (commit) {
      const start = dragStart.current;
      dragStart.current = null;
      setHistory((h) => [...h.slice(-49), start]);
      const next = start.objects.map((o) => (o.id === objId ? { ...o, ...patch } : o));
      void persistObjects(next, start.objects);
    }
  };

  const removeObject = (objId: string) => {
    patchObject(objId, { removed_at: new Date().toISOString() });
    if (selectedId === objId) setSelectedId(null);
  };
  const restoreObject = (objId: string) => patchObject(objId, { removed_at: null });
  const deleteForever = async (objId: string) => {
    try {
      await sceneStudioService.deleteObject(objId);
      setObjects((list) => list.filter((o) => o.id !== objId));
      setHistory((h) => h.map((snap) => ({ ...snap, objects: snap.objects.filter((o) => o.id !== objId) })));
      openedWith.current = openedWith.current.filter((o) => o.id !== objId);
    } catch (e) { fail('The object could not be deleted', e); }
  };
  const emptyRoom = () => {
    const now = new Date().toISOString();
    changeObjects((list) => list.map((o) => (o.removed_at ? o : { ...o, removed_at: now })));
    setSelectedId(null);
  };
  const resetLayout = () => changeObjects(() => openedWith.current.map((o) => ({ ...o })));

  const undo = async () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    const prevObjects = objects;
    setObjects(last.objects);
    void persistObjects(last.objects, prevObjects);
    const bySurface = new Map(surfaces.map((s) => [`${s.room_id}:${s.surface}`, s]));
    const restored = new Map(last.surfaces.map((s) => [`${s.room_id}:${s.surface}`, s]));
    for (const [key, s] of bySurface) {
      const old = restored.get(key);
      if (JSON.stringify(old) === JSON.stringify(s)) continue;
      try {
        await sceneStudioService.setSurface(id, s.room_id, s.surface, { product_id: old?.product_id ?? null, colour_hex: old?.colour_hex ?? null });
      } catch (e) { fail('The paint could not be undone', e); }
    }
    setSurfaces(last.surfaces);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); void undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const paint = async (roomId: string, surface: 'floor' | 'walls') => {
    if (!paintColour && !paintProduct) return;
    remember();
    try {
      const saved = await sceneStudioService.setSurface(id, roomId, surface, {
        product_id: paintProduct?.id ?? null,
        colour_hex: paintProduct ? null : paintColour,
      });
      if (paintProduct) setProducts((p) => ({ ...p, [paintProduct.id]: paintProduct }));
      setSurfaces((list) => [...list.filter((s) => !(s.room_id === roomId && s.surface === surface)), saved]);
    } catch (e) { fail('The surface could not be painted', e); }
  };

  const setObjectProduct = (objId: string, p: SceneProduct | null) => {
    if (p) setProducts((map) => ({ ...map, [p.id]: p }));
    patchObject(objId, { product_id: p?.id ?? null, ...(p ? { label: p.name.slice(0, 200) } : {}) });
  };

  const addObject = async (input: { label: string; kind: string; product?: SceneProduct }) => {
    if (!data) return;
    const room = data.rooms[0];
    const [cx, cy] = room ? polygonCentroid(room.outline) : [2000, 2000];
    const size = input.product ? effectiveSize({ width_mm: 800, depth_mm: 600, height_mm: 800, size_source: 'estimated' }, input.product) : null;
    try {
      remember();
      const created = await sceneStudioService.addObject(id, {
        room_id: room?.id ?? null, kind: input.kind, label: input.label, product_id: input.product?.id ?? null,
        x_mm: cx, y_mm: cy, rotation_deg: 0,
        width_mm: size?.width_mm ?? 800, depth_mm: size?.depth_mm ?? 600, height_mm: size?.height_mm ?? 800,
        elevation_mm: 0, size_source: 'estimated', colour_hex: null, source: 'placed',
      });
      if (input.product) setProducts((map) => ({ ...map, [input.product!.id]: input.product! }));
      setObjects((list) => [...list, created]);
      setSelectedId(created.id);
      setTool('move');
      setAdding(null);
      setNewObj({ label: '', kind: 'other' });
    } catch (e) { fail('The object could not be added', e); }
  };

  const modelUrls = useMemo(() => Object.fromEntries(objects
    .filter((o) => o.model_status === 'ready' && o.model_storage_path)
    .map((o) => [o.id, publicUrl(o.model_storage_path!)])), [objects]);

  const anyProcessing = objects.some((o) => o.model_status === 'processing');
  useEffect(() => {
    if (!anyProcessing) return;
    const t = setInterval(async () => {
      try {
        const states = new Map((await sceneStudioService.objectModelStates(id)).map((r) => [r.id, r]));
        setObjects((list) => list.map((o) => (states.has(o.id) ? { ...o, ...states.get(o.id) } : o)));
      } catch { /* the next tick tries again */ }
    }, 5000);
    return () => clearInterval(t);
  }, [anyProcessing, id]);

  const cropFromRender = async (o: SceneObject): Promise<string> => {
    const source = (activeRender && activeRender.layout_snapshot?.[o.id] ? activeRender : null)
      ?? renders.find((r) => r.id_pass_path && Object.values(r.id_map ?? {}).includes(o.id)) ?? null;
    if (!data || !source?.id_pass_path) {
      throw new Error(renders.length
        ? 'This object is not in any render yet. Render the room again, then make it 3D.'
        : 'Render the room first: the 3D model is made from how the object looks in a render.');
    }
    const hex = Object.entries(source.id_map ?? {}).find(([, objId]) => objId === o.id)?.[0];
    if (!hex) throw new Error('This object is not in any render yet. Render the room again first.');
    const [pass, base] = await Promise.all([loadImage(publicUrl(source.id_pass_path)), loadImage(source.image_url)]);
    const mask = await objectMask([{ image: pass, hex }]);
    if (!mask.box) throw new Error('This object cannot be seen in the current render.');
    const W = base.naturalWidth; const H = base.naturalHeight;
    const padX = (mask.box.x1 - mask.box.x0) * 0.15; const padY = (mask.box.y1 - mask.box.y0) * 0.15;
    const x0 = Math.max(0, (mask.box.x0 - padX) * W); const y0 = Math.max(0, (mask.box.y0 - padY) * H);
    const x1 = Math.min(W, (mask.box.x1 + padX) * W); const y1 = Math.min(H, (mask.box.y1 + padY) * H);
    const scale = Math.max(1, 1024 / Math.max(x1 - x0, y1 - y0));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round((x1 - x0) * scale); canvas.height = Math.round((y1 - y0) * scale);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, x0, y0, x1 - x0, y1 - y0, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Crop failed'))), 'image/png'));
    return sceneStudioService.uploadCapture(data.scene, blob, `object-${o.id.slice(0, 8)}`);
  };

  const make3d = async (o: SceneObject) => {
    if (!data || making3d) return;
    setMaking3d(o.id);
    try {
      const result = o.product_id
        ? await sceneStudioService.make3d({ product_id: o.product_id, workspace_id: data.scene.workspace_id, floor_plan_object_id: o.id })
        : await sceneStudioService.make3d({ floor_plan_object_id: o.id, image_path: await cropFromRender(o) });
      const states = new Map((await sceneStudioService.objectModelStates(id)).map((r) => [r.id, r]));
      setObjects((list) => list.map((x) => (states.has(x.id) ? { ...x, ...states.get(x.id) } : x)));
      toast({
        title: result.status === 'ready' ? `${o.label} is now 3D` : `Making ${o.label} 3D`,
        description: result.charged
          ? `${result.credits_used ?? 10} credits used.${result.status === 'processing' ? ' It appears in the room in about a minute.' : ''}`
          : 'Another 3D model of it is being made right now. Try again in a minute; nothing was charged.',
      });
    } catch (e) {
      fail('The object could not be made 3D', e);
    } finally {
      setMaking3d(null);
    }
  };

  const goToRoom = (roomId: string | undefined, inside: boolean) => {
    if (!roomId) return;
    setWalkRoomId(undefined);
    setShowRender(false);
    setFocusRoomId(roomId);
    canvasRef.current?.focusRoom(roomId, inside);
  };

  const activeRender = renders.find((r) => r.id === activeRenderId) ?? null;

  const sceneLines = () => {
    const lines = objects.filter((o) => !o.removed_at).map((o) => {
      const p = o.product_id ? products[o.product_id] : undefined;
      return describeObject(o.label, o.kind, effectiveSize(o, p), o.colour_hex, p?.name ?? null);
    });
    for (const s of surfaces) {
      const room = data?.rooms.find((r) => r.id === s.room_id);
      const p = s.product_id ? products[s.product_id] : undefined;
      const what = p ? `the product "${p.name}"` : s.colour_hex ? `colour ${s.colour_hex}` : null;
      if (what) lines.push(`${s.surface === 'floor' ? 'Floor' : 'Walls'} of ${room?.name ?? 'the room'}: ${what}`);
    }
    return lines;
  };

  const materialImages = () => {
    const urls: string[] = [];
    for (const o of objects) if (!o.removed_at && o.product_id && products[o.product_id]?.imageUrl) urls.push(products[o.product_id].imageUrl!);
    for (const s of surfaces) if (s.product_id && products[s.product_id]?.imageUrl) urls.push(products[s.product_id].imageUrl!);
    return [...new Set(urls)].filter((u) => u.startsWith('https://')).slice(0, 6);
  };

  const render = async (choice: StyleChoice | null) => {
    if (!data || !canvasRef.current || rendering) return;
    setRendering(true);
    setStyleChoice(choice);
    try {
      setShowRender(false);
      setSelectedId(null);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cap = await canvasRef.current.capture();
      const [capturePath, idPath] = await Promise.all([
        sceneStudioService.uploadCapture(data.scene, cap.colour, 'view'),
        sceneStudioService.uploadCapture(data.scene, cap.idPass, 'ids'),
      ]);
      const result = await sceneStudioService.generate({
        mode: 'scene-render',
        reference_image_url: publicUrl(capturePath),
        style: choice?.kind === 'style' ? `${choice.label} — ${choice.brief}` : undefined,
        style_reference_url: choice?.kind === 'reference' ? choice.url : undefined,
        material_images: materialImages(),
        scene_objects: sceneLines(),
        model_tier: 'fast',
        workspace_id: data.scene.workspace_id,
      });
      const saved = await sceneStudioService.saveRender({
        floor_plan_id: id, parent_render_id: null, kind: 'full', edited_object_id: null,
        camera: cap.camera as unknown as Record<string, unknown>, capture_path: capturePath, id_pass_path: idPath, id_map: cap.idMap,
        style_reference_url: choice?.kind === 'reference' ? choice.url : null, style_label: choice?.label ?? null,
        instruction: null, image_url: result.image_url, layout_snapshot: layoutOf(objects),
      });
      setRenders((list) => [saved, ...list]);
      setActiveRenderId(saved.id);
      setShowRender(true);
      onRendered?.({ image_url: saved.image_url, label: choice?.label ?? 'Render', credits_used: result.credits_used, kind: 'full' });
      toast({ title: 'Rendered', description: `${result.credits_used} credits used. The render is also in the conversation.` });
    } catch (e) {
      fail('The render failed', e);
    } finally {
      setRendering(false);
    }
  };

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const changedSinceRender = (o: SceneObject | null) => {
    if (!o || !activeRender) return false;
    const was = activeRender.layout_snapshot?.[o.id];
    if (!was) return false;
    return was.colour_hex !== o.colour_hex || was.product_id !== o.product_id;
  };

  const applyToRender = async (o: SceneObject) => {
    if (!data || !activeRender || !canvasRef.current || !activeRender.id_pass_path) return;
    setApplying(true);
    try {
      const pose = activeRender.camera as unknown as Parameters<SceneCanvasHandle['captureIdPassAt']>[0];
      const fresh = await canvasRef.current.captureIdPassAt(pose);
      const oldHex = Object.entries(activeRender.id_map ?? {}).find(([, objId]) => objId === o.id)?.[0];
      const newHex = Object.entries(fresh.idMap).find(([, objId]) => objId === o.id)?.[0];
      const [oldPass, newPass, base] = await Promise.all([
        loadImage(publicUrl(activeRender.id_pass_path)),
        loadImage(fresh.idPass),
        loadImage(activeRender.image_url),
      ]);
      const passes = [
        ...(oldHex ? [{ image: oldPass, hex: oldHex }] : []),
        ...(newHex && newPass.naturalWidth === oldPass.naturalWidth ? [{ image: newPass, hex: newHex }] : []),
      ];
      if (!passes.length) throw new Error('This object is not in the render. Render the room again first.');
      const mask = await objectMask(passes);
      if (!mask.box) throw new Error('This object cannot be seen from the render’s camera, so there is nothing to change in the picture.');
      const p = o.product_id ? products[o.product_id] : undefined;
      const size = effectiveSize(o, p);
      const cm = (mm: number) => Math.round(mm / 10);
      const where = describeBox(mask.box);
      const instruction = p
        ? `Replace the ${o.label} in the ${where} with the product shown in the first image ("${p.name}"), about ${cm(size.width_mm)} × ${cm(size.depth_mm)} cm and ${cm(size.height_mm)} cm high, standing in the same place, at the same scale and perspective${o.colour_hex ? `, in colour ${o.colour_hex}` : ''}. Change nothing else in the picture.`
        : `Change the colour of the ${o.label} in the ${where} to ${o.colour_hex}. Keep its shape, its material and texture, its position and every other part of the picture exactly as it is.`;
      const [idPath, result] = await Promise.all([
        sceneStudioService.uploadCapture(data.scene, fresh.idPass, 'ids'),
        sceneStudioService.generate({
          mode: 'image-edit',
          reference_image_url: activeRender.image_url,
          style_reference_url: p?.imageUrl && p.imageUrl.startsWith('https://') ? p.imageUrl : undefined,
          edit_instruction: instruction,
          model_tier: 'fast',
          workspace_id: data.scene.workspace_id,
        }),
      ]);
      const edited = await loadImage(result.image_url);
      const composite = await compositeMasked(base, edited, mask.canvas);
      const compositePath = await sceneStudioService.uploadCapture(data.scene, composite, `edit-${o.id.slice(0, 8)}`);
      const saved = await sceneStudioService.saveRender({
        floor_plan_id: id, parent_render_id: activeRender.id, kind: 'object_edit', edited_object_id: o.id,
        camera: activeRender.camera, capture_path: activeRender.capture_path, id_pass_path: idPath, id_map: fresh.idMap,
        style_reference_url: activeRender.style_reference_url, style_label: activeRender.style_label,
        instruction, image_url: publicUrl(compositePath),
        layout_snapshot: { ...activeRender.layout_snapshot, ...layoutOf([o]) },
      });
      setRenders((list) => [saved, ...list]);
      setActiveRenderId(saved.id);
      setShowRender(true);
      onRendered?.({ image_url: saved.image_url, label: `${o.label} changed`, credits_used: result.credits_used, kind: 'object_edit' });
      toast({ title: `${o.label} updated in the render`, description: `${result.credits_used} credits used. Everything outside it is unchanged.` });
    } catch (e) {
      fail('The object could not be applied to the render', e);
    } finally {
      setApplying(false);
    }
  };

  const references = useMemo(() => renders.filter((r) => r.kind === 'full').slice(0, 9).map((r) => ({ url: r.image_url, label: r.style_label ?? 'Earlier render' })), [renders]);
  const removed = objects.filter((o) => o.removed_at);
  const totalArea = useMemo(() => (data?.rooms ?? []).reduce((sum, r) => sum + roomArea(r.outline), 0), [data]);
  const toolHint = TOOLS.find((t) => t.id === tool)?.hint;

  if (loadError) {
    return <Card><HubEmptyState icon={Box} title="This 3D room could not be opened" description={loadError} /></Card>;
  }
  if (!data) {
    return <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the 3D room</p>;
  }

  const { scene } = data;
  const notes = scene.extract_notes ?? {};
  const noRoom = data.rooms.length === 0 && data.walls.length === 0;

  const sidePanel = selected && !selected.removed_at ? (
    <div className="space-y-3">
    <ObjectInspector
      obj={selected}
      product={selected.product_id ? products[selected.product_id] : undefined}
      workspaceId={scene.workspace_id}
      hasRender={!!activeRender}
      applyBusy={applying}
      changedSinceRender={changedSinceRender(selected)}
      onChange={(patch) => patchObject(selected.id, patch)}
      onProduct={(p) => setObjectProduct(selected.id, p)}
      onApplyToRender={() => void applyToRender(selected)}
      onDelete={() => removeObject(selected.id)}
      onClose={() => setSelectedId(null)}
    />
    <Card>
      <CardContent className="space-y-2 p-3 text-xs">
        {selected.model_status === 'ready' ? (
          <p className="flex items-center gap-1.5"><BoxIcon className="h-3.5 w-3.5" />Shown as a photo-real 3D model.</p>
        ) : selected.model_status === 'processing' ? (
          <p className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Making the 3D model. It appears in the room in about a minute.</p>
        ) : (
          <>
            {selected.model_status === 'failed' && <p className="text-destructive">The last attempt failed and was refunded{selected.model_error ? `: ${selected.model_error}` : '.'}</p>}
            <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={making3d === selected.id} onClick={() => void make3d(selected)}>
              {making3d === selected.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BoxIcon className="h-3.5 w-3.5" />}
              Make 3D (10 credits)
            </Button>
            <p className="text-muted-foreground">{selected.product_id ? 'Made from the product photo, once, then kept for every room.' : 'Made from how it looks in the current render.'}</p>
          </>
        )}
      </CardContent>
    </Card>
    </div>
  ) : tool === 'paint' ? (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Paint</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Colour</Label>
          <ColourRow value={paintProduct ? null : paintColour} onChange={(hex) => { setPaintColour(hex); setPaintProduct(null); }} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Or a product (tile, wood, paint)</Label>
          {paintProduct && (
            <div className="flex items-center gap-2 rounded-sm border border-primary p-1.5">
              {paintProduct.imageUrl && <img src={paintProduct.imageUrl} alt={paintProduct.name} className="h-8 w-8 rounded-sm object-cover" />}
              <span className="min-w-0 flex-1 truncate text-xs">{paintProduct.name}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setPaintProduct(null)} aria-label="Clear product"><X className="h-3.5 w-3.5" /></Button>
            </div>
          )}
          {pickingPaint
            ? <ProductPicker workspaceId={scene.workspace_id} title="Paint with a product" onCancel={() => setPickingPaint(false)} onPick={(p) => { setPaintProduct(p); setPickingPaint(false); }} />
            : <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setPickingPaint(true)}><Package className="h-3.5 w-3.5" />Choose a product</Button>}
        </div>
        <p className="text-xs text-muted-foreground">Then click a floor, or a wall on the side of the room you want painted. Tiles are laid at their real size.</p>
      </CardContent>
    </Card>
  ) : (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">This Room</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="neutral">{SCENE_SOURCE_LABEL[scene.source_kind]}</Badge>
          <Badge variant={SCENE_READ_STATUS[scene.extract_status].variant}>{SCENE_READ_STATUS[scene.extract_status].label}</Badge>
          {notes.scale_basis && <Badge variant={notes.scale_basis === 'printed_dimensions' ? 'success' : 'warning'}>{notes.scale_basis === 'printed_dimensions' ? 'Printed Dimensions' : notes.scale_basis === 'typical_sizes' ? 'Sizes Estimated' : 'Scale Assumed'}</Badge>}
        </div>
        <p className="text-muted-foreground">
          {count(data.rooms.length, 'room')} · {count(data.walls.length, 'wall')} · {count(data.openings.length, 'door or window', 'doors and windows')} · {count(objects.filter((o) => !o.removed_at).length, 'object')}
        </p>
        {(notes.assumptions?.length ?? 0) > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">What was assumed</Label>
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{notes.assumptions!.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
        )}
        {scene.extract_status === 'failed' && <p className="text-destructive">{scene.extract_error}</p>}
        {scene.source_storage_path && (
          <Button variant="outline" size="sm" className="w-full gap-1.5" disabled={reading} onClick={async () => {
            try { await sceneStudioService.read(scene.id); void load(); } catch (e) { fail('The image could not be read again', e); }
          }}>
            <RefreshCw className="h-3.5 w-3.5" />Read the image again
          </Button>
        )}
        <div className="space-y-2 border-t border-hairline pt-3">
          <Label className="text-xs">Add to the room</Label>
          {adding === 'product' ? (
            <ProductPicker workspaceId={scene.workspace_id} title="Add a product" onCancel={() => setAdding(null)} onPick={(p) => void addObject({ label: p.name.slice(0, 200), kind: 'other', product: p })} />
          ) : adding === 'form' ? (
            <div className="space-y-2">
              <Input placeholder="Name, e.g. Oak sideboard" value={newObj.label} onChange={(e) => setNewObj({ ...newObj, label: e.target.value })} />
              <Select value={newObj.kind} onValueChange={(v) => setNewObj({ ...newObj, kind: v })}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{SCENE_OBJECT_KINDS.map((k) => <SelectItem key={k} value={k}>{k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>)}</SelectContent>
              </Select>
              <div className="flex gap-1.5">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setAdding(null)}>Cancel</Button>
                <Button size="sm" className="flex-1" disabled={!newObj.label.trim()} onClick={() => void addObject({ label: newObj.label.trim(), kind: newObj.kind })}>Add</Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setAdding('product')}><Package className="h-3.5 w-3.5" />Product</Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => setAdding('form')}><Plus className="h-3.5 w-3.5" />Object</Button>
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">The 3D room is a schematic of the layout, not a survey. Realism comes from Render.</p>
      </CardContent>
    </Card>
  );

  return (
    <PinnedProductsContext.Provider value={pinned}>
      <div className="space-y-3">
        <div className="relative h-[64vh] min-h-[440px] overflow-hidden rounded-md border border-hairline bg-surface-sunken">
          {reading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />Reading the image into rooms, walls and furniture. This takes about a minute.
            </div>
          ) : noRoom ? (
            <HubEmptyState
              icon={Box}
              title={scene.extract_status === 'failed' ? 'The image could not be read' : 'No room yet'}
              description={scene.extract_status === 'failed' ? (scene.extract_error ?? undefined) : 'Add a rectangular room to start.'}
              action={<Button onClick={async () => { try { await sceneStudioService.addRectRoom(scene.id, 5000, 4000, 'Room'); void load(); } catch (e) { fail('The room could not be added', e); } }}>Add a 5 × 4 m room</Button>}
            />
          ) : !webgl ? (
            <HubEmptyState icon={Box} title="3D is not available in this browser" description="This device does not support WebGL 2. Open the conversation on a computer to edit the room in 3D." />
          ) : (
            <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
              <SceneCanvas
                ref={canvasRef}
                rooms={data.rooms}
                walls={data.walls}
                openings={data.openings}
                surfaces={surfaces}
                objects={objects}
                products={products}
                defaultWallHeightMm={scene.default_wall_height_mm}
                viewCamera={scene.view_camera}
                tool={tool}
                wireframe={wireframe}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onMoveObject={onMoveObject}
                onRemoveObject={removeObject}
                onPaint={(roomId, surface) => void paint(roomId, surface)}
                onFocusRoom={(roomId) => goToRoom(roomId, eyeLevel)}
                modelUrls={modelUrls}
                walkRoomId={walkRoomId}
                onWalkEnd={() => setWalkRoomId(undefined)}
              />
            </Suspense>
          )}

          {!reading && !noRoom && webgl && !showRender && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.10))]" />

              {!walking && <div className="absolute left-3 top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-md border border-hairline bg-card p-1 shadow-overlay">
                {TOOLS.map((t) => (
                  <DockButton key={t.id} side="right" label={t.label} hint={t.hint} active={tool === t.id} onClick={() => setTool(t.id)}>
                    <t.icon className="h-4 w-4" />
                  </DockButton>
                ))}
              </div>}

              <div className="absolute right-3 top-3 flex gap-1 rounded-md border border-hairline bg-card p-1 shadow-overlay">
                <DockButton label={walking ? 'Stop Walking' : 'Walk'} hint="Walk through the rooms at eye height: WASD or arrows, drag to look, click the floor to go there" active={walking} onClick={() => (walking ? setWalkRoomId(undefined) : startWalk(null))}><PersonStanding className="h-4 w-4" /></DockButton>
                <DockButton label="Floor Plan" hint="Look straight down on the whole plan" onClick={() => { setFocusRoomId(null); canvasRef.current?.topView(); }}><MapIcon className="h-4 w-4" /></DockButton>
                <DockButton label="Reset View" hint="Back to the starting view" onClick={() => { setFocusRoomId(null); canvasRef.current?.resetView(); }}><Hand className="h-4 w-4" /></DockButton>
                <DockButton label="Wireframe" hint="See through walls and furniture" active={wireframe} onClick={() => setWireframe((w) => !w)}><Grid3x3 className="h-4 w-4" /></DockButton>
                <DockButton
                  label={eyeLevel ? 'Eye level: on' : 'Eye level: off'}
                  hint="Stand in the space at eye height instead of looking down on it"
                  active={eyeLevel}
                  onClick={() => { const next = !eyeLevel; setEyeLevel(next); goToRoom(focusRoomId ?? data.rooms[0]?.id, next); }}
                ><Footprints className="h-4 w-4" /></DockButton>
              </div>

              {!walking && <div className="absolute bottom-3 left-3 flex gap-1 rounded-md border border-hairline bg-card p-1 shadow-overlay">
                <DockButton side="top" label="Undo" hint="Ctrl+Z" disabled={!history.length} onClick={() => void undo()}><Undo2 className="h-4 w-4" /></DockButton>
                <DockButton side="top" label="Reset Layout" hint="Put everything back where it was when the room was opened" onClick={resetLayout}><RotateCw className="h-4 w-4" /></DockButton>
                <DockButton side="top" label="Empty the Room" hint="Take every object out; they wait in the tray" disabled={!objects.some((o) => !o.removed_at)} onClick={emptyRoom}><Trash2 className="h-4 w-4" /></DockButton>
              </div>}

              {walking && (
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-hairline bg-card px-3 py-1.5 text-xs shadow-overlay">
                  <span className="text-muted-foreground">WASD or arrows to walk · drag to look · click the floor to go there · Shift to hurry</span>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => setWalkRoomId(undefined)}>Stop · Esc</Button>
                </div>
              )}

              {!walking && tool !== 'view' && toolHint && (
                <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[50%] -translate-x-1/2 rounded-md border border-hairline bg-card px-3 py-1.5 text-center text-xs text-muted-foreground shadow-overlay">{toolHint}</div>
              )}

              {removed.length > 0 && (
                <div className="absolute right-3 top-16 max-w-[240px] rounded-md border border-hairline bg-card p-2 shadow-overlay">
                  <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Removed · click to put back</p>
                  <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                    {removed.map((o) => (
                      <span key={o.id} className="inline-flex items-center rounded-sm border border-hairline bg-surface-sunken text-xs">
                        <button type="button" onClick={() => restoreObject(o.id)} className="px-2 py-1 text-left hover:text-foreground">{o.label}</button>
                        <button type="button" onClick={() => void deleteForever(o.id)} className="px-1.5 py-1 text-muted-foreground hover:text-destructive" aria-label={`Delete ${o.label} for good`} title="Delete for good"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {styleChoice && <span className="rounded-md border border-hairline bg-card px-2.5 py-1.5 text-xs shadow-overlay">{styleChoice.label}</span>}
                <Button className="gap-1.5 shadow-overlay" disabled={rendering} onClick={() => void render(styleChoice)}>
                  {rendering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {rendering ? 'Rendering' : 'Render'}
                </Button>
              </div>
            </>
          )}

          {rendering && !showRender && (
            <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-md border border-hairline bg-card px-3 py-1.5 text-xs shadow-overlay">
              <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />Rendering{styleChoice ? ` in ${styleChoice.label}` : ''}…
            </div>
          )}

          {showRender && activeRender && (
            <div className="absolute inset-0 bg-background">
              <img src={activeRender.image_url} alt={activeRender.style_label ?? 'Render'} className="h-full w-full object-contain" />
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center gap-1 rounded-md border border-hairline bg-card p-1 shadow-overlay">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowRender(false)}><Layers className="h-3.5 w-3.5" />Back to 3D</Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setShowRender(false); canvasRef.current?.setPose(activeRender.camera as unknown as Parameters<SceneCanvasHandle['setPose']>[0]); }}><Eye className="h-3.5 w-3.5" />Edit from this view</Button>
                {onWalkThrough && (
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onWalkThrough(activeRender.image_url, `${scene.name}${activeRender.style_label ? ` — ${activeRender.style_label}` : ''}`)}>
                    <Footprints className="h-3.5 w-3.5" />Walk through ({VR_CREDIT_COSTS['marble-1.1']} credits)
                  </Button>
                )}
                <a className="px-2 text-xs text-muted-foreground underline" href={activeRender.image_url} target="_blank" rel="noreferrer">Full size</a>
              </div>
            </div>
          )}
        </div>

        {data.rooms.length > 0 && !reading && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            <SpaceCard
              title="Whole Home"
              meta={`${count(data.rooms.length, 'space')} · ${totalArea.toFixed(1)} m²`}
              active={focusRoomId === null}
              onOpen={() => { setFocusRoomId(null); setShowRender(false); canvasRef.current?.resetView(); }}
            />
            {data.rooms.map((r) => (
              <SpaceCard
                key={r.id}
                title={r.name}
                meta={`${roomArea(r.outline).toFixed(1)} m² · ${count(objects.filter((o) => !o.removed_at && o.room_id === r.id).length, 'object')}`}
                active={focusRoomId === r.id}
                onOpen={() => { setEyeLevel(false); goToRoom(r.id, false); }}
                onStand={() => startWalk(r.id)}
              />
            ))}
          </div>
        )}

        {renders.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {renders.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => { setActiveRenderId(r.id); setShowRender(true); }}
                className={`w-32 shrink-0 overflow-hidden rounded-sm border text-left ${r.id === activeRenderId ? 'border-primary ring-2 ring-primary' : 'border-hairline'}`}
              >
                <img src={r.image_url} alt={r.style_label ?? 'Render'} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                <span className="block truncate px-1.5 py-1 text-[11px]">
                  {r.kind === 'object_edit' ? `Edit: ${objects.find((o) => o.id === r.edited_object_id)?.label ?? 'object'}` : (r.style_label ?? 'Render')}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-2">
          <StylePanel styles={styles} references={references} active={styleChoice} busy={rendering} disabled={rendering || reading || noRoom} onPick={(c) => void render(c)} />
          <div>{sidePanel}</div>
        </div>
      </div>
    </PinnedProductsContext.Provider>
  );
}
