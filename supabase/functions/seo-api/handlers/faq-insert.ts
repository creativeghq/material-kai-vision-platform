/**
 * Where an FAQ entry goes in the markdown — the part that can silently land in the wrong place.
 *
 * Separated from the handler so it can be tested without a Deno runtime or a model call. The
 * handler reads `Deno.env` at module load, so importing it from a unit test throws before a
 * single case runs; this is the same split as `readability.ts` and for the same reason.
 *
 * WHICH heading counts as the FAQ section is not decided here — that lives in
 * `_shared/seo/articleSections.generated.ts`, because the viewer and the analyzer have to answer
 * it the same way. This file only decides where the text lands.
 */

import {
  findConclusionLine,
  findFaqSection,
  stripAccents,
  type SectionLabels,
} from '../../_shared/seo/articleSections.generated.ts';

export { isFaqHeading, findFaqSection } from '../../_shared/seo/articleSections.generated.ts';

/** Kept as a named export because callers outside this file compare questions with it. */
export const STRIP_ACCENTS = stripAccents;

export interface FaqInsertion {
  markdown: string;
  /** True when there was no FAQ section and one was created. */
  createdSection: boolean;
  /** The H2 the entry went under. */
  heading: string;
}

/**
 * Put `### question` + answer at the END of the FAQ section, before whatever H2 follows it.
 *
 * Appending to the document instead would put the entry after the conclusion, which is where the
 * old "Add section" button placed it. The entry format mirrors what the writer already produces
 * (`###` + a blank line + one paragraph) so the viewer's FAQ accordion picks it up unchanged.
 */
export function insertFaqEntry(
  markdown: string,
  question: string,
  answer: string,
  /**
   * How to NAME an FAQ section that does not exist yet. Defaults to English, and the caller is
   * expected to pass the article's own language — writing `## Frequently Asked Questions` into a
   * Greek article is the exact defect this pair of changes removes, and creating the section is
   * the one path that gets to choose the words.
   */
  labels?: Pick<SectionLabels, 'faq'>,
): FaqInsertion {
  const fallbackHeading = labels?.faq ?? 'Frequently Asked Questions';
  const q = question.trim().replace(/\s+/g, ' ');
  const entry = `### ${q}\n\n${answer.trim()}\n`;
  const lines = markdown.split('\n');

  const section = findFaqSection(markdown);

  if (!section) {
    // No FAQ section. Create one — before the conclusion if there is one, since an FAQ after the
    // closing paragraph reads as an afterthought and pushes the call to action off the end.
    const closing = findConclusionLine(markdown);
    const insertAt = closing === -1 ? lines.length : closing;
    const block = [`## ${fallbackHeading}`, '', entry.trimEnd(), ''];
    const next = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)];
    return { markdown: next.join('\n'), createdSection: true, heading: fallbackHeading };
  }

  // Trim the blank lines the section ends with, add the entry, put one blank line back.
  let tail = section.endLine;
  while (tail > section.headingLine + 1 && lines[tail - 1].trim() === '') tail -= 1;

  const next = [
    ...lines.slice(0, tail),
    '',
    entry.trimEnd(),
    '',
    ...lines.slice(section.endLine),
  ];
  return { markdown: next.join('\n'), createdSection: false, heading: section.headingText };
}


/** A stored FAQ pair. The pipeline writes `faq_schema` as a bare array of these. */
export interface FaqPair { question: string; answer: string }

/**
 * The stored FAQ schema, reduced to the entries the article actually shows.
 *
 * The BODY is the source of truth: `faq_schema` is a projection of it for the FAQPage rich
 * result, and a projection that outlives what it projects is a page claiming an FAQ it does not
 * display. That is exactly what a Revert produced — adding a question wrote both, reverting
 * restored only the markdown, and the article came back with six FAQ headings and eight schema
 * entries. Measured on the real article, immediately after the feature that caused it.
 *
 * Cheap enough to run on every write that touches the body, which is where it is called from.
 */
export function faqPairsPresentIn(markdown: string, pairs: FaqPair[]): FaqPair[] {
  const headings = new Set(
    [...markdown.matchAll(/^#{2,4}\s+(.+?)\s*$/gm)].map((m) => STRIP_ACCENTS(m[1])),
  );
  return pairs.filter((p) => headings.has(STRIP_ACCENTS(p.question)));
}
