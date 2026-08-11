/**
 * The ONE place a blueprint + dimensions becomes money on the edge.
 *
 * Three callers share it — the public estimator (`public-project-plan` → estimate), the public
 * kitchen lead (→ kitchen_lead) and the agent tool (`calculate_kitchen_cost`). They must agree:
 * a configurator total, a recorded lead and an agent's answer for the same kitchen are the same
 * number, or the platform is quoting three different prices for one spec.
 *
 * `project-plan-engine` deliberately does NOT use this: it is the authoritative writer of
 * PERSISTED plan prices and resolves workspace service/product rates on top (buildRateMap), which
 * an anonymous or read-only caller has no business seeing. Same formula, wider inputs.
 */

import { evaluateFormula, computeLinePricing, round2 } from './formula.ts';

export interface ComputedTask {
  id: string;
  label: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  is_allowance: boolean;
  option_group: string | null;
  tier: string | null;
  selected: boolean;
}

export interface ComputedSection {
  label: string;
  total: number;
  tasks: ComputedTask[];
}

export interface ComputedBlueprint {
  sections: ComputedSection[];
  ungrouped: ComputedTask[];
  subtotal: number;
}

/**
 * `selectedIds` is the caller's choice and is treated as UNTRUSTED:
 *  - an option_group honours it only when it names exactly ONE member; anything else (missing,
 *    duplicated, tampered) falls back to the tier:'good' default, so a group can never price at
 *    zero or twice.
 *  - an ungrouped line is on iff listed; pass `null` to fall back to each line's own
 *    `default_selected`, which is what an un-configured estimate wants.
 */
export function computeBlueprint(
  rows: Record<string, any>[],
  dims: Record<string, number>,
  selectedIds: Set<string> | null,
): ComputedBlueprint {
  const sectionsById: Record<string, ComputedSection> = {};
  for (const r of rows) if (r.kind === 'section') sectionsById[r.id] = { label: r.label, total: 0, tasks: [] };
  const ungrouped: ComputedTask[] = [];
  let subtotal = 0;

  const byGroup: Record<string, Record<string, any>[]> = {};
  for (const r of rows) {
    if (r.kind === 'task' && r.option_group) (byGroup[r.option_group] ||= []).push(r);
  }
  const optSelected: Record<string, string> = {};
  for (const [grp, members] of Object.entries(byGroup)) {
    const chosen = selectedIds ? members.filter((m) => selectedIds.has(m.id)) : [];
    const pick = chosen.length === 1
      ? chosen[0]
      : (members.find((m) => m.tier === 'good')
        ?? [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]);
    if (pick) optSelected[grp] = pick.id;
  }

  for (const r of rows) {
    if (r.kind !== 'task') continue;
    const selected = r.option_group
      ? optSelected[r.option_group] === r.id
      : (selectedIds ? selectedIds.has(r.id) : r.default_selected !== false);
    let qty: number;
    if (r.quantity_formula && String(r.quantity_formula).trim()) {
      const ev = evaluateFormula(r.quantity_formula, dims);
      qty = ev.ok ? ev.value : Number(r.default_quantity ?? 1);
    } else qty = Number(r.default_quantity ?? 1);
    qty = round2(qty);
    const { unit_price, line_total } = computeLinePricing({
      is_allowance: r.is_allowance, allowance_amount: r.allowance_amount,
      material_cost: r.material_cost, labor_rate: r.labor_rate, margin_pct: r.margin_pct,
      quantity: qty, is_selected: selected,
    });
    const task: ComputedTask = {
      id: r.id, label: r.label, unit: r.unit, quantity: qty, unit_price, line_total,
      is_allowance: !!r.is_allowance, option_group: r.option_group ?? null,
      tier: r.tier ?? null, selected,
    };
    if (selected) subtotal += line_total;
    const sec = r.parent_id ? sectionsById[r.parent_id] : null;
    if (sec) { sec.tasks.push(task); if (selected) sec.total += line_total; }
    else ungrouped.push(task);
  }

  return {
    sections: Object.values(sectionsById).map((s) => ({ ...s, total: round2(s.total) })),
    ungrouped,
    subtotal: round2(subtotal),
  };
}

/** Loose label match: exact fold first, then containment, so "fenix" finds "Fenix". */
const foldLabel = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

export function matchByLabel<T extends { label: string }>(candidates: T[], query: string): T | null {
  const q = foldLabel(query);
  if (!q) return null;
  return candidates.find((c) => foldLabel(c.label) === q)
    ?? candidates.find((c) => foldLabel(c.label).includes(q))
    ?? candidates.find((c) => q.includes(foldLabel(c.label)))
    ?? null;
}

/**
 * Turn a caller's free-text picks into the id set computeBlueprint wants.
 *
 * Lives here, beside the money, and is deliberately PURE — `calculate_kitchen_cost` is reachable
 * only through agent-chat, which the edge typecheck gate cannot check (its type graph exceeds
 * 12 GB), so the part that decides what gets priced must be testable without that file.
 *
 * `unmatched` is returned, never swallowed: a finish the price list does not carry must surface
 * as a correction, because silently pricing the default produces a confident quote for a spec
 * nobody asked for.
 */
export function resolveSelection(
  rows: Record<string, any>[],
  picks: { options?: string[]; extras?: string[] },
): { selected: Set<string>; unmatched: string[] } {
  const tasks = rows.filter((r) => r.kind === 'task');
  const optionMembers = tasks.filter((r) => r.option_group) as { label: string; id: string }[];
  const extraLines = tasks.filter((r) => !r.option_group) as { label: string; id: string; default_selected?: boolean }[];

  const selected = new Set<string>();
  const unmatched: string[] = [];
  for (const want of picks.options ?? []) {
    const hit = matchByLabel(optionMembers, String(want));
    if (hit) selected.add(hit.id); else unmatched.push(String(want));
  }
  for (const want of picks.extras ?? []) {
    const hit = matchByLabel(extraLines, String(want));
    if (hit) selected.add(hit.id); else unmatched.push(String(want));
  }
  // Lines that are ON by default (fitting) stay on regardless of what was asked for — otherwise
  // requesting one accessory would silently drop installation out of the price.
  for (const r of extraLines) if (r.default_selected !== false) selected.add(r.id);

  return { selected, unmatched };
}
