#!/usr/bin/env node
/** build-openapi-edge.mjs */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(__dirname, 'edge-endpoints.json');
// Committed AND bundled by Vite to /api/openapi-edge.json, which the Swagger UI and admin dashboard load.
const OUTS = [join(ROOT, 'public', 'api', 'openapi-edge.json')];

const fns = JSON.parse(readFileSync(SRC, 'utf8'));

/** Where a `docs` pointer resolves from the HOSTED Swagger UI (not from the repo). */
const DOCS_BASE = 'https://github.com/creativeghq/material-kai-vision-platform/blob/main';

// ---- security schemes ----
const securitySchemes = {
  supabaseJwt: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Supabase user session JWT — `Authorization: Bearer <token>`.' },
  apiKeyPartner: { type: 'http', scheme: 'bearer', description: 'Partner API key `kai_*` (external integrations) — `Authorization: Bearer kai_…`.' },
  apiKeySecret: { type: 'apiKey', in: 'header', name: 'apikey', description: 'Platform admin secret key `sb_secret_*` (full access).' },
  supabaseAnonKey: { type: 'apiKey', in: 'header', name: 'apikey', description: 'The project\'s public (anon / publishable) key. Database (`/rest/v1`) calls need it AND the user JWT — the key alone reads nothing.' },
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

/** `request` is a param list, or `{content_type, fields, required}`; older entries say `params`. */
const requestParams = (fn) => (Array.isArray(fn.request) ? fn.request : Array.isArray(fn.params) ? fn.params : []);

function schemaFromFields(req) {
  const properties = {};
  const required = new Set(Array.isArray(req.required) ? req.required : []);
  for (const [name, spec] of Object.entries(req.fields || {})) {
    if (!spec || typeof spec !== 'object') continue;
    const { required: isRequired, ...rest } = spec;
    if (isRequired === true) required.add(name);
    const typed = mapType(rest.type);
    properties[name] = /^(string|number|integer|boolean|object|array)$/.test(rest.type)
      ? rest
      : { ...rest, ...typed, ...(rest.description && typed.description ? { description: `${rest.description} (${typed.description})` } : {}) };
  }
  const schema = { type: 'object', properties };
  if (required.size) schema.required = [...required];
  return schema;
}

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
  if (Array.isArray(fn.routes) && fn.routes.length) {
    d += `\n\n**Sub-paths:** ${fn.routes.map((r) => `\`/${fn.name}/${r}\``).join(', ')}`;
  }
  if (Array.isArray(fn.actions) && !isRestStyle(fn) && fn.actions.some((a) => actSummary(a) || a.response)) {
    d += '\n\n**Actions** (`action` in the body):\n' + fn.actions.filter(actName).map((a) => {
      const ret = a.response ? ` → \`${String(a.response).replace(/`/g, "'")}\`` : '';
      return `- \`${actName(a)}\` — ${actSummary(a)}${ret}`;
    }).join('\n');
  }
  // `response` is either a shape string or a {content_type, description} object. Interpolating the
  // object rendered `[object Object]` into the published spec for 20 functions.
  if (fn.response) {
    const r = typeof fn.response === 'string'
      ? `\`${fn.response}\``
      : [fn.response.description, fn.response.content_type ? `(\`${fn.response.content_type}\`)` : ''].filter(Boolean).join(' ');
    if (r) d += `\n\n**Response:** ${r}`;
  }
  // Absolute: the hosted Swagger UI resolves a repo-relative link against /api/ and 404s.
  if (fn.docs) d += `\n\n📖 [${fn.docs}](${DOCS_BASE}/${fn.docs})`;
  return d.trim();
}

