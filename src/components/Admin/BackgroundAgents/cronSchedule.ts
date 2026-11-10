/** Validates and describes the 5-field cron dialect `_shared/cron-match.ts` evaluates (UTC, day-of-week 0–6). */

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day of month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day of week', min: 0, max: 6 },
] as const;

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const INT = /^\d+$/;

function partError(part: string, min: number, max: number): string | null {
  const inRange = (s: string) => INT.test(s) && Number(s) >= min && Number(s) <= max;
  if (part === '*') return null;
  if (part.includes('/')) {
    const [range, step] = part.split('/');
    if (!INT.test(step ?? '') || Number(step) <= 0) return `step "${step}" must be a positive number`;
    if (range === '*') return null;
    if (range.includes('-')) {
      const [a, b] = range.split('-');
      return inRange(a) && inRange(b) && Number(a) <= Number(b) ? null : `range "${range}" must be within ${min}–${max}`;
    }
    return inRange(range) ? null : `"${range}" must be within ${min}–${max}`;
  }
  if (part.includes('-')) {
    const [a, b] = part.split('-');
    return inRange(a) && inRange(b) && Number(a) <= Number(b) ? null : `range "${part}" must be within ${min}–${max}`;
  }
  return inRange(part) ? null : `"${part}" must be within ${min}–${max}`;
}

export function cronError(expr: string): string | null {
  const parts = expr.trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) return `A schedule is 5 fields (minute hour day-of-month month day-of-week); this has ${parts.length}.`;
  for (let i = 0; i < 5; i++) {
    const f = FIELDS[i];
    for (const p of parts[i].split(',')) {
      const err = partError(p, f.min, f.max);
      if (err) return `${f.name}: ${err}`;
    }
  }
  return null;
}

const pad = (n: string) => n.padStart(2, '0');

export function describeCron(expr: string): string | null {
  if (cronError(expr)) return null;
  const [mi, h, dom, mon, dow] = expr.trim().split(/\s+/);
  const everyDay = dom === '*' && mon === '*' && dow === '*';
  const step = (p: string) => (/^\*\/\d+$/.test(p) ? Number(p.slice(2)) : null);

  if (everyDay) {
    if (mi === '*' && h === '*') return 'Every minute';
    if (step(mi) && h === '*') return `Every ${step(mi)} minutes`;
    if (INT.test(mi) && h === '*') return `Every hour at :${pad(mi)}`;
    if (INT.test(mi) && step(h)) return `Every ${step(h)} hours at :${pad(mi)}`;
    if (INT.test(mi) && INT.test(h)) return `Every day at ${pad(h)}:${pad(mi)} UTC`;
  }
  if (INT.test(mi) && INT.test(h) && dom === '*' && mon === '*' && INT.test(dow)) {
    return `Every ${DOW[Number(dow)]} at ${pad(h)}:${pad(mi)} UTC`;
  }
  if (INT.test(mi) && INT.test(h) && INT.test(dom) && mon === '*' && dow === '*') {
    return `Day ${dom} of every month at ${pad(h)}:${pad(mi)} UTC`;
  }
  return `minute ${mi} · hour ${h} · day ${dom} · month ${mon} · weekday ${dow} (UTC)`;
}
