import { describe, it, expect } from 'vitest';

import { SERVICE_DEFAULTS, SERVICE_TRADE_OF, WORKTOP_SOCKETS, kitchenServices, serviceChecks, serviceCoverage, serviceCounts, servicePoints, type KitchenLayout, type RunModule } from '@/lib/scene/kitchenComposition';
import { kitchenElevations, tradeSheets } from '@/lib/scene/kitchenDrawings';
import { SERVICE_YIELD_KEYS } from '@/utils/blueprintComposition';

const run = (over: Partial<{ id: string; label: string; kind: string; width_mm: number; height_mm: number; elevation_mm: number; x_mm: number; kitchen_layout: KitchenLayout | null }>) => ({
  id: 'r', label: 'Sink Wall', kind: 'kitchen_base', x_mm: 1500, y_mm: 300, rotation_deg: 0, width_mm: 3000, depth_mm: 600, height_mm: 900, elevation_mm: 0,
  kitchen_layout: null as KitchenLayout | null, ...over,
});
const laid = (modules: RunModule[]): KitchenLayout => ({ modules });
const byRule = (checks: ReturnType<typeof serviceChecks>) => Object.fromEntries(checks.map((c) => [c.rule, c]));

const kitchen = [
  run({ id: 'b', kitchen_layout: laid([
    { type: 'drawers', width_mm: 600 }, { type: 'sink_base', width_mm: 600 }, { type: 'dishwasher_housing', width_mm: 600 },
    { type: 'oven_base', width_mm: 600 }, { type: 'door2', width_mm: 600 },
  ]) }),
  run({ id: 'w', label: 'Wall Units', kind: 'kitchen_wall', width_mm: 3000, height_mm: 700, elevation_mm: 1450, kitchen_layout: laid([
    { type: 'door2', width_mm: 900 }, { type: 'door2', width_mm: 900 }, { type: 'extractor', width_mm: 600 }, { type: 'door1', width_mm: 600 },
  ]) }),
  run({ id: 't', label: 'Tall', kind: 'kitchen_tall', x_mm: 3300, width_mm: 600, height_mm: 2100, kitchen_layout: laid([{ type: 'fridge_housing', width_mm: 600 }]) }),
];

