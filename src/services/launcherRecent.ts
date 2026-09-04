/**
 * "Recent" for the app menus — the last few apps opened from EITHER launcher.
 *
 * One key, read and written by both the desktop Apps popover and the mobile Apps panel, so the two
 * surfaces on a device agree about what "recent" means. When the mobile menu was a flat grid it had
 * no recent list at all; giving it a private one would have meant the app you opened from the
 * laptop's launcher a minute ago is missing from the phone's, which reads as the list being broken.
 *
 * Plain localStorage: it is a per-device convenience, not a record. Every read is guarded because
 * private mode and quota errors throw from the accessor itself, and a menu that cannot remember is
 * still a menu.
 */
const RECENT_KEY = 'launcher.recent.v1';
const RECENT_LIMIT = 4;

export function readRecentApps(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Moves `id` to the front and returns the new list. */
export function pushRecentApp(id: string): string[] {
  const next = [id, ...readRecentApps().filter((x) => x !== id)].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — the list is a convenience */
  }
  return next;
}
