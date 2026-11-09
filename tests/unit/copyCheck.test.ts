/** The shared copy check (#552): limits come from channel_writing_rules, phrases from writing_tells, and every writer runs it. */
import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { checkCopy, type ChannelWritingRule, type CopyRules, type WritingTell } from '../../supabase/functions/_shared/copy-check.ts';
import { templateLinkIssues } from '../../supabase/functions/_shared/email/campaign-preflight.ts';
import { strippedSource } from '../helpers/sourceIndex';

const ROOT = process.cwd();

const instagram: ChannelWritingRule = {
  channel: 'instagram', surface: 'social', label: 'Instagram',
  max_chars: 2200, target_min_chars: null, target_max_chars: 600, visible_chars: 125,
  hashtag_limit: 5, hashtag_recommended: 3, hashtag_style: null, ask_max: 1,
  links_clickable: false, tone_notes: null, structure_notes: null,
};
const tells: WritingTell[] = [
  { kind: 'filler_hashtag', phrase: '#fyp', surfaces: ['social'] },
  { kind: 'ai_phrase', phrase: 'game-changing', surfaces: null },
  { kind: 'ai_phrase', phrase: 'απογειώστε', surfaces: null },
  { kind: 'banned_opener', phrase: 'have you ever', surfaces: null },
  { kind: 'ask', phrase: 'comment', surfaces: ['social'] },
  { kind: 'ask', phrase: 'save this', surfaces: ['social'] },
  { kind: 'ask', phrase: 'subscribe now', surfaces: ['email'] },
];
const rules = (rule: ChannelWritingRule | null = instagram, status: CopyRules['status'] = 'ok'): CopyRules => ({ status, rule, tells });
const codes = (r: ReturnType<typeof checkCopy>) => r.warnings.map((w) => w.code);

describe('checkCopy', () => {
  it('passes a clean caption with no warnings', () => {
    const r = checkCopy({ text: '120x120 porcelain in the Kifisia showroom, laid in two days.\n\nComment TILE for the spec sheet.', hashtags: ['#porcelain'], rules: rules() });
    expect(r.checked).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('counts hashtags in the text AND the list against the channel limit', () => {
    const r = checkCopy({ text: 'Tiles #a #b #c', hashtags: ['#d', '#e', '#f'], rules: rules() });
    expect(codes(r)).toContain('too_many_hashtags');
  });

  it('flags filler hashtags, stock phrases (Greek too), banned openers and a second ask', () => {
    const r = checkCopy({
      text: 'Have you ever seen a game-changing floor? Απογειώστε τον χώρο σας. Comment below and save this.',
      hashtags: ['#fyp'], rules: rules(),
    });
    expect(codes(r)).toEqual(expect.arrayContaining(['filler_hashtag', 'ai_phrase', 'banned_opener', 'too_many_asks']));
    expect(r.warnings.find((w) => w.code === 'ai_phrase')?.hits).toEqual(['game-changing', 'απογειώστε']);
  });

  it('flags a link where the channel does not make links clickable', () => {
    expect(codes(checkCopy({ text: 'See https://example.com', rules: rules() }))).toContain('link_not_clickable');
    expect(codes(checkCopy({ text: 'See https://example.com', rules: rules({ ...instagram, links_clickable: true }) }))).not.toContain('link_not_clickable');
  });

  it('flags a first line longer than the visible window and an opening tag', () => {
    expect(codes(checkCopy({ text: 'x'.repeat(130), rules: rules() }))).toContain('first_line_cut');
    expect(codes(checkCopy({ text: '#tiles are great', rules: rules() }))).toContain('opens_with_tag');
  });

  it('ignores tells meant for another surface', () => {
    expect(codes(checkCopy({ text: 'Subscribe now and comment', rules: rules() }))).not.toContain('too_many_asks');
  });

  it('reports an unreadable rule set as unchecked, never as clean', () => {
    const r = checkCopy({ text: 'anything', rules: rules(null, 'unavailable') });
    expect(r.checked).toBe(false);
    expect(checkCopy({ text: 'anything', rules: rules(null, 'no_rule') }).checked).toBe(false);
  });

  it('applies the workspace avoid list accent-insensitively', () => {
    const r = checkCopy({ text: 'Πολυτελές μπάνιο', rules: rules(), avoidList: ['πολυτελες'] });
    expect(r.warnings.find((w) => w.code === 'avoid_list')?.hits).toEqual(['πολυτελες']);
  });
});

describe('templateLinkIssues (email pre-send check)', () => {
  const codesOf = (html: string) => templateLinkIssues(html).map((i) => `${i.severity}:${i.code}`);
  it('blocks links that go nowhere or to a placeholder', () => {
    expect(codesOf('<a href="#">x</a><a href="">y</a><a href="javascript:void(0)">z</a>')).toEqual(['block:empty_link', 'block:empty_link', 'block:empty_link']);
    expect(codesOf('<a href="https://example.com/offer">x</a>')).toEqual(['block:placeholder_link']);
    expect(codesOf('<a href="/relative">x</a>')).toEqual(['block:invalid_link']);
  });
  it('warns on http, and passes https, mailto, tel and merge tags', () => {
    expect(codesOf('<a href="http://materialshub.gr">x</a>')).toEqual(['warn:insecure_link']);
    expect(codesOf('<a href="https://materialshub.gr">a</a><a href="mailto:a@b.gr">b</a><a href="tel:+30210">c</a><a href="{{unsubscribe_url}}">d</a>')).toEqual([]);
  });
});

describe('writers read the rules instead of holding them', () => {
  const caption = strippedSource(join(ROOT, 'supabase/functions/generate-social-content/index.ts'));
  const social = strippedSource(join(ROOT, 'supabase/functions/_shared/tools/social-tools.ts'));

  it('generate-social-content has no platform table of its own and reads channel_writing_rules', () => {
    expect(caption).not.toMatch(/PLATFORM_SPECS|max_chars:\s*\d/);
    expect(caption).toContain('loadCopyRules(');
    expect(caption).toContain('checkCopy(');
  });

  it('an email send runs the pre-send check BEFORE the approval card, and refuses on a block', () => {
    const email = strippedSource(join(ROOT, 'supabase/functions/_shared/tools/email-marketing-tools.ts'));
    const sendAt = email.indexOf("action === 'send'");
    const check = email.indexOf('campaignPreflight(', sendAt);
    const refuse = email.indexOf('!preflight.ok', sendAt);
    const gate = email.indexOf('confirm !== true', sendAt);
    expect(check).toBeGreaterThan(sendAt);
    expect(refuse).toBeGreaterThan(check);
    expect(gate).toBeGreaterThan(refuse);
  });

  it('manage_social checks the copy and publishes the draft it was given', () => {
    expect(social).toContain('loadCopyRules(');
    expect(social).toMatch(/if \(post_id\)[\s\S]{0,120}readDraftPost\(/);
    expect(social).toMatch(/async function readDraftPost[\s\S]{0,200}from\('social_posts'\)/);
    const gate = social.indexOf('confirm !== true');
    const write = social.indexOf("from('social_posts').update({", gate);
    expect(gate).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(gate);
  });
});
