import React from 'react';
import { Package } from 'lucide-react';

import { COLOUR_ROLE_LABELS, type ColourRole } from '@/lib/scene/colourPlan';
import { SCENE_SLOT_LABELS } from '@/lib/scene/sceneReadSchema';
import { resolveFinish } from '@/lib/scene/sceneSurfaces';
import type { SceneObject, SceneObjectFinish, SceneProduct, SceneRender, SceneSurface } from '@/services/sceneStudioService';

interface Row { key: string; where: string; what: string; hex: string | null; imageUrl: string | null }

const SURFACE_LABELS: Record<string, string> = { floor: 'Floor', ceiling: 'Ceiling', walls: 'Walls', wall: 'Wall', splash: 'Splashback', zone: 'Wall Area' };

export function renderMaterialRows(
  objects: SceneObject[], finishes: SceneObjectFinish[], surfaces: SceneSurface[], products: Record<string, SceneProduct>, roomName: (id: string) => string,
): Row[] {
  const rows: Row[] = [];
  for (const o of objects) {
    if (o.removed_at) continue;
    const p = o.product_id ? products[o.product_id] : undefined;
    if (p) rows.push({ key: `o-${o.id}`, where: o.label, what: p.name, hex: null, imageUrl: p.imageUrl });
    const own = finishes.filter((f) => f.object_id === o.id);
    for (const f of own) {
      const fin = resolveFinish(f, f.product_id ? products[f.product_id] : undefined);
      if (!fin) continue;
      rows.push({ key: `f-${f.id}`, where: `${o.label} · ${SCENE_SLOT_LABELS[f.slot]}`, what: fin.label ?? fin.hex ?? '', hex: fin.hex ?? null, imageUrl: fin.imageUrl ?? null });
    }
    if (!p && !own.length && o.colour_hex) rows.push({ key: `c-${o.id}`, where: o.label, what: o.colour_hex, hex: o.colour_hex, imageUrl: null });
  }
  for (const s of surfaces) {
    const fin = resolveFinish(s, s.product_id ? products[s.product_id] : undefined);
    if (!fin) continue;
    rows.push({ key: `s-${s.id}`, where: `${roomName(s.room_id)} · ${SURFACE_LABELS[s.surface] ?? s.surface}`, what: fin.label ?? fin.hex ?? '', hex: fin.hex ?? null, imageUrl: fin.imageUrl ?? null });
  }
  return rows;
}

const Swatch: React.FC<{ hex: string | null; imageUrl: string | null }> = ({ hex, imageUrl }) => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-hairline" style={{ backgroundColor: hex ?? undefined }}>
    {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : !hex && <Package className="h-4 w-4 text-muted-foreground" />}
  </span>
);

export const RenderMaterials: React.FC<{ render: SceneRender; rows: Row[]; actions: React.ReactNode }> = ({ render, rows, actions }) => (
  <aside className="flex max-h-[40%] w-full flex-col border-t border-hairline bg-card md:max-h-none md:w-80 md:border-l md:border-t-0">
    <div className="space-y-0.5 border-b border-hairline bg-surface-sunken px-3 py-2">
      <p className="text-sm font-semibold">{render.style_label ?? 'Render'}</p>
      <p className="text-[11px] text-muted-foreground">What this render is made of</p>
    </div>
    <div className="flex-1 space-y-3 overflow-y-auto p-3">
      {(render.colour_plan ?? []).length > 0 && (
        <section className="space-y-1.5">
          <h4 className="text-xs font-semibold">Colour Plan</h4>
          {(render.colour_plan ?? []).map((p, i) => (
            <div key={`${p.role}-${i}`} className="flex items-center gap-2">
              <span className="h-5 w-5 shrink-0 rounded-sm border border-hairline" style={{ backgroundColor: p.hex }} />
              <span className="flex-1 text-xs">{COLOUR_ROLE_LABELS[p.role as ColourRole] ?? p.role}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{p.hex}</span>
            </div>
          ))}
        </section>
      )}
      <section className="space-y-1.5">
        <h4 className="text-xs font-semibold">Materials</h4>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No materials chosen yet. Select an object in 3D and choose a material, a board decor or a colour for it.</p>
        ) : rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <Swatch hex={r.hex} imageUrl={r.imageUrl} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{r.what}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{r.where}</span>
            </span>
          </div>
        ))}
      </section>
    </div>
    <div className="flex flex-wrap gap-1 border-t border-hairline p-2">{actions}</div>
  </aside>
);
