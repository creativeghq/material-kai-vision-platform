/**
 * Container fill binds on WEIGHT for tile (#439).
 *
 * Every published algorithm is volume-first. Palletised porcelain runs ~1,800–2,000 kg/m³, so a
 * 20ft box hits its ~28 t payload at about 14–15 m³ against a ~33 m³ cube — a volume-first packer
 * builds a container that looks correct on screen and cannot be lifted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  loadIsAFloor, loadIsOverweight, headroomKg, type ContainerFill,
} from '@/modules/stock/containerFillRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const service = read('src/modules/stock/services/containerFillService.ts');
const notice = read('src/modules/stock/components/ContainerFillNotice.tsx');
const resupply = read('src/modules/stock/components/ResupplySection.tsx');

const f = (over: Partial<ContainerFill>): ContainerFill =>
  ({ status: 'space_left', reason: '', ...over });

describe('a partial weight is a FLOOR, not a load', () => {
  it('any unweighed line makes the total a floor', () => {
    // The real figure is higher by an unknown amount, which is the one direction that gets a
    // container turned away at the port.
    expect(loadIsAFloor(f({ status: 'partial', unweighed_lines: 2 }))).toBe(true);
    expect(loadIsAFloor(f({ status: 'unweighable' }))).toBe(true);
    expect(loadIsAFloor(f({ status: 'full' }))).toBe(false);
    expect(loadIsAFloor(f({ status: 'space_left' }))).toBe(false);
    expect(loadIsAFloor(null)).toBe(false);
  });

  it('a floor has no usable headroom', () => {
    // Offering "8,000 kg to go" against a floor invites somebody to fill a box that is already
    // over. Unknown is not room.
    expect(headroomKg(f({ status: 'partial', remaining_kg: 8000 }))).toBeNull();
    expect(headroomKg(f({ status: 'over_payload', remaining_kg: 0 }))).toBeNull();
    expect(headroomKg(f({ status: 'space_left', remaining_kg: 8000 }))).toBe(8000);
    expect(headroomKg(null)).toBeNull();
  });
});

describe('an over-payload load is refused, not rounded', () => {
  it('only over_payload is overweight', () => {
    expect(loadIsOverweight(f({ status: 'over_payload' }))).toBe(true);
    expect(loadIsOverweight(f({ status: 'full' }))).toBe(false);
    expect(loadIsOverweight(null)).toBe(false);
  });
});

describe('the fill is derived in SQL and nothing packs in the client', () => {
  it('the service reads the derivation', () => {
    expect(service).toContain('container_fill');
    expect(service).toContain('container_types');
  });

  it('no payload figure is restated in TypeScript', () => {
    // The container table is reference data: a 20GP payload is a fact about the world, and a copy
    // here is a copy that drifts.
    for (const [name, src] of [['service', service], ['notice', notice]] as const) {
      expect(src, `${name} restates a payload`).not.toMatch(/\b28000\b|\b26700\b|\b33\.2\b/);
    }
  });

  it('it is shown where the buyer is about to order', () => {
    expect(resupply).toContain('ContainerFillNotice');
    expect(resupply).toContain('flagged');
  });

  it('a failed read is unknown, not a fit', () => {
    expect(notice).toMatch(/not a statement that it fits/);
  });

  it('the top-up rule names the per-supplier constraint', () => {
    // There is no shipping consolidation between suppliers, so composing a box means reaching for
    // that one supplier's other lines — not the cheapest line anywhere.
    expect(notice).toMatch(/no consolidation between suppliers/);
  });
});
