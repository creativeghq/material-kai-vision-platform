/**
 * Two Real Estate paths that hand something to the outside world, and both were quietly wrong
 * about what they were handing over.
 *
 * ── 1. An unmatched lead that says it matched ────────────────────────────────────────────
 * `real-estate-inbound-lead` matches a forwarded portal enquiry to a listing by the agency's own
 * `reference_code`, and falls back to the most recent live listing when it cannot — writing a
 * "please re-point this lead" banner into the message so an agent can fix it.
 *
 * The banner was gated on `!parsed.reference` — whether the email CONTAINED a reference — not on
 * whether that reference matched anything. So an enquiry quoting `ESP-9931`, where no listing
 * carries that code, took the fallback listing with NO banner and returned `matched_listing: true`.
 * The agent sees a lead about a flat in Voula sitting on a warehouse in Piraeus and nothing at all
 * saying it might be misfiled. The two states need different fixes, too: no reference means the
 * portal does not send one, while a reference that matched nothing means this listing's
 * `reference_code` is wrong here — and that will misfile every future lead for it.
 *
 * ── 2. A published post pointing at an expired URL ───────────────────────────────────────
 * `real-estate-listing-social` drafts a social post per connected account when a listing goes
 * live. `property-media` is PRIVATE, so it signed the cover photo and stored that URL in
 * `social_posts.image_urls`; `zernio-api` then handed the stored URL to the provider at publish
 * time. A draft reviewed after the signature lapsed published an imageless post — or failed —
 * and nothing in either function could tell. That is pipeline convention 7: never persist a
 * `file_url` for a private bucket, store bucket + path and mint the URL on read.
 *
 * The row now carries `metadata.media_refs` and the publisher signs at the moment of use. The
 * stored `image_urls` remains only so the draft renders in the composer.
 *
 * The reference is an ID, not a {bucket, path}, and that is the whole design. `social_posts`
 * carries a `FOR ALL` policy for workspace members, so its metadata is USER-WRITABLE — while the
 * publisher runs under the SERVICE ROLE. A path taken from there would let any member name any
 * private object in any bucket (another tenant's invoice PDF) and be handed a signed URL for it.
 * The publisher therefore accepts only `{kind: 'property_photo', id}` and reads the bucket and path
 * from `property_photos` filtered by the post's own workspace, so the worst a rewritten id can name
 * is a photo that member could already see.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const INBOUND = 'supabase/functions/real-estate-inbound-lead/index.ts';
const SOCIAL = 'supabase/functions/real-estate-listing-social/index.ts';
const PUBLISH = 'supabase/functions/zernio-api/handlers/publish.ts';

describe('an inbound lead knows whether it actually matched a listing', () => {
  const src = read(INBOUND);

  it('is pointed at the real file', () => {
    expect(src).toContain('real-estate-inbound-lead');
    expect(src, 'the fallback listing is what makes the flag load-bearing').toMatch(/listing_status.*active|active.*listing_status/s);
  });

  it('derives the unmatched flag from the LOOKUP, never from the parsed reference', () => {
    // The precise defect: `const unmatched = !parsed.reference`. A reference that matched nothing
    // is unmatched, and only the lookup knows that.
    expect(src, 'the reference lookup must record whether it found a listing')
      .toMatch(/matchedByReference\s*=\s*!!propertyId/);
    expect(src, 'the banner and the response must both read the lookup result')
      .toMatch(/const unmatched = !matchedByReference/);
    expect(src, 'the parsed reference alone must not decide it')
      .not.toMatch(/const unmatched = !parsed\.reference/);
  });

  it('reports the two unmatched cases apart, because they need different fixes', () => {
    expect(src, 'a reference that matched nothing must say so, and name it')
      .toMatch(/does not match any listing/);
    expect(src, 'no reference at all is the other case')
      .toMatch(/sent no listing reference/);
    expect(src, 'the response must let a forwarder log tell them apart')
      .toMatch(/reference_matched:/);
  });

  it('still reports matched_listing honestly', () => {
    expect(src).toMatch(/matched_listing: matchedByReference/);
  });
});

describe('outbound social media is signed at publish, not at draft', () => {
  const social = read(SOCIAL);
  const publish = read(PUBLISH);

  it('is pointed at the real files', () => {
    expect(social).toContain('social_posts');
    expect(publish).toContain('mediaItems');
  });

  it('the draft carries an ID, never a bucket and path', () => {
    expect(social, 'the durable reference is what publishing reads')
      .toMatch(/media_refs/);
    expect(social, 'it must name a row, not a storage location')
      .toMatch(/kind: 'property_photo', id: cover\.id/);
    // THE SECURITY HALF. `social_posts` carries a `FOR ALL` policy for workspace members, so its
    // metadata is user-writable — and the publisher resolves it under the SERVICE ROLE. A
    // {bucket, path} here would let any member name any private object in any bucket, including
    // another tenant's invoice, and be handed a signed URL for it.
    expect(social, 'a raw bucket must not be persisted into user-writable metadata')
      .not.toMatch(/mediaRefs\.push\(\{[^}]*bucket:/);
    expect(social, 'the stored URL must be named as the preview it is')
      .toMatch(/MEDIA_PREVIEW_TTL_SECONDS/);
  });

  it('the publisher resolves the id in the DB, scoped to the post workspace', () => {
    expect(publish, 'publish must read the reference')
      .toMatch(/media_refs/);
    expect(publish, 'only an id may be accepted from user-writable metadata')
      .toMatch(/kind === 'property_photo'/);
    expect(publish, 'the bucket and path must come from the row, not the metadata')
      .toMatch(/from\('property_photos'\)[\s\S]{0,200}storage_path/);
    // The filter that makes a rewritten id useless.
    expect(publish, 'the lookup must be scoped to the post workspace')
      .toMatch(/\.eq\('workspace_id', post\.workspace_id\)/);
    expect(publish, 'it must sign at the point of use, from the DB row')
      .toMatch(/createSignedUrl\(row\.storage_path/);
    // A freshly-signed image must SUPPRESS the stale persisted one rather than being appended
    // next to it, or the post goes out with the broken link attached anyway.
    expect(publish, 'the stale URL must not be used once a fresh one exists')
      .toMatch(/!freshlySigned\.has\('image'\)/);
  });

  it('a reference that cannot be resolved or signed refuses the publish', () => {
    // Falling through to the expired URL is the original defect wearing a retry: the post goes
    // out, the image 403s, and the operator is told it succeeded. A photo from another workspace
    // takes the same branch, which is what keeps the scoping filter meaningful.
    const at = publish.indexOf("from('property_photos')");
    expect(at).toBeGreaterThan(-1);
    const block = publish.slice(at, at + 1600);
    expect(block, 'an unresolvable ref must return, not continue').toMatch(/return jsonResponse\(/);
    expect(block, 'and it must not be reported as a success').toMatch(/success: false/);
  });
});
