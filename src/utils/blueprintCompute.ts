// Client-side plan compute for the PUBLIC estimator (no DB). Mirrors the
// project-plan-engine's resolve logic using the shared blueprintFormula so an
// anonymous visitor gets the same live editing + pricing as the backend Plan tab.
// The authenticated app always reprices via the engine (authoritative); this is
// only for the unsaved public preview.

import { evaluateFormula, computeLinePricing, round2 } from './blueprintFormula';
import type { ProjectPlanItem } from '@/services/projectPlansService';

/** Within each option_group, keep exactly one member selected (prefer tier 'good'). */
export function applyOptionDefaults(items: ProjectPlanItem[]) {
  const groups: Record<string, ProjectPlanItem[]> = {};
  for (const it of items) if (it.option_group) (groups[it.option_group] ||= []).push(it);
  for (const members of Object.values(groups)) {
    const pick = members.find((m) => m.is_selected)
      ?? members.find((m) => m.tier === 'good')
      ?? [...members].sort((a, b) => a.sort_order - b.sort_order)[0];
    for (const m of members) m.is_selected = m.id === pick?.id;
  }
}

/** Recompute quantity (from formula) + unit_price + line_total for every task. */
export function repriceItems(items: ProjectPlanItem[], dims: Record<string, number>): ProjectPlanItem[] {
  return items.map((it) => {
    if (it.kind === 'section') return { ...it, unit_price: 0, line_total: 0 };
    let qty: number;
    if (it.quantity_formula && String(it.quantity_formula).trim()) {
      const r = evaluateFormula(it.quantity_formula, dims);
      qty = r.ok ? r.value : Number(it.quantity ?? 1);
    } else qty = Number(it.quantity ?? 1);
    qty = round2(qty);
    const { unit_price, line_total } = computeLinePricing({
      is_allowance: it.is_allowance, allowance_amount: it.allowance_amount,
      material_cost: it.material_cost, labor_rate: it.labor_rate, margin_pct: it.margin_pct,
      quantity: qty, is_selected: it.is_selected,
    });
    return { ...it, quantity: qty, unit_price, line_total };
  });
}

export function subtotalOf(items: ProjectPlanItem[]): number {
  return round2(items.filter((i) => i.kind === 'task' && i.is_selected).reduce((a, i) => a + Number(i.line_total || 0), 0));
}

/** Map raw blueprint_items (from the public starters payload) to local plan items. */
export function seedPlanItems(blueprintItems: any[], dims: Record<string, number>): ProjectPlanItem[] {
  const base = blueprintItems.map((bi): ProjectPlanItem => ({
    id: bi.id, plan_id: 'local', parent_id: bi.parent_id, sort_order: bi.sort_order,
    kind: bi.kind, label: bi.label, notes: null, unit: bi.unit,
    quantity_formula: bi.quantity_formula, quantity: Number(bi.default_quantity ?? 1),
    line_kind: bi.line_kind, service_id: null, product_id: null,
    material_cost: bi.material_cost, labor_rate: bi.labor_rate, margin_pct: bi.margin_pct ?? 0,
    unit_price: 0, line_total: 0, option_group: bi.option_group, tier: bi.tier,
    // Option members seed UNSELECTED so applyOptionDefaults below resolves the group by
    // tier:'good' — seeding them all `true` made its `find(is_selected)` match the first
    // member every time, so the good tier never won here while the engine honoured it.
    // Everything else follows the blueprint's own default (optional extras start off).
    is_selected: bi.option_group ? false : (bi.default_selected !== false),
    is_allowance: !!bi.is_allowance, allowance_amount: bi.allowance_amount,
    source: 'template', created_at: '', updated_at: '',
  }));
  applyOptionDefaults(base);
  return repriceItems(base, dims);
}
