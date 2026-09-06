/**
 * What the Apply card should say — one answer, and one that can be tested as a VALUE.
 *
 * Import-free on purpose. It lived inside `SEOArticleViewer.tsx`, which imports the Supabase
 * client at module load, so importing it from a test threw before a single case ran; the verdict
 * could only be checked by rendering the whole viewer, which is why it never was.
 *
 * The state that matters is `stale`, and it is invisible from the types. A fix produced before
 * the analyzer learned to anchor carries no `scope` and no `anchor` — a perfectly valid
 * `ContentFix` — so it fails the applicable test like any other document-wide finding. Every
 * article in the database was in that state, and the card answered by rendering `null`: an
 * Apply/Revert feature that was written, deployed, verified against the edge handler, and absent
 * from the screen. Telling the two apart is the whole job here, because they need different
 * sentences and only one of them has a button that fixes it.
 */

/** A fix the analyzer located in ONE paragraph — the only kind that can be applied surgically. */
export interface ApplicableFix {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  affectedSection: string | null;
  scope?: 'section' | 'document' | 'config';
  anchor?: string | null;
}

export type FixListState =
  | { kind: 'applicable'; fixes: ApplicableFix[] }
  /** Fixes exist and not one carries a scope: this analysis predates anchoring. Re-analyse. */
  | { kind: 'stale'; count: number }
  /** Scoped, but nothing sits in a single paragraph — meta tags, provenance, the brief. */
  | { kind: 'document-only'; count: number }
  | { kind: 'clean' }
  | { kind: 'unanalysed' };

export function fixListState(analysis: unknown): FixListState {
  const fixes = (analysis as { fixes?: unknown })?.fixes;
  if (!Array.isArray(fixes)) return { kind: 'unanalysed' };
  if (fixes.length === 0) return { kind: 'clean' };

  const all = fixes as ApplicableFix[];
  // An empty anchor would splice against every position in the document, so it is not an anchor.
  const applicable = all.filter((f) => f?.scope === 'section' && typeof f.anchor === 'string' && !!f.anchor);
  if (applicable.length > 0) return { kind: 'applicable', fixes: applicable };

  if (all.every((f) => !f?.scope)) return { kind: 'stale', count: all.length };
  return { kind: 'document-only', count: all.length };
}

/**
 * The sentence each empty state gets. An empty surface must offer the way out of being empty
 * (design-system rule), and for `stale` that way out is the free re-analysis.
 */
export const FIX_STATE_COPY: Record<Exclude<FixListState['kind'], 'applicable'>, { title: string; body: string }> = {
  stale: {
    title: 'This analysis is older than per-paragraph fixes',
    body: 'It says WHAT to improve but not WHERE, so nothing here can be applied to a single '
      + 'paragraph. Re-analysing is free and does not change a word of the article.',
  },
  'document-only': {
    title: 'Nothing here rewrites a paragraph',
    body: 'Every remaining issue is article-wide or answered by the brief — meta tags come from '
      + 'the plan, provenance and first-hand experience from the brief. They are listed below.',
  },
  clean: {
    title: 'No issues found',
    body: 'The analyzer raised nothing on this article.',
  },
  unanalysed: {
    title: 'Not analysed yet',
    body: 'Run an analysis to see what can be improved, and where.',
  },
};
