import { describe, it, expect } from 'vitest';
import { mergeFields, proposeSlots } from '@/pages/Inbox/meetingSlots';

describe('proposed meeting times', () => {
  const now = new Date(2026, 9, 6, 8, 0);
  const availability = [
    { date: '2026-10-06', ranges: [{ start: '09:00', end: '12:00' }] },
    { date: '2026-10-07', ranges: [{ start: '10:00', end: '12:00' }] },
    { date: '2026-10-08', ranges: [{ start: '14:00', end: '15:00' }] },
  ];

  it('stays inside the set hours, leaves lead time, and spreads over different days', () => {
    const slots = proposeSlots({ availability, busy: [], now });
    expect(slots.map((d) => [d.getDate(), d.getHours(), d.getMinutes()])).toEqual([[6, 10, 0], [7, 10, 0], [8, 14, 0]]);
  });

  it('never proposes a time that clashes with something booked', () => {
    const busy = [{ start: new Date(2026, 9, 7, 10, 0), end: new Date(2026, 9, 7, 11, 0) }];
    const slots = proposeSlots({ availability, busy, now });
    expect(slots.some((d) => d.getDate() === 7 && d.getHours() === 10 && d.getMinutes() === 0)).toBe(false);
    expect(slots.some((d) => d.getDate() === 7 && d.getHours() === 11)).toBe(true);
  });
});

describe('snippet merge fields', () => {
  it('fills name, first name and email', () => {
    expect(mergeFields('Hi {first_name}, I wrote to {email} ({name})', { name: 'Maria Papadopoulou', email: 'maria@x.gr' }))
      .toBe('Hi Maria, I wrote to maria@x.gr (Maria Papadopoulou)');
  });
});
