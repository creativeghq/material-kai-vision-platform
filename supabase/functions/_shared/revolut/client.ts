/**
 * Revolut Business API client (per-tenant BYOK) — #315.
 *
 * Every workspace connects its OWN Revolut Business account; we never fall back to
 * operator credentials. The trust chain is:
 *
 *   1. `revolut-api?action=init` mints an RSA-2048 keypair SERVER-SIDE. The private key
 *      lands in `workspace_revolut_config.private_key` (service-role-only row) and never
 *      reaches the browser; the PUBLIC key + redirect URI are what the operator pastes
 *      into Revolut dashboard → Settings → API, which hands back a `client_id`.
 *   2. OAuth consent: the operator approves the app at business.revolut.com/app-confirm;
 *      the auth code is exchanged for tokens using a JWT **client assertion** signed with
 *      our private key (RS256, `iss` = the DOMAIN of the redirect URI, `aud` fixed).
 *   3. Access tokens live ~40 minutes; the long-lived refresh token is the durable
 *      credential. Both are cached ON THE CONFIG ROW (not in-process) so the sync cron,
 *      webhooks and interactive calls share one token instead of racing three.
 *
 * Docs: https://developer.revolut.com/docs/api/business
 * NOT the Open Banking API (/docs/api/open-banking) — that one needs an AISP/PISP licence.
 */

// deno-lint-ignore-file no-explicit-any

export interface RevolutConfigRow {
  workspace_id: string;
  client_id: string | null;
  environment: 'sandbox' | 'production';
  enabled: boolean;
  public_key: string | null;
  private_key: string | null;
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  webhook_id: string | null;
  webhook_signing_secret: string | null;
  connected_at: string | null;
  sync_watermark: string | null;
  /**
   * A capped page walk left transactions older than this unread (#359 CM-13). Not null means
   * there is a HOLE: later runs walk backwards from here until a short page closes it. Advancing
   * the watermark without recording this is what made a capped run indistinguishable from a
   * complete one — the skipped transactions then sat outside every future window.
   */
  sync_backfill_before: string | null;
  /** The far edge of that hole — the `from` of the run that was capped. */
  sync_backfill_from: string | null;
  /** Registered in the Revolut dashboard; its DOMAIN is the JWT assertion's `iss`. */
  oauth_redirect_uri: string | null;
}

export interface RevolutHosts {
  /** REST base, e.g. https://b2b.revolut.com/api/1.0 */
  api: string;
  /** Consent page the operator is sent to for OAuth authorisation. */
  authorize: string;
}

export function revolutHosts(environment: string): RevolutHosts {
  return environment === 'production'
    ? {
      api: 'https://b2b.revolut.com/api/1.0',
      authorize: 'https://business.revolut.com/app-confirm',
    }
    : {
      api: 'https://sandbox-b2b.revolut.com/api/1.0',
      authorize: 'https://sandbox-business.revolut.com/app-confirm',
    };
}

/** Load the workspace's config row (service-role client required — RLS has no SELECT). */
export async function resolveRevolutConfig(
  supabase: any,
  workspaceId: string,
): Promise<RevolutConfigRow | null> {
  const { data, error } = await supabase
    .from('workspace_revolut_config')
    .select('*')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error || !data) return null;
  return data as RevolutConfigRow;
}

// ---------------------------------------------------------------------------
// Keypair + PEM
// ---------------------------------------------------------------------------

function toPem(buf: ArrayBuffer, label: string): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/**
 * Mint the workspace's RSA-2048 signing pair. Private = PKCS#8 PEM; public side is a
 * self-signed **X.509 certificate** — Revolut's dashboard rejects a bare SPKI public
 * key ("invalid public key"), it wants the key wrapped in a certificate.
 * `cnDomain` becomes the certificate CN (we pass the redirect URI's domain).
 */
