/**
 * Flesch Reading Ease, 0–100, or null when the formula does not apply.
 *
 * The field shipped as a hardcoded `readabilityScore: null // Could be enhanced with
 * Flesch-Kincaid`, so every article reported a blank where a score belongs.
 *
 * Null for non-Latin scripts, and that is the point rather than a shortcoming. Flesch's
 * constants are fitted to English syllable and sentence statistics; run them over Greek and
 * they still return a number — a confident, meaningless one, which is worse than a blank
 * because nothing downstream can tell it from a real reading. The platform's first article
 * is Greek, so this would have been the very first score it produced. A stated absence beats
 * a fabricated figure (anti-regression rule 3); the length checks above are language-agnostic
 * and keep working either way.
 */
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
