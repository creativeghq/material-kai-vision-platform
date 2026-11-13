import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Box, Eye, Footprints, Grid3x3, Hand, Layers, Loader2, Map as MapIcon, Move, Package, Paintbrush, Plus,
  RefreshCw, RotateCw, Sparkles, Trash2, Undo2, X,
} from 'lucide-react';

import { HubRecordPage } from '@/components/core/hub/HubRecordPage';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { loadVocabulary, type VocabularyTerm } from '@/services/vocabularies';
import { vrWorldService, VR_CREDIT_COSTS } from '@/services/vrWorldService';
import {
  publicUrl, sceneStudioService,
  type LayoutEntry, type SceneData, type SceneObject, type SceneProduct, type SceneRender, type SceneSurface,
} from '@/services/sceneStudioService';
import { describeBox, describeObject, effectiveSize, polygonCentroid } from '@/lib/scene/sceneGeometry';
import { compositeMasked, loadImage, objectMask } from '@/lib/scene/sceneCompositing';
import { SCENE_OBJECT_KINDS } from '@/lib/scene/sceneReadSchema';
import type { SceneCanvasHandle, SceneTool } from '@/components/features/scenestudio/SceneCanvas';
import { ColourRow, ObjectInspector, ProductPicker, StylePanel, type StyleChoice } from '@/components/features/scenestudio/ScenePanels';
import { SCENE_READ_STATUS, SCENE_SOURCE_LABEL } from './SceneStudioPage';