export async function generateRevolutKeypair(cnDomain: string): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair;
  const priv = await crypto.subtle.exportKey('pkcs8', pair.privateKey);

  const x509 = await import('@peculiar/x509');
  x509.cryptoProvider.set(crypto);
  const serial = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: serial,
    name: `CN=${cnDomain.replace(/[^A-Za-z0-9.-]/g, '')}`,
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000),
    keys: pair,
    signingAlgorithm: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
  });

  return { publicKey: cert.toString('pem'), privateKey: toPem(priv, 'PRIVATE KEY') };
}

// ---------------------------------------------------------------------------
// JWT client assertion
// ---------------------------------------------------------------------------

function b64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Revolut's client assertion: RS256 JWT, `iss` = DOMAIN of the OAuth redirect URI (no
 * scheme), `sub` = client_id, `aud` = the literal string "https://revolut.com".
 */
export async function signClientAssertion(
  privateKeyPem: string,
  clientId: string,
  issuerDomain: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: issuerDomain,
    sub: clientId,
    aud: 'https://revolut.com',
    iat: now,
    exp: now + 300,
  }));
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem).buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

/** Strip an origin/URI down to the bare domain Revolut expects in `iss`. */
export function issuerDomainFrom(originOrUri: string): string {
  try {
    return new URL(originOrUri).hostname;
  } catch {
    return originOrUri.replace(/^https?:\/\//, '').split('/')[0];
  }
}

// ---------------------------------------------------------------------------
// Token lifecycle
// ---------------------------------------------------------------------------

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

async function tokenRequest(
  cfg: RevolutConfigRow,
  issuerDomain: string,
  params: Record<string, string>,
): Promise<TokenResponse> {
  if (!cfg.client_id || !cfg.private_key) throw new Error('Revolut client_id/keypair missing');
  const hosts = revolutHosts(cfg.environment);
  const assertion = await signClientAssertion(cfg.private_key, cfg.client_id, issuerDomain);
  const body = new URLSearchParams({
    ...params,
    client_id: cfg.client_id,
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: assertion,
  });
  const res = await fetch(`${hosts.api}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Revolut token request failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const out = await res.json() as TokenResponse;
  if (!out?.access_token) throw new Error('Revolut token response contained no access_token');
  return out;
}

/** One-time exchange after the consent redirect. Persists tokens on the config row. */
export async function exchangeAuthCode(
  supabase: any,
  cfg: RevolutConfigRow,
  code: string,
  issuerDomain: string,
): Promise<void> {
  const out = await tokenRequest(cfg, issuerDomain, {
    grant_type: 'authorization_code',
    code,
    // OAuth requires echoing the redirect_uri used on the consent request; Revolut
    // rejects the code as "invalid or expired" without it.
    ...(cfg.oauth_redirect_uri ? { redirect_uri: cfg.oauth_redirect_uri } : {}),
  });
  const expiresAt = new Date(Date.now() + (Number(out.expires_in ?? 2400) - 120) * 1000).toISOString();
  const { error } = await supabase
    .from('workspace_revolut_config')
    .update({
      access_token: out.access_token,
      access_token_expires_at: expiresAt,
      // Revolut only issues the refresh token on the code exchange — never null it later.
      ...(out.refresh_token ? { refresh_token: out.refresh_token } : {}),
      connected_at: new Date().toISOString(),
      last_sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', cfg.workspace_id);
  if (error) throw new Error(`Failed to persist Revolut tokens: ${error.message}`);
}

/**
 * A live access token, refreshed via the stored refresh token when within 2 minutes of
 * expiry. `issuerDomain` must match the redirect URI registered in the dashboard —
 * callers get it from the stored connection metadata, not from request headers.
 */
export async function getRevolutAccessToken(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
): Promise<string> {
  const fresh = cfg.access_token &&
    cfg.access_token_expires_at &&
    new Date(cfg.access_token_expires_at).getTime() > Date.now() + 120_000;
  if (fresh) return cfg.access_token as string;

  if (!cfg.refresh_token) throw new Error('Revolut connection has no refresh token — reconnect required');
  const out = await tokenRequest(cfg, issuerDomain, {
    grant_type: 'refresh_token',
    refresh_token: cfg.refresh_token,
  });
  const expiresAt = new Date(Date.now() + (Number(out.expires_in ?? 2400) - 120) * 1000).toISOString();
  const { error } = await supabase
    .from('workspace_revolut_config')
    .update({
      access_token: out.access_token,
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', cfg.workspace_id);
  if (error) throw new Error(`Failed to persist refreshed Revolut token: ${error.message}`);
  cfg.access_token = out.access_token;
  cfg.access_token_expires_at = expiresAt;
  return out.access_token;
}

// ---------------------------------------------------------------------------
// REST helpers
// ---------------------------------------------------------------------------

/** Authenticated GET/POST/DELETE against the Business API, one 401-retry via refresh. */
export async function revolutFetch(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const hosts = revolutHosts(cfg.environment);
  const doFetch = async (token: string) =>
    await fetch(`${hosts.api}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });

  let token = await getRevolutAccessToken(supabase, cfg, issuerDomain);
  let res = await doFetch(token);
  if (res.status === 401) {
    // Stored token was revoked server-side; force one refresh cycle and retry.
    cfg.access_token = null;
    token = await getRevolutAccessToken(supabase, cfg, issuerDomain);
    res = await doFetch(token);
  }
  return res;
}

