/** ONE slot convention for the interior image modes. */

/** The material / inspiration / tile reference. Never the thing being edited. */
export const SLOT_REFERENCE = 0;
/** The user's own photo — the one whose pixels must survive. */
export const SLOT_BASE = 1;

export interface ResolvedImageSlots {
  /** Index of the photo being edited, or -1 when nothing was attached. */
  baseIndex: number;
  /** Index of the material/style reference, or -1 when there is only one image. */
  referenceIndex: number;
}

export interface SlotOverrides {
  /** 1-BASED index, as the model counts the images it was shown. */
  baseImageIndex?: number | null;
  /** 1-BASED index, as the model counts the images it was shown. */
  referenceImageIndex?: number | null;
}

/**
 * Resolve which attachment is the base photo and which is the reference.
 *
 * The overrides are 1-based because that is how the model refers to what it was shown ("Image 2 is
 * the base photograph" — which the agent wrote in its prompt text, where nothing could read it).
 * An override outside the range is IGNORED rather than clamped: clamping silently edits a
 * different image, which is the failure this whole module exists to prevent.
 */
export function resolveImageSlots(imageCount: number, overrides: SlotOverrides = {}): ResolvedImageSlots {
  if (!Number.isFinite(imageCount) || imageCount <= 0) {
    return { baseIndex: -1, referenceIndex: -1 };
  }

  const zeroBased = (n: number | null | undefined): number | null =>
    typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= imageCount ? n - 1 : null;

  const pinnedBase = zeroBased(overrides.baseImageIndex);
  const pinnedReference = zeroBased(overrides.referenceImageIndex);

  if (imageCount === 1) {
    // One image is the photo, whatever it was called. A lone image pinned as the "reference"
    // still has to be the base — there is nothing else to edit.
    return { baseIndex: 0, referenceIndex: -1 };
  }

  // Each default gives way to the other side's pin. Pinning ONE slot has to move the other, or
  // the override reintroduces the bug it exists to fix: "the tile is image 2" with the default
  // base also at 2 would edit the tile — exactly what went wrong in the first place, reached
  // through the fix.
  const baseIndex = pinnedBase ?? (pinnedReference === SLOT_BASE ? SLOT_REFERENCE : SLOT_BASE);
  const referenceIndex = pinnedReference ?? (baseIndex === SLOT_REFERENCE ? SLOT_BASE : SLOT_REFERENCE);

  // Both pinned to the same image is a contradiction, and only the caller can mean it. The base
  // wins: passing one photo twice tells the model to copy a style off itself.
  return {
    baseIndex,
    referenceIndex: referenceIndex === baseIndex ? -1 : referenceIndex,
  };
}
