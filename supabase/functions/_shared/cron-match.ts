/**
 * Does a 5-field cron expression (minute hour day-of-month month day-of-week) match `now`?
 * Supports `*`, lists, ranges and steps. Mirrored in SQL by public.cron_expr_matches, which
 * pg_cron uses to decide whether the scheduler is worth waking at all — change both together.
 */
export function cronMatchesNow(cron: string, now: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length < 5) return false;

  const [minPart, hourPart, domPart, monPart, dowPart] = parts;
  return (
    fieldMatches(minPart, now.getMinutes(), 0, 59) &&
    fieldMatches(hourPart, now.getHours(), 0, 23) &&
    fieldMatches(domPart, now.getDate(), 1, 31) &&
    fieldMatches(monPart, now.getMonth() + 1, 1, 12) &&
    fieldMatches(dowPart, now.getDay(), 0, 6)
  );
}

function fieldMatches(field: string, value: number, min: number, max: number): boolean {
  if (field === '*') return true;

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangePart, stepStr] = part.split('/');
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;
      let start = min, end = max;
      if (rangePart !== '*') {
        if (rangePart.includes('-')) {
          [start, end] = rangePart.split('-').map(Number);
        } else {
          start = parseInt(rangePart, 10);
          end = max;
        }
      }
      for (let i = start; i <= end; i += step) {
        if (i === value) return true;
      }
      continue;
    }

    if (part.includes('-')) {
      const [s, e] = part.split('-').map(Number);
      if (value >= s && value <= e) return true;
      continue;
    }

    if (parseInt(part, 10) === value) return true;
  }
  return false;
}
