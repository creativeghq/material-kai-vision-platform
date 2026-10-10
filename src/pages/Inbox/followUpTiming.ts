export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 18;

/** The same moment if it falls Mon–Fri 09:00–18:00 local time, otherwise the next working day at `preferredHour` (or 09:00). */
export function withinBusinessHours(at: Date, preferredHour?: number | null): Date {
  const d = new Date(at);
  const open = preferredHour != null && preferredHour >= BUSINESS_START_HOUR && preferredHour < BUSINESS_END_HOUR ? preferredHour : BUSINESS_START_HOUR;
  const isWeekend = (x: Date) => x.getDay() === 0 || x.getDay() === 6;
  if (!isWeekend(d) && d.getHours() >= BUSINESS_START_HOUR && d.getHours() < BUSINESS_END_HOUR) return d;
  if (!isWeekend(d) && d.getHours() < BUSINESS_START_HOUR) {
    d.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    return d;
  }
  do {
    d.setDate(d.getDate() + 1);
  } while (isWeekend(d));
  d.setHours(open, 0, 0, 0);
  return d;
}

/** The same calendar day at `hour`:00, or the next day at that hour when that has already passed `notBefore`. */
export function atHour(at: Date, hour: number, notBefore = new Date()): Date {
  const d = new Date(at);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= notBefore.getTime() + 60_000) d.setDate(d.getDate() + 1);
  return d;
}

export interface ChainTiming { businessHours: boolean; hour: number | null }

/** Send times for a follow-up chain: the first at `first`, each later one `gapDays[i]` calendar days after the one before. */
export function chainDates(first: Date, gapDays: number[], timing: ChainTiming, now = new Date()): Date[] {
  const adjust = (d: Date) => {
    let out = timing.hour != null ? atHour(d, timing.hour, now) : new Date(d);
    if (timing.businessHours) out = withinBusinessHours(out, timing.hour);
    return out;
  };
  const out = [adjust(first)];
  for (const gap of gapDays) {
    const next = new Date(out[out.length - 1]);
    next.setDate(next.getDate() + Math.max(1, gap));
    out.push(adjust(next));
  }
  return out;
}

const DOW = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export interface BestTime { best_hour: number | null; best_dow: number | null; sample: number; basis: string }

/** "Usually replies around 14:00 on Mondays (5 replies)" — or null when there is nothing to base it on. */
export function describeBestTime(b: BestTime | null): string | null {
  if (!b || b.best_hour == null || b.basis === 'none') return null;
  const hour = `${String(b.best_hour).padStart(2, '0')}:00`;
  const day = b.best_dow ? ` on ${DOW[b.best_dow]}s` : '';
  const who = b.basis === 'contact' ? 'They usually reply' : 'Your customers usually reply';
  return `${who} around ${hour}${day} (${b.sample} ${b.sample === 1 ? 'reply' : 'replies'})`;
}
