/**
 * Canonical storage-path builder for the `generation-images` bucket (client mirror
 * of supabase/functions/_shared/storage-paths.ts — keep the two in sync).
 *
 * Post-2026-05-31 reorg: everything a chat creates lives under one per-session
 * prefix so deleting the chat = deleting one prefix.
 *
 * Layout:
 *   u/{user_id}/sessions/{conversation_id}/gen/{filename}      AI generations
 *   u/{user_id}/sessions/{conversation_id}/uploads/{filename}  user-attached chat images
 *   u/{user_id}/moodboards/{moodboard_id}/{filename}           copy-on-promote target
 *
 * Safe fallback: when conversation context is missing we use the legacy flat
 * prefix, which the orphan cron's grace sweep still owns.
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
 * Returns the per-session key when both ids are present, else the legacy flat
 * prefix (`${legacyPrefix}/${filename}`). `kind` defaults to 'uploads' since the
 * client uploads user inputs; pass 'gen' for client-side generation outputs.
 */
export function resolveUploadPath(
  ctx: Partial<SessionPathCtx>,
  legacyPrefix: string,
  filename: string,
  kind: 'gen' | 'uploads' = 'uploads',
): string {
  if (ctx.userId && ctx.conversationId) {
    return sessionPath({ userId: ctx.userId, conversationId: ctx.conversationId }, kind, filename);
  }
  return `${legacyPrefix}/${filename}`;
}

/** Extract the storage object path from a generation-images public URL. */
export function generationPathFromUrl(publicUrl: string): string | null {
  const marker = '/generation-images/';
  const idx = publicUrl.indexOf(marker);
  return idx >= 0 ? publicUrl.slice(idx + marker.length).split('?')[0] : null;
}
