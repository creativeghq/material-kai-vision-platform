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

const CALLER_TOKEN_REVIEWED: Record<string, string> = {
  'finance-send-invoice-email': 'Forwards to finance-invoice-pdf, an edge function that authenticates the key itself.',
  'xml-import-orchestrator': 'Forwards the caller to MIVAA only when auth.level === user; a key sends the service key.',
  'myaade-rgwspublic2': 'The caller-scoped client serves verify-reseller-application, which refuses non-user callers.',
  'mivaa-gateway': 'Job status, uploads and /api/rag refuse a key before the caller header is forwarded.',
};

const CALLER_TOKEN = [
  /global:\s*\{\s*headers:\s*\{\s*Authorization/g,
  /['"]?Authorization['"]?\s*:\s*(callerAuth|forwardedAuth|authHeader|callerAuthHeader|forwardedAuthHeader|req\.headers\.get)/g,
];

const usesRawCallerToken = (src: string): boolean => CALLER_TOKEN.some((re) => [...src.matchAll(re)]
  .some((m) => !/supabaseAsUser\s*\?\?[\s\S]{0,260}$/.test(src.slice(Math.max(0, m.index! - 300), m.index!))));

describe('a kai_ key is accepted only where the spec says, and works past the door', () => {
  const spec = JSON.parse(readFileSync('scripts/edge-endpoints.json', 'utf8')) as Array<{ name: string; security?: string[] }>;
  const declared = spec.filter((e) => (e.security ?? []).includes('apiKeyPartner')).map((e) => e.name);
  const sourceOf = (fn: string): string => INDEX.stripped()
    .filter(([abs]) => INDEX.paths[INDEX.files.indexOf(abs)].startsWith(`supabase/functions/${fn}/`))
    .map(([, src]) => src).join('\n');

  it('authenticate() refuses a key on any function the generated list does not name', () => {
    const auth = readFileSync('supabase/functions/_shared/auth.ts', 'utf8');
    expect(auth).toMatch(/import \{ API_KEY_ENDPOINTS \} from '\.\/apiKeyEndpoints\.generated\.ts'/);
    expect(auth).toMatch(/!API_KEY_ENDPOINTS\.has\(functionName\(req\)\)/);
  });

  it('a key caller reads the database as its owner, through actingClient', () => {
    const auth = readFileSync('supabase/functions/_shared/auth.ts', 'utf8');
    expect(auth).toMatch(/supabaseAsUser: row\.user_id \? actingClient\(row\.user_id, workspaceId\) : null/);
    expect(auth).toMatch(/'x-acting-user': userId/);
  });

  it('the generated list is the spec, freshly projected', async () => {
    const { keyCapable, render } = await import('../../scripts/gen-api-key-endpoints.mjs');
    const onDisk = readFileSync('supabase/functions/_shared/apiKeyEndpoints.generated.ts', 'utf8');
    expect(onDisk, 'run npm run api:keys').toBe(render(keyCapable()));
  });

  it('every key-capable function authenticates through the shared helper', () => {
    const lies = declared.filter((fn) => !/\bauthenticate(Caller)?\(\s*req/.test(sourceOf(fn)));
    expect(lies).toEqual([]);
  });

  it('a key-capable function never hands the caller token to a hop that cannot read a key, unless reviewed', () => {
    const unreviewed = declared
      .filter((fn) => usesRawCallerToken(sourceOf(fn)))
      .filter((fn) => !CALLER_TOKEN_REVIEWED[fn]);
    expect(unreviewed, 'Authorize at the door, then use the service client with explicit ownership checks — or drop apiKeyPartner').toEqual([]);
  });

  it('every reviewed entry is still key-capable and still uses the caller token (shrink-only)', () => {
    const stale = Object.keys(CALLER_TOKEN_REVIEWED)
      .filter((fn) => !declared.includes(fn) || !usesRawCallerToken(sourceOf(fn)));
    expect(stale).toEqual([]);
  });

  it('operator-only functions never declare apiKeyPartner', () => {
    expect(declared.filter((fn) => KEY_REFUSED[fn])).toEqual([]);
  });
});

describe('a kai_ key acts in ONE workspace, on the edge as in the database', () => {
  const auth = readFileSync('supabase/functions/_shared/auth.ts', 'utf8');
  const fnBody = (name: string): string => {
    const start = auth.indexOf(`export async function ${name}(`);
    return auth.slice(start, auth.indexOf('\n}\n', start));
  };

  it('every request runs inside its own context scope', () => {
    expect(readFileSync('supabase/functions/_shared/api-logger.ts', 'utf8'))
      .toMatch(/return \(req: Request\) => requestContext\.run\(\{\}, \(\) => inner\(req\)\)/);
  });

  it('authenticate() records the key workspace for the request', () => {
    expect(auth).toMatch(/ctx\.keyWorkspaceId = partnerAuth\.apiKey\?\.workspace_id/);
  });

  it.each(['userCanAccessWorkspace', 'userHasWorkspaceCapability', 'listWorkspaceIdsWithCapability', 'listUserWorkspaceIds'])(
    '%s refuses every workspace but the key one',
    (name) => expect(fnBody(name)).toMatch(/keyWorkspaceFence\(\)/),
  );

  it('a key never inherits the operator or global-admin bypass', () => {
    expect(fnBody('userHasWorkspaceCapability')).toMatch(/fence \? false : isPlatformOperator/);
    expect(fnBody('userCanAccessWorkspace')).toMatch(/if \(fence\) return false;\s*const globalRole/);
  });
});
