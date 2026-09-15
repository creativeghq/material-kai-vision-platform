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

function fieldsFromOpenapi(openapi, name) {
  const path = openapi.paths?.[`/${name}`];
  if (!path) return null;
  for (const method of Object.keys(path)) {
    const schema = path[method]?.requestBody?.content?.['application/json']?.schema;
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
  // Enums are the highest-value part for a model: they remove guessing entirely. Capped because
  // a 200-value enum is a wall of tokens that helps nobody.
  if (Array.isArray(values) && values.length && values.length <= 30) field.enum = values;
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
      // The long description is what tells a model WHICH endpoint it wants; keep a usable slice
      // for the ones whose summary alone is ambiguous.
      if (e.description) entry.description = String(e.description).slice(0, DESCRIPTION_CAP);
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
    '// scripts/edge-endpoints.json (itself generated). Cron-secret, admin-secret and',
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
