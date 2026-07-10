// Shared REST client for the Ergani II Web API — the Greek Ministry of Labour's
// interoperability service for digitally submitting workforce declarations (work card
// clock-in/out, leaves, hire announcements E3, work-time schedules).
//
// Guide: "Unified Application Guide for Work-Time Organization & the Digital Work Card",
// §6 (Web API REST). Every workspace runs under its OWN e-EFKA "Ergani" account
// (workspace_ergani_credentials), against either the trial or the production environment.
//
// Auth (§6.1.1): POST /Authentication {Username,Password,Usertype} → JWT accessToken (3h) +
// refreshToken. Bearer on every subsequent call. On 401 with header `api-token-expired:true`,
// refresh via /Authentication/Refresh (§6.1.2). We keep a per-workspace in-memory token cache
// so a burst of submissions in one warm worker reuses one login.

const ENDPOINTS = {
  trial: 'https://trialeservices.yeka.gr/WebServicesApi/api/',
  production: 'https://eservices.yeka.gr/WebservicesAPI/Api/',
} as const;

export type ErganiEnv = keyof typeof ENDPOINTS;

export interface ErganiCredentials {
  username: string;
  password: string;
  usertype: string;      // '01' | '02' | '03' — default '02' (Ergani codes)
  employerAfm: string;   // f_afm_ergodoti
  branchAa: string;      // f_aa (branch No.)
  environment: ErganiEnv;
}

export type SupabaseLike = { from: (t: string) => any };

/** Read + validate the per-workspace Ergani credentials (service-role; bypasses RLS). */
export async function resolveErganiCredentials(
  supabase: SupabaseLike,
  workspaceId: string,
): Promise<ErganiCredentials | null> {
  const { data } = await supabase
    .from('workspace_ergani_credentials')
    .select('username, password, usertype, employer_afm, branch_aa, environment, enabled')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!data || data.enabled === false) return null;
  const username = (data.username ?? '').trim();
  const password = (data.password ?? '').trim();
  if (!username || !password) return null;
  return {
    username,
    password,
    usertype: (data.usertype ?? '02').trim() || '02',
    employerAfm: (data.employer_afm ?? '').trim(),
    branchAa: (data.branch_aa ?? '0').trim() || '0',
    environment: data.environment === 'production' ? 'production' : 'trial',
  };
}

interface TokenEntry {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number; // epoch ms
  refreshToken_raw: string;
}

// Per-(workspace+env+user) token cache. Cleared on process recycle; that's fine — a cold
// worker just re-authenticates. Keyed so distinct credentials never share a token.
const tokenCache = new Map<string, TokenEntry>();

function cacheKey(c: ErganiCredentials, workspaceId: string): string {
  return `${workspaceId}:${c.environment}:${c.username}`;
}

export interface ErganiError {
  status: number;
  message: string;
  raw?: string;
}

export class ErganiApiError extends Error {
  status: number;
  raw?: string;
  constructor(e: ErganiError) {
    super(e.message);
    this.name = 'ErganiApiError';
    this.status = e.status;
    this.raw = e.raw;
  }
}

async function readJson(resp: Response): Promise<any> {
  const text = await resp.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

/** Parse Ergani's error shape ({message:"..."} on 400) into a human string. */
function extractErrorMessage(body: any, status: number): string {
  if (body && typeof body === 'object' && typeof body.message === 'string') return body.message;
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 500);
  return `Ergani API error (HTTP ${status})`;
}

/** POST /Authentication → fresh token pair. */
async function authenticate(base: string, c: ErganiCredentials): Promise<TokenEntry> {
  const resp = await fetch(`${base}Authentication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ Username: c.username, Password: c.password, Usertype: c.usertype }),
  });
  const body = await readJson(resp);
  if (!resp.ok) {
    throw new ErganiApiError({ status: resp.status, message: extractErrorMessage(body, resp.status) });
  }
  const accessToken = body?.accessToken;
  if (!accessToken) throw new ErganiApiError({ status: 502, message: 'Ergani authentication returned no accessToken' });
  const expiresSec = Number(body?.accessTokenExpired ?? 10_800);
  return {
    accessToken,
    refreshToken: body?.refreshToken ?? '',
    refreshToken_raw: body?.refreshToken ?? '',
    // Renew a minute early to avoid racing the 3h boundary mid-request.
    accessExpiresAt: Date.now() + Math.max(60, expiresSec - 60) * 1000,
  };
}

/** POST /Authentication/Refresh, falling back to a full re-auth if the refresh token is stale. */
async function refresh(base: string, c: ErganiCredentials, entry: TokenEntry): Promise<TokenEntry> {
  if (!entry.refreshToken_raw) return authenticate(base, c);
  const resp = await fetch(`${base}Authentication/Refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ AccessToken: entry.accessToken, RefreshToken: entry.refreshToken_raw }),
  });
  if (!resp.ok) return authenticate(base, c); // refresh token expired → clean re-login
  const body = await readJson(resp);
  const accessToken = body?.accessToken;
  if (!accessToken) return authenticate(base, c);
  const expiresSec = Number(body?.accessTokenExpired ?? 10_800);
  return {
    accessToken,
    refreshToken: body?.refreshToken ?? '',
    refreshToken_raw: body?.refreshToken ?? '',
    accessExpiresAt: Date.now() + Math.max(60, expiresSec - 60) * 1000,
  };
}