function requestBodyFor(fn) {
  // action-discriminated with clean action names → oneOf on `action`
  if (Array.isArray(fn.actions) && fn.actions.length && !isRestStyle(fn)) {
    // `common` holds fields every action takes (e.g. workspace_id), stated once in the source.
    const common = Array.isArray(fn.common) ? fn.common : [];
    const oneOf = fn.actions.filter((a) => actName(a)).map((a) => {
      const params = [...common, ...(a.params || [])];
      const props = { action: { type: 'string', enum: [actName(a)], description: actSummary(a) }, ...propsFromParams(params) };
      const required = ['action', ...requiredNames(params)];
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
  const flat = requestParams(fn);
  if (flat.length) {
    const required = requiredNames(flat);
    const schema = { type: 'object', properties: propsFromParams(flat) };
    if (required.length) schema.required = required;
    return { required: required.length > 0, content: { 'application/json': { schema } } };
  }
  if (fn.request && !Array.isArray(fn.request) && fn.request.fields) {
    const schema = schemaFromFields(fn.request);
    const type = fn.request.content_type || 'application/json';
    return { required: Boolean(schema.required), content: { [type]: { schema } } };
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
    // Optional per-method override. A function can serve BOTH a POST action API and a
    // GET query API (e.g. hr-careers: the careers page vs the public job board); without
    // this they'd share one summary/description and read as the same thing.
    const md = (fn.methodDocs && fn.methodDocs[m]) || {};
    const op = {
      tags: [fn.tag || 'Misc'],
      summary: md.summary || fn.summary || fn.name,
      operationId: `${m}_${fn.name.replace(/[^a-zA-Z0-9]/g, '_')}`,
      description: md.description || descriptionFor(fn),
      security: sec,
      responses: genericResponses(hasAuth),
    };
    // GET/DELETE take query params, not a body. `fn.query` documents them; entries may set
    // `methods: ["get"]` on it to scope a param to one method when a function serves several.
    const qp = (fn.query || []).filter((q) => q && q.name && (!q.methods || q.methods.includes(m)));
    if ((m === 'get' || m === 'delete') && qp.length) {
      op.parameters = qp.map((q) => {
        const schema = mapType(q.type);
        const desc = q.desc || schema.description;
        if (schema.description && q.desc) delete schema.description;
        return { name: q.name, in: 'query', required: !!q.required, ...(desc ? { description: desc } : {}), schema };
      });
    }
    if (m !== 'get' && m !== 'delete' && body) op.requestBody = body;
    paths[p][m] = op;
  }
}

// ---- PostgREST resources: columns are a live-schema capture, checked by tests/integration/restEndpointsSchema.test.ts ----
const rest = JSON.parse(readFileSync(join(__dirname, 'rest-endpoints.json'), 'utf8'));
const PROJECT_ORIGIN = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const restSchemas = {};

function pgSchema(pgType) {
  const t = pgType.trim();
  if (t.endsWith('[]')) return { type: 'array', items: pgSchema(t.slice(0, -2)) };
  if (t === 'uuid') return { type: 'string', format: 'uuid' };
  if (t === 'text' || t.startsWith('character')) return { type: 'string' };
  if (t === 'integer' || t === 'smallint') return { type: 'integer' };
  if (t === 'bigint') return { type: 'integer', format: 'int64' };
  if (t === 'numeric' || t === 'real' || t === 'double precision') return { type: 'number' };
  if (t === 'boolean') return { type: 'boolean' };
  if (t === 'date') return { type: 'string', format: 'date' };
  if (t.startsWith('timestamp')) return { type: 'string', format: 'date-time' };
  if (t === 'jsonb' || t === 'json') return {};
  throw new Error(`rest-endpoints.json: no OpenAPI mapping for Postgres type "${pgType}"`);
}

function columnSchema(c) {
  const s = pgSchema(c.type);
  if (c.enum) s.enum = c.nullable ? [...c.enum, null] : c.enum;
  if (c.nullable) s.nullable = true;
  const desc = [c.description, `Postgres \`${c.type}\``].filter(Boolean).join(' · ');
  return { ...s, description: desc };
}

function rowSchema(columns, only) {
  const properties = {};
  for (const c of columns) if (!only || only.includes(c.name)) properties[c.name] = columnSchema(c);
  return { type: 'object', properties };
}

const refName = (name, suffix = '') => `db_${name}${suffix}`;
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const errorBody = { 'application/json': { schema: ref('PostgrestError') } };
const restResponses = (ok) => ({
  ...ok,
  '400': { description: 'Bad filter, unknown column, or a CHECK / NOT NULL violation', content: errorBody },
  '401': { description: 'Missing or expired JWT', content: errorBody },
  '403': { description: 'Row-level security refused the write, or the role lacks the privilege (42501)', content: errorBody },
});
const REST_SECURITY = [{ supabaseAnonKey: [], supabaseJwt: [] }];
const REST_SERVERS = [{ url: PROJECT_ORIGIN, description: 'Production (PostgREST)' }];
const docsLink = (r) => (r.docs ? `\n\n📖 [${r.docs}](${DOCS_BASE}/${r.docs})` : '');

const P = {
  select: { name: 'select', in: 'query', required: false, description: 'Columns to return, comma-separated (default `*`). Embeds follow PostgREST syntax.', schema: { type: 'string' } },
  order: { name: 'order', in: 'query', required: false, description: '`column.asc` / `column.desc`, comma-separated; `.nullslast` allowed.', schema: { type: 'string' } },
  limit: { name: 'limit', in: 'query', required: false, schema: { type: 'integer' } },
  offset: { name: 'offset', in: 'query', required: false, schema: { type: 'integer' } },
  preferCount: { name: 'Prefer', in: 'header', required: false, description: '`count=exact` returns the total in the `Content-Range` header.', schema: { type: 'string', enum: ['count=exact', 'count=planned', 'count=estimated'] } },
  preferReturn: { name: 'Prefer', in: 'header', required: false, description: '`return=representation` returns the written rows; the default returns no body.', schema: { type: 'string', enum: ['return=representation', 'return=minimal'] } },
};
const filterParam = (c) => ({
  name: c.name,
  in: 'query',
  required: false,
  description: `Filter: \`<op>.<value>\` — e.g. \`eq.${c.type === 'uuid' ? '<uuid>' : 'x'}\`, \`neq.\`, \`gt.\`, \`gte.\`, \`lt.\`, \`lte.\`, \`in.(a,b)\`, \`is.null\`.`
    + (c.enum ? ` Values: ${c.enum.join(', ')}.` : ''),
  schema: { type: 'string' },
});

for (const r of rest.resources) {
  tagSet.add(rest.tag);
  const base = { tags: [rest.tag], security: REST_SECURITY };
  if (r.kind === 'rpc') {
    const props = {};
    for (const a of r.args) props[a.name] = { ...pgSchema(a.type), ...(a.description ? { description: a.description } : {}) };
    const required = r.args.filter((a) => a.required).map((a) => a.name);
    const args = { type: 'object', properties: props, ...(required.length ? { required } : {}) };
    const ok = r.returns
      ? (restSchemas[refName(r.name, '_row')] = rowSchema(r.returns.map((c) => ({ ...c, nullable: true }))),
        { '200': { description: 'One object per result row', content: { 'application/json': { schema: { type: 'array', items: ref(refName(r.name, '_row')) } } } } })
      : { '204': { description: 'Done — no body' }, '200': { description: 'Done' } };
    paths[`/rest/v1/rpc/${r.name}`] = {
      servers: REST_SERVERS,
      post: {
        ...base,
        summary: r.summary,
        operationId: `rpc_${r.name}`,
        description: `Database function, called as \`POST /rest/v1/rpc/${r.name}\` with its arguments as the JSON body.${r.description ? `\n\n${r.description}` : ''}${docsLink(r)}`,
        requestBody: { required: required.length > 0, content: { 'application/json': { schema: args } } },
        responses: restResponses(ok),
      },
    };
    continue;
  }

  const rowRef = refName(r.name);
  restSchemas[rowRef] = rowSchema(r.columns);
  const byName = Object.fromEntries(r.columns.map((c) => [c.name, c]));
  for (const f of [...r.filters, ...(r.writable || []), ...(r.required || [])]) {
    if (!byName[f]) throw new Error(`rest-endpoints.json: ${r.name} names unknown column "${f}"`);
  }
  const filters = r.filters.map((f) => filterParam(byName[f]));
  const what = r.kind === 'view' ? 'View' : 'Table';
  const intro = `${what} \`${r.name}\`, read through PostgREST as the signed-in user: row-level security returns only rows in workspaces you belong to.`
    + (r.example ? `\n\nExample: \`GET ${r.example}\`` : '');
  const desc = `${intro}${r.description ? `\n\n${r.description}` : ''}${docsLink(r)}`;
  const rows = { description: 'Matching rows', content: { 'application/json': { schema: { type: 'array', items: ref(rowRef) } } } };
  const item = {};

  item.get = {
    ...base, summary: r.summary, operationId: `get_${r.name}`, description: desc,
    parameters: [P.select, ...filters, P.order, P.limit, P.offset, P.preferCount],
    responses: restResponses({ '200': rows }),
  };
  if (r.writable) {
    const writeRef = refName(r.name, '_write');
    restSchemas[writeRef] = { ...rowSchema(r.columns, r.writable), required: r.required };
    const patchRef = refName(r.name, '_patch');
    restSchemas[patchRef] = rowSchema(r.columns, r.writable.filter((c) => c !== 'workspace_id'));
    const written = { '201': rows, '204': { description: 'Written (Prefer: return=minimal)' } };
    const rowFilter = 'Always target the rows with a filter, e.g. `?id=eq.<uuid>`.';
    if (r.methods.includes('POST')) {
      item.post = {
        ...base, summary: `Create — ${r.name}`, operationId: `post_${r.name}`,
        description: `Insert one row (or an array of rows). \`workspace_id\` must be a workspace you belong to; row-level security rejects anything else.${docsLink(r)}`,
        parameters: [P.preferReturn],
        requestBody: { required: true, content: { 'application/json': { schema: ref(writeRef) } } },
        responses: restResponses(written),
      };
    }
    if (r.methods.includes('PATCH')) {
      item.patch = {
        ...base, summary: `Update — ${r.name}`, operationId: `patch_${r.name}`,
        description: `${rowFilter}${docsLink(r)}`,
        parameters: [...filters, P.preferReturn],
        requestBody: { required: true, content: { 'application/json': { schema: ref(patchRef) } } },
        responses: restResponses({ '200': rows, '204': { description: 'Updated (Prefer: return=minimal)' } }),
      };
    }
    if (r.methods.includes('DELETE')) {
      item.delete = {
        ...base, summary: `Delete — ${r.name}`, operationId: `delete_${r.name}`,
        description: `${rowFilter}${docsLink(r)}`,
        parameters: [...filters, P.preferReturn],
        responses: restResponses({ '200': rows, '204': { description: 'Deleted' } }),
      };
    }
  }
  paths[`/rest/v1/${r.name}`] = { servers: REST_SERVERS, ...item };
}

const TAG_ORDER = [
  'AI Agents', 'AI Generation', 'Social', 'Search', 'MIVAA Gateway', 'Knowledge Base',
  'Finance', 'Banking (database)', 'Payments', 'Quotes', 'CRM', 'Business Profile', 'Real Estate',
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
  'Banking (database)': 'Bank accounts and their balances, the bank feed, payments and payouts — read straight from the database (PostgREST, `/rest/v1/…`). Send BOTH the project `apikey` and the user\'s `Authorization: Bearer <JWT>`; row-level security scopes every result to your workspaces.',
  'Payments': 'Stripe checkout, Connect onboarding, and webhooks.',
  'Quotes': 'Quote documents, public white-label share, email, PDF.',
  'CRM': 'Companies, contacts, users, Stripe state (consolidated crm-api router).',
  'Business Profile': 'VAT/registry validation (VIES, ΑΑΔΕ) and role upgrades.',
  'Real Estate': 'Property listings, leads, viewings, offers, sales, lettings, investments — plus the anonymous public listing pages, buyer portal and portal syndication feed.',
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
    title: 'Material KAI — Supabase Edge Functions & Database',
    version: '1.0.0',
    license: { name: 'Proprietary' },
    description:
      'OpenAPI for the **Supabase Edge Functions** (Deno/TypeScript) of the Material KAI Vision Platform, plus the ' +
      'database resources under **Banking (database)** — tables, views and functions read through PostgREST at ' +
      '`/rest/v1/…` (source: `scripts/rest-endpoints.json`).\n\n' +
      'This is the companion to the FastAPI-generated `openapi.json` at `https://v1api.materialshub.gr/openapi.json`, ' +
      'which covers the **MIVAA Python** backend only. Edge functions are a separate runtime with no auto-generated ' +
      'schema, so this spec is **hand-maintained** from the source code (`scripts/edge-endpoints.json` → ' +
      '`scripts/build-openapi-edge.mjs`).\n\n' +
      'Most functions are **action-based**: POST a JSON body with an `action` field; the spec models each action as a ' +
      'discriminated `oneOf` branch. Finance/REST-style functions use typed bodies or path/method routing (see each ' +
      "operation's description). Auth varies per function — see `security` and the scheme descriptions.",
  },
  servers: [{ url: `${PROJECT_ORIGIN}/functions/v1`, description: 'Production' }],
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
      PostgrestError: {
        type: 'object',
        properties: {
          code: { type: 'string', example: '42501', description: 'Postgres SQLSTATE or PostgREST PGRSTxxx code' },
          message: { type: 'string' },
          details: { type: 'string', nullable: true },
          hint: { type: 'string', nullable: true },
        },
      },
      ...restSchemas,
    },
  },
};

