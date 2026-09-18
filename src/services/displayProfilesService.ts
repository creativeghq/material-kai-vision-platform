import { supabase } from '@/integrations/supabase/client';

export interface DisplayProfile {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  email: string | null;
}

interface DisplayProfileRow {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
}

const cache = new Map<string, DisplayProfile | null>();
const subscribers = new Set<() => void>();
const pending = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHUNK = 200;

// Names and emails resolved as one person must not be rendered to the next one in the same tab.
supabase.auth.onAuthStateChange(() => {
  cache.clear();
  pending.clear();
  for (const fn of subscribers) fn();
});

export function subscribeDisplayProfiles(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function getCachedDisplayProfile(userId: string): DisplayProfile | null | undefined {
  return cache.get(userId);
}

export function primeDisplayProfile(
  userId: string,
  patch: Partial<Omit<DisplayProfile, 'userId'>>,
): void {
  const current = cache.get(userId) ?? null;
  cache.set(userId, {
    userId,
    fullName: patch.fullName ?? current?.fullName ?? null,
    avatarUrl: patch.avatarUrl ?? current?.avatarUrl ?? null,
    email: patch.email ?? current?.email ?? null,
  });
  for (const fn of subscribers) fn();
  if (!current) requestDisplayProfiles([userId], { force: true });
}

async function flush(): Promise<void> {
  const ids = [...pending];
  pending.clear();
  if (ids.length === 0) return;

  try {
    // The RPC is granted to `authenticated` only, so signed out every call is a 42501.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      for (const id of ids) if (!cache.has(id)) cache.set(id, null);
      return;
    }

    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const { data, error } = await supabase.rpc('get_display_profiles', { p_user_ids: slice });
      if (error) {
        console.warn('[displayProfiles] lookup failed; leaving these ids unresolved rather than caching them as absent', error.message);
        continue;
      }
      for (const id of slice) cache.set(id, null);
      for (const row of (data ?? []) as DisplayProfileRow[]) {
        cache.set(row.user_id, {
          userId: row.user_id,
          fullName: row.full_name,
          avatarUrl: row.avatar_url,
          email: row.email,
        });
      }
    }
  } catch (err) {
    // Never reject: one rejection would poison the shared chain for the whole session.
    console.warn('[displayProfiles] lookup threw', err);
  } finally {
    for (const fn of subscribers) fn();
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushing = (flushing ?? Promise.resolve()).then(flush);
  }, 25);
}

export function requestDisplayProfiles(
  userIds: Array<string | null | undefined>,
  opts?: { force?: boolean },
): void {
  let queued = false;
  for (const id of userIds) {
    if (!id || !UUID_RE.test(id)) continue;
    if (!opts?.force && cache.has(id)) continue;
    if (pending.has(id)) continue;
    pending.add(id);
    queued = true;
  }
  if (queued) scheduleFlush();
}

export async function fetchDisplayProfiles(userIds: string[]): Promise<DisplayProfile[]> {
  const wanted = userIds.filter((id) => UUID_RE.test(id));
  for (const id of wanted) if (!cache.has(id)) pending.add(id);
  if (pending.size > 0) {
    flushing = (flushing ?? Promise.resolve()).then(flush);
    await flushing;
  }
  return wanted
    .map((id) => cache.get(id) ?? null)
    .filter((p): p is DisplayProfile => p !== null);
}
