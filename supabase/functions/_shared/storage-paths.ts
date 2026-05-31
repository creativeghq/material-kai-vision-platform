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
