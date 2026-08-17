/**
 * Health Check Edge Function
 *
 * Runs server-side checks (no CORS, real HTTP status codes) for all services:
 *
 * AI providers (key validity):
 *   - Claude:      GET /v1/models          — no tokens consumed
 *   - OpenAI:      GET /v1/models          — no tokens consumed
 *   - SLIG (Modal): GET /health            — SigLIP2 visual embeddings endpoint
 *   - Voyage AI:   POST /v1/embeddings     — minimal single-word embedding
 *
 * Python backend services:
 *   - Embeddings:  GET /api/embeddings/health
 *   - AI Services: GET /api/v1/ai-services/health
 *
 * External third-party APIs (reachability — any HTTP response = UP, only timeout = DOWN):
 *   - Twilio, Apollo, Hunter.io, ZeroBounce, Firecrawl, WorldLabs, Stripe
 *
 * Cloudflare (three surfaces, three different methods, because they fail differently):
 *   - Turnstile:      POST siteverify with a junk token — grades OUR SECRET, not just reachability
 *   - Email Routing:  MX lookup over DoH + delivery outcomes from the DB. The inbound Worker has
 *                     no fetch handler, so it cannot be pinged; its health is its output.
 *   - Workers:        Cloudflare API — token valid + the inbound Worker actually deployed.
 *                     UNKNOWN without a token; an unconfigured check has measured nothing.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveSecrets } from '../_shared/secrets.ts';

const ANTHROPIC_API_KEY = () => Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY = () => Deno.env.get('OPENAI_API_KEY') || '';
const SLIG_MODAL_URL = () => Deno.env.get('SLIG_MODAL_URL') || 'https://basilakis--slig-sligservice-web.modal.run';
const VOYAGE_API_KEY = () => Deno.env.get('VOYAGE_API_KEY') || '';
const MIVAA_GATEWAY_URL   = Deno.env.get('MIVAA_GATEWAY_URL')   || 'https://v1api.materialshub.gr';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')        || '';
const SUPABASE_ANON_KEY   = Deno.env.get('SUPABASE_ANON_KEY')   || '';
const SUPABASE_SERVICE_ROLE_KEY = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/**
 * Cloudflare configuration. Resolved with `resolveSecret`, never `Deno.env.get`.
 *
 * `Deno.env.set` throws on the Supabase edge runtime, so `bootstrapSecretsFromDb` cannot actually
 * populate env there — a `Deno.env.get` on an admin-editable key comes back undefined for ever
 * with nothing logged. Three of these four keys exist ONLY in `platform_secrets` (an operator adds
 * them from Profile → Keys, no redeploy), so reading env would have made this whole panel report
 * "not configured" permanently no matter what the admin saved. `resolveSecret` is env-first and
 * then reads the table, which is the behaviour both halves need.
 *
 * `platform_secrets` is service-role-only, hence the admin client below.
 */
const CLOUDFLARE_SECRET_KEYS = [
  'TURNSTILE_SECRET_KEY',
  'INBOUND_EMAIL_DOMAIN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_EMAIL_WORKER_NAME',
] as const;

interface CloudflareConfig {
  turnstileSecret: string;
  inboundDomain: string;
  apiToken: string;
  accountId: string;
  /** wrangler.toml `name`. The Worker Email Routing invokes for inbound mail. */
  workerName: string;
}

const EMPTY_CLOUDFLARE_CONFIG: CloudflareConfig = {
  turnstileSecret: '', inboundDomain: '', apiToken: '', accountId: '',
  workerName: 'inbound-email-worker',
};

