/**
 * Which role did the caller present?
 *
 * Read from the bearer's `role` claim WITHOUT verifying the signature, because this only ever
 * picks a STATUS CODE — the database has already made the real decision by the time anything
 * here is asked. A forged token buys nothing: the worst it can do is turn a 403 into a 500 on a
 * request that was refused either way.
 *
 * WHY IT EXISTS. Postgres writes `permission denied for function is_workspace_member` for two
 * completely different events: we forgot a GRANT (our bug, nobody can use the feature), or an
 * ANON caller reached an authenticated-only object (a correct refusal). The wording is
 * identical, and the only thing that separates them is who was asking — which the database
 * error cannot say and the request can.
 *
 * Kept dependency-free so both the wrapper and a plain unit test can import it.
 */

export type CallerRole = 'anon' | 'authenticated' | 'service_role' | 'unknown';

export function callerRoleFromAuthHeader(header: string | null | undefined): CallerRole {
  const token = header?.replace(/^Bearer\s+/i, '').trim();
  if (!token) return 'unknown';

  const payload = token.split('.')[1];
  if (!payload) return 'unknown';

  try {
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return role === 'anon' || role === 'authenticated' || role === 'service_role'
      ? role
      : 'unknown';
  } catch {
    // Not a JWT, not base64, not JSON — treat as unknown rather than guessing. `unknown` is
    // handled as "not anon", so an unreadable token cannot silence a real missing-GRANT report.
    return 'unknown';
  }
}
