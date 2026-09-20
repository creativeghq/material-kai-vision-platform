// GENERATED MIRROR of src/components/core/Profile/seo/citabilityDimensions.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** What decides whether an assistant can lift an answer off a page. Mirrored to Deno. */

export type CitabilityStatus = 'ok' | 'no_data' | 'not_collected';

export interface CitabilityDimension {
  key: string;
  label: string;
  /** What an engine gets from it, in the operator's words. */
  why: string;
  /** What to do when it scores low. Shown verbatim as the suggestion. */
  fix: string;
  weight: number;
}

export const CITABILITY_DIMENSIONS: readonly CitabilityDimension[] = [
  {
    key: 'answer_first',
    label: 'Answers in the opening',
    why: 'An engine lifts the first passage that answers the question. A page that warms up for three paragraphs is skipped for one that leads with the answer.',
    fix: 'Put a 2–3 sentence direct answer immediately under the H1, before any preamble.',
    weight: 20,
  },
  {
    key: 'question_heading',
    label: 'Headings ask the question',
    why: 'Retrieval matches a heading against the query. A heading that states the buyer’s question is the strongest match a page can offer.',
    fix: 'Rewrite one H2 as the exact question, in the buyer’s words and language.',
    weight: 15,
  },
  {
    key: 'faq_block',
    label: 'FAQ or Q&A block',
    why: 'A question-and-answer pair is the easiest unit to quote, and FAQPage markup makes it machine-readable.',
    fix: 'Add three real buyer questions with short answers, and FAQPage JSON-LD.',
    weight: 12,
  },
  {
    key: 'entity_facts',
    label: 'Concrete facts and figures',
    why: 'Engines prefer a page that states checkable specifics — sizes, prices, materials, dates — over adjectives.',
    fix: 'Add the numbers: dimensions, tolerances, lead times, certifications.',
    weight: 15,
  },
  {
    key: 'comparison',
    label: 'Comparison or spec table',
    why: 'A table is structured, so it survives extraction intact where prose does not.',
    fix: 'Add a table comparing options, or a spec table for the product.',
    weight: 10,
  },
  {
    key: 'sources_cited',
    label: 'Cites its sources',
    why: 'Outbound citations to standards, tests or manufacturers are the E-E-A-T signal an engine can actually verify.',
    fix: 'Link the standard, datasheet or study behind each claim.',
    weight: 8,
  },
  {
    key: 'author_trust',
    label: 'Named author or company credentials',
    why: 'An unattributed page is harder to trust and easier to skip in favour of one with a named expert behind it.',
    fix: 'Add a byline with a role, or an About block stating the company’s experience.',
    weight: 10,
  },
  {
    key: 'freshness',
    label: 'Visibly current',
    why: 'A page with no date, or an old one, loses to a dated rival on any question where recency matters.',
    fix: 'Show a published or updated date, and refresh the content behind it.',
    weight: 10,
  },
];
