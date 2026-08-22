/**
 * Canonical storage-path builder for the `generation-images` bucket.
 *
 * Post-2026-05-31 reorg: everything a chat creates lives under one per-session
 * prefix so deleting the chat = deleting one prefix. See
 * `.claude/plans/silly-growing-fairy.md` and the CLAUDE.md storage section.
 *
 * Layout:
 *   u/{user_id}/sessions/{conversation_id}/gen/{filename}      AI generations
 *   u/{user_id}/sessions/{conversation_id}/uploads/{filename}  user-attached chat images
 *   u/{user_id}/moodboards/{moodboard_id}/{filename}           copy-on-promote target
 *
 * Safe partial rollout: when conversation context is missing (direct API,
 * board regen, not-yet-updated caller) we fall back to the legacy flat prefix,
 * which the orphan cron's grace sweep still owns. A missing conversation_id is
 * never an error — it just lands in the legacy layout.
 */

export interface SessionPathCtx {
  userId: string;
  conversationId: string;
}

/** Per-session key. `kind` = 'gen' for outputs, 'uploads' for user inputs. */
export function sessionPath(
  ctx: SessionPathCtx,
  kind: 'gen' | 'uploads',
  filename: string,
): string {
  return `u/${ctx.userId}/sessions/${ctx.conversationId}/${kind}/${filename}`;
}

/** Moodboard copy-on-promote key (lives OUTSIDE the session prefix so it survives chat deletion). */
export function moodboardPath(
  userId: string,
  moodboardId: string,
  filename: string,
): string {
  return `u/${userId}/moodboards/${moodboardId}/${filename}`;
}

/**
 * Single decision point used by every generation path. Returns the per-session
 * key when both ids are present, else the legacy flat prefix (`${legacyPrefix}/${filename}`).
 */
export function resolveOutputPath(
  ctx: Partial<SessionPathCtx>,
  legacyPrefix: string,
  filename: string,
): string {
  if (ctx.userId && ctx.conversationId) {
    return sessionPath({ userId: ctx.userId, conversationId: ctx.conversationId }, 'gen', filename);
  }
  return `${legacyPrefix}/${filename}`;
}

/**
 * The legacy flat prefixes that `resolveOutputPath` falls back to when a caller has no
 * conversation context. Each one is written ONLY by the generation function named beside it,
 * so a URL under one of these is, by construction, an image this platform produced.
 *
 * `reference-images/` is deliberately ABSENT: it lives in the same bucket but holds images the
 * USER supplied (generation-tools uploads the caller's data-URL there before handing Replicate a
 * public URL). Exempting it would switch the image-edit gate off for exactly the input the gate
 * exists to inspect.
 */
export const GENERATION_OUTPUT_PREFIXES = [
  'gemini',           // generate-interior-gemini
  'videos/v2',        // generate-interior-video-v2
  'region-edit',      // generate-region-edit
  'virtual-staging',  // generate-virtual-staging
] as const;

/**
 * Did THIS platform generate the image at `url`?
 *
 * Used by the image-edit gate to skip re-classifying our own renders. It was previously a lone
 * regex, `/\/generation-images\/.*\/gen\//`, which only matches the SESSION layout — and the
 * multi-model grid never produces that layout. MIVAA calls generate-interior-gemini with no
 * conversation id, so every grid tile lands on the legacy `gemini/` prefix instead, was read as
 * third-party content, and paid for a full Claude classification on every edit. Worse, the gate
 * fails closed: during a Supabase blip on 2026-08-22 that misclassification turned into a hard
 * refusal to edit our own render.
 *
 * Deliberately an ALLOWLIST of paths we write, never "anything in the generation bucket" — that
 * bucket also holds user uploads.
 */
export function isPlatformGeneratedImage(url: string | undefined): boolean {
  if (!url) return false;
  const marker = '/generation-images/';
  const i = url.indexOf(marker);
  if (i === -1) return false;
  // Drop any query string (signed-URL params) before matching.
  const key = url.slice(i + marker.length).split('?')[0];

  // Session layout: u/{user}/sessions/{conversation}/gen/{file}. `uploads/` is the user's own
  // attachment and must NOT match.
  if (/^u\/[^/]+\/sessions\/[^/]+\/gen\//.test(key)) return true;

  return GENERATION_OUTPUT_PREFIXES.some((p) => key.startsWith(`${p}/`));
}