import { mkdirSync, existsSync } from 'node:fs';
// `--check` writes nothing and exits 1 when a committed output differs from what this would write.
const CHECK = process.argv.includes('--check');
const stale = [];
const emit = (file, content) => {
  if (CHECK) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== content) stale.push(file);
    return;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log(`Wrote ${file}`);
};
const json = JSON.stringify(spec, null, 2) + '\n';
for (const out of OUTS) emit(out, json);
console.log(`  functions: ${fns.length}  database resources: ${rest.resources.length}  paths: ${Object.keys(paths).length}  tags: ${tags.length}`);

// The index in docs/api-master-reference.md is generated from the same source, between two markers.
const AUTH_LABEL = {
  supabaseJwt: 'JWT', apiKeyPartner: 'kai_*', apiKeySecret: 'secret', cronSecret: 'cron',
  queryToken: 'token', stripeSignature: 'sig', zernioSignature: 'sig', svixSignature: 'sig', snsSignature: 'sig',
};
const authCell = (fn) => {
  const labels = [...new Set((fn.security || []).map((k) => AUTH_LABEL[k] || (k === 'public' ? 'public' : k)))];
  return labels.length ? labels.join(' / ') : 'public';
};
const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();

const byTag = new Map();
for (const fn of fns) {
  const t = fn.tag || 'Misc';
  if (!byTag.has(t)) byTag.set(t, []);
  byTag.get(t).push(fn);
}
const orderedTags = [...byTag.keys()].sort((a, b) => {
  const ia = TAG_ORDER.indexOf(a), ib = TAG_ORDER.indexOf(b);
  return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
});
let md = '';
for (const t of orderedTags) {
  md += `**${t}**\n\n| Function | Auth | Summary |\n|---|---|---|\n`;
  for (const fn of byTag.get(t).sort((a, b) => a.name.localeCompare(b.name))) {
    const methods = (fn.methods && fn.methods.length ? fn.methods : ['POST']).map((m) => m.toUpperCase());
    const verb = methods.includes('GET') && methods.length > 1 ? ' _(GET + POST)_' : methods.join('/') === 'GET' ? ' _(GET)_' : '';
    md += `| \`${fn.name}\`${verb} | ${authCell(fn)} | ${esc(fn.summary)} |\n`;
  }
  md += '\n';
}

