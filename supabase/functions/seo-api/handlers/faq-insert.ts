/**
 * Where an FAQ entry goes in the markdown — the part that can silently land in the wrong place.
 *
 * Separated from the handler so it can be tested without a Deno runtime or a model call. The
 * handler reads `Deno.env` at module load, so importing it from a unit test throws before a
 * single case runs; this is the same split as `readability.ts` and for the same reason.
 */

export const STRIP_ACCENTS = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Headings that mean "this is the FAQ section".
 *
 * The writer emits `## Frequently Asked Questions` even in a Greek article (a separate defect —
 * the heading is English in a Greek document), so English has to be here; the localised forms are
 * here because that heading should be, and will be, the article's own language. Matching more
 * than the writer currently produces costs nothing and stops this from breaking the day the
 * prompt is fixed.
 */
export const FAQ_HEADING_PATTERNS = [
  'frequently asked questions',
  'faq',
  'faqs',
  'common questions',
  'συχνές ερωτήσεις',
  'συχνες ερωτησεις',
  'preguntas frecuentes',
  'domande frequenti',
  'häufige fragen',
  'questions fréquentes',
];

const stripAccents = STRIP_ACCENTS;

export function isFaqHeading(headingText: string): boolean {
  const h = stripAccents(headingText).replace(/[:：?;·]+$/, '').trim();
  return FAQ_HEADING_PATTERNS.some((p) => h === stripAccents(p));
}

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
  fallbackHeading = 'Frequently Asked Questions',
): FaqInsertion {
  const q = question.trim().replace(/\s+/g, ' ');
  const entry = `### ${q}\n\n${answer.trim()}\n`;
  const lines = markdown.split('\n');

  let faqStart = -1;
  let heading = '';
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s+(.+?)\s*$/);
    if (m && isFaqHeading(m[1])) { faqStart = i; heading = m[1]; break; }
  }

  if (faqStart === -1) {
    // No FAQ section. Create one — before the conclusion if there is one, since an FAQ after the
    // closing paragraph reads as an afterthought and pushes the call to action off the end.
    let insertAt = lines.length;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^##\s+(.+?)\s*$/);
      if (m && /^(conclusion|συμπέρασμα|συμπερασμα|summary)$/i.test(stripAccents(m[1]))) { insertAt = i; break; }
    }
    const block = [`## ${fallbackHeading}`, '', entry.trimEnd(), ''];
    const next = [...lines.slice(0, insertAt), ...block, ...lines.slice(insertAt)];
    return { markdown: next.join('\n'), createdSection: true, heading: fallbackHeading };
  }

  // The section ends at the next H2 (or H1), or at the end of the document.
  let faqEnd = lines.length;
  for (let i = faqStart + 1; i < lines.length; i++) {
    if (/^#{1,2}\s+/.test(lines[i])) { faqEnd = i; break; }
  }

  // Trim the blank lines the section ends with, add the entry, put one blank line back.
  let tail = faqEnd;
  while (tail > faqStart + 1 && lines[tail - 1].trim() === '') tail -= 1;

  const next = [
    ...lines.slice(0, tail),
    '',
    entry.trimEnd(),
    '',
    ...lines.slice(faqEnd),
  ];
  return { markdown: next.join('\n'), createdSection: false, heading };
}

