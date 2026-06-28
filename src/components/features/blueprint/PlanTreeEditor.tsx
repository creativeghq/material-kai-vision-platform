import React from 'react';
import { Plus, Trash2, Sigma } from 'lucide-react';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import { parseDecimalOr } from '@/utils/decimal';
import type { ProjectPlanItem } from '@/services/projectPlansService';

/**
 * Editable scope-of-works tree (sections → tasks). Presentational: all edits are
 * emitted via callbacks; the parent persists + reprices (the engine is the
 * authoritative price writer). Resolved unit_price/line_total are read-only.
 */
export interface PlanTreeEditorProps {
  items: ProjectPlanItem[];
  currency: string;
  subtotal: number;
  busy?: boolean;
  onPatch: (id: string, patch: Partial<ProjectPlanItem>) => void;
  onDelete: (id: string) => void;
  onAddTask: (sectionId: string) => void;
  onAddSection: () => void;
}

function money(n: number, currency: string) {
  const v = Number(n ?? 0).toFixed(2);
  return `${currency === 'EUR' ? '€' : currency + ' '}${v}`;
}

export function PlanTreeEditor({ items, currency, subtotal, busy, onPatch, onDelete, onAddTask, onAddSection }: PlanTreeEditorProps) {
  const sections = items.filter((i) => i.kind === 'section').sort((a, b) => a.sort_order - b.sort_order);
  const tasksOf = (sectionId: string) => items.filter((i) => i.kind === 'task' && i.parent_id === sectionId).sort((a, b) => a.sort_order - b.sort_order);
  const looseTasks = items.filter((i) => i.kind === 'task' && (!i.parent_id || !sections.find((s) => s.id === i.parent_id)));

  const TaskRow = ({ it }: { it: ProjectPlanItem }) => (
    <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
      <div className="flex items-center gap-2">
        <Switch checked={it.is_selected} disabled={busy} onCheckedChange={(v) => onPatch(it.id, { is_selected: v })} />
        <Input
          className="h-8 flex-1 min-w-0"
          defaultValue={it.label}
          disabled={busy}
          onBlur={(e) => { if (e.target.value !== it.label) onPatch(it.id, { label: e.target.value }); }}
        />
        <Input
          className="h-8 w-16 text-center"
          defaultValue={it.unit ?? ''}
          placeholder="unit"
          disabled={busy}
          onBlur={(e) => { const v = e.target.value || null; if (v !== it.unit) onPatch(it.id, { unit: v }); }}
        />
        {it.is_allowance ? (
          <Input
            className="h-8 w-24 text-right"
            defaultValue={String(it.allowance_amount ?? 0)}
            disabled={busy}
            onBlur={(e) => { const v = parseDecimalOr(e.target.value, it.allowance_amount ?? 0); if (v !== it.allowance_amount) onPatch(it.id, { allowance_amount: v }); }}
          />
        ) : (
          <div className="w-20 flex items-center">
            <Input
              className="h-8 w-20 text-right"
              defaultValue={String(it.quantity ?? 0)}
              disabled={busy || !!it.quantity_formula}
              title={it.quantity_formula ? `Driven by formula: ${it.quantity_formula}` : undefined}
              onBlur={(e) => { const v = parseDecimalOr(e.target.value, it.quantity ?? 0); if (v !== it.quantity) onPatch(it.id, { quantity: v }); }}
            />
          </div>
        )}
        <div className="w-24 text-right text-sm tabular-nums">{money(it.line_total, currency)}</div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={busy} onClick={() => onDelete(it.id)}>
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </div>
      {!it.is_allowance && (
        <div className="flex items-center gap-3 pl-9 pt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">labor
            <Input className="h-6 w-16 text-right" defaultValue={it.labor_rate != null ? String(it.labor_rate) : ''} placeholder="—" disabled={busy}
              onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === '' ? null : parseDecimalOr(raw, it.labor_rate ?? 0); if (v !== it.labor_rate) onPatch(it.id, { labor_rate: v }); }} />
          </span>
          <span className="flex items-center gap-1">material
            <Input className="h-6 w-16 text-right" defaultValue={it.material_cost != null ? String(it.material_cost) : ''} placeholder="—" disabled={busy}
              onBlur={(e) => { const raw = e.target.value.trim(); const v = raw === '' ? null : parseDecimalOr(raw, it.material_cost ?? 0); if (v !== it.material_cost) onPatch(it.id, { material_cost: v }); }} />
          </span>
          <span className="flex items-center gap-1">margin
            <Input className="h-6 w-12 text-right" defaultValue={String(it.margin_pct ?? 0)} disabled={busy}
              onBlur={(e) => { const v = parseDecimalOr(e.target.value, it.margin_pct ?? 0); if (v !== it.margin_pct) onPatch(it.id, { margin_pct: v }); }} />%
          </span>
          <span className="ml-auto">{money(it.unit_price, currency)}{it.unit ? `/${it.unit}` : ''}</span>
          {it.quantity_formula && <Badge variant="outline" className="text-[10px] h-4 gap-1"><Sigma className="h-2.5 w-2.5" />{it.quantity_formula}</Badge>}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {sections.map((sec) => {
        const tasks = tasksOf(sec.id);
        const secTotal = tasks.reduce((s, t) => s + Number(t.line_total ?? 0), 0);
        return (
          <div key={sec.id} className="rounded-lg border border-border">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-t-lg">
              <Input
                className="h-8 flex-1 font-medium bg-transparent border-transparent hover:border-border focus:border-border"
                defaultValue={sec.label}
                disabled={busy}
                onBlur={(e) => { if (e.target.value !== sec.label) onPatch(sec.id, { label: e.target.value }); }}
              />
              <div className="text-sm tabular-nums text-muted-foreground">{money(secTotal, currency)}</div>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy} onClick={() => onDelete(sec.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
            <div className="p-2 space-y-1.5">
              {tasks.map((t) => <TaskRow key={t.id} it={t} />)}
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" disabled={busy} onClick={() => onAddTask(sec.id)}>
                <Plus className="h-3 w-3 mr-1" /> Add task
              </Button>
            </div>
          </div>
        );
      })}

      {looseTasks.length > 0 && (
        <div className="rounded-lg border border-border p-2 space-y-1.5">
          <div className="px-1 text-xs text-muted-foreground">Ungrouped</div>
          {looseTasks.map((t) => <TaskRow key={t.id} it={t} />)}
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={onAddSection}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add section
        </Button>
        <div className="text-sm">
          <span className="text-muted-foreground mr-2">Subtotal</span>
          <span className="font-medium tabular-nums">{money(subtotal, currency)}</span>
        </div>
      </div>
    </div>
  );
}
