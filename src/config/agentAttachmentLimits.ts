/**
 * What ONE agent turn may carry — declared once, for the composer that offers it and the
 * edge function that enforces it.
 */

/** Images on one turn. They are uploaded to storage first, so this is a count, not bytes. */
export const AGENT_MAX_IMAGES = 12;

/** Readable documents (PDFs Claude reads natively) on one turn. */
export const AGENT_MAX_DOCUMENTS = 6;

/**
 * Base64 characters across every attachment on the turn — roughly 24MB of raw bytes. Images
 * arrive as short storage URLs, so in practice this bounds the documents: six 5MB PDFs are
 * ~40MB of base64 and are refused on size even though the count is legal.
 */
export const AGENT_MAX_MULTIMODAL_CHARS = 32 * 1024 * 1024;

/** Machine code on the 413 body, so a caller can react to WHICH limit it hit. */
export type AgentAttachmentRefusalCode =
  | 'too_many_images'
  | 'too_many_documents'
  | 'attachments_too_large';

export interface AgentAttachmentRefusal {
  code: AgentAttachmentRefusalCode;
  /** The sentence shown to the user, verbatim. The edge puts this in the 413 body's `error`. */
  message: string;
}

/**
 * Base64 chars → the megabytes a human recognises.
 *
 * One decimal on the ACTUAL, whole on the LIMIT, and the actual rounds UP: rounding both to whole
 * megabytes produced `~32MB, max 32MB per turn`, which contradicts itself and tells the reader
 * nothing they can act on — and one decimal alone is not enough, because a turn a kilobyte over
 * still reads `32.0MB, max 32MB`. A turn is only ever refused for being OVER, so the number shown
 * must be over. Ceiling at one decimal guarantees it for any whole-megabyte limit.
 */
function actualMegabytes(chars: number): string {
  return (Math.ceil((chars / 1024 / 1024) * 10) / 10).toFixed(1);
}
function limitMegabytes(chars: number): number {
  return Math.round(chars / 1024 / 1024);
}

/**
 * The one check. Pass whatever the turn is carrying; `null` means it may run.
 *
 * Takes the arrays rather than counts so the byte total is derived here too — a caller that
 * measured its own bytes would be a second derivation of the same limit.
 */
export function checkAgentAttachments(turn: {
  images?: readonly string[];
  documents?: readonly string[];
}): AgentAttachmentRefusal | null {
  const images = Array.isArray(turn.images) ? turn.images : [];
  const documents = Array.isArray(turn.documents) ? turn.documents : [];

  if (images.length > AGENT_MAX_IMAGES) {
    return {
      code: 'too_many_images',
      message: `Too many images attached: ${images.length} (max ${AGENT_MAX_IMAGES} per turn).`,
    };
  }
  if (documents.length > AGENT_MAX_DOCUMENTS) {
    return {
      code: 'too_many_documents',
      message: `Too many documents attached: ${documents.length} (max ${AGENT_MAX_DOCUMENTS} per turn).`,
    };
  }
  const chars = [...images, ...documents].reduce(
    (n: number, s: unknown) => n + (typeof s === 'string' ? s.length : 0),
    0,
  );
  if (chars > AGENT_MAX_MULTIMODAL_CHARS) {
    return {
      code: 'attachments_too_large',
      message: `Attached media too large (~${actualMegabytes(chars)}MB, max ${limitMegabytes(AGENT_MAX_MULTIMODAL_CHARS)}MB per turn).`,
    };
  }
  return null;
}

/**
 * How many more of a kind the composer may accept, and what to say about the rest.
 *
 * The composer clamps with this so the user is told at ATTACH time — before the read, before
 * the upload, while the fix is still "attach fewer" rather than "your turn was refused".
 */
export function attachmentRoom(current: number, incoming: number, limit: number): {
  accepted: number;
  rejected: number;
} {
  const accepted = Math.max(0, Math.min(incoming, limit - current));
  return { accepted, rejected: incoming - accepted };
}

/** How many of `incoming` fit under the byte ceiling, in order, given what is already attached. */
export function attachmentsWithinBytes(
  existing: readonly string[],
  incoming: readonly string[],
): { accepted: number; rejected: number } {
  let used = existing.reduce((n, s) => n + (typeof s === 'string' ? s.length : 0), 0);
  let accepted = 0;
  for (const item of incoming) {
    const size = typeof item === 'string' ? item.length : 0;
    if (used + size > AGENT_MAX_MULTIMODAL_CHARS) break;
    used += size;
    accepted++;
  }
  return { accepted, rejected: incoming.length - accepted };
}