async function loadCloudflareConfig(): Promise<CloudflareConfig> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY()) return EMPTY_CLOUDFLARE_CONFIG;
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY());
    const r = await resolveSecrets(admin, [...CLOUDFLARE_SECRET_KEYS]);
    return {
      turnstileSecret: r.TURNSTILE_SECRET_KEY?.value ?? '',
      inboundDomain:   r.INBOUND_EMAIL_DOMAIN?.value ?? '',
      apiToken:        r.CLOUDFLARE_API_TOKEN?.value ?? '',
      accountId:       r.CLOUDFLARE_ACCOUNT_ID?.value ?? '',
      workerName:      r.CLOUDFLARE_EMAIL_WORKER_NAME?.value || 'inbound-email-worker',
    };
  } catch (e) {
    console.warn('[health-check] Cloudflare secret resolution failed:', e);
    return EMPTY_CLOUDFLARE_CONFIG;
  }
}

interface ServiceResult {
  status: 'healthy' | 'unhealthy';
  latency_ms: number;
  message?: string;
  error?: string;
}

interface ExternalResult extends ServiceResult {
  http_status?: number;
}

/**
 * Cloudflare checks carry `unknown` because two of the three can genuinely be unmeasurable, and
 * #365 `AD-1` is precisely what happens when that state gets rounded to `healthy`: a Vercel light
 * that was green whether Vercel was up or down. Not configured is NOT healthy.
 */
interface CloudflareCheck {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latency_ms: number;
  message?: string;
  error?: string;
  detail?: Record<string, unknown>;
}

// ── AI Provider checks ─────────────────────────────────────────────────────

async function checkClaude(): Promise<ServiceResult> {
  if (!ANTHROPIC_API_KEY()) return { status: 'unhealthy', latency_ms: 0, error: 'API key not configured' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': ANTHROPIC_API_KEY(), 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(8000),
    });
    const latency_ms = Date.now() - start;
    if (res.ok) return { status: 'healthy', latency_ms, message: 'API key valid' };
    const body = await res.json().catch(() => ({}));
    return { status: 'unhealthy', latency_ms, error: body?.error?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e.message };
  }
}

async function checkOpenAI(): Promise<ServiceResult> {
  if (!OPENAI_API_KEY()) return { status: 'unhealthy', latency_ms: 0, error: 'API key not configured' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY()}` },
      signal: AbortSignal.timeout(8000),
    });
    const latency_ms = Date.now() - start;
    if (res.ok) return { status: 'healthy', latency_ms, message: 'API key valid' };
    const body = await res.json().catch(() => ({}));
    return { status: 'unhealthy', latency_ms, error: body?.error?.message || `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e.message };
  }
}

