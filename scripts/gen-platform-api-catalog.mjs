/**
 * Generate the agent-facing catalogue of the platform's OWN edge endpoints.
 *
 * The callable set is whatever `scripts/edge-endpoints.json` says accepts a user JWT — derived
 * from the code, never hand-kept, so a new endpoint joins the agent's reach the moment it ships
 * and a cron-secret one never does. Field detail is merged from both generated descriptions:
 * `edge-endpoints.json` carries it for some, `public/api/openapi-edge.json` for others.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'supabase/functions/_shared/platformApiCatalog.generated.ts';

/** The security scheme that means "a signed-in user's own token opens this". */
const USER_SCHEME = 'supabaseJwt';

const DESCRIPTION_CAP = 400;
const FIELD_DESC_CAP = 120;

function fieldsFromEndpoints(entry) {
  const req = entry.request;
  if (!req || Array.isArray(req) || !req.fields) return null;
  const out = {};
  for (const [name, spec] of Object.entries(req.fields)) {
    if (!spec || typeof spec !== 'object') continue;
    out[name] = trimField({
      type: spec.type,
      enum: spec.enum,
      required: spec.required,
      description: spec.description,
    });
  }
  return Object.keys(out).length ? out : null;
}

/** One flat view of an action-discriminated body: every action in the enum, a field required only if every action requires it. */
function mergeBranches(branches) {
  const properties = {};
  const actions = [];
  let required = null;
  for (const b of branches) {
    for (const [prop, spec] of Object.entries(b.properties ?? {})) {
      if (prop === 'action') actions.push(...(spec.enum ?? []));
      else properties[prop] ??= spec;
    }
    const req = new Set(b.required ?? []);
    required = required ? required.filter((r) => req.has(r)) : [...req];
  }
  const action = actions.length ? { action: { type: 'string', enum: actions, description: 'Which operation to run' } } : {};
  return { properties: { ...action, ...properties }, required: required ?? [] };
}

function fieldsFromOpenapi(openapi, name) {
  const path = openapi.paths?.[`/${name}`];
  if (!path) return null;
  for (const method of Object.keys(path)) {
    const body = path[method]?.requestBody?.content?.['application/json']?.schema;
    const schema = body?.oneOf ? mergeBranches(body.oneOf) : body;
    const props = schema?.properties;
    if (!props || !Object.keys(props).length) continue;
    const required = new Set(schema.required ?? []);
    const out = {};
    for (const [prop, spec] of Object.entries(props)) {
      out[prop] = trimField({
        type: spec.type,
        enum: spec.enum,
        required: required.has(prop) || undefined,
        description: spec.description,
      });
    }
    return Object.keys(out).length ? out : null;
  }
  return null;
}

function trimField({ type, enum: values, required, description }) {
  const field = {};
  if (type) field.type = type;
  // Generous: both big dispatchers answer an unknown action naming no alternative, so a capped-out
  // enum leaves the model no way back.
  if (Array.isArray(values) && values.length && values.length <= 100) field.enum = values;
  if (required) field.required = true;
  if (description) field.description = String(description).slice(0, FIELD_DESC_CAP);
  return field;
}

export function buildCatalog() {
  const endpoints = Object.values(
    JSON.parse(readFileSync(join(root, 'scripts/edge-endpoints.json'), 'utf8')),
  );
  const openapi = JSON.parse(readFileSync(join(root, 'public/api/openapi-edge.json'), 'utf8'));

  return endpoints
    .filter((e) => Array.isArray(e.security) && e.security.includes(USER_SCHEME))
    .map((e) => {
      const fields = fieldsFromEndpoints(e) ?? fieldsFromOpenapi(openapi, e.name);
      const entry = {
        name: e.name,
        tag: e.tag || 'Other',
        methods: Array.isArray(e.methods) && e.methods.length ? e.methods : ['POST'],
        summary: (e.summary || '').slice(0, 200),
      };
      // What tells a model WHICH endpoint it wants when the summary alone is ambiguous.
      if (e.description) entry.description = String(e.description).slice(0, DESCRIPTION_CAP);
      // Uncallable without its sub-path: the router answers 400 before it reads the body.
      if (Array.isArray(e.routes) && e.routes.length) entry.routes = e.routes.slice(0, 30);
      if (fields) entry.fields = fields;
      return entry;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function render(catalog) {
  return [
    '// GENERATED — do not edit here. Regenerate: npm run api:catalog (part of gen:all).',
    '//',
    '// The platform edge endpoints a signed-in user\'s own token can call, derived from',
    '// scripts/edge-endpoints.json. Cron-secret, admin-secret and',
    '// webhook-signed endpoints are absent by construction: they carry a different security',
    '// scheme, so no edit here is what keeps them out of the agent\'s reach.',
    '',
    'export interface PlatformApiField {',
    '  type?: string;',
    '  enum?: readonly string[];',
    '  required?: boolean;',
    '  description?: string;',
    '}',
    '',
    'export interface PlatformApiEndpoint {',
    '  name: string;',
    '  tag: string;',
    '  methods: readonly string[];',
    '  summary: string;',
    '  description?: string;',
    '  /** Sub-paths this endpoint routes on. Present means a path is REQUIRED. */',
    '  routes?: readonly string[];',
    '  fields?: Record<string, PlatformApiField>;',
    '}',
    '',
    `export const PLATFORM_API_CATALOG: readonly PlatformApiEndpoint[] = ${JSON.stringify(catalog, null, 2)} as const;`,
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const catalog = buildCatalog();
  writeFileSync(join(root, TARGET), render(catalog), 'utf8');
  const withFields = catalog.filter((e) => e.fields).length;
  console.log(`✎ wrote ${TARGET} — ${catalog.length} user-callable endpoints, ${withFields} with described fields`);
}
