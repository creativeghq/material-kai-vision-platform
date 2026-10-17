// Pure plan-import helpers shared by every path that copies blueprint_items into a plan.
import { absorbedGroups, hasComposition } from './composition.ts';
import type { ZoneDef } from './composition.ts';

export interface ImportRow {
  id: string;
  parent_id: string | null;
  kind: string;
  sort_order: number;
  option_group: string | null;
  tier: string | null;
  is_selected?: boolean;
  default_selected?: boolean;
}

/** blueprint_items → plan selection. Option members stay undefined so applyOptionDefaults decides. */
export function importSelection(r: { option_group: string | null; default_selected?: boolean }): boolean | undefined {
  return r.option_group ? undefined : (r.default_selected !== false);
}

/** Exactly one member per option_group selected: an explicit pick, else tier 'good', else the first. */
export function applyOptionDefaults<T extends ImportRow>(items: T[]): void {
  const groups: Record<string, T[]> = {};
  for (const it of items) {
    if (it.option_group) (groups[it.option_group] ||= []).push(it);
  }
  for (const members of Object.values(groups)) {
    const already = members.find((m) => m.is_selected === true);
    const pick = already
      ?? members.find((m) => m.tier === 'good')
      ?? [...members].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
    for (const m of members) m.is_selected = m.id === pick?.id;
  }
}

/** Absorbed option_groups are the zones' rate tables, priced through the zone lines — never imported. */
export function stripAbsorbed<T extends ImportRow>(items: T[], schema: ZoneDef[] | null | undefined): T[] {
  if (!hasComposition(schema)) return items;
  const absorbed = new Set(absorbedGroups(schema as ZoneDef[]));
  if (!absorbed.size) return items;
  return items.filter((it) => !(it.option_group && absorbed.has(it.option_group)));
}

/**
 * One blueprint section + its direct tasks, re-id'd for a plan whose zones are `targetSchema`.
 * Returns null when `sectionId` is not a section of `rows`.
 */
export function prepareSectionImport<T extends ImportRow>(
  rows: T[],
  sectionId: string,
  targetSchema: ZoneDef[] | null | undefined,
  sortOrder: number,
  newId: () => string = () => crypto.randomUUID(),
): T[] | null {
  const section = rows.find((i) => i.id === sectionId && i.kind === 'section');
  if (!section) return null;
  const secId = newId();
  const tasks = stripAbsorbed(rows.filter((i) => i.parent_id === sectionId), targetSchema)
    .map((t, idx) => ({ ...t, id: newId(), parent_id: secId, sort_order: idx, is_selected: importSelection(t) }));
  applyOptionDefaults(tasks);
  return [{ ...section, id: secId, parent_id: null, sort_order: sortOrder, is_selected: true }, ...tasks];
}
