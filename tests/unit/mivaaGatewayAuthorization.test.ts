/**
 * Guard: the MIVAA gateway authorizes the path it is about to REQUEST (#361 `EG-1`–`EG-3`).
 *
 * This gateway is the only authorization boundary MIVAA has. MIVAA runs every database
 * operation through a service-role client, 63 of its 370 route blocks have no validating auth
 * dependency, and `/api/internal`, `/api/embeddings`, `/api/rag` and `/api/jobs` are excluded
 * from its JWT middleware by prefix. So whatever reaches it executes with service-role
 * authority. Three ways past this gateway were open at once:
 *
 *   EG-1  The admin guard tested `MIVAA_ENDPOINTS[action].path` — the TEMPLATE — and
 *         substitution happened afterwards, unencoded. `rag_get_job` with
 *         `job_id = "../../../admin/system/metrics?x="` passed a guard that saw
 *         `/api/rag/documents/job/{job_id}` and then sent `/api/admin/system/metrics`.
 *         Eleven of twelve parameters were interpolated raw; only `factory_name` was encoded,
 *         which is what showed the correct handling was known.
 *   EG-2  `multipart/form-data` returned before the auth block entirely, forwarding the
 *         privileged MIVAA credential for a caller with no JWT at all.
 *   EG-3  `/job-status/` did the same, one line above it.
 *
 * Static, over source text, because the failures are all about ORDER — which check runs before
 * which line — and order is visible in the source. A runtime test would need a MIVAA to talk to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const GATEWAY = join(
  __dirname, '..', '..', 'supabase', 'functions', 'mivaa-gateway', 'index.ts',
);

/**
 * Source with comments stripped, so prose describing the old bug is not read as code.
 *
 * LINE comments go first, and the order is not cosmetic: this file documents MIVAA's excluded
 * prefixes as `/api/rag/*` in ordinary `//` comments. Stripping block comments first reads that
 * `/*` as the start of one and deletes everything up to the next `*​/` — several hundred lines of
 * real code, including the checks these cases exist to assert. The test then passes by finding
 * nothing to fail on, which is the worst way for a guard to be wrong.
 */
function codeOnly(src: string): string {
  return sharedStripComments(src);
}

const src = codeOnly(readFileSync(GATEWAY, 'utf8'));

