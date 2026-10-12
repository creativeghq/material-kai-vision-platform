/** What an editor changed between our draft and the published page, sentence by sentence. Import-free (unit-tested). */

const MIN_SENTENCE_CHARS = 25;
const MAX_SENTENCES = 80;

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The prose of a markdown draft: no images, link targets, callout markers, table pipes or heading hashes. */
export function draftPlainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*>\s*\[![a-z]+\][^\n]*$/gim, ' ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_`]/g, '');
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;·])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= MIN_SENTENCE_CHARS);
}

/** Draft sentences the published page no longer has, and published sentences the draft never had. */
export function changedSentences(draftMarkdown: string, publishedText: string): { removed: string[]; added: string[] } {
  const draft = sentences(draftPlainText(draftMarkdown));
  const published = sentences(publishedText);
  const draftAll = ` ${norm(draft.join(' '))} `;
  const publishedAll = ` ${norm(published.join(' '))} `;
  const unique = (xs: string[]) => [...new Map(xs.map((x) => [norm(x), x])).values()];
  return {
    removed: unique(draft.filter((s) => !publishedAll.includes(` ${norm(s)} `))).slice(0, MAX_SENTENCES),
    added: unique(published.filter((s) => !draftAll.includes(` ${norm(s)} `))).slice(0, MAX_SENTENCES),
  };
}