async function checkPaddleOcr(): Promise<ServiceResult> {
  // PaddleOCR-VL structural/OCR backbone on Modal (GET /health, unauth). 303 =
  // scale-to-zero container cold-starting (still healthy).
  const url = (Deno.env.get('PADDLEOCR_MODAL_URL')
    || 'https://basilakis--paddleocr-vl-paddleservice-web.modal.run').replace(/\/$/, '');
  const start = Date.now();
  try {
    const res = await fetch(`${url}/health`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const latency_ms = Date.now() - start;
    if (res.ok) return { status: 'healthy', latency_ms, message: 'PaddleOCR-VL on Modal (PP-DocLayoutV2 + 0.9B VLM)' };
    if (res.status === 303 || res.status === 0) return { status: 'healthy', latency_ms, message: 'PaddleOCR cold-starting (Modal)' };
    return { status: 'unhealthy', latency_ms, error: `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: (e as Error).message };
  }
}

async function checkSlig(): Promise<ServiceResult> {
  // SLIG (SigLIP2) visual embeddings run on Modal, not HuggingFace.
  // Probe the unauthenticated GET /health; a 303 means the scale-to-zero
  // container is cold-starting (still healthy, just waking up).
  const start = Date.now();
  try {
    const res = await fetch(`${SLIG_MODAL_URL().replace(/\/$/, '')}/health`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const latency_ms = Date.now() - start;
    if (res.ok) return { status: 'healthy', latency_ms, message: 'SLIG on Modal (siglip2-base-512, 768D)' };
    if (res.status === 303 || res.status === 0) return { status: 'healthy', latency_ms, message: 'SLIG cold-starting (Modal)' };
    return { status: 'unhealthy', latency_ms, error: `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e.message };
  }
}

async function checkVoyageAI(): Promise<ServiceResult> {
  if (!VOYAGE_API_KEY()) return { status: 'unhealthy', latency_ms: 0, error: 'API key not configured' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VOYAGE_API_KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voyage-4', input: 'ping' }),
      signal: AbortSignal.timeout(10000),
    });
    const latency_ms = Date.now() - start;
    if (res.ok) return { status: 'healthy', latency_ms, message: 'Embeddings API reachable' };
    const body = await res.json().catch(() => ({}));
    return { status: 'unhealthy', latency_ms, error: body?.detail || `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e.message };
  }
}

// ── Python backend service checks ──────────────────────────────────────────

async function checkPythonEndpoint(path: string): Promise<ServiceResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${MIVAA_GATEWAY_URL}${path}`, { signal: AbortSignal.timeout(8000) });
    const latency_ms = Date.now() - start;
    if (res.ok) return { status: 'healthy', latency_ms, message: 'Service operational' };
    return { status: 'unhealthy', latency_ms, error: `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e.message };
  }
}

// ── External service reachability checks ──────────────────────────────────
// Any HTTP response (including 401/403/429) = service is UP.
// Only connection errors / timeouts = DOWN.

const EXTERNAL_SERVICES = [
  { name: 'Zernio',      url: 'https://zernio.com/api/v1',     category: 'messaging', icon: '📱' },
  { name: 'Apollo',      url: 'https://api.apollo.io',         category: 'b2b',       icon: '🏢' },
  { name: 'Hunter.io',   url: 'https://api.hunter.io/v2',      category: 'b2b',       icon: '📧' },
  { name: 'ZeroBounce',  url: 'https://api.zerobounce.net/v2', category: 'b2b',       icon: '✉️' },
  { name: 'Firecrawl',   url: 'https://api.firecrawl.dev',     category: 'scraping',  icon: '🕷️' },
  { name: 'WorldLabs',   url: 'https://api.worldlabs.ai',      category: 'vr',        icon: '🌐' },
  { name: 'Stripe',      url: 'https://api.stripe.com/v1',     category: 'payments',  icon: '💳' },
  { name: 'Zernio',      url: 'https://zernio.com',            category: 'social',    icon: '📲' },
  { name: 'xAI Aurora',  url: 'https://api.x.ai',              category: 'social',    icon: '✨' },
];

// Module-gated external services: included only when the listed module is enabled.
// Keyed by module slug → service definitions (same shape as EXTERNAL_SERVICES).
const MODULE_SERVICES: Record<string, { name: string; url: string; category: string; icon: string }[]> = {
  'greek-marketplaces': [
    { name: 'Skroutz',      url: 'https://www.skroutz.gr',    category: 'marketplace', icon: '🛒' },
    { name: 'Bestprice.gr', url: 'https://www.bestprice.gr',  category: 'marketplace', icon: '🛍️' },
    { name: 'Shopflix.gr',  url: 'https://www.shopflix.gr',   category: 'marketplace', icon: '🏬' },
  ],
};

// ── Cloudflare ─────────────────────────────────────────────────────────────
// Three independent surfaces, deliberately checked three different ways, because they fail
// differently and only one of them can be pinged.

/**
 * Turnstile — the bot gate on every public form (/tools estimator, kitchen lead, careers).
 *
 * Reachability alone is not the check worth having: the failure that actually happens is a
 * ROTATED OR WRONG SECRET, and its symptom is that every real visitor's submission is rejected
 * while the endpoint stays perfectly up. So probe with a deliberately-invalid token and read which
 * error Cloudflare returns — it grades our secret for us:
 *
 *   invalid-input-response → the secret was accepted, only the token was junk. Working.
 *   invalid-input-secret   → OUR key is wrong. Every public form is silently refusing people.
 *   success: true          → a Cloudflare TESTING secret is in production. The gate passes
 *                            everything, and looks perfect from every other angle.
 *
 * All three verified against the live endpoint rather than assumed from the docs.
 */
async function checkTurnstile(cfg: CloudflareConfig): Promise<CloudflareCheck> {
  const secret = cfg.turnstileSecret;
  if (!secret) {
    return { status: 'unknown', latency_ms: 0, message: 'TURNSTILE_SECRET_KEY not set — public forms are ungated, and this check cannot run' };
  }
  const start = Date.now();
  try {
    const body = new FormData();
    body.append('secret', secret);
    body.append('response', 'health-check-probe-expected-to-fail');
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body, signal: AbortSignal.timeout(8000),
    });
    const latency_ms = Date.now() - start;
    if (!res.ok) {
      return { status: 'unhealthy', latency_ms, error: `siteverify returned HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => ({})) as { success?: boolean; 'error-codes'?: string[] };
    const codes = json['error-codes'] ?? [];
    if (codes.includes('invalid-input-secret') || codes.includes('missing-input-secret')) {
      return {
        status: 'unhealthy', latency_ms,
        error: 'Cloudflare rejected our Turnstile SECRET — every public form is refusing real submissions',
        detail: { error_codes: codes },
      };
    }
    if (codes.includes('invalid-input-response')) {
      return { status: 'healthy', latency_ms, message: 'siteverify reachable, secret accepted' };
    }
    if (json.success === true) {
      // We sent a token that cannot be valid, and Cloudflare said yes. That is what its TESTING
      // secrets do (`1x0000…AA` always passes) — verified against the live endpoint. In production
      // it means the bot gate is accepting everything, which is indistinguishable from healthy
      // from anywhere else on this dashboard.
      return {
        status: 'unhealthy', latency_ms,
        error: 'siteverify ACCEPTED a deliberately-invalid token — this is a Cloudflare testing secret, so the bot gate is passing everything',
      };
    }
    // Some other shape. The endpoint answered but not in a way we recognise, and an unrecognised
    // answer is not a passing one.
    return {
      status: 'degraded', latency_ms,
      message: 'siteverify answered with an unrecognised result',
      detail: { success: json.success, error_codes: codes },
    };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Email Routing — the MX half.
 *
 * The inbound Worker has NO fetch handler (wrangler.toml sets `workers_dev = false` on purpose),
 * so there is nothing to ping: Email Routing invokes it over SMTP and HTTP never does. What CAN be
 * checked, and is the single most likely silent failure, is whether the receiving domain's MX still
 * points at Cloudflare. Lose that record and mail simply stops arriving — no error, no alert, no
 * row anywhere. Resolved over DNS-over-HTTPS so it needs no credential.
 */
async function checkEmailRoutingMx(cfg: CloudflareConfig): Promise<CloudflareCheck> {
  const domain = cfg.inboundDomain;
  if (!domain) {
    return { status: 'unknown', latency_ms: 0, message: 'INBOUND_EMAIL_DOMAIN not set — no receiving domain to check' };
  }
  const start = Date.now();
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(8000) },
    );
    const latency_ms = Date.now() - start;
    if (!res.ok) return { status: 'unknown', latency_ms, error: `DNS query failed: HTTP ${res.status}` };
    const json = await res.json().catch(() => ({})) as { Answer?: Array<{ data?: string }> };
    const hosts = (json.Answer ?? []).map((a) => String(a.data ?? '').toLowerCase());
    const routed = hosts.filter((h) => h.includes('mx.cloudflare.net'));
    if (hosts.length === 0) {
      return {
        status: 'unhealthy', latency_ms,
        error: `${domain} has NO MX record — inbound mail is not being delivered anywhere`,
      };
    }
    if (routed.length === 0) {
      return {
        status: 'unhealthy', latency_ms,
        error: `${domain} MX does not point at Cloudflare Email Routing — the inbound Worker cannot be reached`,
        detail: { mx: hosts },
      };
    }
    return {
      status: 'healthy', latency_ms,
      message: `${domain} MX → Cloudflare Email Routing (${routed.length} record${routed.length === 1 ? '' : 's'})`,
      detail: { mx: hosts },
    };
  } catch (e) {
    return { status: 'unknown', latency_ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Workers — the only part with a real API behind it, and the only part that needs a credential.
 *
 * Verifies the token, then confirms the inbound Worker script actually exists on the account.
 * Without a token this reports UNKNOWN and names the two secrets to add. It does not report
 * healthy: an unconfigured check has measured nothing.
 */
async function checkCloudflareWorkers(cfg: CloudflareConfig): Promise<CloudflareCheck> {
  const token = cfg.apiToken;
  const accountId = cfg.accountId;
  if (!token) {
    return {
      status: 'unknown', latency_ms: 0,
      message: 'Not measured — set CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) to verify the deployed Worker',
    };
  }
  const start = Date.now();
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const verify = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: auth, signal: AbortSignal.timeout(8000),
    });
    const verifyJson = await verify.json().catch(() => ({})) as { success?: boolean; result?: { status?: string } };
    if (!verify.ok || verifyJson.success !== true) {
      return {
        status: 'unhealthy', latency_ms: Date.now() - start,
        error: `Cloudflare API token rejected (HTTP ${verify.status})`,
      };
    }
    if (verifyJson.result?.status && verifyJson.result.status !== 'active') {
      return {
        status: 'unhealthy', latency_ms: Date.now() - start,
        error: `Cloudflare API token is ${verifyJson.result.status}`,
      };
    }

    if (!accountId) {
      return {
        status: 'degraded', latency_ms: Date.now() - start,
        message: 'Token valid, but CLOUDFLARE_ACCOUNT_ID is unset — the Worker itself was not checked',
      };
    }

    const want = cfg.workerName;
    const scripts = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts`,
      { headers: auth, signal: AbortSignal.timeout(8000) },
    );
    const latency_ms = Date.now() - start;
    const scriptsJson = await scripts.json().catch(() => ({})) as {
      success?: boolean; result?: Array<{ id?: string; modified_on?: string }>;
    };
    if (!scripts.ok || scriptsJson.success !== true) {
      return {
        status: 'degraded', latency_ms,
        error: `Token is valid but the Workers list was refused (HTTP ${scripts.status}) — check the token's permissions`,
      };
    }
    const found = (scriptsJson.result ?? []).find((r) => r.id === want);
    if (!found) {
      return {
        status: 'unhealthy', latency_ms,
        error: `Worker "${want}" is not deployed on this account — inbound mail has nothing to invoke`,
        detail: { deployed: (scriptsJson.result ?? []).map((r) => r.id).filter(Boolean) },
      };
    }
    return {
      status: 'healthy', latency_ms,
      message: `Worker "${want}" deployed`,
      detail: { modified_on: found.modified_on ?? null, worker_count: (scriptsJson.result ?? []).length },
    };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Worst-of, with `unknown` ranked between healthy and degraded — it is not a pass. */