describe('services drawing: where the electrician and plumber connect', () => {
  it('every service key is a blueprint service key', () => {
    const keys = new Set(Object.values(SERVICE_DEFAULTS).flatMap((rules) => rules.map((r) => r.key)));
    for (const k of keys) expect(SERVICE_YIELD_KEYS.has(k)).toBe(true);
  });

  it('derives each appliance its connections at trade heights, assumed', () => {
    const [base, wall, tall] = servicePoints(kitchen);
    const at = (key: string, serves: string) => base.points.filter((p) => p.key === key && p.serves === serves);
    expect(at('water_in', 'Sink Base')[0]).toMatchObject({ x_mm: 900, height_mm: 500 });
    expect(at('waste_out', 'Sink Base')[0]).toMatchObject({ x_mm: 900, height_mm: 400 });
    expect(at('waste_out', 'Dishwasher Housing')[0].x_mm).toBe(1100);
    expect(at('socket_dedicated', 'Dishwasher Housing')[0]).toMatchObject({ x_mm: 900, height_mm: 300 });
    expect(at('socket_dedicated', 'Under-Worktop Oven')[0]).toMatchObject({ x_mm: 2700, height_mm: 1100 });
    const worktop = base.points.filter((p) => p.serves === 'Worktop');
    expect(worktop.map((p) => p.x_mm)).toEqual([150, 1500, 2700]);
    expect(worktop.every((p) => p.height_mm === WORKTOP_SOCKETS.height_mm)).toBe(true);
    expect(wall.points.map((p) => p.key).sort()).toEqual(['duct_run', 'socket']);
    expect(wall.points.find((p) => p.key === 'duct_run')!.height_mm).toBe(2150);
    expect(tall.points).toEqual([expect.objectContaining({ key: 'socket', serves: 'Fridge Housing' })]);
    expect([...base.points, ...wall.points].every((p) => p.height_tone === 'assumed' && p.tone === 'stated')).toBe(true);
    expect(serviceCounts(kitchen)).toMatchObject({ water_in: 2, waste_out: 2, socket_dedicated: 2, duct_run: 1 });
  });

  it('the elevation carries the points at the wall position of their run', () => {
    const elevations = kitchenElevations(kitchen.map((r) => ({ ...r })));
    const wall = elevations.find((e) => e.run_ids.includes('b'))!;
    expect(wall.services.some((p) => p.key === 'water_in')).toBe(true);
  });

  it('a gas hob and a recirculating hood change the connection, not the count', () => {
    const [b, w] = servicePoints([
      run({ kitchen_layout: laid([{ type: 'oven_base', width_mm: 600, options: { fuel: 'gas' } }, { type: 'door2', width_mm: 600 }]), width_mm: 1200 }),
      run({ kind: 'kitchen_wall', elevation_mm: 1450, height_mm: 700, width_mm: 600, kitchen_layout: laid([{ type: 'extractor', width_mm: 600, options: { extraction: 'recirculation' } }]) }),
    ]);
    expect(b.points.some((p) => p.key === 'gas_point')).toBe(true);
    expect(b.points.some((p) => p.key === 'socket_dedicated')).toBe(false);
    expect(w.points.map((p) => p.key).sort()).toEqual(['carbon_filter', 'socket']);
  });

  it('passes a well-planned kitchen except the heights nobody has confirmed', () => {
    const c = byRule(serviceChecks(kitchen));
    expect(c['Every Appliance Has Its Power'].ok).toBe(true);
    expect(c['Every Appliance Has Its Water, Waste and Gas'].ok).toBe(true);
    expect(c['Sockets Clear of Sink and Hob'].ok).toBe(true);
    expect(c['Dishwasher Drains Beside the Sink'].ok).toBe(true);
    expect(c['Worktop Has Sockets'].ok).toBe(true);
    expect(c['Electrical Heights Confirmed by a Person'].detail).toContain('expected until the electrician');
    expect(c['Plumbing Heights Confirmed by a Person'].detail).toContain('expected until the plumber');
  });

  it('fails an unstated appliance, a far dishwasher, an isolator over the hob and a worktop with no clear spot', () => {
    const c = byRule(serviceChecks([
      run({ width_mm: 3000, kitchen_layout: laid([
        { type: 'sink_base', width_mm: 600 }, { type: 'drawers', width_mm: 600 }, { type: 'door2', width_mm: 600 }, { type: 'dishwasher_housing', width_mm: 600 }, { type: 'appliance_base', width_mm: 600 },
      ]) }),
      run({ label: 'Hob Run', width_mm: 1500, kitchen_layout: laid([{ type: 'door1', width_mm: 300 }, { type: 'oven_base', width_mm: 600 }, { type: 'sink_base', width_mm: 600 }]) }),
    ]));
    expect(c['Every Appliance Has Its Power'].detail).toContain('Appliance Space');
    expect(c['Every Appliance Has Its Water, Waste and Gas'].detail).toContain('Appliance Space');
    expect(c['Dishwasher Drains Beside the Sink'].detail).toContain('120 cm from the sink');
    expect(c['Sockets Clear of Sink and Hob'].detail).toContain('Cooker Circuit Isolator');
    expect(c['Worktop Has Sockets'].detail).toContain('Hob Run');
  });

  it('a dishwasher with no sink on its run fails, and a room with no kitchen has no service checks', () => {
    const c = byRule(serviceChecks([run({ width_mm: 1200, kitchen_layout: laid([{ type: 'dishwasher_housing', width_mm: 600 }, { type: 'door2', width_mm: 600 }]) })]));
    expect(c['Dishwasher Drains Beside the Sink'].detail).toContain('no sink');
    expect(serviceChecks([run({ kind: 'sofa' })])).toEqual([]);
  });

  it('every service key belongs to exactly one trade', () => {
    for (const k of SERVICE_YIELD_KEYS) expect(['electrical', 'plumbing']).toContain(SERVICE_TRADE_OF[k as keyof typeof SERVICE_TRADE_OF]);
  });

  it('every kitchen gets a sheet that says Electrical and a sheet that says Plumbing, even with nothing to draw', () => {
    const titles = (runs: typeof kitchen) => tradeSheets(kitchenElevations(runs)).map((t) => t.title);
    expect(titles(kitchen).some((t) => t === 'Electrical and Extraction')).toBe(true);
    expect(titles(kitchen).some((t) => t === 'Plumbing')).toBe(true);
    const dry = [run({ width_mm: 600, kitchen_layout: laid([{ type: 'door2', width_mm: 600 }]) })];
    const sheets = tradeSheets(kitchenElevations(dry));
    expect(new Set(sheets.map((t) => t.trade))).toEqual(new Set(['electrical', 'plumbing']));
    for (const t of tradeSheets(kitchenElevations(kitchen))) expect(t.points.every((p) => SERVICE_TRADE_OF[p.key] === t.trade)).toBe(true);
  });

  it('asks about what nobody decided: no sink, cooker, fridge or extractor fails its trade', () => {
    const dry = byRule(serviceCoverage([run({ kitchen_layout: laid([{ type: 'oven_base', width_mm: 600 }, { type: 'door2', width_mm: 600 }]) })]));
    expect(dry['Kitchen Has Its Plumbing Layout']).toMatchObject({ ok: false, trade: 'plumbing' });
    expect(dry['Fridge Has a Socket']).toMatchObject({ ok: false, trade: 'electrical' });
    expect(dry['Extraction Is Drawn'].ok).toBe(false);
    expect(dry['Cooking Has Its Own Supply'].ok).toBe(true);
    expect(serviceCoverage(kitchen).every((c) => c.ok)).toBe(true);
  });

  it('fails an isolator that lands behind a tall unit on the same wall', () => {
    const oven = run({ id: 'o', label: 'Oven', x_mm: 300, width_mm: 600, kitchen_layout: laid([{ type: 'oven_base', width_mm: 600 }]) });
    const tall = run({ id: 't', label: 'Fridge Column', kind: 'kitchen_tall', x_mm: 900, width_mm: 600, height_mm: 2100, kitchen_layout: laid([{ type: 'fridge_housing', width_mm: 600 }]) });
    expect(byRule(serviceCoverage([oven, tall]))['Isolators Can Be Reached'].detail).toContain('Fridge Column');
    expect(byRule(serviceCoverage([oven, { ...tall, x_mm: 2400 }]))['Isolators Can Be Reached'].ok).toBe(true);
    expect(byRule(serviceCoverage([oven, { ...tall, rotation_deg: 90 }]))['Isolators Can Be Reached'].ok).toBe(true);
  });

  it('the agent report splits the trades and loses no point', () => {
    const s = kitchenServices(kitchen)!;
    const total = (o: object) => Object.values(o).reduce((n: number, v) => n + (v as number), 0);
    expect(total(s.electrical.points) + total(s.plumbing.points)).toBe(total(serviceCounts(kitchen)));
    expect(s.plumbing.checks.every((c) => c.trade === 'plumbing')).toBe(true);
    expect(kitchenServices([run({ kind: 'sofa' })])).toBeNull();
  });
});
