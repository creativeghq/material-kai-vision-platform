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
import { deriveComposition, hasComposition, optionFlags } from './composition.ts';
import type { Composition, DerivedComposition, ZoneDef } from './composition.ts';

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
  /** Quantity-only schedule line. Counted, never added to the subtotal. */
  is_schedule?: boolean;
  /**
   * What the composition IMPLIES this quantity should be — two corner mechanisms for two corner
   * units. Present only when the line declares `suggests_quantity`. A suggestion, never a rule:
   * the UI seeds from it and flags a mismatch, and the customer decides.
   */
  suggested_quantity?: number;
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
  /** Present only when the blueprint is zone-driven. Carries the per-zone metres/counts/issues. */
  composition?: DerivedComposition;
}

/** What the caller configured, when the blueprint declares zones. */
export interface CompositionInput {
  schema: ZoneDef[];
  config: Composition | null | undefined;
}

/**
 * `selectedIds` is the caller's choice and is treated as UNTRUSTED:
 *  - an option_group honours it only when it names exactly ONE member; anything else (missing,
 *    duplicated, tampered) falls back to the tier:'good' default, so a group can never price at
 *    zero or twice.
 *  - an ungrouped line is on iff listed; pass `null` to fall back to each line's own
 *    `default_selected`, which is what an un-configured estimate wants.
 *
 * `composition` is the zone configuration, for blueprints that declare zones. It does two things:
 * publishes the derived metres/counts as formula variables (so the flat per-metre lines keep
 * resolving off a real composition), and ABSORBS the option_groups its globals are bound to — those
 * groups stop being priced here because their money now arrives through the zone's own lines. Skip
 * that and every zone is charged twice.
 */
export function computeBlueprint(
  rows: Record<string, any>[],
  dims: Record<string, number>,
  selectedIds: Set<string> | null,
  composition?: CompositionInput | null,
): ComputedBlueprint {
  const derived = composition && hasComposition(composition.schema)
    ? deriveComposition(composition.schema, composition.config, rows as any[])
    : null;
  const absorbed = new Set(derived?.absorbed_groups ?? []);
  if (derived) dims = { ...dims, ...derived.vars };

  const sectionsById: Record<string, ComputedSection> = {};
  for (const r of rows) if (r.kind === 'section') sectionsById[r.id] = { label: r.label, total: 0, tasks: [] };
  const ungrouped: ComputedTask[] = [];
  let subtotal = 0;

  const byGroup: Record<string, Record<string, any>[]> = {};
  for (const r of rows) {
    if (r.kind === 'task' && r.option_group && !absorbed.has(r.option_group)) (byGroup[r.option_group] ||= []).push(r);
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

  // Choice flags must exist BEFORE any formula is evaluated — a gola line asking for `opt_gola`
  // while the variable is still undefined does not fail loudly, it falls back to its default
  // quantity, which is a wrong number that looks like a right one.
  dims = {
    ...dims,
    ...optionFlags(rows.map((r) => ({
      option_key: r.option_key,
      is_selected: r.option_group ? optSelected[r.option_group] === r.id : (selectedIds ? selectedIds.has(r.id) : r.default_selected !== false),
    }))),
  };

  for (const r of rows) {
    if (r.kind !== 'task') continue;
    // A zone owns this group's selection and prices it through its own lines.
    if (r.option_group && absorbed.has(r.option_group)) continue;
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
    // A schedule line reports HOW MANY, not how much: it is priced when the plan becomes a quote.
    // Its rate rides along in unit_price so the value is visible, but it adds nothing here — and a
    // rate that was never set stays NULL rather than becoming a confident 0.00.
    const isSchedule = !!r.is_schedule;
    // Evaluated against the SAME dims as the quantity, so a suggestion can never disagree with the
    // composition it is derived from.
    const suggestion = r.suggests_quantity && String(r.suggests_quantity).trim()
      ? evaluateFormula(r.suggests_quantity, dims)
      : null;
    const task: ComputedTask = {
      id: r.id, label: r.label, unit: r.unit, quantity: qty,
      unit_price: isSchedule ? (r.material_cost != null ? unit_price : 0) : unit_price,
      line_total: isSchedule ? 0 : line_total,
      is_allowance: !!r.is_allowance, option_group: r.option_group ?? null,
      tier: r.tier ?? null, selected, ...(isSchedule ? { is_schedule: true } : {}),
      ...(suggestion?.ok ? { suggested_quantity: round2(suggestion.value) } : {}),
    };
    if (selected && !isSchedule) subtotal += line_total;
    const sec = r.parent_id ? sectionsById[r.parent_id] : null;
    if (sec) { sec.tasks.push(task); if (selected && !isSchedule) sec.total += line_total; }
    else ungrouped.push(task);
  }

  // COMPLETENESS: the zones derived a count that no schedule line consumes.
  //
  // `total_hinges` sitting at 30 with nothing referencing it is the silent-zero shape wearing a
  // different hat — the kitchen needs thirty hinges, the schedule says nothing, and the workshop
  // finds out on fitting day. The derivation cannot see this (it does not know what lines exist)
  // and the lines cannot see it either, so the check belongs exactly here, where both are in scope.
  if (derived) {
    const referenced = rows
      .filter((r) => r.is_schedule && r.quantity_formula)
      .map((r) => String(r.quantity_formula))
      .join(' ');
    // WORD-ANCHORED, not a substring. `total_socket` is a PREFIX of `total_socket_dedicated`,
    // so a plain `.includes()` let a line counting the oven's dedicated circuit answer for the
    // general sockets too — and a kitchen deriving ordinary socket counts that NOTHING schedules
    // then raised no issue at all. That is precisely the case this check exists for: the
    // electrician finds out on fitting day.
    //
    // A trailing word boundary does not match between `socket` and `_dedicated`, because `_` is
    // a word character — which is the whole point. Keys come from the blueprint author's schema,
    // so they are escaped rather than trusted to be identifier-safe.
    const countsKey = (k: string) =>
      new RegExp(String.raw`\btotal_` + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + String.raw`\b`);
    for (const row of derived.schedule) {
      if (!countsKey(row.key).test(referenced)) {
        derived.issues.push(
          `${row.quantity} ${row.unit} of ${row.label.toLowerCase()} are derived but no schedule line counts them (total_${row.key}).`,
        );
      }
    }
  }

  // Zone lines read as their own sections, ahead of the flat scope — that is the order a kitchen
  // quote is read in: what the units are, then what is done to them.
  const zoneSections: ComputedSection[] = [];
  if (derived) {
    for (const z of derived.zones) {
      const zoneLines = derived.lines.filter((l) => l.zone_key === z.key);
      if (!z.enabled || zoneLines.length === 0) continue;
      zoneSections.push({
        label: z.label,
        total: round2(z.total),
        tasks: zoneLines.map((l) => ({
          id: l.key,
          label: l.label,
          unit: l.unit,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.line_total,
          is_allowance: false,
          option_group: null,
          tier: null,
          selected: true,
        })),
      });
      subtotal += z.total;
    }
  }

  return {
    sections: [...zoneSections, ...Object.values(sectionsById).map((s) => ({ ...s, total: round2(s.total) }))],
    ungrouped,
    subtotal: round2(subtotal),
    ...(derived ? { composition: derived } : {}),
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