const REF = join(ROOT, 'docs', 'api-master-reference.md');
// Match on the marker PREFIX, not the full line — the trailing note is prose and an em-dash
// vs hyphen difference must not silently skip the regeneration.
const BEGIN_PREFIX = '<!-- BEGIN AUTO-INDEX';
const BEGIN = '<!-- BEGIN AUTO-INDEX (generated by scripts/build-openapi-edge.mjs — do not edit by hand) -->';
const END = '<!-- END AUTO-INDEX -->';
try {
  let doc = readFileSync(REF, 'utf8');
  const b = doc.indexOf(BEGIN_PREFIX), e = doc.indexOf(END);
  if (b !== -1 && e !== -1 && e > b) {
    doc = doc.slice(0, b) + `${BEGIN}\n\n${md}${END}` + doc.slice(e + END.length);
    doc = doc.replace(/^## 1\. Supabase Edge Functions \(\d+\)/m, `## 1. Supabase Edge Functions (${fns.length})`);
    emit(REF, doc);
  } else {
    console.warn(`  ! ${REF}: AUTO-INDEX markers not found — index NOT regenerated.`);
  }
} catch (err) {
  console.warn(`  ! could not update ${REF}: ${err.message}`);
}

if (CHECK && stale.length) {
  console.error(`Stale — run \`npm run openapi:edge\` and commit:\n  ${stale.join('\n  ')}`);
  process.exit(1);
}
