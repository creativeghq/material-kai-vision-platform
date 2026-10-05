export interface DayAvailability { date: string; ranges: Array<{ start: string; end: string }> }
export interface BusyBlock { start: Date; end: Date }

function at(date: string, hhmm: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm || 0, 0, 0);
}

/** Free slots inside the person's own availability, clear of anything already booked — spread over different days first. */
export function proposeSlots(opts: {
  availability: DayAvailability[];
  busy: BusyBlock[];
  now?: Date;
  durationMin?: number;
  max?: number;
  leadMin?: number;
}): Date[] {
  const now = opts.now ?? new Date();
  const duration = (opts.durationMin ?? 60) * 60_000;
  const earliest = now.getTime() + (opts.leadMin ?? 120) * 60_000;
  const max = opts.max ?? 3;
  const free: Date[] = [];
  const days = [...opts.availability].sort((a, b) => a.date.localeCompare(b.date));
  for (const day of days) {
    for (const r of day.ranges ?? []) {
      const end = at(day.date, r.end).getTime();
      for (let t = at(day.date, r.start).getTime(); t + duration <= end; t += 30 * 60_000) {
        if (t < earliest) continue;
        const clash = opts.busy.some((b) => t < b.end.getTime() && t + duration > b.start.getTime());
        if (!clash) free.push(new Date(t));
      }
    }
  }
  const picked: Date[] = [];
  const usedDays = new Set<string>();
  for (const slot of free) {
    if (picked.length >= max) break;
    const key = slot.toDateString();
    if (usedDays.has(key)) continue;
    usedDays.add(key);
    picked.push(slot);
  }
  for (const slot of free) {
    if (picked.length >= max) break;
    if (!picked.some((p) => p.getTime() === slot.getTime())) picked.push(slot);
  }
  return picked.sort((a, b) => a.getTime() - b.getTime());
}

export function mergeFields(text: string, ctx: { name?: string | null; email?: string | null }): string {
  const name = (ctx.name ?? '').trim();
  const first = name.split(/\s+/)[0] ?? '';
  return text
    .replace(/\{first_name\}/g, first)
    .replace(/\{name\}/g, name)
    .replace(/\{email\}/g, (ctx.email ?? '').trim());
}
