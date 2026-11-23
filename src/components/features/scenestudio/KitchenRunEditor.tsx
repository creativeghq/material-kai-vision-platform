/** The units of one kitchen run, edited through the placement engine (#604 phase 3): every change is built or refused with its reason. */
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  MODULE_LABELS, ZONE_MODULES, autoLayout, placeRun, runContext, runModulesOf, spansBehind,
  type KitchenLayout, type Placement, type RunModule,
} from '@/lib/scene/kitchenComposition';
import type { PlanOpening, PlanWall } from '@/lib/scene/sceneGeometry';
import type { SceneObject } from '@/services/sceneStudioService';

const DEFAULT_WIDTH: Record<string, number> = { filler: 50, gap: 600, end_panel: 18 };

export const KitchenRunEditor: React.FC<{
  obj: SceneObject;
  walls: PlanWall[];
  openings: PlanOpening[];
  onChange(layout: KitchenLayout): void;
}> = ({ obj, walls, openings, onChange }) => {
  const ctx = useMemo(
    () => runContext(obj, spansBehind(obj, walls, openings)),
    [obj, walls, openings],
  );
  const [result, setResult] = useState<Placement | null>(null);
  const [adding, setAdding] = useState<string>('door2');
  if (!ctx) return null;
  const current: RunModule[] = runModulesOf(obj).filter((m) => !m.auto).map(({ type, width_mm, options }) => ({ type, width_mm, ...(options ? { options } : {}) }));
  const placed = placeRun(current, ctx).built;

  const apply = (modules: RunModule[], seating = obj.kitchen_layout?.seating_mm) => {
    const r = placeRun(modules, ctx);
    setResult(r);
    onChange({
      modules: r.built.filter((m) => !m.auto).map(({ type, width_mm, options }) => ({ type, width_mm, ...(options ? { options } : {}) })),
      ...(seating ? { seating_mm: seating } : {}),
    });
  };
  const move = (i: number, by: number) => {
    const next = [...current];
    const [m] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, m);
    apply(next);
  };

  const proposed = obj.kitchen_layout?.source === 'read' && !obj.kitchen_layout.confirmed;
  return (
    <div className="space-y-2 border-t border-hairline pt-3">
      {proposed && (
        <div className="space-y-1.5 rounded-sm border border-hairline bg-surface-sunken p-2 text-[11px]">
          <p>These units were read from the drawing. Check each one against it, then confirm.</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange({ ...obj.kitchen_layout!, confirmed: true })}>Confirm Units</Button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Label className="text-xs">Units, Left to Right</Label>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => apply(autoLayout(obj.kind, ctx))}>
          <Wand2 className="h-3.5 w-3.5" />Auto Layout
        </Button>
      </div>
      <ul className="space-y-1">
        {placed.map((m, i) => (
          <li key={`${i}-${m.type}`} className="flex items-center gap-1 text-xs">
            {m.auto ? (
              <span className="flex-1 text-muted-foreground">Filler {Math.round(m.width_mm / 10)} cm (added)</span>
            ) : (
              <>
                <Select value={m.type} onValueChange={(v) => apply(current.map((c, k) => (k === i ? { ...c, type: v } : c)))}>
                  <SelectTrigger className="h-7 flex-1 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ZONE_MODULES[ctx.zone].map((t) => <SelectItem key={t} value={t} className="text-xs">{MODULE_LABELS[t] ?? t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  className="h-7 w-14 text-xs"
                  inputMode="numeric"
                  aria-label="Width in cm"
                  defaultValue={String(Math.round(m.width_mm / 10))}
                  key={`${i}-${m.width_mm}`}
                  disabled={m.type === 'end_panel'}
                  onBlur={(e) => {
                    const cm = Number.parseFloat(e.target.value.replace(',', '.'));
                    if (Number.isFinite(cm) && cm > 0) apply(current.map((c, k) => (k === i ? { ...c, width_mm: Math.round(cm * 10) } : c)));
                  }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move left"><ArrowUp className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" disabled={i >= current.length - 1} onClick={() => move(i, 1)} aria-label="Move right"><ArrowDown className="h-3 w-3" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => apply(current.filter((_, k) => k !== i))} aria-label="Remove unit"><Trash2 className="h-3 w-3" /></Button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <Select value={adding} onValueChange={setAdding}>
          <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ZONE_MODULES[ctx.zone].map((t) => <SelectItem key={t} value={t} className="text-xs">{MODULE_LABELS[t] ?? t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => apply([...current, { type: adding, width_mm: DEFAULT_WIDTH[adding] ?? 600 }])}>
          <Plus className="h-3.5 w-3.5" />Add
        </Button>
      </div>
      {ctx.zone === 'island' && (
        <div className="space-y-1">
          <Label className="text-xs">Seating Overhang (cm, optional)</Label>
          <Input
            className="h-8 text-xs"
            inputMode="numeric"
            defaultValue={obj.kitchen_layout?.seating_mm ? String(obj.kitchen_layout.seating_mm / 10) : ''}
            key={`seat-${obj.kitchen_layout?.seating_mm ?? 0}`}
            onBlur={(e) => {
              const cm = Number.parseFloat(e.target.value.replace(',', '.'));
              apply(current, Number.isFinite(cm) && cm > 0 ? Math.round(cm * 10) : undefined);
            }}
          />
        </div>
      )}
      {result && result.rejected.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-amber-800 dark:text-amber-300">
          {result.rejected.map((r, i) => <li key={i}>Not built: {r.reason}</li>)}
        </ul>
      )}
      {result && result.issues.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {result.issues.map((t) => <li key={t}>{t}</li>)}
        </ul>
      )}
    </div>
  );
};
