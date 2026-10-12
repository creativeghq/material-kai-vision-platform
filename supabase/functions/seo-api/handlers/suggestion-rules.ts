/** Article suggestions: which items to propose for, and whether a proposal still fits the text. Import-free (unit-tested). */

export type SuggestionSource = 'coverage' | 'answer_check' | 'analysis' | 'update';
export type SuggestionStatus = 'pending' | 'applied' | 'dismissed';

export interface SuggestionItem {
  source: SuggestionSource;
  /** The reader point, or the analyzer's instruction. */
  point: string;
  /** Analysis only: the paragraph the finding is about, verbatim. */
  anchor?: string;
  detail?: string;
}

export interface ArticleSuggestion {
  id: string;
  source: SuggestionSource;
  title: string;
  kind: 'insert' | 'replace';
  find?: string;
  replace?: string;
  after?: string;
  markdown?: string;
  /** The item it answers, so a dismissed one is not proposed again. */
  basis: string;
  status: SuggestionStatus;
  created_at: string;
  resolved_at?: string;
}

export const MAX_SUGGESTION_ITEMS = 12;
const MAX_TEXT_CHARS = 6000;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function occurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/** Up to MAX items, de-duplicated, never one already applied or dismissed, smallest edit first. */
export function pickSuggestionItems(
  candidates: SuggestionItem[],
  markdown: string,
  history: Pick<ArticleSuggestion, 'basis' | 'status'>[],
): SuggestionItem[] {
  const settled = new Set(history.filter((h) => h.status !== 'pending').map((h) => norm(h.basis)));
  const seen = new Set<string>();
  const kept: SuggestionItem[] = [];
  for (const c of candidates) {
    if (!c.point?.trim()) continue;
    if (c.source === 'analysis' && (!c.anchor || occurrences(markdown, c.anchor) !== 1)) continue;
    const key = norm(basisOf(c));
    if (seen.has(key) || settled.has(key)) continue;
    seen.add(key);
    kept.push(c);
  }
  const cost = (c: SuggestionItem) => (c.anchor?.length ?? 0) + c.point.length;
  return kept.sort((a, b) => cost(a) - cost(b)).slice(0, MAX_SUGGESTION_ITEMS);
}

export function basisOf(item: SuggestionItem): string {
  return item.source === 'analysis' ? `${item.point}\n${item.anchor ?? ''}` : item.point;
}

/** Why a proposal cannot be applied to `markdown`, or null when it can. */
export function validateSuggestion(
  markdown: string,
  s: Pick<ArticleSuggestion, 'kind' | 'find' | 'replace' | 'after' | 'markdown'>,
): string | null {
  const anchor = s.kind === 'replace' ? s.find : s.after;
  const text = s.kind === 'replace' ? s.replace : s.markdown;
  if (s.kind !== 'replace' && s.kind !== 'insert') return 'unknown kind';
  if (!anchor || !anchor.trim()) return 'no anchor text';
  if (typeof text !== 'string' || (s.kind === 'insert' && !text.trim())) return 'no new text';
  if (text.length > MAX_TEXT_CHARS) return 'new text too long';
  const n = occurrences(markdown, anchor);
  if (n === 0) return 'the anchor text is not in the article';
  if (n > 1) return 'the anchor text appears more than once';
  if (s.kind === 'replace' && text === anchor) return 'the replacement is identical';
  if (s.kind === 'insert' && markdown.includes(text.trim())) return 'that text is already in the article';
  return null;
}

/** The article with the proposal applied. Call only after validateSuggestion returned null. */
export function applySuggestion(
  markdown: string,
  s: Pick<ArticleSuggestion, 'kind' | 'find' | 'replace' | 'after' | 'markdown'>,
): string {
  const anchor = (s.kind === 'replace' ? s.find : s.after) as string;
  const at = markdown.indexOf(anchor);
  const end = at + anchor.length;
  if (s.kind === 'replace') return markdown.slice(0, at) + (s.replace as string) + markdown.slice(end);
  // A new block goes after the block the anchor ends in, never into the middle of a paragraph.
  const blank = markdown.indexOf('\n\n', end);
  const cut = blank === -1 ? markdown.replace(/\s+$/, '').length : blank;
  const block = (s.markdown as string).trim();
  return `${markdown.slice(0, cut)}\n\n${block}${blank === -1 ? '\n' : markdown.slice(cut)}`;
}

/** Fresh proposals replace older pending ones; applied and dismissed history stays. */
export function mergeSuggestions(
  existing: ArticleSuggestion[],
  fresh: ArticleSuggestion[],
  regenerated: SuggestionSource[] = ['coverage', 'answer_check', 'analysis'],
): ArticleSuggestion[] {
  return [...existing.filter((s) => s.status !== 'pending' || !regenerated.includes(s.source)), ...fresh];
}

export function storedSuggestions(raw: unknown): ArticleSuggestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is ArticleSuggestion =>
    !!s && typeof (s as ArticleSuggestion).id === 'string' && typeof (s as ArticleSuggestion).kind === 'string');
}
