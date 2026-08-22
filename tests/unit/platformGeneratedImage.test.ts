/**
 * `isPlatformGeneratedImage` decides whether the image-edit gate (invariant 9b) is SKIPPED.
 * Getting it wrong is not symmetric:
 *   - too narrow  → our own renders pay for a Claude classification on every edit, and are
 *                   refused outright whenever the classifier cannot run (observed 2026-08-22)
 *   - too broad   → the gate switches off for user-supplied images, which is the exact input
 *                   it exists to inspect (credentials, identity documents, financial instruments)
 *
 * The bug it replaces was the narrow kind: a lone `/\/generation-images\/.*\/gen\//` regex that
 * matches only the per-session layout, while the multi-model grid always lands on the legacy
 * `gemini/` prefix because MIVAA calls the edge function with no conversation id.
 */
import { describe, it, expect } from 'vitest';
import {
  isPlatformGeneratedImage,
  GENERATION_OUTPUT_PREFIXES,
} from '../../supabase/functions/_shared/storage-paths.ts';

const BUCKET = 'https://xyz.supabase.co/storage/v1/object/public/generation-images/';

describe('isPlatformGeneratedImage', () => {
  it('recognises the per-session generation layout', () => {
    expect(isPlatformGeneratedImage(`${BUCKET}u/user-1/sessions/conv-1/gen/job.jpg`)).toBe(true);
  });

  it('recognises every legacy generation prefix — the grid only ever produces these', () => {
    // The regression verbatim: a grid tile written by MIVAA, which sends no conversation id.
    expect(isPlatformGeneratedImage(`${BUCKET}gemini/25723117-382f-4757-a241-75cadacb7d93.jpg`)).toBe(true);
    for (const prefix of GENERATION_OUTPUT_PREFIXES) {
      expect(isPlatformGeneratedImage(`${BUCKET}${prefix}/file.jpg`), prefix).toBe(true);
    }
  });

  it('does NOT exempt user uploads that share the bucket', () => {
    // generation-tools uploads the caller's data URL here before handing Replicate a public
    // URL. It is user content in a platform bucket — the single most important non-match.
    expect(isPlatformGeneratedImage(`${BUCKET}reference-images/interior-ref-123.jpg`)).toBe(false);
    // The session layout's OWN upload folder must not match either.
    expect(isPlatformGeneratedImage(`${BUCKET}u/user-1/sessions/conv-1/uploads/passport.jpg`)).toBe(false);
    // Nor a moodboard copy, which can hold anything a user put on a board.
    expect(isPlatformGeneratedImage(`${BUCKET}u/user-1/moodboards/mb-1/file.jpg`)).toBe(false);
  });

  it('does not exempt another bucket, or a lookalike path outside it', () => {
    expect(isPlatformGeneratedImage('https://xyz.supabase.co/storage/v1/object/public/pdf-documents/gemini/x.jpg')).toBe(false);
    expect(isPlatformGeneratedImage('https://evil.example.com/generation-images-fake/gemini/x.jpg')).toBe(false);
  });

  it('is not fooled by a prefix that merely starts with the same letters', () => {
    // `gemini-uploads/` must not match on `gemini`.
    expect(isPlatformGeneratedImage(`${BUCKET}gemini-uploads/x.jpg`)).toBe(false);
  });

  it('ignores signed-URL query strings', () => {
    expect(isPlatformGeneratedImage(`${BUCKET}gemini/x.jpg?token=abc&expires=1`)).toBe(true);
  });

  it('treats a missing url as not-ours, so the gate still runs', () => {
    expect(isPlatformGeneratedImage(undefined)).toBe(false);
    expect(isPlatformGeneratedImage('')).toBe(false);
  });
});
