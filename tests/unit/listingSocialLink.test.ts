/**
 * A post about a listing is LINKED to it, not tagged in jsonb (#378 N6).
 *
 * THE FINDING, AND THE HALF THAT WAS ALREADY TRUE
 * ----------------------------------------------
 * The issue says "marketing content connects to nothing it markets… marketing ROI is structurally
 * unanswerable rather than merely unreported". Half right, and the true half is the more
 * interesting defect: `real-estate-listing-social` has always announced a published listing and
 * always recorded WHICH property — as `metadata->>'property_id'`.
 *
 * A jsonb key is not a link:
 *   • no foreign key, so deleting the property leaves a dangling id nothing cleans up;
 *   • no index, and the idempotence check ran `.contains('metadata', …)` on every call;
 *   • nothing can JOIN it, which is exactly why the ROI question could not be asked of data that
 *     was already being written.
 *
 * WHAT THIS PINS
 * --------------
 * That the writer, the idempotence check and the reader all use the COLUMN. Any one of them
 * falling back to `metadata` puts the link back where it was — and it would keep working, which is
 * what makes it worth a test rather than a comment.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const WRITER = 'supabase/functions/real-estate-listing-social/index.ts';
const READER = 'src/modules/real-estate/components/ListingSocialPostsCard.tsx';
const WORKBENCH = 'src/modules/real-estate/pages/PropertyWorkbench.tsx';

describe('the listing link is a column', () => {
  const writer = read(WRITER);

  it('the writer sets the column', () => {
    expect(writer, 'the post must carry property_id as a column').toMatch(/property_id: propertyId/);
  });

  it('the idempotence check reads the column, not the jsonb', () => {
    // `.contains('metadata', { property_id })` works, and that is the problem: it keeps passing
    // while the column goes unwritten, so the two drift with no symptom.
    expect(writer, 'the "already announced" check must use the column').toMatch(/\.eq\('property_id', propertyId\)/);
    expect(writer, 'the jsonb containment check must be gone').not.toMatch(/contains\('metadata', \{ property_id/);
  });

  it('metadata keeps only WHY the post exists, not what it is about', () => {
    // `source` answers a different question from `property_id` and stays.
    expect(writer).toMatch(/source: 'realestate\.listing_published'/);
    expect(writer, 'property_id must not also live in metadata — two copies, free to disagree')
      .not.toMatch(/metadata:\s*\{[\s\S]{0,200}?property_id:/);
  });
});

describe('the link has a reader, so it is not write-only', () => {
  it('the property page shows what was posted about it', () => {
    expect(read(WORKBENCH), 'the card must be mounted').toMatch(/<ListingSocialPostsCard/);
    expect(read(READER), 'the reader must query the column').toMatch(/\.eq\('property_id', propertyId\)/);
  });

  it('the empty state says how posts get there', () => {
    // "None" here usually means the listing is not live or no account is connected — both
    // fixable, and neither guessable from a blank panel.
    expect(read(READER)).toMatch(/automatically for each connected social account/);
  });

  it('it does not total engagement — that has its own collectors', () => {
    // `social_post_analytics` is a separate table; a second surface summing it is a second
    // derivation of the same numbers.
    expect(read(READER)).not.toMatch(/social_post_analytics/);
  });
});
