/**
 * Short-let iCal guard.
 *
 * Channel sync is the feature, and a mis-parsed date is not a cosmetic bug — it is a double booking
 * or a phantom one. Two specific things have to hold:
 *
 *  1. **DTEND is exclusive.** For an all-day iCal event DTEND is the morning of departure, which is
 *     exactly our half-open `check_out`. Reading it as the last night is the classic off-by-one, and
 *     it manufactures an overlap on every back-to-back changeover — the database exclusion constraint
 *     would then reject a perfectly legal booking.
 *  2. **The outbound feed carries no guest identity.** That URL is a bearer capability handed to
 *     third parties; who is staying where is not theirs to have.
 */
import { describe, it, expect } from 'vitest';
import { parseIcal, buildIcal } from '../../supabase/functions/_shared/real-estate-ical';

/** Shaped like a real Airbnb export: folded lines, VALUE=DATE, a VTIMEZONE block to ignore. */
const AIRBNB = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Airbnb Inc//Hosting Calendar 1.0.0//EN',
  'VERSION:2.0',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Athens',
  'END:VTIMEZONE',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20260914',
  'DTSTART;VALUE=DATE:20260910',
  'UID:1234abcd@airbnb.com',
  'SUMMARY:Reserved — a very long summary line that the exporter has',
  '  folded across two physical lines',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20260918',
  'DTSTART;VALUE=DATE:20260914',
  'UID:5678efgh@airbnb.com',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('iCal import — dates a channel actually sends', () => {
  it('reads DTEND as the EXCLUSIVE checkout date', () => {
    const [first] = parseIcal(AIRBNB);
    expect(first.start).toBe('2026-09-10');
    // Not 2026-09-13. If this ever becomes the last night, back-to-back stays start colliding.
    expect(first.end).toBe('2026-09-14');
  });

  it('lets a back-to-back changeover parse as two non-overlapping stays', () => {
    const [a, b] = parseIcal(AIRBNB);
    expect(a.end).toBe(b.start);
    // Half-open [start, end): touching ranges do not overlap, which is what the DB constraint enforces.
    expect(a.end <= b.start).toBe(true);
  });

  it('unfolds continuation lines instead of losing them', () => {
    expect(parseIcal(AIRBNB)[0].summary).toContain('folded across two physical lines');
  });

  it('reads a datetime DTSTART as well as a date one', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260401T140000Z', 'DTEND:20260405T100000Z', 'UID:x', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(parseIcal(ics)[0]).toMatchObject({ start: '2026-04-01', end: '2026-04-05' });
  });

  it('ignores non-VEVENT blocks and events missing dates', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VTIMEZONE', 'TZID:X', 'END:VTIMEZONE',
      'BEGIN:VEVENT', 'UID:no-dates', 'SUMMARY:Broken', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    expect(parseIcal(ics)).toEqual([]);
  });
});

describe('iCal export — what we hand a third party', () => {
  const bookings = [{ id: 'b1', check_in: '2026-09-10', check_out: '2026-09-14', status: 'confirmed' }];
  const feed = buildIcal(bookings, 'Seaside Apartment', new Date('2026-08-07T10:00:00Z'));

  it('publishes the blocked nights with an exclusive DTEND', () => {
    expect(feed).toContain('DTSTART;VALUE=DATE:20260910');
    expect(feed).toContain('DTEND;VALUE=DATE:20260914');
  });

  it('round-trips through our own parser', () => {
    expect(parseIcal(feed)[0]).toMatchObject({ start: '2026-09-10', end: '2026-09-14' });
  });

  it('never leaks guest identity to the channel', () => {
    const withGuest = buildIcal(
      [{ id: 'b2', check_in: '2026-10-01', check_out: '2026-10-05', status: 'confirmed' }],
      'Seaside Apartment', new Date('2026-08-07T10:00:00Z'),
    );
    expect(withGuest).toContain('SUMMARY:Not available');
    expect(withGuest.toLowerCase()).not.toContain('guest');
    expect(withGuest).not.toMatch(/@[\w.-]+\.\w+/);
  });

  it('uses CRLF line endings, as RFC5545 requires', () => {
    expect(feed.includes('\r\n')).toBe(true);
    expect(feed.endsWith('\r\n')).toBe(true);
  });
});
