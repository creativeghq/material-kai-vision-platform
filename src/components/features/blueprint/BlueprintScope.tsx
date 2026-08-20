// The measurements + section/task tree of a blueprint. ONE renderer, used by the editor page
// (editable) and by the library's starter preview (read-only) — the preview is the same screen with
// the inputs disabled, not a second, thinner rendering of the same data.
//
// It was briefly the latter: the library drew its own summary of section names and quantities, which
// silently dropped the formula, the labor and material rates, the margin, the allowance flag and the
// option/tier — i.e. everything you would actually want to read BEFORE copying a starter into your
// library. A preview that hides the fields cannot answer the question it exists to answer.
//
// Read-only is enforced by a `<fieldset disabled>` wrapper rather than a `disabled` prop on each
// control: it cannot be forgotten on a field added later, and it covers the native <select> too.
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { HubEmptyState } from '@/components/core/hub';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Switch } from '@/components/core/ui/switch';
import { UnitSelect } from '@/components/features/blueprint/UnitSelect';
import type { BlueprintItem, DimensionDef } from '@/services/blueprintsService';

export type ScopeItem = Partial<BlueprintItem> & { id: string; kind: 'section' | 'task'; label: string };

export interface BlueprintScopeProps {
  schema: DimensionDef[];
  items: ScopeItem[];
  /** Disables every control and hides the add/remove verbs. */
  readOnly?: boolean;
  onPatchItem?: (id: string, patch: Partial<ScopeItem>) => void;
  onDeleteItem?: (id: string) => void;
  onAddSection?: () => void;
  onAddTask?: (sectionId: string) => void;
  onPatchDim?: (idx: number, patch: Partial<DimensionDef>) => void;
  onDeleteDim?: (idx: number) => void;
  onAddDim?: () => void;
}

