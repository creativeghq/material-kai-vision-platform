/**
 * Guards the blueprint→money rules shared by the public kitchen calculator, the kitchen lead
 * capture and the `calculate_kitchen_cost` agent tool.
 *
 * WHY THIS EXISTS
 * ---------------
 * `calculate_kitchen_cost` is reachable only through `agent-chat`, and agent-chat is the ONE
 * entrypoint the edge typecheck gate excludes ("type graph exceeds 12 GB even alone"). `tsconfig`
 * excludes `supabase/**` too. So the code deciding which lines get priced had no compiler and no
 * test covering it. Moving the selection into `_shared/blueprint/compute.ts` made it importable
 * from here; this file is the guard that pays for that move.
 *
 * It asserts RULES, never prices. The rates live in the `kitchen_cabinets` blueprint and are meant
 * to be edited in the admin — a test pinning them would fail on every legitimate re-price.
 */

import { describe, it, expect } from 'vitest';
import { computeBlueprint, resolveSelection, matchByLabel } from '../../supabase/functions/_shared/blueprint/compute';

// A miniature blueprint carrying every shape that matters: a per-metre option group with a
// tier default, flat-price allowances, an extra that starts OFF, and a service that starts ON.
const SECTION = 'sec-1';
const rows: Record<string, any>[] = [
  { id: SECTION, parent_id: null, sort_order: 0, kind: 'section', label: 'Kitchen' },
  // option group, priced per metre of run_length
  { id: 'cheap', parent_id: SECTION, sort_order: 0, kind: 'task', label: 'Cheap', unit: 'm', quantity_formula: '= run_length', default_quantity: 1, material_cost: 10, margin_pct: 0, option_group: 'Model', tier: null, is_allowance: false, default_selected: true },
  { id: 'mid', parent_id: SECTION, sort_order: 1, kind: 'task', label: 'Middle', unit: 'm', quantity_formula: '= run_length', default_quantity: 1, material_cost: 20, margin_pct: 0, option_group: 'Model', tier: 'good', is_allowance: false, default_selected: true },
  { id: 'posh', parent_id: SECTION, sort_order: 2, kind: 'task', label: 'Posh Finish', unit: 'm', quantity_formula: '= run_length', default_quantity: 1, material_cost: 30, margin_pct: 0, option_group: 'Model', tier: null, is_allowance: false, default_selected: true },
  // optional flat-price extra — must start OFF
  { id: 'bin', parent_id: SECTION, sort_order: 3, kind: 'task', label: 'Waste bin', unit: 'pcs', default_quantity: 1, option_group: null, is_allowance: true, allowance_amount: 50, margin_pct: 0, default_selected: false },
  // service — must start ON and survive an unrelated extras request
  { id: 'fit', parent_id: SECTION, sort_order: 4, kind: 'task', label: 'Installation', unit: 'm', quantity_formula: '= run_length', default_quantity: 1, labor_rate: 5, margin_pct: 0, option_group: null, is_allowance: false, default_selected: true },
];
const DIMS = { run_length: 4 };

const price = (picks: { options?: string[]; extras?: string[] }, dims = DIMS) => {
  const { selected, unmatched } = resolveSelection(rows, picks);
  const c = computeBlueprint(rows, dims, selected);
  return { subtotal: c.subtotal, unmatched, c };
};

describe('kitchen cost derivation', () => {
  it('resolves an option group by tier:good, not by sort order', () => {
    // Middle (20/m) is tier:'good'; Cheap (10/m) is first. 20*4 + fitting 5*4 = 100.
    expect(price({}).subtotal).toBe(100);
  });

  it('leaves optional extras OFF by default', () => {
    // The 50 allowance must not be in an untouched estimate. This is the whole reason
    // blueprint_items.default_selected exists.
    expect(price({}).subtotal).toBe(100);
    expect(price({ extras: ['Waste bin'] }).subtotal).toBe(150);
  });

  it('keeps default-ON services when unrelated extras are requested', () => {
    // Asking for a bin must not drop installation out of the price.
    const withBin = price({ extras: ['Waste bin'] });
    expect(withBin.c.sections[0].tasks.find((t) => t.label === 'Installation')?.selected).toBe(true);
  });

  it('honours an explicit option pick', () => {
    expect(price({ options: ['Posh Finish'] }).subtotal).toBe(30 * 4 + 20);
  });

  it('reports an unmatched pick instead of silently pricing the default', () => {
    const r = price({ options: ['Marble'] });
    expect(r.unmatched).toEqual(['Marble']);
    expect(r.subtotal).toBe(100); // default still priced — but the caller is told
  });

  it('falls back to the tier default when a group gets two picks, never both and never zero', () => {
    // Untrusted input must not be able to price a group twice or drop it entirely.
    const r = price({ options: ['Cheap', 'Posh Finish'] });
    expect(r.subtotal).toBe(100);
    const chosen = r.c.sections[0].tasks.filter((t) => t.option_group === 'Model' && t.selected);
    expect(chosen).toHaveLength(1);
  });

  it('scales per-metre lines with the dimension but never allowances', () => {
    const two = price({ extras: ['Waste bin'] }, { run_length: 2 });
    // (20 + 5) * 2 metres + a flat 50 that must NOT double
    expect(two.subtotal).toBe(100);
  });

  it('matches labels case- and punctuation-insensitively, preferring an exact fold', () => {
    const opts = rows.filter((r) => r.option_group) as { label: string; id: string }[];
    expect(matchByLabel(opts, 'posh finish')?.id).toBe('posh');
    expect(matchByLabel(opts, 'POSH-FINISH')?.id).toBe('posh');
    // 'Middle' is an exact fold; it must win over 'Posh Finish' containing no such token
    expect(matchByLabel(opts, 'middle')?.id).toBe('mid');
    expect(matchByLabel(opts, 'nonexistent')).toBeNull();
  });

  it('prices an unselected option at zero while keeping its unit price for display', () => {
    // The configurator shows "what would this cost" for every alternative, which reads
    // unit_price on lines whose line_total is 0.
    const { c } = price({});
    const posh = c.sections[0].tasks.find((t) => t.id === 'posh')!;
    expect(posh.selected).toBe(false);
    expect(posh.line_total).toBe(0);
    expect(posh.unit_price).toBe(30);
    expect(posh.quantity).toBe(4);
  });
});
