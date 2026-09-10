/** Flesch Reading Ease, 0–100, or null when the formula does not apply. */
export function readingEase(markdown: string): number | null {
  // Strip markdown furniture so hashes, list bullets and link syntax are not counted as words.
  const prose = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_>`|-]/g, ' ');

  const letters = prose.match(/\p{L}/gu) ?? [];
  if (letters.length < 200) return null;
  const latin = letters.filter((c) => /[A-Za-z]/.test(c)).length;
  if (latin / letters.length < 0.85) return null;

  const words = prose.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  const sentences = prose.split(/[.!?]+/).filter((s) => /\p{L}/u.test(s));
  if (words.length === 0 || sentences.length === 0) return null;

  // Vowel groups, with the silent trailing "e" removed and every word worth at least one.
  const syllables = words.reduce((sum, w) => {
    const cleaned = w.toLowerCase().replace(/[^a-z]/g, '').replace(/e$/, '');
    const groups = cleaned.match(/[aeiouy]+/g);
    return sum + Math.max(1, groups?.length ?? 0);
  }, 0);

  const score = 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
  return Math.round(Math.max(0, Math.min(100, score)) * 10) / 10;
}
