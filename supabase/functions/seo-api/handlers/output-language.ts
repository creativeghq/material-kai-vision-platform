/** The language the ARTICLE is written in. */

/**
 * "el" / "el-GR" → "Greek". Falls back to the raw code, which is still a usable
 * instruction — an unknown tag must not silently mean "write in English".
 */
export function languageName(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return '';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(trimmed) || trimmed;
  } catch {
    // Intl throws RangeError on a malformed tag. The tag itself is the fallback.
    return trimmed;
  }
}

/**
 * The block appended to the plan and write system prompts. Empty for English and for an
 * unset code — English is the platform default (CLAUDE.md), so saying so adds nothing.
 */
export function outputLanguageBlock(code: string | null | undefined): string {
  if (!code) return '';
  const trimmed = String(code).trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('en')) return '';

  const name = languageName(trimmed);
  return `

=== OUTPUT LANGUAGE ===
Write EVERY word of the output in ${name} (${trimmed}) — headings, meta title, meta
description, body copy, FAQ questions and answers. The slug stays latin-alphabet.
Keep proper nouns, brand names and technical standards (R-ratings, EN/ISO codes) in
their original form. Do not translate the target keyword: use it exactly as given.

This includes the STRUCTURAL section headings. Where these rules name a section in
English — "Frequently Asked Questions", "Conclusion", "Next Steps" — that names the
section's PURPOSE, not the words to print. Write each of those headings in ${name},
the way a native publication in ${name} would title it. An English heading in the
middle of a ${name} article is a defect, not a convention.`;
}
