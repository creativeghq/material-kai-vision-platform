import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';
import { isOurs, judgePlatform, ratingOf } from '../../supabase/functions/seo-api/handlers/presence-rules';

const who = { domain: 'materialshub.gr', brand: 'MaterialsHub' };
const organic = (url: string, title: string, extra: Record<string, unknown> = {}) => ({ type: 'organic', url, title, ...extra });

describe('presence plan (#487 C3)', () => {
  it('a platform whose every lookup failed is unknown, never absent', () => {
    const v = judgePlatform('youtube', [{ keyword: 'tiles', ok: false, error: '402', items: [] }], who);
    expect(v.status).toBe('collector_failed');
    expect(v.actions).toEqual([]);
  });

  it('ours is our domain in a URL or the brand as a whole word, never a substring of an id', () => {
    expect(isOurs({ channel: { title: 'MaterialsHub Greece' } }, who)).toBe(true);
    expect(isOurs({ url: 'https://www.pinterest.com/pin/1', description: 'from materialshub.gr' }, who)).toBe(true);
    expect(isOurs({ title: 'Other shop', url: 'https://youtube.com/watch?v=materialshubx' }, { domain: 'tiles.gr', brand: 'abc' })).toBe(false);
    expect(isOurs({ title: 'The tiles guide' }, { domain: 'tiles.gr', brand: null })).toBe(false);
  });

  it('Google results not on the platform are ignored', () => {
    const v = judgePlatform('reddit', [{ keyword: 'tiles', ok: true, items: [
      { type: 'people_also_ask', title: 'Which tiles?' },
      organic('https://www.reddit.com/r/HomeImprovement/x', 'Which tiles for a bathroom?'),
      organic('https://example.com/blog', 'Tiles blog'),
    ] }], who);
    expect(v.actions).toHaveLength(1);
    expect(v.actions[0]).toMatchObject({ url: 'https://www.reddit.com/r/HomeImprovement/x' });
  });

  it('absent on YouTube becomes a video to make', () => {
    const yt = judgePlatform('youtube', [{ keyword: 'porcelain tiles', ok: true, items: [{ type: 'youtube_video', title: 'Tile guide', url: 'https://youtube.com/x' }] }], who);
    expect(yt.status).toBe('absent');
    expect(yt.actions[0].text).toMatch(/Publish a video for "porcelain tiles"/);
  });

  it('a Trustpilot rating is read from the rating block, never rendered as an object', () => {
    expect(ratingOf({ rating: { value: 4.6, votes_count: 12 } })).toEqual({ value: 4.6, votes: 12 });
    const listed = judgePlatform('trustpilot', [{ keyword: 'MaterialsHub', ok: true, items: [
      organic('https://www.trustpilot.com/review/materialshub.gr', 'MaterialsHub Reviews', { rating: { value: 4.6, votes_count: 3 } }),
    ] }], who);
    expect(listed.status).toBe('present');
    expect(listed.note).toBe('Listed, rated 4.6 from 3 reviews.');
    expect(listed.actions[0].text).toMatch(/Only 3 reviews/);
    const none = judgePlatform('trustpilot', [{ keyword: 'MaterialsHub', ok: true, items: [organic('https://www.trustpilot.com/review/other.gr', 'Other')] }], who);
    expect(none.status).toBe('absent');
  });

  it('every lookup is a live SERP through the spend gate, and the estimate shares the gate formula', () => {
    const src = strippedSource('supabase/functions/seo-api/handlers/presence-plan.ts');
    expect(src).toContain('callDataForSEO(');
    expect(src).not.toMatch(/fetch\(|business_reddit|business_pinterest|business_trustpilot/);
    expect(src).toContain('ceilingCreditsFor(');
    expect(src.indexOf('body.estimate === true')).toBeLessThan(src.indexOf('callDataForSEO('));
  });
});
