#!/usr/bin/env node
/**
 * build-openapi-edge.mjs
 *
 * Generates docs/api/openapi-edge.json — an OpenAPI 3.0.3 spec for the
 * Supabase Edge Functions (the Deno/TypeScript surface that FastAPI's
 * /openapi.json does NOT cover).
 *
 * Source of truth: scripts/edge-endpoints.json (a hand-maintained, code-derived
 * array of function metadata). To update: edit that JSON, then re-run:
 *
 *     node scripts/build-openapi-edge.mjs
 *
 * Why hand-maintained: edge functions are action-based Deno handlers with no
 * runtime schema to introspect, so the metadata is extracted from the code by
 * hand. Keep it in sync when you add/change a function.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(__dirname, 'edge-endpoints.json');
// Emit to BOTH the repo doc (GitHub-viewable) and the served static asset
// (public/api → dist/api → https://<frontend>/api/openapi-edge.json). One source,
// two identical outputs, so they can't drift.
const OUTS = [join(ROOT, 'docs', 'api', 'openapi-edge.json'), join(ROOT, 'public', 'api', 'openapi-edge.json')];

const fns = JSON.parse(readFileSync(SRC, 'utf8'));

// ---- security schemes ----
const securitySchemes = {
  supabaseJwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Supabase user session JWT — `Authorization: Bearer <token>`.' },
  apiKeyPartner: { type: 'http', scheme: 'bearer', description: 'Partner API key `kai_*` (external integrations) — `Authorization: Bearer kai_…`.' },
  apiKeySecret: { type: 'apiKey', in: 'header', name: 'apikey', description: 'Platform admin secret key `sb_secret_*` (full access).' },
  cronSecret: { type: 'apiKey', in: 'header', name: 'x-cron-secret', description: 'Shared cron secret (`CRON_SECRET`). pg_cron / scheduled invocations only.' },
  stripeSignature: { type: 'apiKey', in: 'header', name: 'stripe-signature', description: 'Stripe webhook signature.' },
  zernioSignature: { type: 'apiKey', in: 'header', name: 'X-Zernio-Signature', description: 'Zernio webhook HMAC-SHA256 signature.' },
  svixSignature: { type: 'apiKey', in: 'header', name: 'svix-signature', description: 'Svix/Resend webhook signature.' },
  snsSignature: { type: 'apiKey', in: 'header', name: 'x-amz-sns-message-type', description: 'AWS SNS message (Amazon SES notifications).' },
  queryToken: { type: 'apiKey', in: 'query', name: 'token', description: 'Public share / session token (sent in body or query depending on the function).' },
};
const SCHEME_KEYS = new Set(Object.keys(securitySchemes));

// ---- helpers ----
function mapType(raw) {
  if (!raw || typeof raw !== 'string') return { type: 'string' };
  let t = raw.trim();
  if (t.endsWith('[]')) return { type: 'array', items: mapType(t.slice(0, -2)) };
  if (/^(string|number|integer|boolean|object|array)$/.test(t)) return { type: t };
  if (t.includes('|')) return { type: 'string', description: `one of: ${t}` };
  // unknown / union-ish / TS-ish → string with a hint
  return { type: 'string', description: t };
}

// Agents emitted action objects with either {name,summary} or {action,description}.
const actName = (a) => a && (a.name || a.action || a.method || '');
const actSummary = (a) => (a && (a.summary || a.description)) || '';

function propsFromParams(params = []) {
  const props = {};
  for (const p of params) {
    if (!p || !p.name) continue;
    const s = mapType(p.type);
    if (p.desc) s.description = s.description ? `${p.desc} (${s.description})` : p.desc;
    props[p.name] = s;
  }
  return props;
}
function requiredNames(params = []) {
  return params.filter((p) => p && p.name && p.required).map((p) => p.name);
}

function isRestStyle(fn) {
  return Array.isArray(fn.actions) && fn.actions.some((a) => /[ /]/.test(actName(a)));
}

function securityFor(fn) {
  const keys = (fn.security || []).filter((k) => SCHEME_KEYS.has(k));
  const isPublic = (fn.security || []).includes('public');
  if (keys.length === 0) return []; // public / unauthenticated
  // OR semantics: any one of the listed schemes satisfies auth
  const sec = keys.map((k) => ({ [k]: [] }));
  if (isPublic) sec.push({}); // public fallback path also allowed
  return sec;
}

function descriptionFor(fn) {
  let d = fn.description || fn.summary || '';
  if (isRestStyle(fn) && fn.actions) {
    d += '\n\n**Routes / actions:**\n' + fn.actions.map((a) => `- \`${actName(a)}\` — ${actSummary(a)}`).join('\n');
  }
  if (Array.isArray(fn.actions) && !isRestStyle(fn) && fn.actions.some((a) => a.response)) {
    // responses documented per-action in the oneOf branches' descriptions
  }
  if (fn.response) d += `\n\n**Response:** \`${fn.response}\``;
  if (fn.docs) d += `\n\n📖 [docs/${fn.docs}](${fn.docs.replace(/^api\//, '')})`;
  return d.trim();
}

function requestBodyFor(fn) {
  // action-discriminated with clean action names → oneOf on `action`
  if (Array.isArray(fn.actions) && fn.actions.length && !isRestStyle(fn)) {
    const oneOf = fn.actions.filter((a) => actName(a)).map((a) => {
      const props = { action: { type: 'string', enum: [actName(a)], description: actSummary(a) }, ...propsFromParams(a.params) };
      const required = ['action', ...requiredNames(a.params)];
      const schema = { type: 'object', required, properties: props };
      if (a.response) schema.description = `Returns: ${a.response}`;
      return schema;
    });
    return {
      required: true,
      content: { 'application/json': { schema: { oneOf, discriminator: { propertyName: 'action' } } } },
    };
  }
  // flat request body (flags / typed fields)
  if (Array.isArray(fn.request) && fn.request.length) {
    const required = requiredNames(fn.request);
    const schema = { type: 'object', properties: propsFromParams(fn.request) };
    if (required.length) schema.required = required;
    return { required: required.length > 0, content: { 'application/json': { schema } } };
  }
  // REST-style (method+path actions) → free-form object, routes listed in description
  if (isRestStyle(fn)) {
    return { content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };
  }
  // webhook with a provider payload
  const sig = (fn.security || []).some((k) => /Signature$/.test(k) || k === 'queryToken');
  if (sig) {
    return { description: 'Provider event payload (verified by signature).', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };
  }
  return null; // pure cron, no body
}

const genericResponses = (hasAuth) => {
  const r = {
    '200': { description: 'Success', content: { 'application/json': { schema: { type: 'object' } } } },
    '400': { description: 'Bad request (validation error)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    '500': { description: 'Internal error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  };
  if (hasAuth) {
    r['401'] = { description: 'Unauthorized (missing/invalid credential)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
    r['403'] = { description: 'Forbidden (role/entitlement)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
  }
  return r;
};

// ---- build paths ----
const paths = {};
const tagSet = new Set();
for (const fn of fns) {
  tagSet.add(fn.tag || 'Misc');
  const methods = (fn.methods && fn.methods.length ? fn.methods : ['POST']).map((m) => m.toLowerCase());
  const sec = securityFor(fn);
  const hasAuth = sec.length > 0 && !(sec.length === 1 && Object.keys(sec[0]).length === 0);
  const body = requestBodyFor(fn);
  const p = `/${fn.name}`;
  paths[p] = paths[p] || {};
  for (const m of methods) {
    const op = {
      tags: [fn.tag || 'Misc'],
      summary: fn.summary || fn.name,
      operationId: `${m}_${fn.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      description: descriptionFor(fn),
      security: sec,
      responses: genericResponses(hasAuth),
    };
    if (m !== 'get' && m !== 'delete' && body) op.requestBody = body;
    paths[p][m] = op;
  }
}

const TAG_ORDER = [
  'AI Agents', 'AI Generation', 'Social', 'Search', 'MIVAA Gateway', 'Knowledge Base',
  'Finance', 'Payments', 'Quotes', 'CRM', 'Business Profile',
  'Catalogs', 'Moodboard & Sheets', 'PDF Processing', 'Data Import', 'Scraping',
  'Email', 'Messaging', 'Pinterest', 'Notifications', 'Recommendations',
  'SEO', 'Flows', 'Alerts', 'Monitoring Crons', 'Background Agents', 'Crons', 'Admin', 'Internal', 'Misc',
];
const TAG_DESCRIPTIONS = {
  'AI Agents': 'KAI multi-agent chat (LangGraph + Claude), SSE streaming, tool gating.',
  'AI Generation': 'Image / video / 3D / VR / PBR generation (Gemini, Replicate, WorldLabs).',
  'Social': 'Social publishing + AI content/image/video generation (Zernio).',
  'Search': 'Search re-ranking and relevance.',
  'MIVAA Gateway': 'Proxy to the MIVAA Python backend (RAG, search, AI services).',
  'Knowledge Base': 'KB document embeddings.',
  'Finance': 'Greek e-invoicing (AADE/myDATA via Novus), AR/AP, POS, storefront, statements.',
  'Payments': 'Stripe checkout, Connect onboarding, and webhooks.',
  'Quotes': 'Quote documents, public white-label share, email, PDF.',
  'CRM': 'Companies, contacts, users, Stripe state (consolidated crm-api router).',
  'Business Profile': 'VAT/registry validation (VIES, ΑΑΔΕ) and role upgrades.',
  'Catalogs': 'Presentation catalogs: extract, translate, render, email-gate, send.',
  'Moodboard & Sheets': 'Presentation sheets + project Client View deliverables.',
  'PDF Processing': 'Batch PDF processing.',
  'Data Import': 'XML import, field templates, AI field suggestion.',
  'Scraping': 'Web scraping sessions, sitemap, single-page, site crawl.',
  'Email': 'Transactional/marketing email (Resend/SES) + webhooks.',
  'Messaging': 'WhatsApp messaging via Zernio (Meta Cloud API).',
  'Pinterest': 'Pinterest OAuth + pin import.',
  'Notifications': 'Push / webhook / VAPID notification dispatch.',
  'Recommendations': 'Collaborative-filtering recommendations + interaction tracking.',
  'SEO': 'SEO toolkit: research, plan, write, analyze, pipeline.',
  'Flows': 'Visual workflow automation engine (execute, schedule, webhook).',
  'Alerts': 'Saved-search material alerts.',
  'Monitoring Crons': 'Scheduled refreshers for price / mention / job research + LLM probes.',
  'Background Agents': 'Background agent execution + delegation.',
  'Crons': 'Service-role scheduled maintenance (pg_cron).',
  'Admin': 'Operator/admin utilities (secrets, reset, health, seeds).',
  'Internal': 'Internal proxies called by agents/service-role.',
  'Misc': 'Uncategorised.',
};
const tags = [...tagSet]
  .sort((a, b) => {
    const ia = TAG_ORDER.indexOf(a), ib = TAG_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
  })
  .map((name) => ({ name, description: TAG_DESCRIPTIONS[name] || `${name} functions.` }));

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'Material KAI — Supabase Edge Functions',
    version: '1.0.0',
    license: { name: 'Proprietary' },
    description:
      'OpenAPI for the **Supabase Edge Functions** (Deno/TypeScript) of the Material KAI Vision Platform.\n\n' +
      'This is the companion to the FastAPI-generated `openapi.json` at `https://v1api.materialshub.gr/openapi.json`, ' +
      'which covers the **MIVAA Python** backend only. Edge functions are a separate runtime with no auto-generated ' +
      'schema, so this spec is **hand-maintained** from the source code (`scripts/edge-endpoints.json` → ' +
      '`scripts/build-openapi-edge.mjs`).\n\n' +
      'Most functions are **action-based**: POST a JSON body with an `action` field; the spec models each action as a ' +
      'discriminated `oneOf` branch. Finance/REST-style functions use typed bodies or path/method routing (see each ' +
      "operation's description). Auth varies per function — see `security` and the scheme descriptions.",
  },
  servers: [{ url: 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1', description: 'Production' }],
  tags,
  paths,
  components: {
    securitySchemes,
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string' },
          code: { type: 'string' },
        },
      },
    },
  },
};

import { mkdirSync } from 'node:fs';
const json = JSON.stringify(spec, null, 2) + '\n';
for (const out of OUTS) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
  console.log(`Wrote ${out}`);
}
console.log(`  functions: ${fns.length}  paths: ${Object.keys(paths).length}  tags: ${tags.length}`);
