/** `?tab=` deep-link resolution for the CRM record pages (company + contact). */
const TAB_ALIASES: Record<string, string> = {
  equipment:  'warranties',
  warranties: 'work',
  projects:   'work',
  property:   'work',
};

/**
 * Resolve a raw `?tab=` value to the tab this page actually renders.
 *
 * Follows the alias chain to a fixed point, because a tab can be renamed twice — `equipment` was
 * renamed to `warranties` and `warranties` then merged into `work`, so a link sent before the
 * first rename has two hops to make. Bounded, so a mistaken cycle in the map cannot hang the page.
 */
export function resolveRecordTab(raw: string | null | undefined, fallback = 'activity'): string {
  let v = (raw ?? '').trim();
  if (!v) return fallback;
  for (let hops = 0; hops < 8 && TAB_ALIASES[v]; hops++) v = TAB_ALIASES[v];
  return v;
}
