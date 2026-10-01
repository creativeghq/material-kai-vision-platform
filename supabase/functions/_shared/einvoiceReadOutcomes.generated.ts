// GENERATED MIRROR of src/config/einvoiceReadOutcomes.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const EINVOICE_READ_OUTCOMES = ['details_found', 'nothing_printed', 'unreachable', 'not_readable'] as const;

export type EinvoiceReadOutcome = (typeof EINVOICE_READ_OUTCOMES)[number];
