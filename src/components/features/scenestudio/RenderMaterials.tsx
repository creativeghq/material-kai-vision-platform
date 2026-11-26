import React from 'react';
import { Package } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { COLOUR_ROLE_LABELS, type ColourRole } from '@/lib/scene/colourPlan';
import { SCENE_SLOT_LABELS } from '@/lib/scene/sceneReadSchema';
import { resolveFinish } from '@/lib/scene/sceneSurfaces';
import type { SceneObject, SceneObjectFinish, SceneProduct, SceneSurface } from '@/services/sceneStudioService';

interface Row { key: string; objectId: string | null; where: string; what: string; hex: string | null; imageUrl: string | null }

const NOT_CHOSEN = 'No material chosen';

const SURFACE_LABELS: Record<string, string> = { floor: 'Floor', ceiling: 'Ceiling', walls: 'Walls', wall: 'Wall', splash: 'Splashback', zone: 'Wall Area' };

export function renderMaterialRows(
  objects: SceneObject[], finishes: SceneObjectFinish[], surfaces: SceneSurface[], products: Record<string, SceneProduct>, rooms: Array<{ id: string; name: string }>,
): Row[] {
  const rows: Row[] = [];
  for (const o of objects) {
    if (o.removed_at) continue;
    const p = o.product_id ? products[o.product_id] : undefined;
    if (p) rows.push({ key: `o-${o.id}`, objectId: o.id, where: o.label, what: p.name, hex: null, imageUrl: p.imageUrl });
    const own = finishes.filter((f) => f.object_id === o.id);
    for (const f of own) {
      const fin = resolveFinish(f, f.product_id ? products[f.product_id] : undefined);
      if (!fin) continue;
      rows.push({ key: `f-${f.id}`, objectId: o.id, where: `${o.label} · ${SCENE_SLOT_LABELS[f.slot]}`, what: fin.label ?? NOT_CHOSEN, hex: fin.hex ?? null, imageUrl: fin.imageUrl ?? null });
    }
    if (!p && !own.length) rows.push({ key: `c-${o.id}`, objectId: o.id, where: o.label, what: NOT_CHOSEN, hex: o.colour_hex, imageUrl: null });
  }
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'Room';
  for (const s of surfaces) {
    const fin = resolveFinish(s, s.product_id ? products[s.product_id] : undefined);
    if (!fin) continue;
    rows.push({ key: `s-${s.id}`, objectId: null, where: `${roomName(s.room_id)} · ${SURFACE_LABELS[s.surface] ?? s.surface}`, what: fin.label ?? NOT_CHOSEN, hex: fin.hex ?? null, imageUrl: fin.imageUrl ?? null });
  }
  for (const r of rooms) {
    for (const kind of ['floor', 'walls'] as const) {
      if (surfaces.some((s) => s.room_id === r.id && (s.surface === kind || (kind === 'walls' && s.surface === 'wall')))) continue;
      rows.push({ key: `n-${r.id}-${kind}`, objectId: null, where: `${r.name} · ${SURFACE_LABELS[kind]}`, what: NOT_CHOSEN, hex: null, imageUrl: null });
    }
  }
  return rows;
}

const Swatch: React.FC<{ hex: string | null; imageUrl: string | null }> = ({ hex, imageUrl }) => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-hairline" style={{ backgroundColor: hex ?? undefined }}>
    {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : !hex && <Package className="h-4 w-4 text-muted-foreground" />}
  </span>
);

export const MaterialsPanel: React.FC<{
  title: string;
  subtitle: string;
  plan?: Array<{ role: string; hex: string }>;
  rows: Row[];
  onPickObject(id: string): void;
  onPickSurface(): void;
  actions?: React.ReactNode;
}> = ({ title, subtitle, plan = [], rows, onPickObject, onPickSurface, actions }) => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm">{title}</CardTitle>
      <p className="text-xs text-muted-foreground">{subtitle}</p>
    </CardHeader>
    <CardContent className="space-y-3">
      {plan.length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold">Colour Plan</h4>
          {plan.map((p, i) => (
            <div key={`${p.role}-${i}`} className="flex items-center gap-2">
              <span className="h-5 w-5 shrink-0 rounded-sm border border-hairline" style={{ backgroundColor: p.hex }} />
              <span className="flex-1 text-xs">{COLOUR_ROLE_LABELS[p.role as ColourRole] ?? p.role}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{p.hex}</span>
            </div>
          ))}
        </section>
      )}
      <div className="space-y-1.5">
        {rows.map((r) => (
          <button key={r.key} type="button" onClick={() => (r.objectId ? onPickObject(r.objectId) : onPickSurface())} className="flex w-full items-center gap-2 rounded-sm text-left hover:bg-surface-sunken">
            <Swatch hex={r.hex} imageUrl={r.imageUrl} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-xs ${r.what === NOT_CHOSEN ? 'text-muted-foreground' : 'font-medium'}`}>{r.what}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{r.where}</span>
            </span>
          </button>
        ))}
      </div>
      {actions && <div className="flex flex-wrap gap-1 border-t border-hairline pt-2">{actions}</div>}
    </CardContent>
  </Card>
);
