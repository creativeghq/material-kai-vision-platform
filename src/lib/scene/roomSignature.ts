interface SigObject { id: string; room_id: string | null; x_mm: number; y_mm: number; rotation_deg: number; width_mm: number; depth_mm: number; height_mm: number; colour_hex: string | null; removed_at?: string | null }
interface SigSurface { room_id: string; surface: string; wall_id?: string | null; zone_key?: string | null; product_id: string | null; colour_hex: string | null }
interface SigFinish { object_id: string; slot: string; product_id: string | null; colour_hex: string | null }

export function roomSignature(roomId: string, objects: SigObject[], surfaces: SigSurface[], finishes: SigFinish[]): string {
  const mine = objects.filter((o) => !o.removed_at && o.room_id === roomId);
  const ids = new Set(mine.map((o) => o.id));
  const rows = [
    ...mine.map((o) => `o|${o.id}|${[o.x_mm, o.y_mm, o.rotation_deg, o.width_mm, o.depth_mm, o.height_mm].map((n) => Math.round(Number(n))).join(',')}|${o.colour_hex ?? ''}`),
    ...surfaces.filter((s) => s.room_id === roomId).map((s) => `s|${s.surface}|${s.wall_id ?? ''}|${s.zone_key ?? ''}|${s.product_id ?? ''}|${s.colour_hex ?? ''}`),
    ...finishes.filter((f) => ids.has(f.object_id)).map((f) => `f|${f.object_id}|${f.slot}|${f.product_id ?? ''}|${f.colour_hex ?? ''}`),
  ].sort().join('\n');
  let h = 0x811c9dc5;
  for (let i = 0; i < rows.length; i++) h = Math.imul(h ^ rows.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16);
}
