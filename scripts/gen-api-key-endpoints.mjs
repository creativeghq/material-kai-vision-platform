import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = 'supabase/functions/_shared/apiKeyEndpoints.generated.ts';

export function keyCapable() {
  const endpoints = JSON.parse(readFileSync(join(root, 'scripts/edge-endpoints.json'), 'utf8'));
  return endpoints
    .filter((e) => Array.isArray(e.security) && e.security.includes('apiKeyPartner'))
    .map((e) => e.name)
    .sort();
}

export function render(names) {
  return [
    '// GENERATED — do not edit here. Regenerate: npm run api:keys (part of gen:all).',
    '// Source: scripts/edge-endpoints.json, every function whose `security` lists apiKeyPartner.',
    '',
    'export const API_KEY_ENDPOINTS: ReadonlySet<string> = new Set([',
    ...names.map((n) => `  '${n}',`),
    ']);',
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = keyCapable();
  writeFileSync(join(root, TARGET), render(names));
  console.log(`✎ wrote ${TARGET} — ${names.length} key-capable functions`);
}
