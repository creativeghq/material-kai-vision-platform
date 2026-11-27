import React, { useState } from 'react';
import { ChevronDown, Package } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { COLOUR_ROLE_LABELS, type ColourRole } from '@/lib/scene/colourPlan';
import { SCENE_SLOT_LABELS } from '@/lib/scene/sceneReadSchema';
import { colourOptions } from '@/lib/scene/sceneSurfaces';
import { decorLabel, decorOfRow } from '@/lib/scene/boardDecor';
import type { SceneObject, SceneObjectFinish, SceneProduct, SceneSurface } from '@/services/sceneStudioService';

interface Row {
  key: string;
  objectId: string | null;
  where: string;
  material: { key: string; name: string; imageUrl: string | null } | null;
  colour: { name: string; hex: string; imageUrl: string | null } | null;
}

const SURFACE_LABELS: Record<string, string> = { floor: 'Floor', ceiling: 'Ceiling', walls: 'Walls', wall: 'Wall', splash: 'Splashback', zone: 'Wall Area' };

type FinishRow = Pick<SceneObjectFinish, 'product_id' | 'colour_hex'> & { decor_brand?: string | null; decor_code?: string | null; decor_name?: string | null };

function describe(f: FinishRow | null, products: Record<string, SceneProduct>): Pick<Row, 'material' | 'colour'> {
  const product = f?.product_id ? products[f.product_id] : undefined;
  if (product) {
    const option = f?.colour_hex ? colourOptions(product).find((o) => o.hex === f.colour_hex!.toLowerCase()) : undefined;
    return {
      material: { key: `p:${product.id}`, name: product.name, imageUrl: product.imageUrl },
      colour: option ? { name: option.name, hex: option.hex, imageUrl: option.swatch_url ?? null } : null,
    };
  }
  const decor = decorOfRow(f);
  if (decor) return { material: { key: `d:${decor.brand ?? ''}:${decor.code ?? ''}`, name: decorLabel(decor), imageUrl: null }, colour: null };
  return { material: null, colour: null };
}

export function renderMaterialRows(
  objects: SceneObject[], finishes: SceneObjectFinish[], surfaces: SceneSurface[], products: Record<string, SceneProduct>, rooms: Array<{ id: string; name: string }>,
): Row[] {
  const rows: Row[] = [];
  for (const o of objects) {
    if (o.removed_at) continue;
    if (o.product_id) rows.push({ key: `o-${o.id}`, objectId: o.id, where: o.label, ...describe({ product_id: o.product_id, colour_hex: null }, products) });
    const own = finishes.filter((f) => f.object_id === o.id);
    for (const f of own) rows.push({ key: `f-${f.id}`, objectId: o.id, where: `${o.label} · ${SCENE_SLOT_LABELS[f.slot]}`, ...describe(f, products) });
    if (!o.product_id && !own.length) rows.push({ key: `c-${o.id}`, objectId: o.id, where: o.label, material: null, colour: null });
  }
  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? 'Room';
  for (const s of surfaces) {
    rows.push({ key: `s-${s.id}`, objectId: null, where: `${roomName(s.room_id)} · ${SURFACE_LABELS[s.surface] ?? s.surface}`, ...describe(s, products) });
  }
  for (const r of rooms) {
    for (const kind of ['floor', 'walls'] as const) {
      if (surfaces.some((s) => s.room_id === r.id && (s.surface === kind || (kind === 'walls' && s.surface === 'wall')))) continue;
      rows.push({ key: `n-${r.id}-${kind}`, objectId: null, where: `${r.name} · ${SURFACE_LABELS[kind]}`, material: null, colour: null });
    }
  }
  return rows;
}

const Thumb: React.FC<{ imageUrl: string | null; hex?: string | null }> = ({ imageUrl, hex }) => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-hairline" style={{ backgroundColor: hex ?? undefined }}>
    {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : !hex && <Package className="h-4 w-4 text-muted-foreground" />}
  </span>
);

const usedOn = (rows: Row[]) => {
  const names = [...new Set(rows.map((r) => r.where))].sort((a, b) => a.localeCompare(b));
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ');
};

function groupBy<T>(items: T[], key: (t: T) => string): Array<[string, T[]]> {
  const m = new Map<string, T[]>();
  for (const it of items) (m.get(key(it)) ?? m.set(key(it), []).get(key(it))!).push(it);
  return [...m.entries()];
}

