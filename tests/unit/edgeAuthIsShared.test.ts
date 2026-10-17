/** An edge function identifies its caller through `authenticate()`; a bare `auth.getUser()` refuses every kai_ key. */
import { describe, expect, it } from 'vitest';
import { sourceIndex } from '../helpers/sourceIndex';

const INDEX = sourceIndex({
  roots: ['supabase/functions'],
  filter: (p) => p !== 'supabase/functions/_shared/auth.ts',
});

const SESSION_ONLY: Record<string, string> = {
  'supabase/functions/health-check/index.ts':
    'Operator probe on a user-scoped client; on demand it wakes the scale-to-zero GPU containers.',
  'supabase/functions/role-upgrade-requests/index.ts':
    'A person applying for a global account tier, and its admin review — not something a machine key files.',
  'supabase/functions/generate-purchase-sheet-pdf/index.ts':
    'Every read runs through the caller-scoped client, so RLS is the tenancy boundary.',
  'supabase/functions/scan-receipt/index.ts':
    'Four of five actions read through the caller-scoped client and call RLS-bound inbound_doc_* RPCs.',
  'supabase/functions/trip-expense-ops/index.ts':
    'Report-owner / finance-manager rules are enforced by RLS on the caller-scoped client.',
};

const callers = (): string[] =>
  INDEX.stripped().filter(([, src]) => /\.auth\.getUser\(/.test(src)).map(([abs]) => INDEX.paths[INDEX.files.indexOf(abs)]);

describe('edge functions authenticate through the shared helper', () => {
  it('no function verifies its caller with a bare auth.getUser() outside the session-only list', () => {
    const offenders = callers().filter((p) => !SESSION_ONLY[p]);
    expect(offenders, 'Use authenticate(req, { requireUser: true }) from _shared/auth.ts so kai_ keys work too').toEqual([]);
  });

  it('every session-only entry still calls getUser (shrink-only)', () => {
    const live = new Set(callers());
    expect(Object.keys(SESSION_ONLY).filter((p) => !live.has(p))).toEqual([]);
  });
});
