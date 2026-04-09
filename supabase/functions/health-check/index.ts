/**
 * Health Check Edge Function
 *
 * Runs server-side checks (no CORS, real HTTP status codes) for all services:
 *
 * AI providers (key validity):
 *   - Claude:      GET /v1/models          — no tokens consumed
 *   - OpenAI:      GET /v1/models          — no tokens consumed
 *   - HuggingFace: GET /api/whoami-v2      — verifies token + account name
 *   - Voyage AI:   POST /v1/embeddings     — minimal single-word embedding
 *
 * Python backend services:
 *   - Embeddings:  GET /api/embeddings/health
 *   - AI Services: GET /api/v1/ai-services/health
 *
 * External third-party APIs (reachability — any HTTP response = UP, only timeout = DOWN):
 *   - Twilio, Apollo, Hunter.io, ZeroBounce, Firecrawl, WorldLabs, Stripe
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const ANTHROPIC_API_KEY   = Deno.env.get('ANTHROPIC_API_KEY')   || '';
const OPENAI_API_KEY      = Deno.env.get('OPENAI_API_KEY')      || '';
const HUGGINGFACE_API_KEY = Deno.env.get('HUGGINGFACE_API_KEY') || '';
const VOYAGE_API_KEY      = Deno.env.get('VOYAGE_API_KEY')      || '';
const MIVAA_GATEWAY_URL   = Deno.env.get('MIVAA_GATEWAY_URL')   || 'https://v1api.materialshub.gr';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')        || '';
const SUPABASE_ANON_KEY   = Deno.env.get('SUPABASE_ANON_KEY')   || '';

interface ServiceResult {
  status: 'healthy' | 'unhealthy';
  latency_ms: number;
  message?: string;
  error?: string;
}

interface ExternalResult extends ServiceResult {
  http_status?: number;
}

// ── AI Provider checks ─────────────────────────────────────────────────────

async function checkClaude(): Promise<ServiceResult> {
  if (!ANTHROPIC_API_KEY) return { status: 'unhealthy', latency_ms: 0, error: 'API key not configured' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
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
  if (!OPENAI_API_KEY) return { status: 'unhealthy', latency_ms: 0, error: 'API key not configured' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` },
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

async function checkHuggingFace(): Promise<ServiceResult> {
  if (!HUGGINGFACE_API_KEY) return { status: 'unhealthy', latency_ms: 0, error: 'API key not configured' };
  const start = Date.now();
  try {
    const res = await fetch('https://huggingface.co/api/whoami-v2', {
      headers: { 'Authorization': `Bearer ${HUGGINGFACE_API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    const latency_ms = Date.now() - start;
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      return { status: 'healthy', latency_ms, message: body?.name ? `Authenticated as ${body.name}` : 'Token valid' };
    }
    return { status: 'unhealthy', latency_ms, error: `HTTP ${res.status}` };
  } catch (e) {
    return { status: 'unhealthy', latency_ms: Date.now() - start, error: e.message };
  }
}

async function checkVoyageAI(): Promise<ServiceResult> {
  if (!VOYAGE_API_KEY) return { status: 'unhealthy', latency_ms: 0, error: 'API key not configured' };
  const start = Date.now();
  try {
    const res = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'voyage-3-lite', input: 'ping' }),
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
  { name: 'Twilio',      url: 'https://api.twilio.com',        category: 'messaging', icon: '📱' },
  { name: 'Apollo',      url: 'https://api.apollo.io',         category: 'b2b',       icon: '🏢' },
  { name: 'Hunter.io',   url: 'https://api.hunter.io/v2',      category: 'b2b',       icon: '📧' },
  { name: 'ZeroBounce',  url: 'https://api.zerobounce.net/v2', category: 'b2b',       icon: '✉️' },
  { name: 'Firecrawl',   url: 'https://api.firecrawl.dev',     category: 'scraping',  icon: '🕷️' },
  { name: 'WorldLabs',   url: 'https://api.worldlabs.ai',      category: 'vr',        icon: '🌐' },
  { name: 'Stripe',      url: 'https://api.stripe.com/v1',     category: 'payments',  icon: '💳' },
  { name: 'Late.dev',    url: 'https://api.getlate.dev',       category: 'social',    icon: '📲' },
  { name: 'xAI Aurora',  url: 'https://api.x.ai',              category: 'social',    icon: '✨' },
];

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

  // Run every check in parallel
  const externalChecks = EXTERNAL_SERVICES.map(svc => checkExternalService(svc.url));

  const [
    claude, openai, huggingface, voyage_ai,
    embeddings, ai_services,
    ...externalResults
  ] = await Promise.all([
    checkClaude(),
    checkOpenAI(),
    checkHuggingFace(),
    checkVoyageAI(),
    checkPythonEndpoint('/api/embeddings/health'),
    checkPythonEndpoint('/api/v1/ai-services/health'),
    ...externalChecks,
  ]);

  const external = EXTERNAL_SERVICES.map((svc, i) => ({
    name: svc.name,
    category: svc.category,
    icon: svc.icon,
    ...externalResults[i],
  }));

  return new Response(JSON.stringify({
    claude, openai, huggingface, voyage_ai,
    embeddings, ai_services,
    external,
    timestamp: new Date().toISOString(),
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
