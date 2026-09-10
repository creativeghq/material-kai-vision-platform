// GENERATED MIRROR of src/modules/projects/drawingVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** The drawing-register value-sets, written ONCE. */

/** `project_documents_kind_check`. What sort of document this register entry is. */
export const DOCUMENT_KINDS = [
  'drawing',
  'specification',
  'schedule',
  'report',
  'certificate',
  'correspondence',
  'other',
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export function isDocumentKind(v: unknown): v is DocumentKind {
  return typeof v === 'string' && (DOCUMENT_KINDS as readonly string[]).includes(v);
}

/**
 * `project_document_revisions_purpose_check` — why a revision was ISSUED.
 *
 * This is the field that decides whether somebody may build from the sheet in their hand, which
 * is why it sits on the REVISION and not the document: rev C can be for construction while rev B
 * was for tender, and the register has to be able to say so. `as_built` is last because it is the
 * only one issued after the work, not before it.
 */
export const DRAWING_PURPOSES = [
  'preliminary',
  'for_information',
  'for_tender',
  'for_approval',
  'for_construction',
  'as_built',
] as const;
export type DrawingPurpose = (typeof DRAWING_PURPOSES)[number];

export function isDrawingPurpose(v: unknown): v is DrawingPurpose {
  return typeof v === 'string' && (DRAWING_PURPOSES as readonly string[]).includes(v);
}

/**
 * The only purposes you may build from. Used to warn when a superseded or preliminary sheet is
 * the one somebody is about to hand to site — the register knowing this and not saying it is the
 * failure this field exists to prevent.
 */
export const BUILDABLE_PURPOSES: readonly DrawingPurpose[] = ['for_construction', 'as_built'];

/** Offered by the picker and snapped to by extraction. NOT a database constraint — see the header. */
export const DISCIPLINES = [
  'architectural',
  'structural',
  'mechanical',
  'electrical',
  'plumbing',
  'civil',
  'landscape',
  'interior',
  'fire',
  'other',
] as const;
export type Discipline = (typeof DISCIPLINES)[number];

export function isDiscipline(v: unknown): v is Discipline {
  return typeof v === 'string' && (DISCIPLINES as readonly string[]).includes(v);
}

/** Snap free text onto one of the lists above, or null. */
export function snapToVocabulary<T extends string>(
  value: unknown,
  vocabulary: readonly T[],
): T | null {
  if (typeof value !== 'string') return null;
  const norm = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!norm) return null;
  const exact = vocabulary.find((v) => v === norm);
  if (exact) return exact;

  // "structural_engineering" -> structural; "issued_for_construction" -> for_construction.
  //
  // Floored at four characters, because below that the containment is meaningless: a title block
  // reading just "FOR" would otherwise land on `for_information` purely because it sorts first,
  // and a confidently wrong issue status is worse than an unmapped one the operator is asked about.
  if (norm.length < 4) return null;
  const contained = vocabulary.find((v) => norm.includes(v) || v.includes(norm));

  // A genuinely ambiguous sheet ("Mechanical & Electrical") resolves to whichever member comes
  // first in the vocabulary. Deliberate and deterministic rather than null: M&E sheets are common,
  // the operator confirms every extracted field anyway, and refusing to place them would push the
  // commonest combined discipline into the unmapped bucket on every set.
  return contained ?? null;
}
