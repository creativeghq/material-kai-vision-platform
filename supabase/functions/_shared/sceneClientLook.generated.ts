// GENERATED MIRROR of src/config/sceneClientLook.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const CLIENT_LOOKS = ['renders', 'drawn'] as const;
export type ClientLook = typeof CLIENT_LOOKS[number];

export const CLIENT_LOOK_LABELS: Record<ClientLook, string> = {
  renders: 'Live 3D Rooms and All Renders',
  drawn: 'Live 3D Rooms and Photo Mode Pictures',
};

export const RENDER_SOURCES = ['ai', 'photo_mode'] as const;
export type RenderSource = typeof RENDER_SOURCES[number];

/** The pictures a shared walkthrough may show: for `drawn`, only pictures taken of the live rooms themselves. */
export function rendersForLook<T extends { source?: string | null }>(look: string | null | undefined, renders: T[]): T[] {
  return look === 'drawn' ? renders.filter((r) => r.source === 'photo_mode') : renders;
}
