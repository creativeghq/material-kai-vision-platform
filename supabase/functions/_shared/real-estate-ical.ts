// deno-lint-ignore-file no-explicit-any
/**
 * iCalendar in and out for short-let channel sync.
 *
 * Every booking channel (Airbnb, Booking.com, Vrbo) speaks the same dialect: they publish an .ics of
 * their bookings and consume one of ours. That is the entire integration — no per-channel API, no
 * partner approval — which is why this is the sync layer rather than three bespoke clients.
 *
 * Dependency-free so `tests/unit/shortLetIcal.test.ts` can exercise the parser against real channel
 * exports. A silently mis-parsed DTEND is a double booking, and that is not a bug you find by reading.
 */

export interface IcalEvent {
  uid: string | null;
  /** Inclusive first night. */
  start: string;
  /** EXCLUSIVE — the iCal DTEND for an all-day event is the morning of departure, which is exactly
   *  our half-open check_out. Treating it as the last night is THE classic off-by-one here and it
   *  produces a phantom overlap on every back-to-back changeover. */
  end: string;
  summary: string | null;
}

/** Unfold RFC5545 continuation lines (a leading space or tab continues the previous line). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** `20260910` or `20260910T140000Z` → `2026-09-10`. Channels use both. */
function toDate(raw: string): string | null {
  const v = raw.trim();
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(v);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** Parse the VEVENTs out of an .ics feed. Ignores everything else a channel may include. */
export function parseIcal(ics: string): IcalEvent[] {
  const out: IcalEvent[] = [];
  let cur: Partial<IcalEvent> | null = null;

  for (const line of unfold(ics)) {
    const t = line.trim();
    if (t === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (t === 'END:VEVENT') {
      if (cur?.start && cur.end) {
        out.push({ uid: cur.uid ?? null, start: cur.start, end: cur.end, summary: cur.summary ?? null });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    // `DTSTART;VALUE=DATE:20260910` — the property name may carry parameters after a semicolon.
    const idx = t.indexOf(':');
    if (idx < 0) continue;
    const name = t.slice(0, idx).split(';')[0].toUpperCase();
    const value = t.slice(idx + 1);

    if (name === 'DTSTART') cur.start = toDate(value) ?? undefined;
    else if (name === 'DTEND') cur.end = toDate(value) ?? undefined;
    else if (name === 'UID') cur.uid = value.trim();
    else if (name === 'SUMMARY') cur.summary = value.trim();
  }
  return out;
}

/** Escape a text value per RFC5545 — a comma or a semicolon in a guest name would split the field. */
function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateOnly = (s: string) => s.slice(0, 10).replace(/-/g, '');

/**
 * Build the availability feed a channel pulls from us.
 *
 * Guest identity is NOT included. The channels do not need it, and this URL is a bearer capability
 * handed to third parties — publishing who is staying where would be a data leak dressed up as an
 * integration. Blocked nights are all a channel needs to stop selling them.
 */
export function buildIcal(bookings: { check_in: string; check_out: string; id: string; status: string }[], propertyTitle: string, now: Date): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Material KAI//Real Estate//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(propertyTitle || 'Availability')}`,
  ];
  for (const b of bookings) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@material-kai`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateOnly(b.check_in)}`,
      // Mirrors the parse side: DTEND is the exclusive morning-of-departure, so a channel reading
      // this feed leaves the changeover day sellable exactly as we do.
      `DTEND;VALUE=DATE:${dateOnly(b.check_out)}`,
      'SUMMARY:Not available',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  // RFC5545 wants CRLF.
  return lines.join('\r\n') + '\r\n';
}
