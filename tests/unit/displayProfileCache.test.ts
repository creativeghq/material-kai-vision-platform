/**
 * The top bar's account name. Its cache was emptied on EVERY auth event, so a token refresh — or
 * the SIGNED_IN supabase-js re-emits when a tab regains focus — dropped the name with nothing left
 * to refetch it, and the label sat on "Profile" until a click mounted a second `UserAvatar` whose
 * own `useDisplayProfile` refilled the cache for everyone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { strippedSource } from '../helpers/sourceIndex';

type Row = { user_id: string; full_name: string | null; avatar_url: string | null; email: string | null };

const h = vi.hoisted(() => ({
  onAuth: null as null | ((event: string, session: unknown) => void),
  session: null as null | { user: { id: string } },
  rows: new Map<string, Row>(),
  rpcCalls: [] as string[][],
  hold: null as null | Promise<void>,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        h.onAuth = cb;
        return { data: { subscription: { unsubscribe() { return; } } } };
      },
      getSession: async () => ({ data: { session: h.session } }),
    },
    rpc: async (_fn: string, args: { p_user_ids: string[] }) => {
      h.rpcCalls.push(args.p_user_ids);
      if (h.hold) await h.hold;
      return { data: args.p_user_ids.map((id) => h.rows.get(id)).filter(Boolean), error: null };
    },
  },
}));

const {
  fetchDisplayProfiles,
  getCachedDisplayProfile,
} = await import('@/services/displayProfilesService');

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';

const signedIn = (id: string) => ({ user: { id } });

async function withAliceCached(): Promise<void> {
  h.session = signedIn(ALICE);
  h.onAuth?.('INITIAL_SESSION', h.session);
  await fetchDisplayProfiles([ALICE]);
  expect(getCachedDisplayProfile(ALICE)?.fullName).toBe('Alice Aleph');
}

beforeEach(() => {
  h.rows.set(ALICE, { user_id: ALICE, full_name: 'Alice Aleph', avatar_url: null, email: 'alice@example.test' });
  h.rows.set(BOB, { user_id: BOB, full_name: 'Bob Beth', avatar_url: null, email: 'bob@example.test' });
  h.rpcCalls.length = 0;
  h.hold = null;
  h.onAuth?.('SIGNED_OUT', null);
});

describe('display profile cache — a token refresh is not a new person', () => {
  it('keeps the resolved name across the events that carry the SAME user', async () => {
    await withAliceCached();

    for (const event of ['TOKEN_REFRESHED', 'SIGNED_IN', 'USER_UPDATED', 'INITIAL_SESSION']) {
      h.onAuth?.(event, signedIn(ALICE));
      expect(
        getCachedDisplayProfile(ALICE)?.fullName,
        `${event} carries the same user, so the top bar must still know its name`,
      ).toBe('Alice Aleph');
    }
  });

  it('empties the cache when the identity actually changes', async () => {
    await withAliceCached();

    h.session = signedIn(BOB);
    h.onAuth?.('SIGNED_IN', h.session);
    expect(getCachedDisplayProfile(ALICE)).toBeUndefined();

    await fetchDisplayProfiles([BOB]);
    expect(getCachedDisplayProfile(BOB)?.fullName).toBe('Bob Beth');
  });

  it('empties the cache on sign-out', async () => {
    await withAliceCached();

    h.session = null;
    h.onAuth?.('SIGNED_OUT', null);
    expect(getCachedDisplayProfile(ALICE)).toBeUndefined();
  });

  it('drops a lookup that was answered under the previous person', async () => {
    h.session = signedIn(ALICE);
    h.onAuth?.('SIGNED_IN', h.session);

    let release!: () => void;
    h.hold = new Promise<void>((resolve) => { release = resolve; });
    const inFlight = fetchDisplayProfiles([ALICE]);
    // Past `pending.clear()` and into the RPC, where a clear can no longer reach the pending write.
    await vi.waitFor(() => expect(h.rpcCalls.length).toBe(1));

    h.session = signedIn(BOB);
    h.onAuth?.('SIGNED_IN', h.session);
    release();
    await inFlight;

    expect(getCachedDisplayProfile(ALICE), "answered under Alice's JWT, read by Bob").toBeUndefined();
  });

  it('leaves a cleared id ABSENT, never cached as a person with no name', async () => {
    await withAliceCached();

    h.session = signedIn(BOB);
    h.onAuth?.('SIGNED_IN', h.session);
    expect(getCachedDisplayProfile(ALICE)).not.toBeNull();
    expect(getCachedDisplayProfile(ALICE)).toBeUndefined();
  });
});

describe('useDisplayProfile — an absent id refills itself', () => {
  const src = strippedSource('src/hooks/useDisplayProfile.ts');
  const bound = /const\s+(\w+)\s*=\s*useSyncExternalStore\(/.exec(src)?.[1] ?? '';
  const effect = src.slice(src.indexOf('useEffect('));
  const deps = (/\}, \[([^\]]*)\]\)/.exec(effect)?.[1] ?? '').split(',').map((d) => d.trim());

  it('reads the raw cache entry rather than collapsing absent into null', () => {
    expect(bound, 'the hook must bind the store snapshot to a name the effect can key on').toBeTruthy();
    expect(
      src,
      'collapsing `undefined` to `null` in the snapshot hides "never looked up" from the effect',
    ).not.toMatch(/getCachedDisplayProfile\([^)]*\)\s*\?\?\s*null/);
  });

  it('re-requests on an absent entry, and keys the effect on it', () => {
    expect(
      src,
      'only an ABSENT entry may be re-requested, or the effect loops on a real "no row"',
    ).toContain(`${bound} === undefined`);
    expect(
      deps,
      'keyed on userId alone the effect never re-runs after a clear — which is the bug',
    ).toContain(bound);
  });
});