function worstCloudflareStatus(parts: CloudflareCheck[]): CloudflareCheck['status'] {
  const rank = { healthy: 0, unknown: 1, degraded: 2, unhealthy: 3 } as const;
  let worst: CloudflareCheck['status'] = 'healthy';
  for (const p of parts) if (rank[p.status] > rank[worst]) worst = p.status;
  return worst;
}

/**
 * The deployed frontend itself. `SystemHealthMonitor` used to render Vercel as a hard-coded
 * `{ status: 'healthy', message: 'Platform operational' }` — a health indicator that was green
 * whether Vercel was up or down (#365 `AD-1`). A HEAD against the app's own origin is the check
 * that light was always claiming to be.
 *
 * Any HTTP response means the deployment is serving. Only a network-level failure — DNS, TLS,
 * timeout, a Vercel outage — is unhealthy. A 5xx is reported as degraded rather than healthy,
 * because the edge answered but the app did not.
 */
async function checkVercel(): Promise<ExternalResult & { message?: string }> {
  const url = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const latency_ms = Date.now() - start;
    if (res.status >= 500) {
      return { status: 'unhealthy', latency_ms, http_status: res.status, error: `Deployment returned ${res.status}` };
    }
    return { status: 'healthy', latency_ms, http_status: res.status, message: `Serving ${url} (${res.status})` };
  } catch (e) {
    return {
      status: 'unhealthy',
      latency_ms: Date.now() - start,
      error: e instanceof Error ? e.message : 'Unreachable',
    };
  }
}

