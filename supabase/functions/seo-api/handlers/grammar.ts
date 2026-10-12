/** Grammar of the visible prose: LanguageTool's rule matches (via MIVAA) and a model agreement pass, corrected and re-checked. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import { getConfig } from '../../_shared/config.ts';
import { resolveSecret } from '../../_shared/secrets.ts';
import { applyReviewEdits, type ReviewEdit } from './site-assets.ts';
import { reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';

export const GRAMMAR_MODEL = 'claude-sonnet-5';
const GRAMMAR_MAX_INPUT_TOKENS = 12000;
const GRAMMAR_MAX_OUTPUT_TOKENS = 8000;
const MAX_SENTENCES = 60;
const MAX_SENTENCE_CHARS = 20000;
const CHUNK_CHARS = 50000;
const AGREEMENT_CHUNK_CHARS = 12000;
const CHECK_TIMEOUT_MS = 45_000;

const SCHEMA = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: { find: { type: 'string' }, replace: { type: 'string' }, note: { type: 'string' } },
        required: ['find', 'replace', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['edits'],
  additionalProperties: false,
};

const HIDDEN =
  /`[^`\n]*`|!\[[^\]]*\]\([^)]*\)|\]\([^)]*\)|\[![\w-]+\][+-]?|https?:\/\/[^\s<>()\]]+|www\.[^\s<>()\]]+|<[^>\n]+>|\*\*|__|[*[\]]/g;
const LINE_MARKUP = /^\s*(?:#{1,6}\s+|(?:>\s?)+(?:[-*+]\s+|\d+\.\s+)?|[-*+]\s+|\d+\.\s+)/;
const LATIN = /\p{Script=Latin}/u;
const WORD = /[\p{L}\p{M}\p{N}'’-]+/gu;

/** Spelling belongs to the dictionary gate; typography, casing, punctuation and style are not grammar. */
const DROPPED_CATEGORIES = new Set(['TYPOS', 'TYPOGRAPHY', 'CASING', 'PUNCTUATION', 'STYLE', 'WHITESPACE']);
const DROPPED_ISSUES = new Set(['misspelling', 'typographical', 'whitespace', 'style']);
const DROPPED_RULES = new Set([
  'UPPERCASE_SENTENCE_START', 'WHITESPACE_RULE', 'DOUBLE_PUNCTUATION', 'COMMA_PARENTHESIS_WHITESPACE',
  'GREEK_PARTICLE_EXTRA_N_1', 'GREEK_PARTICLE_EXTRA_N_2', 'GREEK_ART_FEM_EXTRA_N', 'GREEK_PREP_ART_FEM_EXTRA_N',
  'GREEK_PRONOUN_FEM_EXTRA_N',
]);

export interface LtMatch {
  offset: number;
  length: number;
  text?: string;
  message: string;
  rule_id: string;
  category: string;
  issue_type?: string;
  replacements?: string[];
  sentence?: string;
}

/** The prose a reader sees, one paragraph per line or table cell, with each character's index in the markdown (-1 = inserted). */
export function visibleProse(markdown: string): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  const brk = () => {
    if (text && !text.endsWith('\n\n')) {
      text += '\n\n';
      at.push(-1, -1);
    }
  };
  let fenced = false;
  let lineStart = 0;
  for (const line of markdown.split('\n')) {
    const base = lineStart;
    lineStart += line.length + 1;
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line.trim() || /^\s*\|?\s*:?-{3,}/.test(line)) continue;
    const hidden = new Array<boolean>(line.length).fill(false);
    const lead = line.match(LINE_MARKUP);
    if (lead) hidden.fill(true, 0, lead[0].length);
    for (const m of line.matchAll(HIDDEN)) hidden.fill(true, m.index!, m.index! + m[0].length);
    brk();
    for (let i = 0; i < line.length; i++) {
      if (hidden[i]) continue;
      if (line[i] === '|') {
        brk();
        continue;
      }
      if (/\s/.test(line[i]) && (!text || /\s$/.test(text))) continue;
      text += line[i];
      at.push(base + i);
    }
  }
  return { text, at };
}

