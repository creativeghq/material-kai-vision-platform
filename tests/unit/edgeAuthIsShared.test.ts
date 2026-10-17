import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
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

const KEY_EXCLUDED_BY_HAND: Record<string, string> = {
  'supabase/functions/agent-chat/index.ts': 'Mail tools gate on userJwt (set only for level user); model override on auth.level === user.',
  'supabase/functions/agent-eval/index.ts': 'The operator branch is inside auth.level === user.',
  'supabase/functions/hr-api/expansion.ts': 'Receives viaApiKey from hr-api/index.ts and skips the operator test for a key.',
};

describe('a kai_ key never passes a platform-operator gate', () => {
  const operatorCallers = (): string[] => INDEX.stripped()
    .filter(([, src]) => /[^.\w]isPlatformOperator\(/.test(src))
    .map(([abs]) => INDEX.paths[INDEX.files.indexOf(abs)]);

  it('request-level operator checks go through callerIsPlatformOperator(auth)', () => {
    const offenders = operatorCallers().filter((p) => !KEY_EXCLUDED_BY_HAND[p]);
    expect(offenders, 'isPlatformOperator(userId) cannot see that the caller is a key — use callerIsPlatformOperator(auth)').toEqual([]);
  });

  it('every hand-excluded entry still calls isPlatformOperator (shrink-only)', () => {
    const live = new Set(operatorCallers());
    expect(Object.keys(KEY_EXCLUDED_BY_HAND).filter((p) => !live.has(p))).toEqual([]);
  });
});

const KEY_REFUSED: Record<string, string> = {
  'reset-platform': 'Operator only (callerIsPlatformOperator).',
  'platform-secrets-admin': 'Operator only (callerIsPlatformOperator).',
  'gmail-api': 'Operator only (callerIsPlatformOperator).',
  'agent-eval': 'The user branch requires auth.level === user.',
};

describe('the Swagger spec says which functions take a kai_ key', () => {
  const spec = JSON.parse(readFileSync('scripts/edge-endpoints.json', 'utf8')) as Array<{ name: string; security?: string[] }>;
  const acceptsKey = (fn: string): boolean => INDEX.stripped()
    .some(([abs, src]) => INDEX.paths[INDEX.files.indexOf(abs)].startsWith(`supabase/functions/${fn}/`)
      && /\bauthenticate(Caller)?\(\s*req/.test(src));

  it('a user-callable function declares apiKeyPartner exactly when its code accepts one', () => {
    const drift = spec
      .filter((e) => (e.security ?? []).includes('supabaseJwt'))
      .filter((e) => (acceptsKey(e.name) && !KEY_REFUSED[e.name]) !== (e.security ?? []).includes('apiKeyPartner'))
      .map((e) => e.name);
    expect(drift, 'Fix `security` in scripts/edge-endpoints.json, then npm run openapi:edge').toEqual([]);
  });
});