async function checkExternalService(url: string): Promise<ExternalResult> {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const latency_ms = Date.now() - start;
    // Any HTTP response means the service is reachable (401/403/429 are expected without auth)
    return { status: 'healthy', latency_ms, http_status: res.status };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: 'Unreachable' };
  }
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(withApiLogging('health-check', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Resolve which module-gated services are live (e.g. Skroutz/Bestprice/Shopflix
  // only appear when `greek-marketplaces` is enabled).
  let enabledModuleSlugs: string[] = [];
  try {
    const { data: moduleRows } = await supabase
      .from('modules')
      .select('slug')
      .eq('enabled', true);
    enabledModuleSlugs = (moduleRows || []).map((r: { slug: string }) => r.slug);
  } catch {
    // If the query fails, silently skip module-gated checks.
  }

  const activeServices = [
    ...EXTERNAL_SERVICES,
    ...enabledModuleSlugs.flatMap((slug) => MODULE_SERVICES[slug] || []),
  ];

  // Resolved once, before the fan-out, so the three Cloudflare checks share one read of
  // platform_secrets rather than three.
  const cfConfig = await loadCloudflareConfig();

  // Run every check in parallel
  const externalChecks = activeServices.map(svc => checkExternalService(svc.url));

  const [
    claude, openai, slig, paddleocr, voyage_ai,
    embeddings, ai_services, vercel,
    turnstile, emailRoutingMx, workers, inboundDelivery,
    ...externalResults
  ] = await Promise.all([
    checkClaude(),
    checkOpenAI(),
    checkSlig(),
    checkPaddleOcr(),
    checkVoyageAI(),
    checkPythonEndpoint('/api/embeddings/health'),
    checkPythonEndpoint('/api/v1/ai-services/health'),
    checkVercel(),
    checkTurnstile(cfConfig),
    checkEmailRoutingMx(cfConfig),
    checkCloudflareWorkers(cfConfig),
    // Delivery OUTCOMES for the Email Routing → Worker → email-webhooks path. Read through the
    // caller's own client so the RPC's is_platform_admin() self-guard applies.
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_inbound_email_health', { p_days: 7 });
        return error ? null : data;
      } catch {
        return null;
      }
    })(),
    ...externalChecks,
  ]);

  const cloudflare = {
    status: worstCloudflareStatus([turnstile, emailRoutingMx, workers]),
    turnstile,
    email_routing: emailRoutingMx,
    workers,
    // Never rolled into the status above. Zero inbound mail on a low-volume receiving domain is a
    // legitimate quiet, not a fault — the MX check is what says whether mail COULD arrive. Shown
    // so an operator can tell the two apart instead of guessing from a colour.
    inbound_delivery: inboundDelivery ?? null,
  };

  const external = activeServices.map((svc, i) => ({
    name: svc.name,
    category: svc.category,
    icon: svc.icon,
    ...externalResults[i],
  }));

  return new Response(JSON.stringify({
    claude, openai, slig, paddleocr, voyage_ai,
    embeddings, ai_services, vercel,
    cloudflare,
    external,
    timestamp: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