/** Get a valid access token for these credentials (cached, auto-refresh). */
async function getToken(c: ErganiCredentials, workspaceId: string): Promise<TokenEntry> {
  const base = ENDPOINTS[c.environment];
  const key = cacheKey(c, workspaceId);
  const cached = tokenCache.get(key);
  if (cached && cached.accessExpiresAt > Date.now()) return cached;
  const entry = cached ? await refresh(base, c, cached) : await authenticate(base, c);
  tokenCache.set(key, entry);
  return entry;
}

/** Authorized request helper. Retries once on api-token-expired. */
async function authedFetch(
  c: ErganiCredentials,
  workspaceId: string,
  path: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  const base = ENDPOINTS[c.environment];
  const token = await getToken(c, workspaceId);
  const resp = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token.accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  if ((resp.status === 401 || resp.headers.get('api-token-expired') === 'true') && attempt === 0) {
    tokenCache.delete(cacheKey(c, workspaceId));
    return authedFetch(c, workspaceId, path, init, attempt + 1);
  }
  return resp;
}

export interface SubmissionType { id: number; code: string; description: string }
export interface SubmitResult { id: string; protocol: string; submitDate: string }

/** GET Lookup/Submissions — active submission types for this employer (§6.1.4). */
export async function listSubmissions(c: ErganiCredentials, workspaceId: string): Promise<SubmissionType[]> {
  const resp = await authedFetch(c, workspaceId, 'Lookup/Submissions', { method: 'GET' });
  const body = await readJson(resp);
  if (!resp.ok) throw new ErganiApiError({ status: resp.status, message: extractErrorMessage(body, resp.status) });
  return Array.isArray(body) ? body : [];
}

/** GET Documents/{code} — the JSON schema for a submission type (§6.1.5). */
export async function getDocumentSchema(c: ErganiCredentials, workspaceId: string, code: string): Promise<any> {
  const resp = await authedFetch(c, workspaceId, `Documents/${encodeURIComponent(code)}`, { method: 'GET' });
  const body = await readJson(resp);
  if (!resp.ok) throw new ErganiApiError({ status: resp.status, message: extractErrorMessage(body, resp.status) });
  return body;
}

/** POST Documents/{code} — submit a new declaration (§6.1.6). Returns [{id,protocol,submitDate}]. */
export async function submitDocument(
  c: ErganiCredentials, workspaceId: string, code: string, payload: unknown,
): Promise<SubmitResult> {
  const resp = await authedFetch(c, workspaceId, `Documents/${encodeURIComponent(code)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await readJson(resp);
  if (!resp.ok) throw new ErganiApiError({ status: resp.status, message: extractErrorMessage(body, resp.status), raw: typeof body === 'string' ? body : JSON.stringify(body) });
  const row = Array.isArray(body) ? body[0] : body;
  if (!row?.protocol) throw new ErganiApiError({ status: 502, message: 'Ergani submission returned no protocol', raw: JSON.stringify(body) });
  return { id: String(row.id ?? ''), protocol: String(row.protocol), submitDate: String(row.submitDate ?? '') };
}

/** POST Documents/CancelSubmittedDocument — cancel a submitted declaration (§6.1.7, leaves only). */
export async function cancelDocument(
  c: ErganiCredentials, workspaceId: string,
  args: { typeOfDocument: string; protocol: string; submittedDate: string },
): Promise<{ message: string }> {
  const resp = await authedFetch(c, workspaceId, 'Documents/CancelSubmittedDocument', {
    method: 'POST',
    body: JSON.stringify({ TypeOfDocument: args.typeOfDocument, Protocol: args.protocol, SubmittedDate: args.submittedDate }),
  });
  const body = await readJson(resp);
  if (!resp.ok) throw new ErganiApiError({ status: resp.status, message: extractErrorMessage(body, resp.status) });
  return { message: body?.message ?? 'cancelled' };
}

/** GET Documents/{code}?protocol=&submittedDate= — the submitted PDF as Base64 (§6.1.8). */
export async function getSubmittedPdf(
  c: ErganiCredentials, workspaceId: string, code: string, protocol: string, submittedDate: string,
): Promise<string> {
  const q = `protocol=${encodeURIComponent(protocol)}&submittedDate=${encodeURIComponent(submittedDate)}`;
  const resp = await authedFetch(c, workspaceId, `Documents/${encodeURIComponent(code)}?${q}`, { method: 'GET' });
  const body = await readJson(resp);
  if (!resp.ok) throw new ErganiApiError({ status: resp.status, message: extractErrorMessage(body, resp.status) });
  return typeof body === 'string' ? body : (body?.pdf ?? body?.content ?? '');
}

/** POST WebServices/ExecuteService — run an employer service, e.g. EX_BASE_01 employer info (§6.1.10). */
export async function executeService(
  c: ErganiCredentials, workspaceId: string, serviceCode: string,
  parameters: { ParameterName: string; ParameterValue: string }[] = [],
): Promise<any> {
  const resp = await authedFetch(c, workspaceId, 'WebServices/ExecuteService', {
    method: 'POST',
    body: JSON.stringify({ ServiceCode: serviceCode, Parameters: parameters }),
  });
  const body = await readJson(resp);
  if (!resp.ok) throw new ErganiApiError({ status: resp.status, message: extractErrorMessage(body, resp.status) });
  return body;
}
