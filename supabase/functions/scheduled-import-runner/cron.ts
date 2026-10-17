/**
 * The one next-run calculation for scheduled imports (UTC, 5 fields). An expression it cannot
 * parse is refused — never quietly turned into "an hour from now". Import-free for unit tests.
 */

export class InvalidCronError extends Error {}

const FIELD_BOUNDS: Array<[number, number]> = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const FIELD_NAMES = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week'];

function parseInt10(raw: string, field: string): number {
  if (!/^\d+$/.test(raw)) throw new InvalidCronError(`Invalid ${field} value "${raw}".`);
  return Number(raw);
}

function parseField(raw: string, idx: number): Set<number> {
  const [min, max] = FIELD_BOUNDS[idx];
  const name = FIELD_NAMES[idx];
  const out = new Set<number>();
  for (const part of raw.split(',')) {
    const [range, stepRaw] = part.split('/');
    if (part.split('/').length > 2) throw new InvalidCronError(`Invalid ${name} "${part}".`);
    const step = stepRaw === undefined ? 1 : parseInt10(stepRaw, name);
    if (step < 1) throw new InvalidCronError(`Invalid ${name} step "${part}".`);
    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = min; hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = parseInt10(a, name); hi = parseInt10(b, name);
    } else {
      lo = parseInt10(range, name);
      hi = stepRaw === undefined ? lo : max;
    }
    const ceiling = idx === 4 ? 7 : max;
    if (lo < min || hi > ceiling || lo > hi) throw new InvalidCronError(`${name} "${part}" is out of range.`);
    for (let v = lo; v <= hi; v += step) out.add(idx === 4 && v === 7 ? 0 : v);
  }
  return out;
}

export interface ParsedCron {
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
}

export function parseCron(expr: string): ParsedCron {
  const parts = String(expr ?? '').trim().split(/\s+/);
  if (parts.length !== 5) throw new InvalidCronError('A schedule needs exactly 5 fields: minute hour day month weekday.');
  const [minutes, hours, days, months, weekdays] = parts.map(parseField);
  return { minutes, hours, days, months, weekdays };
}

/** The first minute strictly after `from` that the expression matches. Throws when there is none within a year. */
export function nextCronRun(expr: string, from: Date): Date {
  const c = parseCron(expr);
  const t = new Date(from.getTime());
  t.setUTCSeconds(0, 0);
  t.setUTCMinutes(t.getUTCMinutes() + 1);
  const limit = from.getTime() + 366 * 24 * 60 * 60 * 1000;
  while (t.getTime() <= limit) {
    if (!c.months.has(t.getUTCMonth() + 1)) {
      t.setUTCMonth(t.getUTCMonth() + 1, 1);
      t.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!c.days.has(t.getUTCDate()) || !c.weekdays.has(t.getUTCDay())) {
      t.setUTCDate(t.getUTCDate() + 1);
      t.setUTCHours(0, 0, 0, 0);
      continue;
    }
    if (!c.hours.has(t.getUTCHours())) {
      t.setUTCHours(t.getUTCHours() + 1, 0, 0, 0);
      continue;
    }
    if (!c.minutes.has(t.getUTCMinutes())) {
      t.setUTCMinutes(t.getUTCMinutes() + 1, 0, 0);
      continue;
    }
    return t;
  }
  throw new InvalidCronError(`"${expr}" never fires within a year.`);
}