export async function revolutJson<T>(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await revolutFetch(supabase, cfg, issuerDomain, path, init);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Revolut API ${init.method ?? 'GET'} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return await res.json() as T;
}

export interface RevolutAccount {
  id: string;
  name?: string;
  balance: number;
  currency: string;
  state: string;
  public?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RevolutTransactionLeg {
  leg_id: string;
  account_id: string;
  counterparty?: { account_type?: string; account_id?: string };
  amount: number;
  currency: string;
  description?: string;
  balance?: number;
}

export interface RevolutTransaction {
  id: string;
  type: string;
  state: string;
  created_at: string;
  updated_at?: string;
  completed_at?: string;
  reference?: string;
  merchant?: { name?: string };
  counterparty?: { name?: string };
  legs: RevolutTransactionLeg[];
}

export function listAccounts(supabase: any, cfg: RevolutConfigRow, issuerDomain: string) {
  return revolutJson<RevolutAccount[]>(supabase, cfg, issuerDomain, '/accounts');
}

export function listTransactions(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  opts: { from?: string; to?: string; count?: number } = {},
) {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  q.set('count', String(opts.count ?? 500));
  return revolutJson<RevolutTransaction[]>(supabase, cfg, issuerDomain, `/transactions?${q.toString()}`);
}

/**
 * One transaction by id. Needed because `/transactions?from=` filters on CREATION time:
 * a line that was pending when we last pulled and completed afterwards is never returned
 * again by the list endpoint, so the sync backstop has to re-read it explicitly.
 */
export function getTransaction(supabase: any, cfg: RevolutConfigRow, issuerDomain: string, id: string) {
  return revolutJson<RevolutTransaction>(supabase, cfg, issuerDomain, `/transaction/${id}`);
}

// ---------------------------------------------------------------------------
// Money-out (PAY/WRITE scopes) — thin wrappers; auditing lives in revolut_payouts.
// ---------------------------------------------------------------------------

export interface RevolutCounterparty {
  id: string;
  name?: string;
  state?: string;
}

/** Create an external-IBAN counterparty. Body per Revolut: company_name | individual_name + iban/bic. */
export function createCounterparty(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  body: Record<string, unknown>,
) {
  return revolutJson<RevolutCounterparty>(supabase, cfg, issuerDomain, '/counterparty', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Immediate transfer to a counterparty (UNATTENDED money movement — callers audit first). */
export function createPayment(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  body: {
    request_id: string;
    account_id: string;
    receiver: { counterparty_id: string; account_id?: string };
    amount: number;
    currency: string;
    reference?: string;
  },
) {
  return revolutJson<{ id: string; state: string }>(supabase, cfg, issuerDomain, '/pay', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Payment draft — prepared by the ERP, approved by a human in the Revolut app. */
export function createPaymentDraft(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  body: {
    title?: string;
    payments: Array<{
      account_id: string;
      receiver: { counterparty_id: string; account_id?: string };
      amount: number;
      currency: string;
      reference?: string;
    }>;
  },
) {
  return revolutJson<{ id: string }>(supabase, cfg, issuerDomain, '/payment-drafts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Payout link — money claimable by URL; no IBAN needed (customer refunds). */
export function createPayoutLink(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  body: {
    counterparty_name: string;
    request_id: string;
    account_id: string;
    amount: number;
    currency: string;
    reference?: string;
  },
) {
  return revolutJson<{ id: string; state?: string; url?: string }>(supabase, cfg, issuerDomain, '/payout-links', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function getExchangeRate(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  from: string,
  to: string,
  amount: number,
) {
  const q = new URLSearchParams({ from, to, amount: String(amount) });
  return revolutJson<Record<string, unknown>>(supabase, cfg, issuerDomain, `/rate?${q.toString()}`);
}

// ---------------------------------------------------------------------------
// Cards + expenses (#315 phase 4)
// ---------------------------------------------------------------------------

export interface RevolutTeamMember {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  state?: string;
  role?: string;
}

export interface RevolutCard {
  id: string;
  label?: string;
  state?: string;
  virtual?: boolean;
  holder_id?: string;
  last_digits?: string;
  expiry?: string;
  created_at?: string;
}

export interface RevolutExpense {
  id: string;
  state?: string;
  merchant?: { name?: string; category?: string };
  transaction_id?: string;
  amount?: number;
  currency?: string;
  spent_at?: string;
  card_id?: string;
  labels?: unknown[];
  receipts?: Array<{ id: string; file_name?: string; content_type?: string }>;
}

export function listTeamMembers(supabase: any, cfg: RevolutConfigRow, issuerDomain: string) {
  return revolutJson<RevolutTeamMember[]>(supabase, cfg, issuerDomain, '/team-members');
}

export function listCards(supabase: any, cfg: RevolutConfigRow, issuerDomain: string) {
  return revolutJson<RevolutCard[]>(supabase, cfg, issuerDomain, '/cards');
}

/** Create a VIRTUAL card for a team member (physical cards need address plumbing). */
export function createCard(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  body: { holder_id: string; label?: string; virtual: true; accounts?: string[] },
) {
  return revolutJson<RevolutCard>(supabase, cfg, issuerDomain, '/cards', {
    method: 'POST',
    body: JSON.stringify({ ...body, request_id: crypto.randomUUID() }),
  });
}

export function setCardFrozen(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  cardId: string,
  frozen: boolean,
) {
  return revolutFetch(supabase, cfg, issuerDomain, `/cards/${cardId}/${frozen ? 'freeze' : 'unfreeze'}`, {
    method: 'POST',
  });
}

export function listExpenses(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  opts: { from?: string; count?: number } = {},
) {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  q.set('count', String(opts.count ?? 100));
  return revolutJson<RevolutExpense[]>(supabase, cfg, issuerDomain, `/expenses?${q.toString()}`);
}

/** Raw receipt bytes for an expense (content-type comes from the response). */
export async function getExpenseReceipt(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  expenseId: string,
  receiptId: string,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await revolutFetch(
    supabase, cfg, issuerDomain,
    `/expenses/${expenseId}/receipts/${receiptId}/content`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`receipt fetch failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return { bytes: buf, contentType: res.headers.get('content-type') ?? 'application/octet-stream' };
}

/** Exchange between the business's own currency pockets. */
export function exchangeMoney(
  supabase: any,
  cfg: RevolutConfigRow,
  issuerDomain: string,
  body: {
    request_id: string;
    from: { account_id: string; currency: string; amount: number };
    to: { account_id: string; currency: string };
    reference?: string;
  },
) {
  return revolutJson<{ id?: string; state?: string }>(supabase, cfg, issuerDomain, '/exchange', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
