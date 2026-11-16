export type SplatGroup = 'main' | 'low' | 'top';

export const GROUP_NONE = 255;
const GROUP_CODE: Record<SplatGroup, number> = { main: 0, low: 1, top: 2 };

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export function groupSplats(
  y: Float32Array, rgb: Float32Array, opacity: Float32Array,
  bands: { low: boolean; top: boolean },
): Uint8Array {
  const n = y.length;
  const out = new Uint8Array(n).fill(GROUP_NONE);
  let minY = Infinity; let maxY = -Infinity;
  for (let i = 0; i < n; i++) if (opacity[i] >= 0.1) { minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]); }
  if (!(maxY > minY)) return out;
  const span = maxY - minY;
  const rest: number[] = [];
  for (let i = 0; i < n; i++) {
    if (opacity[i] < 0.1) continue;
    const t = (y[i] - minY) / span;
    if (bands.low && t < 0.12) out[i] = GROUP_CODE.low;
    else if (bands.top && t > 0.94) out[i] = GROUP_CODE.top;
    else rest.push(i);
  }
  if (!rest.length) return out;
  const chroma = (i: number): [number, number, number] => {
    const r = rgb[i * 3]; const g = rgb[i * 3 + 1]; const bl = rgb[i * 3 + 2];
    const m = (r + g + bl) / 3 + 0.02;
    return [(r - m) / m, (g - m) / m, (bl - m) / m];
  };
  const feats = rest.map(chroma);
  let a = feats[0]; let b = feats[0];
  let far = 0;
  for (const f of feats) { const dd = (f[0] - a[0]) ** 2 + (f[1] - a[1]) ** 2 + (f[2] - a[2]) ** 2; if (dd > far) { far = dd; b = f; } }
  const assign = new Uint8Array(rest.length);
  for (let iter = 0; iter < 10; iter++) {
    const sa = [0, 0, 0, 0]; const sb = [0, 0, 0, 0];
    feats.forEach((f, k) => {
      const da = (f[0] - a[0]) ** 2 + (f[1] - a[1]) ** 2 + (f[2] - a[2]) ** 2;
      const db = (f[0] - b[0]) ** 2 + (f[1] - b[1]) ** 2 + (f[2] - b[2]) ** 2;
      const s2 = da <= db ? sa : sb;
      assign[k] = da <= db ? 0 : 1;
      s2[0] += f[0]; s2[1] += f[1]; s2[2] += f[2]; s2[3] += 1;
    });
    if (sa[3]) a = [sa[0] / sa[3], sa[1] / sa[3], sa[2] / sa[3]];
    if (sb[3]) b = [sb[0] / sb[3], sb[1] / sb[3], sb[2] / sb[3]];
  }
  const countA = assign.reduce((m, v) => m + (v === 0 ? 1 : 0), 0);
  const mainCluster = countA >= rest.length - countA ? 0 : 1;
  const close = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.25;
  rest.forEach((i, k) => { if (close || assign[k] === mainCluster) out[i] = GROUP_CODE.main; });
  return out;
}

export function tintSplats(rgb: Float32Array, groups: Uint8Array, targets: Partial<Record<SplatGroup, [number, number, number]>>): Float32Array {
  const out = new Float32Array(rgb);
  for (const [name, target] of Object.entries(targets) as Array<[SplatGroup, [number, number, number] | undefined]>) {
    if (!target) continue;
    const code = GROUP_CODE[name];
    let sum = 0; let count = 0;
    for (let i = 0; i < groups.length; i++) if (groups[i] === code) { sum += luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); count++; }
    if (!count) continue;
    const mean = Math.max(sum / count, 0.02);
    for (let i = 0; i < groups.length; i++) {
      if (groups[i] !== code) continue;
      const k = Math.min(1.6, Math.max(0.45, luma(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) / mean));
      out[i * 3] = Math.min(1, target[0] * k);
      out[i * 3 + 1] = Math.min(1, target[1] * k);
      out[i * 3 + 2] = Math.min(1, target[2] * k);
    }
  }
  return out;
}
