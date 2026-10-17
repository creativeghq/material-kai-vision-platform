/** #486 P-3 â€” "Add section from library" imports with option defaults and without absorbed groups. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { prepareSectionImport } from '../../supabase/functions/_shared/blueprint/section-import';
import type { ZoneDef } from '../../supabase/functions/_shared/blueprint/composition';
import { computeLinePricing } from '../../supabase/functions/_shared/blueprint/formula';
import { blankComments } from '../helpers/stripComments';

// The live New Kitchen "Cabinets" section: 12 door models, every one default_selected=true, one
// tier 'good', plus an optional extra that imports OFF.
const MODELS: Array<[string, number, string | null]> = [
  ['Ecoline', 74, null], ['Izzy', 92, null], ['Light', 110, 'good'], ['Bright', 129, null],
  ['New Age', 147, null], ['Lux', 165, null], ['Elegant', 184, null], ['HPL', 202, null],
  ['Laka', 220, null], ['Gloss', 238, null], ['Glam', 257, null], ['Fenix', 275, null],
];
const rows = [
  { id: 'sec', parent_id: null, kind: 'section', label: 'Cabinets', sort_order: 3, option_group: null, tier: null, default_selected: true, material_cost: null },
  ...MODELS.map(([label, cost, tier], i) => ({
    id: `m${i}`, parent_id: 'sec', kind: 'task', label, sort_order: i, option_group: 'Cabinet model',
    tier, default_selected: true, material_cost: cost,
  })),
  { id: 'extra', parent_id: 'sec', kind: 'task', label: 'Premium coloured carcass', sort_order: 12, option_group: null, tier: null, default_selected: false, material_cost: 35 },
  { id: 'other', parent_id: 'elsewhere', kind: 'task', label: 'Not in this section', sort_order: 0, option_group: null, tier: null, default_selected: true, material_cost: 1 },
];

const ZONED: ZoneDef[] = [{
  key: 'bottom', label: 'Bottom units', kind: 'units', modules: [],
  globals: [{ key: 'door_model', label: 'Door model', type: 'option', option_group: 'Cabinet model', is_rate_source: true }],
}];

let n = 0;
const ids = () => `new-${n++}`;
const selected = (out: Array<{ kind: string; is_selected?: boolean; label: string }>) =>
  out.filter((r) => r.kind !== 'section' && r.is_selected).map((r) => r.label);

describe('prepareSectionImport', () => {
  it('selects only the default member of the option group on a plan without zones', () => {
    const out = prepareSectionImport(rows, 'sec', [], 5, ids)!;
    expect(out).toHaveLength(14);
    expect(selected(out)).toEqual(['Light']);
    expect(out.find((r) => r.label === 'Premium coloured carcass')!.is_selected).toBe(false);
    expect(out.some((r) => r.label === 'Not in this section')).toBe(false);

    const total = out.reduce((sum, r) => sum + (r.kind === 'section' ? 0 : computeLinePricing({
      is_allowance: false, allowance_amount: null, material_cost: r.material_cost, labor_rate: null,
      resolved_material: null, resolved_labor: null, margin_pct: 0, quantity: 6, is_selected: r.is_selected,
    }).line_total), 0);
    expect(total).toBe(660);
  });

  it('drops the group the target plan\'s zones absorb', () => {
    const out = prepareSectionImport(rows, 'sec', ZONED, 5, ids)!;
    expect(out.some((r) => r.option_group === 'Cabinet model')).toBe(false);
    expect(out.map((r) => r.label)).toEqual(['Cabinets', 'Premium coloured carcass']);
    expect(selected(out)).toEqual([]);
  });

  it('re-ids the section and parents its tasks to it', () => {
    const out = prepareSectionImport(rows, 'sec', [], 7, ids)!;
    const [section, ...tasks] = out;
    expect(section.id).not.toBe('sec');
    expect(section.parent_id).toBeNull();
    expect(section.sort_order).toBe(7);
    for (const t of tasks) expect(t.parent_id).toBe(section.id);
  });

  it('returns null for an id that is not a section', () => {
    expect(prepareSectionImport(rows, 'm0', [], 0, ids)).toBeNull();
  });
});

describe('project-plan-engine imports through the shared helper', () => {
  const engine = blankComments(readFileSync(
    join(__dirname, '..', '..', 'supabase', 'functions', 'project-plan-engine', 'index.ts'), 'utf8',
  ));
  it('add-section-from-blueprint uses prepareSectionImport and checks blueprint visibility', () => {
    const start = engine.indexOf("case 'add-section-from-blueprint'");
    const body = engine.slice(start, engine.indexOf('case ', start + 10));
    expect(body).toContain('prepareSectionImport(');
    expect(body).toContain('loadVisibleBlueprint(supabase, source_blueprint_id, plan.workspace_id)');
    expect(body.indexOf('loadVisibleBlueprint')).toBeLessThan(body.indexOf("from('blueprint_items')"));
  });
});
