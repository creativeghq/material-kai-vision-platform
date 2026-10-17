/** Canonical storage-path builder for the `generation-images` bucket. */

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
 */
export const GENERATION_OUTPUT_PREFIXES = [
  'gemini',           // generate-interior-gemini
  'videos/v2',        // generate-interior-video-v2
  'region-edit',      // generate-region-edit
  'virtual-staging',  // generate-virtual-staging
] as const;

function hostOf(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}

/** Did THIS platform generate the image at `url`? */
export function isPlatformGeneratedImage(
  url: string | undefined,
  storageHost: string = hostOf(
    (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get('SUPABASE_URL') ?? '',
  ),
): boolean {
  if (!url || !storageHost) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  // Our own storage host and object path only: a marker anywhere else in a URL proves nothing.
  if (parsed.protocol !== 'https:' || parsed.host !== storageHost) return false;
  const m = parsed.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/generation-images\/(.+)$/);
  if (!m) return false;
  let key: string;
  try { key = decodeURIComponent(m[1]); } catch { return false; }
  if (key.split('/').some((seg) => seg === '..' || seg === '.')) return false;

  // Session layout: u/{user}/sessions/{conversation}/gen/{file}. `uploads/` is the user's own
  // attachment and must NOT match.
  if (/^u\/[^/]+\/sessions\/[^/]+\/gen\//.test(key)) return true;

  return GENERATION_OUTPUT_PREFIXES.some((p) => key.startsWith(`${p}/`));
}
