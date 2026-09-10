/** Which role did the caller present? */

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
