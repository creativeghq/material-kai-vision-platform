// GENERATED MIRROR of src/modules/projects/snagVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * `project_snags_severity_check`, written ONCE (#391).
 *
 * Declared as a union plus an array in `siteService`, and again in
 * `seo-api/handlers/analyze.ts` — which is the surprising one: an SEO handler reusing the
 * snag severity ladder for its own findings. Same four words, and the sweep flagged them
 * as one set.
 *
 * They ARE one fact here only because the SEO handler is deliberately reporting into the
 * same severity ladder the site module already uses, so an operator reads one scale
 * across both. If that ever stops being true, the right move is a second named
 * vocabulary, not a wider version of this one.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

export const SNAG_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type SnagSeverity = (typeof SNAG_SEVERITIES)[number];

export function isSnagSeverity(v: unknown): v is SnagSeverity {
  return typeof v === 'string' && (SNAG_SEVERITIES as readonly string[]).includes(v);
}
