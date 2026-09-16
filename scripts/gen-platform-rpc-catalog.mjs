/**
 * The agent-facing catalogue of the platform's own DERIVED READS.
 *
 * `--print-sql` emits the query that defines the set and refreshes the snapshot. Volatility is
 * the load-bearing filter: it removes 36 functions whose names read exactly like the rest.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = 'scripts/platform-rpcs.json';
const TARGET = 'supabase/functions/_shared/platformRpcCatalog.generated.ts';

const REFRESH_SQL = `-- Refresh scripts/platform-rpcs.json from the live schema, then re-run this generator.
with fns as (
  select p.proname::text as name, pg_get_function_arguments(p.oid) as args
  from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind='f'
    and p.provolatile in ('s','i')
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and (p.proname ~ '^(get|list|search)_' or p.proname ~ '(_summary|_overview|_360)$')
    and pg_get_function_result(p.oid) ~ '^(jsonb|json|TABLE|SETOF)'
)
select string_agg(name || ' :: ' || args, chr(10) order by name, length(args) desc) from fns
 where name !~ '^(admin_|get_cron_|storage_|get_query_cache|get_slowest|get_search_|get_vector|get_embedding|get_provider_health|get_ai_model|get_tool_call|get_zero_result|get_popular|get_top_cached|get_inbound_email_health|get_webhook)';`;

/** A word a person would actually use for this reader, from its own name. */
function keywords(name) {
  return name.replace(/^(get|list|search)_/, '').replace(/_/g, ' ').trim();
}

export function buildCatalog() {
  const rows = JSON.parse(readFileSync(join(root, SOURCE), 'utf8'));
  return rows
    .map((r) => ({
      name: r.name,
      subject: keywords(r.name),
      args: (r.args ?? []).map((a) => ({
        name: a.name,
        type: a.type,
        ...(a.required ? { required: true } : {}),
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function render(catalog) {
  return [
    '// GENERATED — do not edit here. Regenerate: npm run rpc:catalog (part of gen:all).',
    '//',
    '// Derived reads a signed-in user\'s own token can call through PostgREST. Every entry is',
    '// STABLE or IMMUTABLE, which is what keeps a writer out: a VOLATILE function of the same',
    '// name shape is excluded by construction, not by anyone remembering to exclude it.',
    '',
    'export interface PlatformRpcArg {',
    '  name: string;',
    '  type: string;',
    '  required?: boolean;',
    '}',
    '',
    'export interface PlatformRpcEntry {',
    '  name: string;',
    '  subject: string;',
    '  args: readonly PlatformRpcArg[];',
    '}',
    '',
    `export const PLATFORM_RPC_CATALOG: readonly PlatformRpcEntry[] = ${JSON.stringify(catalog, null, 2)} as const;`,
    '',
  ].join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes('--print-sql')) {
    console.log(REFRESH_SQL);
  } else {
    const catalog = buildCatalog();
    writeFileSync(join(root, TARGET), render(catalog), 'utf8');
    const withRequired = catalog.filter((e) => e.args.some((a) => a.required)).length;
    console.log(`✎ wrote ${TARGET} — ${catalog.length} derived reads, ${withRequired} taking a required argument`);
  }
}