export const BlueprintScope: React.FC<BlueprintScopeProps> = ({
  schema, items, readOnly = false,
  onPatchItem, onDeleteItem, onAddSection, onAddTask, onPatchDim, onDeleteDim, onAddDim,
}) => {
  const patch = (id: string, p: Partial<ScopeItem>) => onPatchItem?.(id, p);
  const sections = items.filter((i) => i.kind === 'section');
  const tasksOf = (sid: string) => items.filter((i) => i.kind === 'task' && i.parent_id === sid);

  const TaskRow = ({ it }: { it: ScopeItem }) => (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <Input className="h-8 flex-1" value={it.label} onChange={(e) => patch(it.id, { label: e.target.value })} />
        <UnitSelect className="w-40 shrink-0" value={it.unit} onChange={(u) => patch(it.id, { unit: u })} />
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">Allowance
          <Switch checked={!!it.is_allowance} onCheckedChange={(v) => patch(it.id, { is_allowance: v })} />
        </div>
        {/* A schedule line answers HOW MANY and adds no money here — hinges, runners, gola profile.
            It is priced when the plan becomes a quote. */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">Schedule
          <Switch checked={!!it.is_schedule} onCheckedChange={(v) => patch(it.id, { is_schedule: v })} />
        </div>
        {!readOnly && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteItem?.(it.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
        )}
      </div>
      {it.is_allowance ? (
        <div className="flex items-center gap-2 pl-1 text-[11px] text-muted-foreground">Allowance Amount
          <Input className="h-6 w-24 text-right" value={String(it.allowance_amount ?? 0)} onChange={(e) => patch(it.id, { allowance_amount: Number(e.target.value) || 0 })} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 pl-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">QTY Formula
            <Input className="h-6 w-40" value={it.quantity_formula ?? ''} placeholder="= floor_area * 1.1" onChange={(e) => patch(it.id, { quantity_formula: e.target.value || null })} />
          </span>
          <span className="flex items-center gap-1">Default
            <Input className="h-6 w-14 text-right" value={String(it.default_quantity ?? 1)} onChange={(e) => patch(it.id, { default_quantity: Number(e.target.value) || 0 })} />
          </span>
          <span className="flex items-center gap-1">Labor
            <Input className="h-6 w-16 text-right" value={it.labor_rate != null ? String(it.labor_rate) : ''} placeholder="—" onChange={(e) => patch(it.id, { labor_rate: e.target.value === '' ? null : Number(e.target.value) })} />
          </span>
          <span className="flex items-center gap-1">Material
            <Input className="h-6 w-16 text-right" value={it.material_cost != null ? String(it.material_cost) : ''} placeholder="—" onChange={(e) => patch(it.id, { material_cost: e.target.value === '' ? null : Number(e.target.value) })} />
          </span>
          <span className="flex items-center gap-1">Margin
            <Input className="h-6 w-14 text-right" value={String(it.margin_pct ?? 0)} onChange={(e) => patch(it.id, { margin_pct: Number(e.target.value) || 0 })} />%
          </span>
          <span className="flex items-center gap-1">Option
            <Input className="h-6 w-24" value={it.option_group ?? ''} placeholder="group" onChange={(e) => patch(it.id, { option_group: e.target.value || null })} />
          </span>
          {/* What the LAYOUT implies this quantity should be. Seeds the stepper and flags a
              mismatch; unlike QTY Formula it never drives or locks the field, because how many
              corners get a mechanism is a judgement, not a derivation. */}
          <span className="flex items-center gap-1">Suggests
            <Input
              className="h-6 w-40" value={it.suggests_quantity ?? ''} placeholder="= base_corner_count"
              onChange={(e) => patch(it.id, { suggests_quantity: e.target.value || null })}
            />
          </span>
          {it.option_group && (
            <select className="h-6 bg-transparent border border-border rounded px-1 text-[11px]" value={it.tier ?? ''} onChange={(e) => patch(it.id, { tier: (e.target.value || null) as ScopeItem['tier'] })}>
              <option value="">Tier…</option>
              <option value="good">Good</option>
              <option value="better">Better</option>
              <option value="best">Best</option>
            </select>
          )}
          {/* A stable slug publishes `opt_<key>` so OTHER lines can be conditional on this choice —
              how the four gola parts switch on together. Slug, not label: renaming the option must
              not silently zero every line that depends on it. */}
          {it.option_group && (
            <span className="flex items-center gap-1">opt_
              <Input
                className="h-6 w-24" value={it.option_key ?? ''} placeholder="key"
                onChange={(e) => patch(it.id, { option_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') || null })}
              />
            </span>
          )}
        </div>
      )}
    </div>
  );

  return (
    <fieldset disabled={readOnly} className="space-y-6 border-0 p-0 m-0 min-w-0 disabled:opacity-90">
      {/* dimensions schema */}
      <Card className="dashboard-card"><CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Measurements</div>
          {!readOnly && (
            <Button variant="outline" size="sm" className="rounded-full" onClick={onAddDim}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">These drive the parametric formulas (use the <code>key</code> in a task formula, e.g. <code>= floor_area * 1.1</code>).</p>
        <div className="space-y-1.5">
          {schema.map((d, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input className="h-8 w-32" value={d.key} placeholder="key" onChange={(e) => onPatchDim?.(idx, { key: e.target.value.replace(/[^a-zA-Z0-9_]/g, '_') })} />
              <Input className="h-8 flex-1" value={d.label} placeholder="label" onChange={(e) => onPatchDim?.(idx, { label: e.target.value })} />
              <Input className="h-8 w-20" value={d.unit ?? ''} placeholder="unit" onChange={(e) => onPatchDim?.(idx, { unit: e.target.value })} />
              <Input className="h-8 w-20 text-right" value={String(d.default ?? 0)} placeholder="default" onChange={(e) => onPatchDim?.(idx, { default: Number(e.target.value) || 0 })} />
              {!readOnly && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onDeleteDim?.(idx)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
              )}
            </div>
          ))}
          {schema.length === 0 && (
            <HubEmptyState
              title="No measurements yet"
              description="The dimensions a plan asks for — run length, ceiling height, wall depth. Task formulas read them by name."
              action={!readOnly ? <Button size="sm" variant="outline" onClick={onAddDim}><Plus className="h-3.5 w-3.5 mr-1" /> Add measurement</Button> : undefined}
            />
          )}
        </div>
      </CardContent></Card>

      {/* tree */}
      <div className="space-y-4">
        {sections.map((sec) => (
          <div key={sec.id} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-t-lg">
              <Input className="h-8 flex-1 font-medium bg-transparent" value={sec.label} onChange={(e) => patch(sec.id, { label: e.target.value })} />
              {!readOnly && (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDeleteItem?.(sec.id)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></Button>
              )}
            </div>
            <div className="p-2 space-y-1.5">
              {tasksOf(sec.id).map((t) => <TaskRow key={t.id} it={t} />)}
              {!readOnly && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => onAddTask?.(sec.id)}><Plus className="h-3 w-3 mr-1" /> Add task</Button>
              )}
            </div>
          </div>
        ))}
        {sections.length === 0 && (
          <div className="rounded-lg border border-dashed border-border">
            <HubEmptyState
              title="No sections yet"
              description="A section groups the tasks of one stage — strip-out, first fix, tiling. Each task can price off a measurement above."
              action={!readOnly ? <Button size="sm" variant="outline" onClick={onAddSection}><Plus className="h-3.5 w-3.5 mr-1" /> Add section</Button> : undefined}
            />
          </div>
        )}
        {!readOnly && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onAddSection}><Plus className="h-3.5 w-3.5 mr-1" /> Add section</Button>
        )}
      </div>
    </fieldset>
  );
};
