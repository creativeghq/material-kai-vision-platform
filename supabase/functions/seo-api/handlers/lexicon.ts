/** Words a dictionary of the article's language does not know, corrected once by a model and re-checked. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import { applyReviewEdits, type ReviewEdit } from './site-assets.ts';
import { reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';

export const LEXICON_MODEL = 'claude-sonnet-5';
const LEXICON_MAX_INPUT_TOKENS = 12000;
const LEXICON_MAX_OUTPUT_TOKENS = 4000;
const MAX_SENTENCES = 80;
const MAX_SENTENCE_CHARS = 24000;

const SCHEMA = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: { find: { type: 'string' }, replace: { type: 'string' } },
        required: ['find', 'replace'],
        additionalProperties: false,
      },
    },
  },
  required: ['edits'],
  additionalProperties: false,
};

const PROTECTED =
  /```[\s\S]*?```|`[^`\n]*`|!\[[^\]]*\]\([^)]*\)|\]\([^)]*\)|\[![\w-]+\]|https?:\/\/[^\s<>()\]]+|www\.[^\s<>()\]]+|<[^>\n]+>/g;
const GREEK = /\p{Script=Greek}/u;
const LATIN = /\p{Script=Latin}/u;
const GREEK_WORD = /(?<![\p{L}\p{M}\p{N}])\p{Script=Greek}[\p{Script=Greek}\p{M}]*(?![\p{L}\p{M}\p{N}])/gu;

interface Segment { text: string; prose: boolean }

/** The markdown split into prose and the parts a reader never sees as prose (code, URLs, targets, callout tags, HTML). */
function segments(markdown: string): Segment[] {
  const out: Segment[] = [];
  let at = 0;
  for (const m of markdown.matchAll(PROTECTED)) {
    if (m.index! > at) out.push({ text: markdown.slice(at, m.index), prose: true });
    out.push({ text: m[0], prose: false });
    at = m.index! + m[0].length;
  }
  if (at < markdown.length) out.push({ text: markdown.slice(at), prose: true });
  return out;
}

function proseMask(segs: Segment[]): boolean[] {
  return segs.flatMap((s) => Array.from({ length: s.text.length }, () => s.prose));
}

/** Greek interrogatives end in ';', and a doubled Greek word («βήμα βήμα») is hyphenated. Latin text is untouched. */
export function fixGreekPunctuation(markdown: string): string {
  const segs = segments(markdown).map((s) => s.prose
    ? { ...s, text: s.text.replace(/(?<![\p{L}\p{M}\p{N}-])(\p{Script=Greek}{3,}) \1(?![\p{L}\p{M}\p{N}-])/gu, '$1-$1') }
    : s);
  const text = segs.map((s) => s.text).join('');
  const prose = proseMask(segs);
  const chars = text.split('');
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '?' || !prose[i] || /[\p{L}\p{N}]/u.test(chars[i + 1] ?? '')) continue;
    let greek = 0;
    let latin = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (prose[j] && /[.!?;\n]/.test(chars[j])) break;
      if (!prose[j]) continue;
      if (GREEK.test(chars[j])) greek++;
      else if (LATIN.test(chars[j])) latin++;
    }
    if (greek > 0 && greek >= latin) chars[i] = ';';
  }
  return chars.join('');
}

/**
 * Distinct Greek-script words of the visible prose, in first-seen order. All-capital words are skipped
 * (capitals drop their accents), as are elisions («σ'») and short abbreviations («εκ.», «π.χ.»).
 */
