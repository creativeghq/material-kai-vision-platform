/** The one copy check every writer runs. Limits come from `channel_writing_rules`, phrases from `writing_tells`; it flags, never rewrites. */
import type { DbClient } from './supabase-client.ts';
import { compileTellPattern, containsPhrase, foldText, startsWithPhrase } from './phrase-match.ts';
import type { CopyWarningCode, WritingSurface, WritingTellKind, WritingTellStrength } from './writingVocabulary.generated.ts';

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
  strength?: WritingTellStrength;
  pattern?: string | null;
}

export interface CopyStyle {
  weak_tells_min: number;
  dash_per_100_words: number;
  min_words_for_rhythm: number;
  repeated_openings_run: number;
}

export interface CopyRules {
  status: 'ok' | 'no_rule' | 'unavailable';
  rule: ChannelWritingRule | null;
  tells: WritingTell[];
  style?: CopyStyle | null;
  error?: string;
}

const STYLE_KINDS: Partial<Record<WritingTellKind, { code: CopyWarningCode; message: string }>> = {
  ai_phrase: { code: 'ai_phrase', message: 'Stock phrasing that reads as machine-written.' },
  engagement_bait: { code: 'engagement_bait', message: 'Reflex engagement bait.' },
  staging: { code: 'staging', message: 'Signals importance instead of stating the point.' },
  inflation: { code: 'inflation', message: 'Dresses an ordinary fact as pivotal or expert-backed.' },
  chatbot_residue: { code: 'chatbot_residue', message: 'Left over from a chat reply, or writes about the text itself.' },
};

const patternCache = new Map<string, RegExp | null>();
function tellMatches(text: string, folded: string, t: WritingTell): boolean {
  if (!t.pattern) return containsPhrase(text, t.phrase);
  if (!patternCache.has(t.pattern)) patternCache.set(t.pattern, compileTellPattern(t.pattern));
  return patternCache.get(t.pattern)?.test(folded) ?? false;
}

const SENTENCE_SPLIT = /(?<=[.!?;;…])\s+|\n+/u;
const MARKUP_LEAD = /^[\s>#*_\-+[\]!]+/u;

function sentencesOf(text: string): string[] {
  return text.split(SENTENCE_SPLIT).map((s) => s.replace(MARKUP_LEAD, '').trim()).filter((s) => /\p{L}/u.test(s));
}

export function findTellPassages(text: string, rules: CopyRules, surface: string | null, limit = 20): Array<{ sentence: string; kind: WritingTellKind; label: string }> {
  const tells = rules.tells.filter((t) => STYLE_KINDS[t.kind] && (t.strength ?? 'strong') === 'strong'
    && (!t.surfaces?.length || (surface != null && t.surfaces.includes(surface))));
  const out: Array<{ sentence: string; kind: WritingTellKind; label: string }> = [];
  for (const s of sentencesOf(text)) {
    const folded = foldText(s);
    const hit = tells.find((t) => tellMatches(s, folded, t));
    if (hit) out.push({ sentence: s, kind: hit.kind, label: hit.phrase });
    if (out.length >= limit) break;
  }
  return out;
}

export type { CopyWarningCode };

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
  const [ruleRes, tellRes, styleRes] = await Promise.all([
    db.from('channel_writing_rules').select('*').eq('channel', channel).eq('is_active', true).maybeSingle(),
    db.from('writing_tells').select('kind, phrase, surfaces, strength, pattern').eq('is_active', true),
    db.from('system_settings').select('setting_value').eq('setting_key', 'copy_style_checks').maybeSingle(),
  ]);
  if (ruleRes.error || tellRes.error || styleRes.error) {
    return { status: 'unavailable', rule: null, tells: [], error: (ruleRes.error ?? tellRes.error ?? styleRes.error)?.message };
  }
  const rule = (ruleRes.data ?? null) as ChannelWritingRule | null;
  const style = (styleRes.data?.setting_value ?? null) as CopyStyle | null;
  return { status: rule ? 'ok' : 'no_rule', rule, tells: (tellRes.data ?? []) as WritingTell[], style };
}

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
  const foldedFull = foldText(full);
  const hitsOf = (kind: WritingTellKind, strength?: WritingTellStrength) => tells
    .filter((t) => t.kind === kind && (!strength || (t.strength ?? 'strong') === strength) && tellMatches(full, foldedFull, t))
    .map((t) => t.phrase);

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

  const weak: string[] = [];
  for (const [kind, spec] of Object.entries(STYLE_KINDS) as [WritingTellKind, { code: CopyWarningCode; message: string }][]) {
    const strong = hitsOf(kind, 'strong');
    if (strong.length) add(spec.code, spec.message, strong);
    weak.push(...hitsOf(kind, 'weak'));
  }
  const style = rules.style;
  if (style && weak.length >= style.weak_tells_min) {
    add('weak_tells', `${weak.length} weak signs of machine writing together; any one alone would be fine.`, weak);
  }
  const words = full.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length;
  if (style && words >= style.min_words_for_rhythm) {
    const dashes = (full.match(/\s[—–-]\s|—/gu) ?? []).length;
    const per100 = (dashes / words) * 100;
    if (per100 > style.dash_per_100_words) {
      add('dash_heavy', `${dashes} dashes in ${words} words; prefer full stops and commas.`);
    }
    let run = 1;
    let worst = { word: '', run: 1 };
    let prev = '';
    for (const s of sentencesOf(full)) {
      const first = foldText(s).match(/\p{L}+/u)?.[0] ?? '';
      run = first && first === prev ? run + 1 : 1;
      if (run > worst.run) worst = { word: first, run };
      prev = first;
    }
    if (worst.run >= style.repeated_openings_run) {
      add('repeated_openings', `${worst.run} sentences in a row start with "${worst.word}".`, [worst.word]);
    }
  }
  if (INVISIBLE_RE.test(full)) add('invisible_characters', 'Contains invisible characters a keyboard does not produce.');

  const avoid = (input.avoidList ?? []).filter((term) => term?.trim() && containsPhrase(full, term));
  if (avoid.length) add('avoid_list', 'Uses words on your avoid list.', avoid);

  return { checked: rules.status === 'ok', channel: rule?.channel ?? null, length, visible, warnings };
}
