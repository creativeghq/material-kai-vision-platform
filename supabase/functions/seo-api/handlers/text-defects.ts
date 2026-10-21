/** Mechanical writing slips a reader notices at once, found without a model so any language is covered. */

export type TextDefectKind = 'doubled_punctuation' | 'repeated_phrase' | 'repeated_opener';

export interface TextDefect {
  kind: TextDefectKind;
  /** The offending text as it reads in the prose (link targets and emphasis removed). */
  text: string;
  /** The block it sits in, verbatim from the markdown: a paragraph, a list item or a quote. */
  source: string;
}

const WORD = '[\\p{L}\\p{N}]+';
/** Two to four words said twice in a row. One repeated word is left alone: «σιγά σιγά», «nous nous», «had had» are correct. */
const REPEATED_PHRASE = new RegExp(`(?<![\\p{L}\\p{N}])((?:${WORD}\\s+){1,3}${WORD})\\s+\\1(?![\\p{L}\\p{N}])`, 'giu');
const DOUBLED = /(?<![.…])\.\.(?![.…])|,,|;;|!!|\?\?|··/g;
const SENTENCE_END = /(?<=[.!?;…])\s+(?=\S)/u;
const OPENER_MIN_LETTERS = 5;
const LINK_TARGET = /\]\([^)]*\)/g;

interface Block { source: string; prose: string }

function stripMarkup(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Prose blocks only: headings, tables, code, images and callout markers say nothing about wording. */
function proseBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let raw: string[] = [];
  let inCode = false;
  const flush = () => {
    if (raw.length) blocks.push({ source: raw.join('\n'), prose: stripMarkup(raw.map((l) => l.trim().replace(/^>\s?/, '')).join(' ')) });
    raw = [];
  };
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) { flush(); inCode = !inCode; continue; }
    const t = line.trim();
    if (inCode || !t || /^(#|\||!\[|---|<)/.test(t) || /^>\s*\[!/.test(t)) { flush(); continue; }
    if (/^([-*+]|\d+\.)\s/.test(t)) {
      flush();
      blocks.push({ source: line, prose: stripMarkup(t.replace(/^([-*+]|\d+\.)\s+/, '')) });
      continue;
    }
    raw.push(line);
  }
  flush();
  return blocks;
}

function opener(sentence: string): string | null {
  const first = /^\p{L}+/u.exec(sentence.replace(/^[^\p{L}]+/u, ''))?.[0];
  return first && first.length >= OPENER_MIN_LETTERS ? first : null;
}

export function textDefects(markdown: string): TextDefect[] {
  const out: TextDefect[] = [];
  for (const { source, prose } of proseBlocks(markdown)) {
    for (const m of prose.matchAll(DOUBLED)) out.push({ kind: 'doubled_punctuation', text: m[0], source });
    for (const m of prose.matchAll(REPEATED_PHRASE)) {
      if (/\p{N}/u.test(m[1])) continue;
      out.push({ kind: 'repeated_phrase', text: m[0], source });
    }
    const sentences = prose.split(SENTENCE_END);
    for (let i = 1; i < sentences.length; i++) {
      const a = opener(sentences[i - 1]);
      const b = opener(sentences[i]);
      if (a && b && a.toLocaleLowerCase() === b.toLocaleLowerCase()) out.push({ kind: 'repeated_opener', text: b, source });
    }
  }
  return out;
}

/** Defects present in `after` and not in `before`: what an edit introduced. */
export function newDefects(before: string, after: string): TextDefect[] {
  const key = (d: TextDefect) => `${d.kind}|${d.text.toLocaleLowerCase()}`;
  const seen = new Map<string, number>();
  for (const d of textDefects(before)) seen.set(key(d), (seen.get(key(d)) ?? 0) + 1);
  const added: TextDefect[] = [];
  for (const d of textDefects(after)) {
    const left = seen.get(key(d)) ?? 0;
    if (left > 0) seen.set(key(d), left - 1);
    else added.push(d);
  }
  return added;
}

/** The one slip safe to fix without judgement: a doubled full stop in prose that is not an ellipsis. */
export function fixDoubledFullStops(markdown: string): string {
  let inCode = false;
  return markdown.split('\n').map((line) => {
    if (/^\s*```/.test(line)) { inCode = !inCode; return line; }
    if (inCode || /^\s*\|/.test(line)) return line;
    const targets: string[] = [];
    const masked = line.replace(LINK_TARGET, (t) => `\u0000${targets.push(t) - 1}\u0000`);
    return masked
      .replace(/(?<![.…])\.\.(?![.…])/g, '.')
      .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => targets[Number(i)]);
  }).join('\n');
}
