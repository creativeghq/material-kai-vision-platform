import { BoxGeometry, Vector3, type BufferGeometry } from 'three';

const ROUND_STEPS = 4;

function roundedBox(size: [number, number, number], r: number): BufferGeometry {
  const n = ROUND_STEPS * 2 + 1;
  const g = new BoxGeometry(1, 1, 1, n, n, n);
  const pos = g.getAttribute('position'); const nor = g.getAttribute('normal');
  const d = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    const at = [pos.getX(i), pos.getY(i), pos.getZ(i)].map((c) => Math.round((c + 0.5) * n));
    const low = at.map((k) => k <= ROUND_STEPS);
    d.fromArray(at.map((k, axis) => Math.tan((Math.PI / 4) * (low[axis] ? k / ROUND_STEPS - 1 : (k - ROUND_STEPS - 1) / ROUND_STEPS)))).normalize();
    nor.setXYZ(i, d.x, d.y, d.z);
    const p = size.map((s, axis) => (low[axis] ? -1 : 1) * (s / 2 - r) + d.getComponent(axis) * r);
    pos.setXYZ(i, p[0], p[1], p[2]);
  }
  return g;
}

export function partGeometry(size: [number, number, number], round?: number): BufferGeometry {
  const r = round ? Math.min(round, Math.min(...size) / 2 - 0.0005) : 0;
  const g = r > 0 ? roundedBox(size, r) : new BoxGeometry(...size);
  g.clearGroups();
  const pos = g.getAttribute('position'); const uv = g.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const axis = Math.floor(i / (pos.count / 6)) >> 1;
    const [a, b] = axis === 0 ? [2, 1] : axis === 1 ? [0, 2] : [0, 1];
    const at = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [u, v] = size[a] > size[b] ? [b, a] : [a, b];
    uv.setXY(i, at[u] + size[u] / 2, at[v] + size[v] / 2);
  }
  return g;
}
