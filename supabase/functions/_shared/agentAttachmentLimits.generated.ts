// GENERATED MIRROR of src/config/agentAttachmentLimits.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * What ONE agent turn may carry — declared once, for the composer that offers it and the
 * edge function that enforces it.
 *
 * These are a COST GUARD, not a preference. Images and documents become native Anthropic
 * vision/document content blocks with no per-item cap, while the turn fee is flat (partner)
 * or metered only post-hoc (internal) — so an unbounded multimodal payload buys tens of
 * dollars of input tokens for a near-zero charge. agent-chat therefore refuses an oversized
 * turn with 413 BEFORE any model call.
 *
 * WHY IT LIVES HERE. The three numbers used to be `const`s inside agent-chat's request
 * handler, so the only party that knew them was the one refusing. The composer appended
 * attachments with no ceiling of any kind: a user attached 19 PDFs, watched 19 chips appear,
 * pressed send, uploaded every byte, and got back
 * `Agent execution failed: 413 - {"error":"Too many documents attached: 19 (max 6 per turn)."}`.
 * Nothing was wrong with the guard — the surface offering the attachments simply could not
 * see it. Same shape as the toolkit picker offering tools the binder never binds: an offer
 * the enforcer refuses is silent until a user finds it.
 *
 * `checkAgentAttachments` is the ONE predicate. The composer calls it to stop before the
 * upload, the edge calls it to refuse; a second hand-written count comparison is the drift.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — it is byte-mirrored to the edge by
 * `npm run vocab:mirror` (part of `gen:all`), and freshness is enforced by
 * tests/unit/vocabularyMirrors.test.ts.
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

/** Base64 chars → the megabytes a human recognises, for the message. */
function approxMegabytes(chars: number): number {
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
      message: `Attached media too large (~${approxMegabytes(chars)}MB, max ${approxMegabytes(AGENT_MAX_MULTIMODAL_CHARS)}MB per turn).`,
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
