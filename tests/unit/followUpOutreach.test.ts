import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAutoReply, isAutoReplyFromHeaderList } from '../../supabase/functions/_shared/mail-auto-reply';
import { scoreEmail } from '../../src/utils/emailScore';
import { atHour, chainDates, describeBestTime, withinBusinessHours } from '../../src/pages/Inbox/followUpTiming';
import { blankComments } from '../helpers/stripComments';

const read = (...p: string[]) => blankComments(readFileSync(join(process.cwd(), ...p), 'utf8').split('\r\n').join('\n'));

describe('an automatic reply is not them answering', () => {
  it('recognises the headers and the subjects, in English and Greek', () => {
    expect(isAutoReply({ autoSubmitted: 'auto-replied' })).toBe(true);
    expect(isAutoReply({ autoSubmitted: 'no', subject: 'Re: your quote' })).toBe(false);
    expect(isAutoReply({ precedence: 'auto_reply' })).toBe(true);
    expect(isAutoReply({ xAutoreply: 'yes' })).toBe(true);
    expect(isAutoReply({ subject: 'Automatic reply: Kitchen order' })).toBe(true);
    expect(isAutoReply({ subject: 'Out of Office: back Monday' })).toBe(true);
    expect(isAutoReply({ subject: 'Αυτόματη απάντηση: Παραγγελία' })).toBe(true);
    expect(isAutoReply({ subject: 'Εκτός γραφείου' })).toBe(true);
    expect(isAutoReply({ subject: 'Re: out of office furniture for the new branch' })).toBe(false);
    expect(isAutoReplyFromHeaderList([{ name: 'auto-submitted', value: 'auto-generated' }])).toBe(true);
  });

  it('is applied wherever a reply cancels a follow-up', () => {
    expect(read('supabase', 'functions', '_shared', 'inbound-email.ts')).toMatch(/auto_reply: true/);
    const scheduler = read('supabase', 'functions', 'mail-scheduler', 'index.ts');
    const replied = scheduler.slice(scheduler.indexOf('async function repliedSince'), scheduler.indexOf('async function cancelForReply'));
    expect(replied).toMatch(/isAutoReplyFromHeaderList/);
    expect(replied).toMatch(/'SENT'/);
  });

  it('a reply ends the whole chain, not just the step that noticed it', () => {
    const scheduler = read('supabase', 'functions', 'mail-scheduler', 'index.ts');
    const cancel = scheduler.slice(scheduler.indexOf('async function cancelForReply'), scheduler.indexOf('async function deliverScheduled'));
    expect(cancel).toMatch(/\.eq\('sequence_id', sequenceId\)\.eq\('status', 'pending'\)/);
  });
});

describe('follow-up timing', () => {
  it('moves a weekend or after-hours time to the next opening at 09:00', () => {
    const sat = new Date(2026, 9, 10, 14, 0);
    expect(withinBusinessHours(sat).getDay()).toBe(1);
    expect(withinBusinessHours(sat).getHours()).toBe(9);
    const lateFri = new Date(2026, 9, 9, 20, 30);
    expect(withinBusinessHours(lateFri).getDay()).toBe(1);
    const early = new Date(2026, 9, 7, 6, 0);
    expect(withinBusinessHours(early).getHours()).toBe(9);
    expect(withinBusinessHours(early).getDate()).toBe(7);
    const inHours = new Date(2026, 9, 7, 11, 15);
    expect(withinBusinessHours(inHours).getTime()).toBe(inHours.getTime());
  });

  it('chains calendar days after the step before, and keeps them in order', () => {
    const now = new Date(2026, 9, 5, 8, 0);
    const dates = chainDates(new Date(2026, 9, 8, 10, 0), [3, 7], { businessHours: true, hour: 14 }, now);
    expect(dates.map((d) => d.getHours())).toEqual([14, 14, 14]);
    for (let i = 1; i < dates.length; i++) expect(dates[i].getTime()).toBeGreaterThan(dates[i - 1].getTime());
    expect(dates.every((d) => d.getDay() !== 0 && d.getDay() !== 6)).toBe(true);
  });

  it('never picks an hour that has already passed', () => {
    const now = new Date(2026, 9, 7, 15, 0);
    expect(atHour(now, 10, now).getDate()).toBe(8);
  });

  it('says what a best time rests on, and says nothing without data', () => {
    expect(describeBestTime({ best_hour: 14, best_dow: 1, sample: 5, basis: 'contact' })).toBe('They usually reply around 14:00 on Mondays (5 replies)');
    expect(describeBestTime({ best_hour: null, best_dow: null, sample: 1, basis: 'none' })).toBeNull();
  });
});

describe('writing score', () => {
  it('rewards a short email with one clear question', () => {
    const good = scoreEmail({
      subject: 'Kitchen quote follow-up',
      body: 'Hi Maria,\n\nI wanted to check whether you had a chance to look at the kitchen quote we sent last week. We can still hold the oak worktop price until Friday, and our fitter has a free slot on the 20th. Would you like us to reserve it for you?\n\nBest,\nNikos',
    });
    expect(good?.verdict).toBe('good');
    expect(good?.metrics.find((m) => m.key === 'questions')?.ok).toBe(true);
  });

  it('flags a wall of text with no question', () => {
    const wall = scoreEmail({ body: Array(260).fill('word').join(' ') + '.' });
    expect(wall?.verdict).toBe('weak');
    expect(wall?.metrics.find((m) => m.key === 'questions')?.tip).toMatch(/question/);
  });

  it('counts a Greek question mark, but not an English semicolon', () => {
    expect(scoreEmail({ body: 'Καλησπέρα, λάβατε την προσφορά που σας στείλαμε; Θα θέλατε να κλείσουμε ραντεβού;' })?.metrics.find((m) => m.key === 'questions')?.value).toBe('2');
    expect(scoreEmail({ body: 'We sent the quote; the price holds until Friday; let us know.' })?.metrics.find((m) => m.key === 'questions')?.value).toBe('0');
  });

  it('ignores quoted text and the signature', () => {
    const s = scoreEmail({ body: 'Did you get the quote we sent?\n\n> ' + Array(300).fill('quoted').join(' ') + '\n-- \nNikos Papadopoulos, Sales' });
    expect(s?.metrics.find((m) => m.key === 'length')?.value).toBe('7 words');
  });
});
