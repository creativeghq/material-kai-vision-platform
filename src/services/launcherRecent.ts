/** "Recent" for the app menus — the last few apps opened from EITHER launcher. */
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
