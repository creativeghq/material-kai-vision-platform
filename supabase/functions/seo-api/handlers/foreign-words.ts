/** Latin-script words left inside a non-Latin-script article (English left in Greek). Import-free. */

/** Kept in Latin script on purpose: terms Greek searchers type that way, units and formats. */
export const ALLOWED_FOREIGN_WORDS = new Set([
  'spa', 'terrazzo', 'zellige', 'book-match', 'bookmatch', 'inverter', 'led', 'wifi', 'wi-fi',
  'pei', 'din', 'iso', 'en', 'cm', 'mm', 'kw', 'kwh', 'cop', 'scop', 'seer', 'gr', 'diy',
]);

/** Lower-case Latin words in free text (3+ letters), with each hyphenated word also split into its parts. */
export function latinTerms(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toLowerCase().matchAll(/(?<![\p{L}\d])([a-z]{3,}(?:-[a-z]+)*)(?![\p{L}\d])/gu)) {
    out.add(m[1]);
    for (const part of m[1].split('-')) if (part.length >= 3) out.add(part);
  }
  return [...out];
}

/** The prose a reader sees: no URLs, image or link targets, code, callout tags or HTML. */
function visibleText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\[!(\w+)\]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ');
}

/** Lower-case Latin words in a mostly non-Latin article; capitalised ones are names and stay. */
export function foreignWords(markdown: string, allowed: Set<string> = ALLOWED_FOREIGN_WORDS): string[] {
  const text = visibleText(markdown);
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  const other = (text.match(/[Ͱ-Ͽἀ-῿Ѐ-ӿ]/g) ?? []).length;
  if (other === 0 || latin / (latin + other) > 0.5) return [];
  const words = new Set<string>();
  for (const m of text.matchAll(/(?<![\p{L}\d-])([a-z][a-z]{2,}(?:-[a-z]+)*)(?![\p{L}\d-])/gu)) {
    const w = m[1];
    if (!allowed.has(w) && !(w.includes('-') && w.split('-').every((p) => allowed.has(p)))) words.add(w);
  }
  return [...words].sort();
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Times a Greek keyword that carries accents appears in `text`, as whole words, spelled any other way.
 * All-caps text is skipped: Greek capitals are written without accents by convention.
 */
export function unaccentedKeywordUses(text: string, keyword: string): number {
  const kw = keyword.normalize('NFC').toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!kw.length || !/[Ͱ-Ͽ]/.test(kw.join(' ')) || kw.every((w) => fold(w) === w)) return 0;
  const words = text.normalize('NFC').match(/[\p{L}\p{M}]+/gu) ?? [];
  const target = kw.map(fold);
  let count = 0;
  for (let i = 0; i + kw.length <= words.length; i++) {
    const window = words.slice(i, i + kw.length);
    if (!window.every((w, j) => fold(w) === target[j])) continue;
    if (window.every((w) => w === w.toUpperCase())) continue;
    if (window.some((w, j) => w.toLowerCase() !== kw[j])) count++;
  }
  return count;
}