describe('path parameters cannot escape their template', () => {
  it('encodes every substituted value', () => {
    // One substitution routine, so a twelfth parameter cannot be added raw next to it.
    expect(src, 'the shared substitution helper is gone — parameters are being interpolated inline again')
      .toMatch(/function substitutePathParams\(/);

    const fn = src.slice(src.indexOf('function substitutePathParams('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body, 'substitutePathParams no longer encodes the value it interpolates')
      .toContain('encodeURIComponent');

    // The old shape: a `finalPath.replace('{x}', payload.x)` with no encoding around it.
    const rawSubstitutions = src.match(/\.replace\('\{\w+\}',\s*(?!encodeURIComponent)/g) ?? [];
    expect(
      rawSubstitutions,
      'a path parameter is being substituted without encodeURIComponent — that is exactly EG-1',
    ).toEqual([]);
  });

  it('refuses a resolved path that still contains a traversal segment', () => {
    expect(src, 'the bare `..` segment check is gone').toMatch(/includes\('\.\.'\)/);
  });
});

describe('the admin gate reads the resolved path, not the template', () => {
  it('tests finalPath rather than the endpoint template', () => {
    expect(
      src,
      'the admin gate is testing the endpoint TEMPLATE again. The template and the path that ' +
        'gets sent are different strings the moment a parameter is substituted — that gap IS EG-1.',
    ).not.toMatch(/MIVAA_ENDPOINTS\[action\]\.path\.startsWith\('\/api\/admin'\)/);

    // The gate is `isAdminAction(action, finalPath)`: privileged by explicit action NAME, or by
    // the RESOLVED path. Both halves are pinned.
    //
    // The name list exists only so a privileged route that does NOT live under /api/admin can
    // still be gated — `admin_system_health` and `admin_system_metrics`, whose real MIVAA paths
    // are `/api/system/...` because that router is mounted at `prefix="/api"`. Before that was
    // corrected they pointed at `/api/admin/system/...`, which 404'd; fixing the path without
    // the name list would have un-gated host CPU, memory and disk for any authenticated user.
    //
    // Delete the path half and EG-1 comes straight back, so it is asserted separately.
    expect(src, 'the admin gate no longer consults the resolved path')
      .toMatch(/isAdminAction\(action, finalPath\)/);
    expect(src, 'isAdminAction no longer falls back to the resolved path — EG-1 returns')
      .toMatch(/isAdminPath\(path\)/);
  });

  it('the explicitly-gated actions are still privileged', () => {
    // A path outside /api/admin is invisible to isAdminPath, so these two are gated ONLY by
    // name. Losing an entry here silently exposes host metrics.
    for (const action of ['admin_system_health', 'admin_system_metrics']) {
      expect(src, `${action} must stay in ADMIN_ONLY_ACTIONS — its path is not under /api/admin`)
        .toMatch(new RegExp(`ADMIN_ONLY_ACTIONS[\\s\\S]{0,400}'${action}'`));
    }
  });

  it('normalises . and .. before deciding, so the check sees what the router will', () => {
    const fn = src.slice(src.indexOf('function normalizePath('));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body, 'normalizePath no longer collapses `..`').toContain("'..'");
    expect(body, 'normalizePath no longer pops the parent segment').toContain('out.pop()');
  });

  it('resolves the path before the credit debit, so a refused request is never charged', () => {
    const substituteAt = src.indexOf('substitutePathParams(endpoint.path');
    const gateAt = src.indexOf('isAdminAction(action, finalPath)');
    const debitAt = src.indexOf("rpc('debit_credits'");
    expect(substituteAt, 'substitution site not found').toBeGreaterThan(-1);
    expect(gateAt, 'admin gate not found').toBeGreaterThan(-1);
    expect(debitAt, 'debit site not found').toBeGreaterThan(-1);
    expect(substituteAt, 'the path is resolved AFTER the gate that authorizes it').toBeLessThan(gateAt);
    expect(gateAt, 'a caller about to be 403d is debited first').toBeLessThan(debitAt);
  });
});

describe('nothing reaches MIVAA above authentication', () => {
  const authAt = src.indexOf('const auth = await authenticate(req)');
  const isAdminAt = src.indexOf('const isAdmin = isAdminAccess(auth)');

  it('authenticates before the job-status branch', () => {
    const branchAt = src.indexOf("url.pathname.startsWith('/job-status/')");
    expect(branchAt, 'job-status branch not found').toBeGreaterThan(-1);
    expect(
      authAt,
      'job-status returns above authentication again — it reads MIVAA with the service ' +
        'credential for an unauthenticated caller (EG-3)',
    ).toBeLessThan(branchAt);
  });

  it('authenticates before the multipart branch', () => {
    const branchAt = src.indexOf("contentType.includes('multipart/form-data')");
    expect(branchAt, 'multipart branch not found').toBeGreaterThan(-1);
    expect(
      authAt,
      'the multipart upload path returns above authentication again (EG-2) — it forwards the ' +
        'privileged MIVAA key for a caller with no JWT',
    ).toBeLessThan(branchAt);
    expect(isAdminAt).toBeLessThan(branchAt);
  });

  it('authenticates exactly once at the top, not per-branch', () => {
    // A second unconditional `authenticate(req)` at the old position would mean the move was
    // half-done. The admin re-check with allowedRoles is a different call and is expected.
    const plain = src.match(/await authenticate\(req\)(?!\s*,)/g) ?? [];
    expect(plain, 'authenticate(req) appears more than once — the auth block was duplicated, not moved')
      .toHaveLength(1);
  });
});

describe('the multipart path is bound to a tenant and bounded in size', () => {
  const upload = src.slice(src.indexOf('async function handleFileUpload('));
  const body = upload.slice(0, upload.indexOf('\n}\n'));

  it('verifies the workspace_id form field against the caller memberships', () => {
    expect(body, 'the multipart path no longer reads the claimed workspace off the form')
      .toContain("formData.get('workspace_id')");
    expect(body, 'the claimed workspace is no longer checked against workspace_members')
      .toContain("from('workspace_members')");
  });

  it('rejects an oversized upload before parsing it', () => {
    expect(body, 'the content-length ceiling is gone — formData() parses whatever arrives')
      .toContain('MAX_UPLOAD_BYTES');
    const capAt = body.indexOf('MAX_UPLOAD_BYTES');
    const parseAt = body.indexOf('await req.formData()');
    expect(capAt, 'the size check runs after the body has already been parsed').toBeLessThan(parseAt);
  });
});