export function visibleGreekWords(markdown: string): string[] {
  const text = segments(markdown).map((s) => (s.prose ? s.text : ' ')).join('');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of text.matchAll(GREEK_WORD)) {
    const w = m[0];
    const end = m.index! + w.length;
    const next = text[end] ?? '';
    if (/['’ʼ]/.test(next)) continue;
    if (text[m.index! - 1] === '.' || (next === '.' && w.length <= 4)) continue;
    if (w.length > 1 && w === w.toUpperCase()) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export interface LexiconReport {
  checked: number;
  unknown_before: string[];
  corrected: { from: string; to: string }[];
  kept: string[];
  skipped: { find: string; replace: string; why: string }[];
  unverified: string[];
  credits: number;
  failed?: string;
}

const loadedLanguages = new Map<string, boolean>();

const baseLanguage = (code: string | null | undefined) => (code ?? '').toLowerCase().split(/[-_]/)[0];

async function hasLexicon(supabase: DbClient, language: string): Promise<boolean> {
  if (!language) return false;
  const cached = loadedLanguages.get(language);
  if (cached !== undefined) return cached;
  const { data, error } = await supabase.from('lexicon_words').select('word').eq('language_code', language).limit(1);
  if (error) throw new Error(`lexicon lookup failed: ${error.message}`);
  const has = (data ?? []).length > 0;
  loadedLanguages.set(language, has);
  return has;
}

async function unknownWords(
  supabase: DbClient,
  language: string,
  websiteId: string | null,
  workspaceId: string | null,
  words: string[],
): Promise<string[]> {
  if (!words.length) return [];
  const { data, error } = await supabase.rpc('lexicon_unknown_words', {
    p_language: language, p_website_id: websiteId, p_workspace_id: workspaceId, p_words: words,
  });
  if (error) throw new Error(`lexicon check failed: ${error.message}`);
  return (data as string[] | null) ?? [];
}

/** The raw markdown sentences that contain any of `words` (lower-cased), each copied verbatim. */
function sentencesWith(markdown: string, words: Set<string>): string[] {
  const out: string[] = [];
  let size = 0;
  for (const line of markdown.split('\n')) {
    for (const sentence of line.split(/(?<=[.!;?])\s+/)) {
      if (!visibleGreekWords(sentence).some((w) => words.has(w.toLowerCase()))) continue;
      if (out.length >= MAX_SENTENCES || size + sentence.length > MAX_SENTENCE_CHARS) return out;
      out.push(sentence);
      size += sentence.length;
    }
  }
  return out;
}

const ONE_GREEK_WORD = /^\p{Script=Greek}[\p{Script=Greek}\p{M}]*$/u;

/** Every whole-word occurrence of `from` in the prose replaced by `to`, keeping a leading capital. */
export function replaceWordInProse(markdown: string, from: string, to: string): { markdown: string; count: number } {
  const lower = from.toLowerCase();
  let count = 0;
  const text = segments(markdown).map((s) => !s.prose ? s.text : s.text.replace(GREEK_WORD, (w) => {
    if (w.toLowerCase() !== lower) return w;
    count++;
    return w[0] !== w[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to;
  })).join('');
  return { markdown: text, count };
}

/** A one-word fix of a flagged word applies wherever it appears; anything else must match exactly once. */
export function applyLexiconEdits(markdown: string, edits: ReviewEdit[], flagged: Set<string>) {
  let out = markdown;
  const corrected: { from: string; to: string }[] = [];
  const skipped: { find: string; replace: string; why: string }[] = [];
  for (const e of edits) {
    const find = e.find.trim();
    const replace = e.replace.trim();
    if (ONE_GREEK_WORD.test(find) && ONE_GREEK_WORD.test(replace) && find !== replace && flagged.has(find.toLowerCase())) {
      const r = replaceWordInProse(out, find, replace);
      if (r.count) {
        out = r.markdown;
        corrected.push({ from: find, to: replace });
      } else skipped.push({ find, replace, why: 'word not found in the prose' });
      continue;
    }
    const one = applyReviewEdits(out, [e]);
    out = one.markdown;
    corrected.push(...correctedPairs(one.applied));
    skipped.push(...one.skipped.map((x) => ({ find: x.find, replace: x.replace, why: x.why })));
  }
  return { markdown: out, corrected, skipped };
}

async function approvedGlossary(supabase: DbClient, workspaceId: string | null, language: string): Promise<{ from: string; to: string }[]> {
  if (!workspaceId) return [];
  const { data, error } = await supabase.from('seo_writer_lessons').select('from_text, to_text')
    .eq('workspace_id', workspaceId).eq('language_code', language).eq('kind', 'glossary').eq('status', 'approved').limit(200);
  if (error) return [];
  return (data ?? []).flatMap((l: { from_text: string | null; to_text: string | null }) =>
    l.from_text && l.to_text && ONE_GREEK_WORD.test(l.from_text.trim()) && ONE_GREEK_WORD.test(l.to_text.trim())
      ? [{ from: l.from_text.trim(), to: l.to_text.trim() }] : []);
}

function correctedPairs(applied: ReviewEdit[]): { from: string; to: string }[] {
  return applied.flatMap((e) => {
    const a = visibleGreekWords(e.find);
    const b = visibleGreekWords(e.replace);
    if (a.length !== b.length) return [{ from: e.find, to: e.replace }];
    return a.flatMap((w, i) => (w === b[i] ? [] : [{ from: w, to: b[i] }]));
  });
}

/** Never throws: a check that cannot run says so in `failed` and returns the markdown it was given (punctuation fixed). */
export async function enforceLexicon(
  supabase: DbClient,
  opts: { markdown: string; languageCode: string | null; websiteId: string | null; workspaceId: string | null; userId: string },
): Promise<{ markdown: string; report: LexiconReport }> {
  const language = baseLanguage(opts.languageCode);
  const empty: LexiconReport = { checked: 0, unknown_before: [], corrected: [], kept: [], skipped: [], unverified: [], credits: 0 };
  let markdown = opts.markdown;
  const house: { from: string; to: string }[] = [];
  try {
    if (!(await hasLexicon(supabase, language))) return { markdown, report: empty };
    if (language === 'el') markdown = fixGreekPunctuation(markdown);
    for (const g of await approvedGlossary(supabase, opts.workspaceId, language)) {
      const r = replaceWordInProse(markdown, g.from, g.to);
      if (r.count) { markdown = r.markdown; house.push(g); }
    }
    const words = visibleGreekWords(markdown);
    const unknown = await unknownWords(supabase, language, opts.websiteId, opts.workspaceId, words);
    const report: LexiconReport = { ...empty, checked: words.length, unknown_before: unknown, corrected: house, unverified: unknown };
    if (!unknown.length) return { markdown, report };

    const sentences = sentencesWith(markdown, new Set(unknown));
    const wallet: StageWallet = { userId: opts.userId, workspaceId: opts.workspaceId, opType: 'seo_lexicon' };
    const ceiling = await tokenCeiling(supabase, LEXICON_MODEL, LEXICON_MAX_INPUT_TOKENS, LEXICON_MAX_OUTPUT_TOKENS, 10);
    const hold = await reserveStage(supabase, wallet, ceiling, 'SEO dictionary check');
    if (!hold.ok) return { markdown, report: { ...report, failed: `not corrected: ${hold.error}` } };

    let actual: number | null = null;
    let edits: ReviewEdit[] = [];
    try {
      const res = await callClaudeMessages({
        model: LEXICON_MODEL,
        max_tokens: LEXICON_MAX_OUTPUT_TOKENS,
        system: await getToolPrompt(supabase, 'seo_lexicon_fix'),
        messages: [{
          role: 'user',
          content: `Article language: ${language}\n<unknown_words>\n${unknown.join('\n')}\n</unknown_words>\n`
            + `<sentences>\n${sentences.join('\n')}\n</sentences>`,
        }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      }, { task: 'seo_lexicon', userId: opts.userId, workspaceId: opts.workspaceId, timeoutMs: 120_000 });
      actual = await tokenCredits(supabase, LEXICON_MODEL, {
        inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
      });
      // A refusal or a truncated reply is a failed correction, never a reply to salvage.
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
        const credits = await settleStage(supabase, wallet, ceiling, actual, { failed: res.stop_reason });
        return { markdown, report: { ...report, credits, failed: `correction ${res.stop_reason}` } };
      }
      const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
      edits = (Array.isArray(out?.edits) ? out.edits : []).map((e: { find: string; replace: string }) => ({
        find: String(e.find ?? ''), replace: String(e.replace ?? ''), kind: 'lexicon',
      }));
    } catch (e) {
      const credits = await settleStage(supabase, wallet, ceiling, actual ?? 0, { failed: true });
      return { markdown, report: { ...report, credits, failed: (e as Error).message.slice(0, 200) } };
    }
    const credits = await settleStage(supabase, wallet, ceiling, actual, { unknown: unknown.length, edits: edits.length });

    const applied = applyLexiconEdits(markdown, edits, new Set(unknown.map((w) => w.toLowerCase())));
    markdown = applied.markdown;
    const corrected = [...house, ...applied.corrected];
    const touched = new Set(edits.flatMap((e) => visibleGreekWords(e.find).map((w) => w.toLowerCase())));
    const kept = unknown.filter((w) => !touched.has(w.toLowerCase()));
    const skipped = applied.skipped;
    try {
      const unverified = await unknownWords(supabase, language, opts.websiteId, opts.workspaceId, visibleGreekWords(markdown));
      return { markdown, report: { ...report, corrected, kept, skipped, unverified, credits } };
    } catch (e) {
      return { markdown, report: { ...report, corrected, kept, skipped, credits, failed: `not re-checked: ${(e as Error).message.slice(0, 200)}` } };
    }
  } catch (e) {
    return { markdown, report: { ...empty, corrected: house, failed: (e as Error).message.slice(0, 200) } };
  }
}

/** Each keyword word replaced by its one accented spelling; an unknown or ambiguous word stays as typed. */
export async function accentKeywords(supabase: DbClient, languageCode: string | null, keywords: string[]): Promise<string[]> {
  const language = baseLanguage(languageCode);
  const words = [...new Set(keywords.flatMap((k) => k.match(GREEK_WORD) ?? []).map((w) => w.toLowerCase()))];
  if (!language || !words.length) return keywords;
  const { data, error } = await supabase.rpc('lexicon_accented_forms', { p_language: language, p_words: words });
  if (error || !Array.isArray(data)) return keywords;
  const accented = new Map((data as { word: string; accented: string }[]).map((r) => [r.word, r.accented]));
  return keywords.map((k) => k.replace(GREEK_WORD, (w) => {
    const a = accented.get(w.toLowerCase());
    if (!a) return w;
    if (w === w.toLowerCase()) return a;
    return w[0] === w[0].toUpperCase() && w.slice(1) === w.slice(1).toLowerCase() ? a[0].toUpperCase() + a.slice(1) : w;
  }));
}
