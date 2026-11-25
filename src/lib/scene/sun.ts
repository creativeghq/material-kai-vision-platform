export function sunAt(hour: number, span: number): { position: [number, number, number]; colour: string; intensity: number; sky: number } {
  const t = Math.min(1, Math.max(0, (hour - 6) / 14));
  const el = (Math.PI / 3) * Math.sin(Math.PI * t);
  const az = Math.PI * t;
  const s = Math.max(span, 4);
  const low = Math.min(1, el / (Math.PI / 9));
  const mix = (a: number, b: number) => Math.round(a + (b - a) * low);
  return {
    position: [s * 1.4 * Math.cos(az) * Math.cos(el), s * 1.6 * Math.max(0.12, Math.sin(el)), s * (0.35 + 0.5 * Math.sin(az)) * Math.cos(el)],
    colour: `rgb(${mix(255, 255)}, ${mix(170, 241)}, ${mix(102, 220)})`,
    intensity: 0.4 + 1.5 * Math.sin(el),
    sky: 0.15 + 0.25 * Math.sin(el),
  };
}