export const MaterialsPanel: React.FC<{
  title: string;
  subtitle: string;
  plan?: Array<{ role: string; hex: string }>;
  rows: Row[];
  onPickObject(id: string): void;
  onPickSurface(): void;
  actions?: React.ReactNode;
}> = ({ title, subtitle, plan = [], rows, onPickObject, onPickSurface, actions }) => {
  const [showUnchosen, setShowUnchosen] = useState(false);
  const pick = (r: Row) => (r.objectId ? onPickObject(r.objectId) : onPickSurface());
  const chosen = rows.filter((r) => r.material);
  const unchosen = rows.filter((r) => !r.material).sort((a, b) => a.where.localeCompare(b.where));
  const materials = groupBy(chosen, (r) => r.material!.key).sort((a, b) => a[1][0].material!.name.localeCompare(b[1][0].material!.name));
  const colours = groupBy(chosen.filter((r) => r.colour), (r) => `${r.material!.key}|${r.colour!.hex}`)
    .sort((a, b) => a[1][0].colour!.name.localeCompare(b[1][0].colour!.name));
  const ownColour = chosen.filter((r) => !r.colour).length;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Tabs defaultValue="materials">
          <TabsList className="h-8">
            <TabsTrigger value="materials" className="text-xs">Materials ({materials.length})</TabsTrigger>
            <TabsTrigger value="colours" className="text-xs">Colours ({colours.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="materials" className="mt-2 space-y-1.5">
            {materials.length === 0 && <p className="text-xs text-muted-foreground">No catalogue material is chosen yet. Click a part to pick one.</p>}
            {materials.map(([key, group]) => (
              <button key={key} type="button" onClick={() => pick(group[0])} className="flex w-full items-center gap-2 rounded-sm text-left hover:bg-surface-sunken">
                <Thumb imageUrl={group[0].material!.imageUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{group[0].material!.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{usedOn(group)}</span>
                </span>
              </button>
            ))}
          </TabsContent>
          <TabsContent value="colours" className="mt-2 space-y-1.5">
            {colours.map(([key, group]) => (
              <button key={key} type="button" onClick={() => pick(group[0])} className="flex w-full items-center gap-2 rounded-sm text-left hover:bg-surface-sunken">
                <Thumb imageUrl={group[0].colour!.imageUrl} hex={group[0].colour!.hex} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium">{group[0].colour!.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{group[0].material!.name} · {usedOn(group)}</span>
                </span>
              </button>
            ))}
            {colours.length === 0 && <p className="text-xs text-muted-foreground">No colourway picked yet.</p>}
            {ownColour > 0 && <p className="text-[11px] text-muted-foreground">{ownColour === 1 ? '1 part shows' : `${ownColour} parts show`} its product in the colour of its catalogue photo.</p>}
            {plan.length > 0 && (
              <section className="space-y-1.5 border-t border-hairline pt-2">
                <h4 className="text-xs font-semibold">Style Palette</h4>
                <p className="text-[11px] text-muted-foreground">Guides the render only where no material is chosen.</p>
                {plan.map((p, i) => (
                  <div key={`${p.role}-${i}`} className="flex items-center gap-2">
                    <span className="h-5 w-5 shrink-0 rounded-sm border border-hairline" style={{ backgroundColor: p.hex }} />
                    <span className="flex-1 text-xs">{COLOUR_ROLE_LABELS[p.role as ColourRole] ?? p.role}</span>
                  </div>
                ))}
              </section>
            )}
          </TabsContent>
        </Tabs>
        {unchosen.length > 0 && (
          <div className="border-t border-hairline pt-2">
            <button type="button" onClick={() => setShowUnchosen((v) => !v)} className="flex w-full items-center justify-between text-left">
              <span className="text-xs text-muted-foreground">Material not chosen ({unchosen.length})</span>
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${showUnchosen ? 'rotate-180' : ''}`} />
            </button>
            {showUnchosen && (
              <div className="mt-1.5 space-y-0.5">
                {unchosen.map((r) => (
                  <button key={r.key} type="button" onClick={() => pick(r)} className="block w-full truncate rounded-sm px-1 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-surface-sunken">
                    {r.where}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {actions && <div className="flex flex-wrap gap-1 border-t border-hairline pt-2">{actions}</div>}
      </CardContent>
    </Card>
  );
};
