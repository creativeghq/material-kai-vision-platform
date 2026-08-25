/**
 * The character avatar shown for a contact whose photo we cannot get.
 *
 * WhatsApp gives a business no customer profile picture — measured 2026-08-25 across every
 * endpoint that declares the field: `participantPicture` null on all 100 conversations,
 * `avatarUrl` absent from all 516 contact records. So this is not a placeholder waiting for a
 * real photo. It is the avatar, permanently.
 *
 * ── A cast, not a render per person ──
 * The characters are generated ONCE by `messaging-api generate-avatar-cast` (Gemini, 3D cartoon
 * style) into `generation-images/avatars/cast/NNN.png`, and each contact is assigned one by a
 * hash of their id. 516 contacts would otherwise be 516 generations to bill, wait for and store,
 * and the style would drift between calls. This way the cost is a few dollars once, assignment is
 * instant, and a contact keeps the same face forever.
 *
 * A hand-drawn SVG version was tried first and thrown away: flat vector shapes cannot reach the
 * soft-shaded 3D look this is for, and it read as a different product entirely.
 *
 * ── Assigned from the ID, never the name ──
 * The seed is the contact's stable id, so the character is ASSIGNED — the way a game assigns a
 * starting avatar — rather than inferred. Picking a face from "Kostas" or from a +86 number would
 * mean guessing someone's sex and ethnicity and then showing that guess to staff beside their
 * name, where it reads as a photograph. A name is also edited and re-capitalised, and seeding on
 * it would hand people a new face every time their record is tidied up.
 */

const BUCKET = 'generation-images';
const CAST_PREFIX = 'avatars/cast';

/**
 * How many characters exist in the cast.
 *
 * Must match what `generate-avatar-cast` has actually rendered. Set too high, some contacts point
 * at a 404 — an avatar that silently fails to load, which is the exact state this feature exists
 * to end.
 */
export const CAST_SIZE = 24;

/** FNV-1a: small, stable across engines, well spread for picking from a short list. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Which character in the cast this seed gets. Stable for the life of the contact. */
export function castSlotFor(seed: string | null | undefined): number {
  return hash(seed || '?') % CAST_SIZE;
}

/** The storage object for a seed's character — bucket + path, never a baked-in URL. */
export function castObjectFor(seed: string | null | undefined): {
  storage_bucket: string;
  storage_object_path: string;
} {
  return {
    storage_bucket: BUCKET,
    storage_object_path: `${CAST_PREFIX}/${String(castSlotFor(seed)).padStart(3, '0')}.png`,
  };
}

/**
 * A ready-to-render URL for a seed's character.
 *
 * `generation-images` is public-read, so this is a plain public URL rather than a signed one. It
 * never expires, which matters because the same face renders on every message row — a signed URL
 * would have to be re-minted constantly and would break the moment one expired mid-scroll.
 *
 * The storage base comes from the caller so this module needs no Supabase client and can be
 * tested without one.
 */
export function castAvatarUrl(seed: string | null | undefined, storageBaseUrl: string): string {
  const { storage_bucket, storage_object_path } = castObjectFor(seed);
  return `${storageBaseUrl.replace(/\/$/, '')}/object/public/${storage_bucket}/${storage_object_path}`;
}
