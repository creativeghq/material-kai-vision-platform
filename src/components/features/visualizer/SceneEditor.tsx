/**
 * Author a surface on a scene: click its four corners on the photo, say how big it really is,
 * and optionally let SAM 2 cut the mask so furniture in front of it stays. Workspace scenes only;
 * the library is authored by the operator.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Undo2, Wand2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { MoneyInput } from '@/components/core/ui/money-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Pt } from '@/lib/surfaceRenderer';
import {
  visualizerService, SURFACE_KINDS, SURFACE_KIND_LABELS,
  type VisualizerScene, type VisualizerSurface, type SurfaceKind, type NormalizedQuad,
} from '@/services/visualizerService';

interface Props {
  scene: VisualizerScene;
  workspaceId: string;
  existing: VisualizerSurface[];
  onSaved: (surface: VisualizerSurface) => void;
}

const CORNER_HINTS = ['far-left corner', 'far-right corner', 'near-right corner', 'near-left corner'];

export const SceneEditor: React.FC<Props> = ({ scene, workspaceId, existing, onSaved }) => {
  const { toast } = useToast();
  const imgRef = useRef<HTMLImageElement>(null);
  const [points, setPoints] = useState<Pt[]>([]);
  const [kind, setKind] = useState<SurfaceKind>('floor');
  const [widthM, setWidthM] = useState(4);
  const [depthM, setDepthM] = useState(3);
  const [autoMask, setAutoMask] = useState(true);
  const [saving, setSaving] = useState(false);
  const [maskNote, setMaskNote] = useState<string | null>(null);

  useEffect(() => { setPoints([]); setMaskNote(null); }, [scene.id]);

  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (points.length >= 4) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setPoints((prev) => [...prev, { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }]);
  }, [points.length]);

  // Corners are placed with the pointer; the keyboard can take the last one back.
  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setPoints((prev) => prev.slice(0, -1));
    }
  }, []);

  const save = useCallback(async () => {
    if (points.length !== 4) return;
    setSaving(true);
    setMaskNote(null);
    try {
      const taken = new Set(existing.map((s) => s.key));
      let key = kind as string;
      for (let n = 2; taken.has(key); n++) key = `${kind}_${n}`;
      const quad = points as NormalizedQuad;
      const surface = await visualizerService.saveSurface(scene, {
        key, kind, quad, width_cm: Math.round(widthM * 100), depth_cm: Math.round(depthM * 100), sort_order: existing.length,
      });
      if (autoMask) {
        const xs = quad.map((p) => p.x);
        const ys = quad.map((p) => p.y);
        const bbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
        const png = await visualizerService.requestMask(scene, bbox, workspaceId);
        if (png) {
          const maskUrl = await visualizerService.saveMask(scene, surface.id, png);
          onSaved({ ...surface, mask_path: `visualizer/scenes/${scene.id}/masks/${surface.id}.png`, maskUrl });
          setMaskNote('Mask cut by SAM 2.');
        } else {
          onSaved(surface);
          setMaskNote('SAM 2 could not cut a mask here; the whole rectangle will be painted. You can try again later.');
        }
      } else {
        onSaved(surface);
      }
      setPoints([]);
      toast({ title: 'Surface saved', description: `${SURFACE_KIND_LABELS[kind]} · ${widthM} × ${depthM} m` });
    } catch (e) {
      toast({ title: 'Could not save the surface', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [points, kind, widthM, depthM, autoMask, existing, scene, workspaceId, onSaved, toast]);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div
        role="application"
        aria-label={`${scene.name}: click the four corners of the surface; Backspace removes the last corner`}
        tabIndex={0}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="relative cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <img
          ref={imgRef}
          src={scene.imageUrl}
          alt=""
          className="pointer-events-none block w-full rounded-lg border border-border/60"
        />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1 1" preserveAspectRatio="none">
          {points.length >= 2 && (
            <polyline
              points={points.map((p) => `${p.x},${p.y}`).join(' ') + (points.length === 4 ? ` ${points[0].x},${points[0].y}` : '')}
              fill={points.length === 4 ? 'rgba(28,110,140,0.25)' : 'none'} stroke="#1c6e8c" strokeWidth={0.004} vectorEffect="non-scaling-stroke"
            />
          )}
          {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={0.008} fill="#1c6e8c" />)}
        </svg>
      </div>
      <div className="grid content-start gap-3">
        <p className="text-xs text-muted-foreground">
          {points.length < 4
            ? `Click the ${CORNER_HINTS[points.length]} of a rectangle on the ${SURFACE_KIND_LABELS[kind].toLowerCase()}.`
            : 'Four corners set. Say how big that rectangle really is, then save.'}
        </p>
        <div>
          <Label className="text-xs">Surface</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as SurfaceKind)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{SURFACE_KINDS.map((k) => <SelectItem key={k} value={k}>{SURFACE_KIND_LABELS[k]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Along the far edge (m)</Label>
            <MoneyInput displayDecimals={null} value={widthM} onValueChange={(v) => setWidthM(v || 1)} />
          </div>
          <div>
            <Label className="text-xs">Far to near (m)</Label>
            <MoneyInput displayDecimals={null} value={depthM} onValueChange={(v) => setDepthM(v || 1)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={autoMask} onChange={(e) => setAutoMask(e.target.checked)} />
          Cut the mask with SAM 2, so furniture in front stays
        </label>
        {maskNote && <p className="text-[11px] text-muted-foreground">{maskNote}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPoints((p) => p.slice(0, -1))} disabled={points.length === 0 || saving}>
            <Undo2 className="mr-1 h-3.5 w-3.5" />Undo corner
          </Button>
          <Button size="sm" onClick={save} disabled={points.length !== 4 || saving}>
            {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}Save surface
          </Button>
        </div>
      </div>
    </div>
  );
};
