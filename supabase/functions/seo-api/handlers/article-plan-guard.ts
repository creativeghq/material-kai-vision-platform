/**
 * Shape check for a body-supplied `article_plan`.
 *
 * `analyze` and `write` both took an `ArticlePlan` straight off the request body and
 * checked only that the KEY was present. `ArticlePlan` is a TypeScript interface, so
 * `body.article_plan` is typed `any` at the boundary and the compiler has nothing to
 * say — the first thing to notice a half-built plan was `plan.primaryKeyword
 * .toLowerCase()` throwing `Cannot read properties of undefined`, which the wrapper
 * turned into a 500. A malformed request is the CALLER's bug and must read as 400,
 * or every partial plan looks like a platform outage.
 *
 * The requirement is PER HANDLER and both lists live here, because the two read
 * overlapping but different fields: `analyze` reads slug/metaTitle/metaDescription,
 * `write` reads sections/lsiKeywords. Requiring the union would reject plans that
 * work today — a guard that fails a valid request is worse than the 500 it replaced.
 *
 * Deliberately NOT required by either list: `searchIntent` and `recommendedSchema`
 * (already optional-chained by their only readers) and `featuredSnippetTarget`
 * (nullable BY DESIGN — the type says `string | null` and `write` falls back to the
 * SERP signal). Validating a field the code handles as absent breaks working callers.
 */

interface PlanFieldSpec {
  readonly strings: readonly string[];
  readonly arrays: readonly string[];
  readonly numbers: readonly string[];
}

/** What `analyzeContent` dereferences without a guard. */
export const ANALYZE_PLAN_FIELDS: PlanFieldSpec = {
  // `searchIntent` too: analyzeContent does `plan.searchIntent.toLowerCase()`. Inside the
  // pipeline the zod schema guarantees it, but seo_content_analyzer takes a hand-passed plan.
  strings: ['title', 'primaryKeyword', 'slug', 'metaTitle', 'metaDescription', 'searchIntent'],
  arrays: ['secondaryKeywords', 'faqQuestions', 'entityMentions'],
  numbers: ['targetWordCount'],
};

/** What the writer prompts dereference without a guard. */
export const WRITE_PLAN_FIELDS: PlanFieldSpec = {
  strings: ['title', 'primaryKeyword'],
  arrays: ['secondaryKeywords', 'lsiKeywords', 'faqQuestions', 'entityMentions', 'sections'],
  numbers: ['targetWordCount'],
};

/**
 * Return the field names that would make the handler throw, or `[]` when the plan is
 * safe to dereference.
 *
 * An empty string / empty array is ACCEPTED: "no secondary keywords" is a real plan and
 * every reader handles a zero-length list. Only a missing or wrong-typed field is a
 * fault, because that is the one the code cannot survive.
 */
export function missingArticlePlanFields(plan: unknown, spec: PlanFieldSpec): string[] {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    return ['article_plan must be an object'];
  }
  const p = plan as Record<string, unknown>;
  const missing: string[] = [];

  for (const field of spec.strings) {
    if (typeof p[field] !== 'string') missing.push(field);
  }
  for (const field of spec.arrays) {
    if (!Array.isArray(p[field])) missing.push(field);
  }
  for (const field of spec.numbers) {
    // Read as `plan.targetWordCount * 0.85` — a string here yields NaN comparisons that
    // silently report every article as the wrong length rather than throwing.
    if (typeof p[field] !== 'number' || !Number.isFinite(p[field])) missing.push(field);
  }
  return missing;
}
