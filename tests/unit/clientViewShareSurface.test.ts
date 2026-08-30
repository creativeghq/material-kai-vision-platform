/**
 * The client-view share link is an ANONYMOUS surface that both reads private files and accepts a
 * write. Two things were wrong with it.
 *
 * ── 1. Snag photos pointed at a bucket the files are not in ──────────────────────────────
 * #358 PQ-9 moved snag and site-log photos out of the public `generation-images` bucket into the
 * PRIVATE `pdf-documents` under `project-site/…`, read through signed URLs — because a defect photo
 * of the inside of a client's home was openable by anyone holding the URL. Every internal reader
 * moved with it. `moodboard-sheet-share` — the CLIENT-facing handover list — kept building
 * `getPublicUrl()` against the old bucket, so it emitted URLs for a file that is not there. Not a
 * leak any more: just every snag photo on a client view silently broken, with the list still
 * rendering around the gaps.
 *
 * ── 2. The anonymous feedback write had no rate limit ────────────────────────────────────
 * A share link is MEANT to be forwarded; it travels by email and group chat, and possession of it
 * says nothing about who is holding it. Every accepted feedback row also emits
 * `client_view_feedback_received`, which notifies and can email the deliverable's owner. So one
 * leaked link was an unbounded write into somebody's storage and inbox, from a URL they handed to
 * a client themselves.
 *
 * The budget is counted on `client_view_feedback` itself — no second store to keep consistent —
 * with a per-view cap (bounds the flood at all) and a per-caller cap keyed on a HASHED IP (targets
 * the one abusing it without locking out an honest client on the same link). Both counts fail
 * closed, per tests/unit/rateLimitFailsClosed.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SHARE = 'supabase/functions/moodboard-sheet-share/index.ts';
const src = readFileSync(join(ROOT, SHARE), 'utf8');

describe('client-view share — private files are signed, not linked', () => {
  it('is pointed at the real file', () => {
    expect(src).toContain('client_view_feedback');
    expect(src, 'the handover snag list is what this guards').toContain('project_snags');
  });

  it('signs snag photos from the private bucket they actually live in', () => {
    expect(src, 'site photos live in pdf-documents since #358 PQ-9')
      .toMatch(/SITE_PHOTO_BUCKET = 'pdf-documents'/);
    expect(src, 'they must be signed, in a batch, not linked')
      .toMatch(/createSignedUrls\(paths, SITE_PHOTO_TTL_SECONDS\)/);
  });

  it('never builds a public URL for a site photo', () => {
    // The precise defect: `getPublicUrl(p)` on `generation-images` for a `photo_paths` entry.
    expect(src, 'a public URL in the wrong bucket is a broken image, and was one for months')
      .not.toMatch(/from\('generation-images'\)\.getPublicUrl/);
  });

  it('drops a photo it could not sign rather than emitting a dead URL', () => {
    expect(src).toMatch(/photo_urls: \(s\.photo_paths \|\| \[\]\)\.map\(\(p: string\) => snagPhotoUrls\[p\]\)\.filter\(Boolean\)/);
  });
});

describe('client-view share — the anonymous write is bounded', () => {
  it('checks a budget before accepting feedback, and before the flow emit', () => {
    const guardAt = src.indexOf('checkFeedbackBudget(supabase, req, view.id)');
    const insertAt = src.indexOf("from('client_view_feedback').insert(");
    const emitAt = src.indexOf("emitFlowEvent('client_view_feedback_received'");
    expect(guardAt, 'the budget check must exist').toBeGreaterThan(-1);
    expect(insertAt, 'the insert must exist').toBeGreaterThan(-1);
    // ORDER is the assertion: a check after the side effect is not a check, and the notification
    // is half the reason the limit exists.
    expect(guardAt).toBeLessThan(insertAt);
    expect(guardAt).toBeLessThan(emitAt);
  });

  it('bounds the view AND the individual caller', () => {
    expect(src).toMatch(/FEEDBACK_HOURLY_LIMIT/);
    expect(src, 'a per-caller cap is what stops one flood locking out the real client')
      .toMatch(/FEEDBACK_PER_CALLER_HOURLY_LIMIT/);
  });

  it('stores a HASH of the trusted hop, never the raw address', () => {
    expect(src, 'the IP must come from the trusted proxy hop, not a client header')
      .toMatch(/getTrustedClientIp\(req\)/);
    expect(src, 'and it must be hashed before it is stored')
      .toMatch(/crypto\.subtle\.digest\('SHA-256'/);
    expect(src, 'the row takes the hash, not the address')
      .toMatch(/ip_hash: budget\.ipHash/);
  });

  it('both counts fail closed', () => {
    // An unanswerable count read as "nobody has written anything" lifts the limit at exactly the
    // moment it is needed — the shape rateLimitFailsClosed.test.ts exists for.
    const fn = src.slice(src.indexOf('async function checkFeedbackBudget'), src.indexOf('Deno.serve('));
    expect(fn, 'the per-view count must bind its error').toMatch(/count: viewCount, error: viewErr/);
    expect(fn, 'and refuse on it').toMatch(/if \(viewErr\)[\s\S]{0,400}429\)/);
    expect(fn, 'the per-caller count must bind its error').toMatch(/count: mine, error: mineErr/);
    expect(fn, 'and refuse on it').toMatch(/if \(mineErr\)[\s\S]{0,400}429\)/);
  });
});
