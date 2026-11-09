/** The one copy check every writer runs. Limits come from `channel_writing_rules`, phrases from `writing_tells`; it flags, never rewrites. */
import type { DbClient } from './supabase-client.ts';
import { containsPhrase, startsWithPhrase } from './phrase-match.ts';
import type { WritingSurface, WritingTellKind } from './writingVocabulary.generated.ts';

export type { WritingTellKind };

export interface ChannelWritingRule {
  channel: string;
  surface: WritingSurface;
  label: string;
  max_chars: number | null;
  target_min_chars: number | null;
  target_max_chars: number | null;
  visible_chars: number | null;
  hashtag_limit: number | null;
  hashtag_recommended: number | null;
  hashtag_style: string | null;
  ask_max: number | null;
  links_clickable: boolean;
  tone_notes: string | null;
  structure_notes: string | null;
}

export interface WritingTell {
  kind: WritingTellKind;
  phrase: string;
  surfaces: string[] | null;
}

export interface CopyRules {
  status: 'ok' | 'no_rule' | 'unavailable';
  rule: ChannelWritingRule | null;
  tells: WritingTell[];
  error?: string;
}

export type CopyWarningCode =
  | 'over_limit' | 'below_target' | 'above_target' | 'first_line_cut' | 'opens_with_tag'
  | 'banned_opener' | 'too_many_hashtags' | 'filler_hashtag' | 'link_not_clickable'
  | 'too_many_asks' | 'ai_phrase' | 'engagement_bait' | 'invisible_characters' | 'avoid_list';

export interface CopyWarning {
  code: CopyWarningCode;
  message: string;
  hits?: string[];
}

export interface CopyCheckResult {
  /** False when the rules could not be read: unchecked, never clean. */
  checked: boolean;
  channel: string | null;
  length: number;
  visible: string | null;
  warnings: CopyWarning[];
}

const HASHTAG_RE = /(?:^|\s)(#[\p{L}\p{N}_]+)/gu;
const LINK_RE = /https?:\/\/\S+|\bwww\.\S+/i;
const INVISIBLE_RE = /[​-‍⁠﻿­᠎]/;

export async function loadCopyRules(db: DbClient, channel: string): Promise<CopyRules> {
  const [ruleRes, tellRes] = await Promise.all([
    db.from('channel_writing_rules').select('*').eq('channel', channel).eq('is_active', true).maybeSingle(),
    db.from('writing_tells').select('kind, phrase, surfaces').eq('is_active', true),
  ]);
  if (ruleRes.error || tellRes.error) {
    return { status: 'unavailable', rule: null, tells: [], error: (ruleRes.error ?? tellRes.error)?.message };
  }
  const rule = (ruleRes.data ?? null) as ChannelWritingRule | null;
  return { status: rule ? 'ok' : 'no_rule', rule, tells: (tellRes.data ?? []) as WritingTell[] };
}

/** Caption + hashtags exactly as the channel will show them. */
export function composePublishedText(text: string, hashtags?: string[] | null): string {
  const tags = (hashtags ?? []).map((t) => String(t).trim()).filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  return [String(text ?? '').trim(), tags.join(' ')].filter(Boolean).join('\n\n');
}

export function checkCopy(input: {
  text: string;
  hashtags?: string[] | null;
  rules: CopyRules;
  avoidList?: string[] | null;
  /** Which surface's tells apply when there is no channel rule (an email body has none). */
  surface?: string;
}): CopyCheckResult {
  const { rules } = input;
  const full = composePublishedText(input.text, input.hashtags);
  const rule = rules.rule;
  const warnings: CopyWarning[] = [];
  const add = (code: CopyWarningCode, message: string, hits?: string[]) =>
    warnings.push(hits ? { code, message, hits } : { code, message });

  const surface = rule?.surface ?? input.surface ?? null;
  const tells = rules.tells.filter((t) => !t.surfaces?.length || (surface != null && t.surfaces.includes(surface)));
  const hitsOf = (kind: WritingTellKind) => tells.filter((t) => t.kind === kind && containsPhrase(full, t.phrase)).map((t) => t.phrase);

  const length = [...full].length;
  if (rule?.max_chars && length > rule.max_chars) add('over_limit', `${length} characters; ${rule.label} allows ${rule.max_chars}.`);
  if (rule?.target_max_chars && length > rule.target_max_chars && !(rule.max_chars && length > rule.max_chars)) {
    add('above_target', `${length} characters; aim for at most ${rule.target_max_chars} on ${rule.label}.`);
  }
  if (rule?.target_min_chars && length < rule.target_min_chars) add('below_target', `${length} characters; aim for at least ${rule.target_min_chars} on ${rule.label}.`);

  const firstLine = full.split('\n')[0]?.trim() ?? '';
  const visible = rule?.visible_chars ? [...full].slice(0, rule.visible_chars).join('') : null;
  if (rule?.visible_chars && [...firstLine].length > rule.visible_chars) {
    add('first_line_cut', `The first line runs past the ${rule.visible_chars} characters ${rule.label} shows before the cut.`);
  }
  if (/^[#@]/.test(firstLine)) add('opens_with_tag', 'Opens on a hashtag or mention, which spends the only line everyone sees.');
  const openers = tells.filter((t) => t.kind === 'banned_opener' && startsWithPhrase(full, t.phrase)).map((t) => t.phrase);
  if (openers.length) add('banned_opener', 'Opens with a stock opener.', openers);

  const tags = [...new Set([...full.matchAll(HASHTAG_RE)].map((m) => m[1].toLowerCase()))];
  if (rule?.hashtag_limit != null && tags.length > rule.hashtag_limit) {
    add('too_many_hashtags', `${tags.length} hashtags; ${rule.label} allows ${rule.hashtag_limit}.`);
  }
  const filler = tells.filter((t) => t.kind === 'filler_hashtag' && tags.includes(t.phrase.toLowerCase())).map((t) => t.phrase);
  if (filler.length) add('filler_hashtag', 'Hashtags that describe nothing.', filler);

  if (rule && !rule.links_clickable && LINK_RE.test(full)) add('link_not_clickable', `Links are not clickable on ${rule.label}; point to the profile link instead.`);

  const asks = hitsOf('ask');
  if (rule?.ask_max != null && asks.length > rule.ask_max) add('too_many_asks', `${asks.length} different asks; keep to ${rule.ask_max}.`, asks);

  const ai = hitsOf('ai_phrase');
  if (ai.length) add('ai_phrase', 'Stock phrasing that reads as machine-written.', ai);
  const bait = hitsOf('engagement_bait');
  if (bait.length) add('engagement_bait', 'Reflex engagement bait.', bait);
  if (INVISIBLE_RE.test(full)) add('invisible_characters', 'Contains invisible characters a keyboard does not produce.');

  const avoid = (input.avoidList ?? []).filter((term) => term?.trim() && containsPhrase(full, term));
  if (avoid.length) add('avoid_list', 'Uses words on your avoid list.', avoid);

  return { checked: rules.status === 'ok', channel: rule?.channel ?? null, length, visible, warnings };
}
