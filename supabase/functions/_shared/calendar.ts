/**
 * Calendar-day arithmetic in a named timezone.
 *
 * `Date.now() + days * 86_400_000` is the wrong way to say "in three days": a DST day is 23 or
 * 25 hours long, so the millisecond form lands an hour off across the change, and a date of
 * record derived from it can land on the wrong day. The frontend has `src/utils/datetime.ts`
 * for this; the edge side had nothing, which is why the millisecond form kept reappearing here.
 *
 * There is no per-workspace business timezone yet (a known gap), so callers name the zone.
 */

const partsFormatter = (tz: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

interface WallClock { y: number; m: number; d: number; H: number; M: number; S: number }

function wallClockIn(instant: Date, tz: string): WallClock {
  const get = (type: string) =>
    Number(partsFormatter(tz).formatToParts(instant).find((p) => p.type === type)?.value ?? '0');
  return { y: get('year'), m: get('month'), d: get('day'), H: get('hour'), M: get('minute'), S: get('second') };
}

/** The UTC instant at which `tz` reads exactly this wall-clock time. */
function instantOf(w: WallClock, tz: string): Date {
  // Treat the wall clock as if it were UTC, measure how far the zone is from that, correct once.
  // One correction is enough: the residual only differs when the guess straddles a DST change,
  // and the second pass lands on the correct side of it.
  let guess = Date.UTC(w.y, w.m - 1, w.d, w.H, w.M, w.S);
  for (let i = 0; i < 2; i++) {
    const seen = wallClockIn(new Date(guess), tz);
    const seenAsUtc = Date.UTC(seen.y, seen.m - 1, seen.d, seen.H, seen.M, seen.S);
    const target = Date.UTC(w.y, w.m - 1, w.d, w.H, w.M, w.S);
    if (seenAsUtc === target) break;
    guess += target - seenAsUtc;
  }
  return new Date(guess);
}

/**
 * `from` moved forward `days` calendar days in `tz`, keeping the same wall-clock time. On a
 * 23-hour day the result is still "the same time tomorrow", which is what an operator means.
 */
export function addCalendarDays(from: Date, days: number, tz: string): Date {
  const w = wallClockIn(from, tz);
  // Roll the DATE part in UTC (no DST there), keep the clock part untouched.
  const rolled = new Date(Date.UTC(w.y, w.m - 1, w.d + days));
  return instantOf(
    { y: rolled.getUTCFullYear(), m: rolled.getUTCMonth() + 1, d: rolled.getUTCDate(), H: w.H, M: w.M, S: w.S },
    tz,
  );
}