const SceneCanvas = lazy(() => import('@/components/features/scenestudio/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));
const WorldViewer = lazy(() => import('@/components/features/ai/WorldViewer').then((m) => ({ default: m.WorldViewer })));

const TOOLS: Array<{ id: SceneTool; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }> = [
  { id: 'view', label: 'View', icon: Eye, hint: 'Drag to turn the view · right-drag to pan · scroll to zoom · click an object to select it' },
  { id: 'move', label: 'Move', icon: Move, hint: 'Drag an object across the floor · right-drag to pan' },
  { id: 'turn', label: 'Turn', icon: RotateCw, hint: 'Drag around an object to turn it (15° steps, hold Shift for free) · right-drag to pan' },
  { id: 'remove', label: 'Remove', icon: Trash2, hint: 'Click an object to take it out of the room — it waits in the tray to be put back' },
  { id: 'paint', label: 'Paint', icon: Paintbrush, hint: 'Pick a colour or product on the right, then click a floor or a wall' },
];

interface Snapshot { objects: SceneObject[]; surfaces: SceneSurface[] }

const layoutOf = (objects: SceneObject[]): Record<string, LayoutEntry> =>
  Object.fromEntries(objects.map((o) => [o.id, {
    colour_hex: o.colour_hex, product_id: o.product_id, x_mm: o.x_mm, y_mm: o.y_mm, rotation_deg: o.rotation_deg, removed: !!o.removed_at,
  }]));

const hasWebGL2 = () => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
};

export default function SceneStudioEditorPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
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
  const [world, setWorld] = useState<{ renderId: string; vrWorldId: string } | null>(null);
  const [walking, setWalking] = useState(false);
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
      if (!d) { setLoadError('This scene does not exist or you cannot open it.'); return; }
      apply(d);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'The scene could not be loaded.');
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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) { e.preventDefault(); void undo(); }
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
    if (!data || !canvasRef.current || rendering || !activeWorkspaceId) return;
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
        workspace_id: activeWorkspaceId,
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
      toast({ title: 'Rendered', description: `${result.credits_used} credits used.` });
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
    if (!data || !activeRender || !canvasRef.current || !activeRender.id_pass_path || !activeWorkspaceId) return;
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
          workspace_id: activeWorkspaceId,
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
      toast({ title: `${o.label} updated in the render`, description: `${result.credits_used} credits used. Everything outside it is unchanged.` });
    } catch (e) {
      fail('The object could not be applied to the render', e);
    } finally {
      setApplying(false);
    }
  };

  const walkThrough = async (r: SceneRender) => {
    if (r.vr_world_id) { setWorld({ renderId: r.id, vrWorldId: r.vr_world_id }); return; }
    setWalking(true);
    try {
      const res = await vrWorldService.generateVRWorld({
        sourceImageUrl: r.image_url,
        prompt: `${data?.scene.name ?? 'Interior'}${r.style_label ? ` — ${r.style_label}` : ''}`,
        style: r.style_label ?? undefined,
      });
      await sceneStudioService.setRenderWorld(r.id, res.vrWorldId);
      setRenders((list) => list.map((x) => (x.id === r.id ? { ...x, vr_world_id: res.vrWorldId } : x)));
      setWorld({ renderId: r.id, vrWorldId: res.vrWorldId });
    } catch (e) {
      fail('The walk-through could not be started', e);
    } finally {
      setWalking(false);
    }
  };

  const references = useMemo(() => renders.filter((r) => r.kind === 'full').slice(0, 9).map((r) => ({ url: r.image_url, label: r.style_label ?? 'Earlier render' })), [renders]);
  const removed = objects.filter((o) => o.removed_at);
  const toolHint = TOOLS.find((t) => t.id === tool)?.hint;

  if (loadError) {
    return (
      <HubRecordPage icon={Box} title="Scene" breadcrumbs={[{ label: 'Scene Studio', to: '/scene-studio' }, { label: 'Scene' }]} left={null}>
        <Card><HubEmptyState icon={Box} title="This scene could not be opened" description={loadError} action={<Button variant="outline" onClick={() => navigate('/scene-studio')}><ArrowLeft className="mr-1.5 h-4 w-4" />All scenes</Button>} /></Card>
      </HubRecordPage>
    );
  }
  if (!data) {
    return (
      <HubRecordPage icon={Box} title="Scene" breadcrumbs={[{ label: 'Scene Studio', to: '/scene-studio' }, { label: 'Loading' }]} left={null}>
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading the scene</p>
      </HubRecordPage>
    );
  }

  const { scene } = data;
  const notes = scene.extract_notes ?? {};
  const noRoom = data.rooms.length === 0 && data.walls.length === 0;

  const rightRail = (
    <>
      {selected && !selected.removed_at ? (
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
          <CardHeader className="pb-2"><CardTitle className="text-sm">This Scene</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="neutral">{SCENE_SOURCE_LABEL[scene.source_kind]}</Badge>
              <Badge variant={SCENE_READ_STATUS[scene.extract_status].variant}>{SCENE_READ_STATUS[scene.extract_status].label}</Badge>
              {notes.scale_basis && <Badge variant={notes.scale_basis === 'printed_dimensions' ? 'success' : 'warning'}>{notes.scale_basis === 'printed_dimensions' ? 'Printed Dimensions' : notes.scale_basis === 'typical_sizes' ? 'Sizes Estimated' : 'Scale Assumed'}</Badge>}
            </div>
            <p className="text-muted-foreground">
              {data.rooms.length} rooms · {data.walls.length} walls · {data.openings.length} doors and windows · {objects.filter((o) => !o.removed_at).length} objects
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
      )}
    </>
  );

  return (
    <HubRecordPage
      icon={Box}
      title={scene.name}
      subtitle="Arrange the room in 3D, then render it photo-real in any style."
      breadcrumbs={[{ label: 'Scene Studio', to: '/scene-studio' }, { label: scene.name }]}
      left={<StylePanel styles={styles} references={references} active={styleChoice} busy={rendering} disabled={rendering || reading || noRoom} onPick={(c) => void render(c)} />}
      right={rightRail}
      overlays={
        <Dialog open={!!world} onOpenChange={(o) => { if (!o) setWorld(null); }}>
          <DialogContent className="max-w-5xl">
            <DialogHeader>
              <DialogTitle>Walk-through</DialogTitle>
              <DialogDescription>A generated world built from the render: look around and move with WASD. It is a visualisation, not a survey.</DialogDescription>
            </DialogHeader>
            <div className="h-[60vh]">
              {world && <Suspense fallback={<Loader2 className="h-5 w-5 animate-spin" />}><WorldViewer vrWorldId={world.vrWorldId} /></Suspense>}
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-hairline bg-surface-sunken p-1.5">
          {TOOLS.map((t) => (
            <Button key={t.id} size="sm" variant={tool === t.id && !showRender ? 'secondary' : 'ghost'} className="gap-1.5" onClick={() => { setTool(t.id); setShowRender(false); }}>
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setShowRender(false); canvasRef.current?.topView(); }}><MapIcon className="h-3.5 w-3.5" />Floor plan</Button>
          <Button size="sm" variant={wireframe ? 'secondary' : 'ghost'} className="gap-1.5" onClick={() => setWireframe((w) => !w)}><Grid3x3 className="h-3.5 w-3.5" />Wireframe</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setShowRender(false); canvasRef.current?.resetView(); }}><Hand className="h-3.5 w-3.5" />Reset view</Button>
        </div>

        <div className="relative h-[62vh] min-h-[420px] bg-surface-sunken">
          {reading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
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
            <HubEmptyState icon={Box} title="3D is not available in this browser" description="This device does not support WebGL 2. Open the scene on a computer to edit it in 3D; renders stay viewable below." />
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
              />
            </Suspense>
          )}

          {showRender && activeRender && (
            <div className="absolute inset-0 flex flex-col bg-background">
              <img src={activeRender.image_url} alt={activeRender.style_label ?? 'Render'} className="min-h-0 flex-1 object-contain" />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline bg-card p-1.5">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowRender(false)}><Layers className="h-3.5 w-3.5" />Back to 3D</Button>
                <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setShowRender(false); canvasRef.current?.setPose(activeRender.camera as unknown as Parameters<SceneCanvasHandle['setPose']>[0]); }}><Eye className="h-3.5 w-3.5" />Edit from this view</Button>
                <Button size="sm" variant="ghost" className="gap-1.5" disabled={walking} onClick={() => void walkThrough(activeRender)}>
                  {walking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Footprints className="h-3.5 w-3.5" />}
                  {activeRender.vr_world_id ? 'Open walk-through' : `Walk through (${VR_CREDIT_COSTS['marble-1.1']} credits)`}
                </Button>
                <a className="ml-auto text-xs text-muted-foreground underline" href={activeRender.image_url} target="_blank" rel="noreferrer">Open full size</a>
              </div>
            </div>
          )}

          {!showRender && removed.length > 0 && !reading && (
            <div className="absolute bottom-2 right-2 max-w-[260px] rounded-sm border border-hairline bg-card/95 p-2 shadow-overlay">
              <p className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Removed · click to put back, × to delete</p>
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

          {!showRender && toolHint && !reading && !noRoom && (
            <div className="pointer-events-none absolute bottom-2 left-2 max-w-[60%] rounded-sm bg-card/90 px-2 py-1 text-[11px] text-muted-foreground">{toolHint}</div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-hairline bg-surface-sunken p-1.5">
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={!history.length} onClick={() => void undo()}><Undo2 className="h-3.5 w-3.5" />Undo</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={!objects.some((o) => !o.removed_at)} onClick={emptyRoom}>Empty the room</Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={resetLayout}>Reset layout</Button>
          <Button size="sm" className="ml-auto gap-1.5" disabled={rendering || reading || noRoom || !webgl} onClick={() => void render(styleChoice)}>
            {rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {rendering ? 'Rendering' : 'Render'}
          </Button>
        </div>
      </Card>

      {renders.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Renders</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {renders.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => { setActiveRenderId(r.id); setShowRender(true); }}
                  className={`w-36 shrink-0 overflow-hidden rounded-sm border text-left ${r.id === activeRenderId ? 'border-primary ring-2 ring-primary' : 'border-hairline'}`}
                >
                  <img src={r.image_url} alt={r.style_label ?? 'Render'} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <span className="block truncate px-1.5 py-1 text-[11px]">
                    {r.kind === 'object_edit' ? `Edit: ${objects.find((o) => o.id === r.edited_object_id)?.label ?? 'object'}` : (r.style_label ?? 'Render')}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </HubRecordPage>
  );
}
