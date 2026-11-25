export interface SceneMaterial {
  key: string;
  label: string;
  kind: 'wood' | 'fabric' | 'carpet' | 'leather' | 'paint' | 'stone' | 'metal';
  roles: string[];
  words: string[];
  albedoUrl: string;
  normalUrl: string;
  roughnessUrl: string;
  tileM: number;
  mean: [number, number, number];
  tintOnly: boolean;
  normalScale: number;
  roughnessFactor: number;
  priority: number;
}

export interface MaterialWant { role: string | null; text?: string | null; hex?: string | null }

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function linearOfHex(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)];
}

export function looksLikeWood(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  const hi = Math.max(r, g, b); const lo = Math.min(r, g, b);
  const light = (hi + lo) / 2; const span = hi - lo;
  if (span < 0.03 || hi !== r) return false;
  const hue = 60 * (((g - b) / span) % 6);
  const sat = span / (1 - Math.abs(2 * light - 1));
  return hue >= 12 && hue <= 46 && sat >= 0.1 && sat <= 0.75 && light >= 0.12 && light <= 0.8;
}

const says = (text: string, word: string) => new RegExp(`(^|[^\p{L}])${word}`, 'iu').test(text);

const apart = (a: [number, number, number], b: [number, number, number]) => Math.hypot(...a.map((v, i) => Math.cbrt(v) - Math.cbrt(b[i])));

export function pickMaterial(library: SceneMaterial[], { role, text, hex }: MaterialWant): SceneMaterial | null {
  const named = text ? library.filter((m) => m.words.some((w) => says(text, w))) : [];
  const fits = (list: SceneMaterial[]) => (role ? list.filter((m) => m.roles.includes(role)) : []);
  const wood = !hex || looksLikeWood(hex);
  const pool = named.length ? (fits(named).length ? fits(named) : named) : fits(library).filter((m) => m.kind !== 'wood' || wood);
  if (!pool.length) return null;
  const target = hex ? linearOfHex(hex) : null;
  return [...pool].sort((a, b) => {
    if (a.kind === 'wood' && b.kind === 'wood' && target) return apart(a.mean, target) - apart(b.mean, target);
    return (a.kind === 'wood' && wood ? 0 : 1) - (b.kind === 'wood' && wood ? 0 : 1) || a.priority - b.priority;
  })[0];
}

export function tintFor(material: SceneMaterial, hex: string | null): [number, number, number] {
  if (!hex) return [1, 1, 1];
  return linearOfHex(hex).map((v, i) => Math.min(4, v / material.mean[i])) as [number, number, number];
}
