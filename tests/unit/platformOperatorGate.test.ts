/**
 * Guards the #362 fix: `reset-platform` deletes every tenant's data, and its authorization
 * gate accepted a WORKSPACE admin from ANY workspace.
 *
 * The root error is a vocabulary one, and it is worth restating because the same two words
 * mean different things one line apart:
 *
 *   workspace_members.role = 'admin'   per-workspace business role. Every tenant's own
 *                                      administrator holds it. `authenticate({allowedRoles})`
 *                                      matches it in ANY workspace, with no workspace bound.
 *   roles.name = 'admin'               the GLOBAL account tier, via user_profiles.role_id.
 *                                      True in every workspace. This is "operates the platform".
 *
 * `reset-platform` gated on the first and meant the second, so any customer admin could wipe
 * all tenants. Live at the time: 5 workspaces, 1 workspace-admin membership, 1 global operator.
 *
 * These are static assertions over source text — there is no Deno runtime in this suite, and a
 * behavioural test would need a live JWT plus a platform this test is allowed to destroy.
 *
 * Every case was watched to FAIL against the pre-fix tree.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const RESET = join(ROOT, 'supabase', 'functions', 'reset-platform', 'index.ts');
const AUTH = join(ROOT, 'supabase', 'functions', '_shared', 'auth.ts');

const read = (p: string) => readFileSync(p, 'utf8');

/** Body of a named function/handler region, comments stripped, so a rule cannot be
 *  satisfied by prose that merely mentions the right identifier. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('#362 — a platform-wide wipe requires a platform operator', () => {
  it('reset-platform does not gate on a workspace-level role', () => {
    const src = stripComments(read(RESET));
    expect(
      /allowedRoles\s*:\s*\[/.test(src),
      'reset-platform gates on allowedRoles again. That resolves against workspace_members.role ' +
        'in ANY workspace, so every tenant admin can wipe every tenant.',
    ).toBe(false);
  });

  it('reset-platform gates on the global operator role or the service role', () => {
    const src = stripComments(read(RESET));
    expect(src, 'the platform-operator check is gone from reset-platform').toContain('isPlatformOperator');
    expect(src, 'the service-role path is gone from reset-platform').toContain('isServiceRoleRequest');
  });

  it('the dead second operand is gone', () => {
    // `!auth.success && !isAdminAccess(auth)` — isAdminAccess is `auth.success && …`, ANDed
    // against `!auth.success`, so it could never contribute. It read as defence in depth and
    // was decoration.
    const src = stripComments(read(RESET));
    expect(
      /!auth\.success\s*&&\s*!isAdminAccess/.test(src),
      'the unreachable isAdminAccess operand is back — it cannot ever contribute and it ' +
        'disguises the real gate as being stricter than it is',
    ).toBe(false);
  });

  it('isPlatformOperator reads the GLOBAL tier, never workspace_members', () => {
    const src = read(AUTH);
    const start = src.indexOf('export async function isPlatformOperator');
    expect(start, 'isPlatformOperator is gone — re-point this guard').toBeGreaterThan(-1);
    // to the next top-level doc comment, i.e. the start of the following declaration
    const end = src.indexOf('\n/**', start);
    const body = stripComments(src.slice(start, end === -1 ? src.length : end));
    expect(body, 'isPlatformOperator no longer resolves the global account tier').toContain('user_profiles');
    expect(
      body.includes('workspace_members'),
      'isPlatformOperator consults workspace_members — that is the per-workspace business ' +
        'role, which is the exact confusion #362 was',
    ).toBe(false);
  });

  it('allowedRoles ignores a membership that is no longer active', () => {
    const src = read(AUTH);
    const i = src.indexOf("from('workspace_members').select('role')");
    expect(i, "the allowedRoles workspace_members lookup moved — re-point this guard").toBeGreaterThan(-1);
    const stmt = src.slice(i, i + 260);
    expect(
      stmt,
      'the allowedRoles lookup dropped its status filter, so a REMOVED admin whose membership ' +
        'row still exists passes every allowedRoles gate in the platform',
    ).toContain("eq('status', 'active')");
  });

  it('the confirmation phrase is checked by the server, not by the browser', () => {
    const src = stripComments(read(RESET));
    expect(src, 'the server-side confirmation phrase is gone').toContain('RESET_CONFIRM_PHRASE');
    expect(
      /body\.confirm_phrase\s*!==\s*RESET_CONFIRM_PHRASE/.test(src),
      'reset-platform no longer verifies the typed phrase itself — a direct functions.invoke ' +
        'never loads the dialog that asks for it',
    ).toBe(true);
  });

  it('a partial wipe is not reported as a success', () => {
    const src = stripComments(read(RESET));
    expect(
      /success:\s*true\b/.test(src),
      'the response hardcodes success: true again, so a reset that left half the platform ' +
        'behind reports as a clean run',
    ).toBe(false);
    expect(src, 'the per-step error roll-up is gone').toContain('stepErrors');
  });

  it('the invocation is recorded before anything is deleted', () => {
    const src = stripComments(read(RESET));
    const insertAt = src.indexOf("from('platform_reset_log')");
    const deleteAt = src.indexOf('STEP 1: Clear database tables');
    expect(insertAt, 'reset-platform no longer records who invoked it').toBeGreaterThan(-1);
    expect(
      insertAt < deleteAt,
      'the audit row is written after the deletion starts — a reset that dies half way then ' +
        'leaves no actor behind, which is the one thing anyone wants afterwards',
    ).toBe(true);
  });

  it('the audit log is never itself cleared', () => {
    const src = read(RESET);
    const never = src.slice(src.indexOf('const NEVER_CLEAR'), src.indexOf('const IDLESS_DELETE_COLUMN'));
    expect(
      never,
      'platform_reset_log left NEVER_CLEAR — a wipe that erases the record of itself is not ' +
        'an audit trail',
    ).toContain('platform_reset_log');
  });
});
