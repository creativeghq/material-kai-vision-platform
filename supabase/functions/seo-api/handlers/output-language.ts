/**
 * The language the ARTICLE is written in.
 *
 * `language_code` used to reach the research stage only — it is a DataForSEO parameter, and
 * that is all it was ever wired to. So a run could research Greek SERPs and then plan and
 * write in English, because nothing downstream of research was ever told. It mostly did not
 * show: a Greek keyword and Greek competitor headings drag the model into Greek on their
 * own. "Mostly" is the problem — the output language was an emergent property of the
 * research, not an instruction, so it was correct until the day it was not.
 *
 * A prompt directive rather than a schema field on purpose. The plan and write prompts are
 * loaded from `prompts` (admin-editable, no code fallback), so the language has to be
 * appended as context by the caller rather than baked into a prompt row per language.
 */

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
their original form. Do not translate the target keyword: use it exactly as given.`;
}
