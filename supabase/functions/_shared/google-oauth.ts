/** The platform's one Google OAuth client (GOOGLE_CLIENT_ID / _SECRET): signed state, code exchange, refresh. */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_TTL_MS = 10 * 60 * 1000;
const enc = new TextEncoder();

export const googleClientId = () => Deno.env.get('GOOGLE_CLIENT_ID') || '';
const googleClientSecret = () => Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const stateKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function hmacHex(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(stateKey()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** State the callback can trust: who asked, for which workspace, and when (10-minute life). */
export async function signOAuthState(data: Record<string, string>): Promise<string> {
  const payload = JSON.stringify({ ...data, ts: Date.now() });
  return `${btoa(payload)}.${await hmacHex(payload)}`;
}

export async function verifyOAuthState(state: string): Promise<Record<string, string> | null> {
  const [b64, sig] = String(state).split('.');
  if (!b64 || !sig) return null;
  let payload: string;
  try { payload = atob(b64); } catch { return null; }
  if ((await hmacHex(payload)) !== sig) return null;
  try {
    const parsed = JSON.parse(payload);
    if (Date.now() - Number(parsed.ts ?? 0) > STATE_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

export function googleConsentUrl(opts: { redirectUri: string; scope: string; state: string; loginHint?: string }): string {
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set('client_id', googleClientId());
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', opts.scope);
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', opts.state);
  if (opts.loginHint) u.searchParams.set('login_hint', opts.loginHint);
  return u.toString();
}

export interface GoogleTokens { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }

async function tokenCall(body: Record<string, string>): Promise<GoogleTokens> {
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: googleClientId(), client_secret: googleClientSecret(), ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j.error_description || j.error || `Google token call ${r.status}`) as Error & { code?: string };
    err.code = j.error;
    throw err;
  }
  return j as GoogleTokens;
}

export const exchangeGoogleCode = (code: string, redirectUri: string) =>
  tokenCall({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });

/** Throws with `code === 'invalid_grant'` when the user revoked access or the token expired. */
export const refreshGoogleToken = (refreshToken: string) =>
  tokenCall({ refresh_token: refreshToken, grant_type: 'refresh_token' });

export async function revokeGoogleToken(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => undefined);
}