function wordAround(text: string, index: number, dir: -1 | 1): string {
  let i = index;
  while (i >= 0 && i < text.length && /[\s([{«"“]/u.test(text[i])) i += dir;
  const words = [...text.matchAll(WORD)];
  return words.find((w) => w.index! <= i && i < w.index! + w[0].length)?.[0] ?? '';
}

function atSentenceStart(text: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && /[\s«"“(]/u.test(text[i])) i--;
  return i < 0 || /[.!;?:·\n]/.test(text[i]);
}

/** Matches worth a correction: grammar only, and never on a Latin word, a brand or a name. */
export function keepMatch(text: string, m: LtMatch): boolean {
  if (DROPPED_CATEGORIES.has(m.category) || DROPPED_RULES.has(m.rule_id)) return false;
  if (m.issue_type && DROPPED_ISSUES.has(m.issue_type)) return false;
  if (/^(MORFOLOGIK|HUNSPELL)_/.test(m.rule_id)) return false;
  const span = text.slice(m.offset, m.offset + m.length);
  const before = wordAround(text, m.offset - 1, -1);
  const after = wordAround(text, m.offset + m.length, 1);
  if ([span, before, after].some((w) => LATIN.test(w))) return false;
  for (const w of span.matchAll(WORD)) {
    const word = w[0];
    if (word[0] !== word[0].toLowerCase() && !atSentenceStart(text, m.offset + w.index!)) return false;
  }
  return true;
}

/** The raw markdown sentence holding markdown index `pos`, copied verbatim. */
export function markdownSentenceAt(markdown: string, pos: number): string {
  const lineStart = markdown.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd = markdown.indexOf('\n', pos);
  const line = markdown.slice(lineStart, lineEnd < 0 ? markdown.length : lineEnd);
  const rel = pos - lineStart;
  let start = 0;
  for (const m of line.matchAll(/(?<=[.!;?])\s+/g)) {
    if (m.index! + m[0].length > rel) return line.slice(start, m.index!).trim();
    start = m.index! + m[0].length;
  }
  return line.slice(start).trim();
}

function sourceIndex(at: number[], offset: number, length: number): number {
  for (let i = offset; i < Math.min(offset + Math.max(length, 1), at.length); i++) if (at[i] >= 0) return at[i];
  for (let i = offset; i >= 0; i--) if (at[i] >= 0) return at[i];
  return -1;
}

/** Paragraph-aligned pieces of `text` no longer than CHUNK_CHARS, each with its start offset. */
export function chunkText(text: string, size = CHUNK_CHARS): { start: number; text: string }[] {
  const out: { start: number; text: string }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const cut = text.lastIndexOf('\n\n', end);
      if (cut > start) end = cut;
    }
    out.push({ start, text: text.slice(start, end) });
    start = end;
  }
  return out;
}

async function languageToolMatches(supabase: DbClient, language: string, text: string): Promise<LtMatch[]> {
  const secret = (await resolveSecret(supabase, 'CRON_SECRET')).value;
  if (!secret) throw new Error('CRON_SECRET is not configured');
  const url = `${getConfig().mivaaBaseUrl.replace(/\/+$/, '')}/api/internal/text/grammar-check`;
  const out: LtMatch[] = [];
  for (const chunk of chunkText(text)) {
    if (!chunk.text.trim()) continue;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
      body: JSON.stringify({ language, text: chunk.text }),
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`grammar check ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
    const body = await res.json();
    if (!body?.success || !Array.isArray(body.matches)) throw new Error('grammar check returned no matches list');
    for (const m of body.matches as LtMatch[]) out.push({ ...m, offset: m.offset + chunk.start });
  }
  return out;
}

interface Finding { sentence: string; message: string; rule: string }

/** Kept matches of `markdown`, each placed on its raw markdown sentence. */
async function findings(supabase: DbClient, language: string, markdown: string): Promise<Finding[]> {
  const { text, at } = visibleProse(markdown);
  if (!text.trim()) return [];
  const matches = await languageToolMatches(supabase, language, text);
  const out: Finding[] = [];
  for (const m of matches) {
    if (!keepMatch(text, m)) continue;
    const pos = sourceIndex(at, m.offset, m.length);
    if (pos < 0) continue;
    out.push({ sentence: markdownSentenceAt(markdown, pos), message: m.message, rule: m.rule_id });
  }
  return out;
}

function distinctSentences(found: Finding[]): string[] {
  const out: string[] = [];
  let size = 0;
  for (const s of new Set(found.map((f) => f.sentence))) {
    if (out.length >= MAX_SENTENCES || size + s.length > MAX_SENTENCE_CHARS) break;
    out.push(s);
    size += s.length;
  }
  return out;
}

const baseLanguage = (code: string | null | undefined) => (code ?? '').toLowerCase().split(/[-_]/)[0];

const GREEK_ONLY = /^[\p{Script=Greek}\p{M}'’-]+$/u;

export interface AgreementEdit { find: string; replace: string; note: string }

export type EditCheck = { ok: true; find: string; words: string[] } | { ok: false; why: string };

/**
 * The deterministic half of the agreement gate: `find` is in the prose exactly once and maps onto the
 * markdown without crossing markup, and the edit changes Greek word forms only (same words, same
 * spacing and punctuation). Returns the markdown text to replace and the new words to look up.
 */
export function checkAgreementEdit(
  e: AgreementEdit,
  prose: { text: string; at: number[] },
  markdown: string,
): EditCheck {
  if (!e.find || e.find === e.replace) return { ok: false, why: 'empty or unchanged' };
  const first = prose.text.indexOf(e.find);
  if (first < 0) return { ok: false, why: 'not in the prose' };
  if (prose.text.indexOf(e.find, first + 1) >= 0) return { ok: false, why: 'not unique' };
  const a = [...e.find.matchAll(WORD)].map((m) => m[0]);
  const b = [...e.replace.matchAll(WORD)].map((m) => m[0]);
  if (a.length !== b.length || e.find.replace(WORD, '\u0000') !== e.replace.replace(WORD, '\u0000')) {
    return { ok: false, why: 'changes more than word forms' };
  }
  const changed = b.filter((w, i) => w !== a[i]);
  const replaced = a.filter((w, i) => w !== b[i]);
  if ([...changed, ...replaced].some((w) => !GREEK_ONLY.test(w))) return { ok: false, why: 'changes a non-Greek word' };
  const start = prose.at[first];
  const end = prose.at[first + e.find.length - 1];
  if (start < 0 || end < 0 || markdown.slice(start, end + 1) !== e.find) return { ok: false, why: 'spans markup' };
  if (markdown.split(e.find).length !== 2) return { ok: false, why: 'not unique in the article' };
  return { ok: true, find: e.find, words: changed };
}

export interface GrammarReport {
  checked: boolean;
  flagged: { sentence: string; message: string; rule: string }[];
  corrected: { from: string; to: string }[];
  remaining: { sentence: string; message: string }[];
  agreement: {
    ran: boolean;
    applied: { from: string; to: string; note: string }[];
    dropped: { find: string; replace: string; why: string }[];
  };
  credits: number;
  failed?: string;
}

interface CallResult { edits: AgreementEdit[]; credits: number | null; failed?: string }

/** One schema-constrained edit call. Never throws; a refusal or a truncated reply yields no edits. */
async function editCall(
  supabase: DbClient,
  system: string,
  content: string,
  opts: { userId: string; workspaceId: string | null },
): Promise<CallResult> {
  try {
    const res = await callClaudeMessages({
      model: GRAMMAR_MODEL,
      max_tokens: GRAMMAR_MAX_OUTPUT_TOKENS,
      system,
      messages: [{ role: 'user', content }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_grammar', userId: opts.userId, workspaceId: opts.workspaceId, timeoutMs: 120_000 });
    const credits = await tokenCredits(supabase, GRAMMAR_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      return { edits: [], credits, failed: res.stop_reason };
    }
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
    const edits = (Array.isArray(out?.edits) ? out.edits : []).map((e: Partial<AgreementEdit>) => ({
      find: String(e.find ?? ''), replace: String(e.replace ?? ''), note: String(e.note ?? ''),
    }));
    return { edits, credits };
  } catch (e) {
    return { edits: [], credits: 0, failed: (e as Error).message.slice(0, 200) };
  }
}

async function unknownWords(supabase: DbClient, workspaceId: string | null, words: string[]): Promise<Set<string>> {
  if (!words.length) return new Set();
  const { data, error } = await supabase.rpc('lexicon_unknown_words', {
    p_language: 'el', p_website_id: null, p_workspace_id: workspaceId, p_words: words,
  });
  if (error) throw new Error(`lexicon check failed: ${error.message}`);
  return new Set(((data as string[] | null) ?? []).map((w) => w.toLowerCase()));
}

/** Agreement edits that pass every deterministic check and introduce only dictionary words, mapped onto the markdown. */
export async function validateAgreementEdits(
  supabase: DbClient,
  edits: AgreementEdit[],
  markdown: string,
  workspaceId: string | null,
): Promise<{ accepted: (AgreementEdit & { mdFind: string })[]; dropped: { find: string; replace: string; why: string }[] }> {
  const prose = visibleProse(markdown);
  const accepted: (AgreementEdit & { mdFind: string; words: string[] })[] = [];
  const dropped: { find: string; replace: string; why: string }[] = [];
  for (const e of edits) {
    const c = checkAgreementEdit(e, prose, markdown);
    if (c.ok) accepted.push({ ...e, mdFind: c.find, words: c.words });
    else dropped.push({ find: e.find, replace: e.replace, why: c.why });
  }
  let unknown: Set<string>;
  try {
    unknown = await unknownWords(supabase, workspaceId, [...new Set(accepted.flatMap((e) => e.words))]);
  } catch (err) {
    const why = (err as Error).message.slice(0, 120);
    return { accepted: [], dropped: [...dropped, ...accepted.map((e) => ({ find: e.find, replace: e.replace, why }))] };
  }
  const ok = accepted.filter((e) => {
    const bad = e.words.filter((w) => unknown.has(w.toLowerCase()));
    if (bad.length) dropped.push({ find: e.find, replace: e.replace, why: `unknown word: ${bad.join(', ')}` });
    return !bad.length;
  });
  return { accepted: ok.map(({ words: _w, ...e }) => e), dropped };
}

/**
 * Two passes: LanguageTool's rule matches (cheap, local) corrected by one model call, and a model
 * agreement pass over the Greek prose (gender, number, case — which LanguageTool cannot see). Both are
 * billed under one reservation. Never throws: what cannot run is named in `failed`.
 */
export async function enforceGrammar(
  supabase: DbClient,
  opts: { markdown: string; languageCode: string | null; userId: string; workspaceId: string | null },
): Promise<{ markdown: string; report: GrammarReport }> {
  const language = baseLanguage(opts.languageCode);
  const report: GrammarReport = {
    checked: false, flagged: [], corrected: [], remaining: [],
    agreement: { ran: false, applied: [], dropped: [] }, credits: 0,
  };
  let markdown = opts.markdown;
  if (!language) return { markdown, report: { ...report, failed: 'no article language' } };
  const failures: string[] = [];

  let flagged: Finding[] = [];
  try {
    flagged = await findings(supabase, language, markdown);
    report.checked = true;
  } catch (e) {
    failures.push((e as Error).message.slice(0, 200));
  }
  report.flagged = flagged;
  report.remaining = flagged.map(({ sentence, message }) => ({ sentence, message }));

  const chunks = language === 'el' ? chunkText(visibleProse(markdown).text, AGREEMENT_CHUNK_CHARS).filter((c) => c.text.trim()) : [];
  const sentences = new Set(distinctSentences(flagged));
  const points = flagged.filter((f) => sentences.has(f.sentence));
  const calls = chunks.length + (points.length ? 1 : 0);
  const done = () => ({ markdown, report: { ...report, ...(failures.length ? { failed: failures.join('; ') } : {}) } });
  if (!calls) return done();

  try {
    const wallet: StageWallet = { userId: opts.userId, workspaceId: opts.workspaceId, opType: 'seo_grammar' };
    const ceiling = await tokenCeiling(
      supabase, GRAMMAR_MODEL, GRAMMAR_MAX_INPUT_TOKENS * calls, GRAMMAR_MAX_OUTPUT_TOKENS * calls, 10 * calls,
    );
    const hold = await reserveStage(supabase, wallet, ceiling, 'SEO grammar check');
    if (!hold.ok) {
      failures.push(`not corrected: ${hold.error}`);
      return done();
    }

    const results: CallResult[] = [];
    const agreementEdits: AgreementEdit[] = [];
    let ltEdits: ReviewEdit[] = [];
    try {
      if (chunks.length) {
        const system = await getToolPrompt(supabase, 'seo_grammar_agreement');
        for (const chunk of chunks) {
          const r = await editCall(supabase, system, `Article language: ${language}\n<prose>\n${chunk.text}\n</prose>`, opts);
          results.push(r);
          if (r.failed) failures.push(`agreement ${r.failed}`);
          agreementEdits.push(...r.edits);
        }
        report.agreement.ran = true;
      }
      if (points.length) {
        const r = await editCall(
          supabase,
          await getToolPrompt(supabase, 'seo_grammar_fix'),
          `Article language: ${language}\n<flagged>\n`
            + points.map((p) => `- ${p.sentence}\n  issue: ${p.message}`).join('\n')
            + '\n</flagged>',
          opts,
        );
        results.push(r);
        if (r.failed) failures.push(`correction ${r.failed}`);
        ltEdits = r.edits
          .filter((e) => [...sentences].some((s) => s.includes(e.find)))
          .map((e) => ({ find: e.find, replace: e.replace, kind: 'grammar' }));
      }
    } finally {
      const priced = results.every((r) => r.credits !== null);
      const actual = priced ? results.reduce((n, r) => n + (r.credits ?? 0), 0) : null;
      report.credits = await settleStage(supabase, wallet, ceiling, actual, {
        flagged: flagged.length, agreement_edits: agreementEdits.length, lt_edits: ltEdits.length, calls: results.length,
      });
    }

    const valid = await validateAgreementEdits(supabase, agreementEdits, markdown, opts.workspaceId);
    const agreed = applyReviewEdits(markdown, valid.accepted.map((e) => ({ find: e.mdFind, replace: e.replace, kind: 'agreement', note: e.note })));
    markdown = agreed.markdown;
    report.agreement.applied = agreed.applied.map((e) => ({ from: e.find, to: e.replace, note: e.note ?? '' }));
    report.agreement.dropped = [...valid.dropped, ...agreed.skipped.map((e) => ({ find: e.find, replace: e.replace, why: e.why }))];

    const fixed = applyReviewEdits(markdown, ltEdits);
    markdown = fixed.markdown;
    report.corrected = [...agreed.applied, ...fixed.applied].map((e) => ({ from: e.find, to: e.replace }));

    if (report.checked && report.corrected.length) {
      try {
        const after = await findings(supabase, language, markdown);
        report.remaining = after.map(({ sentence, message }) => ({ sentence, message }));
      } catch (e) {
        failures.push(`not re-checked: ${(e as Error).message.slice(0, 200)}`);
      }
    }
    return done();
  } catch (e) {
    failures.push((e as Error).message.slice(0, 200));
    return done();
  }
}
