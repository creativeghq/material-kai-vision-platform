const { WORKSPACE_ROLE_CAPABILITIES } = await import('../src/auth/roleCapabilities.ts');

const pairs = Object.entries(WORKSPACE_ROLE_CAPABILITIES).flatMap(([role, caps]) => caps.map((cap) => [role, cap]));

const sql = `CREATE OR REPLACE FUNCTION public.workspace_role_capability_matrix()
 RETURNS TABLE(role text, capability text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  values
${pairs.map(([r, c]) => `    ('${r}', '${c}')`).join(',\n')}
$function$;
`;

if (process.argv.includes('--print')) {
  process.stdout.write(sql);
  process.exit(0);
}

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.PROJECT_REF || process.env.SUPABASE_PROJECT_ID;
if (!token || !ref) {
  console.error('❌ SUPABASE_ACCESS_TOKEN and PROJECT_REF are required to sync the capability matrix.');
  process.exit(1);
}

async function query(q) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : [];
}

const key = ([r, c]) => `${r}:${c}`;
const want = new Set(pairs.map(key));
const live = async () => new Set(
  (await query('select role, capability from public.workspace_role_capability_matrix()')).map((x) => `${x.role}:${x.capability}`),
);
const diff = (have) => ({
  missing: [...want].filter((k) => !have.has(k)),
  extra: [...have].filter((k) => !want.has(k)),
});

const before = diff(await live());
if (!before.missing.length && !before.extra.length) {
  console.log(`✅ Capability matrix in sync (${want.size} rows).`);
  process.exit(0);
}
console.log(`↻ Capability matrix drifted — missing: ${before.missing.join(', ') || 'none'}; extra: ${before.extra.join(', ') || 'none'}. Applying.`);
await query(sql);

const after = diff(await live());
if (after.missing.length || after.extra.length) {
  console.error(`❌ Still out of sync after applying — missing: ${after.missing.join(', ')}; extra: ${after.extra.join(', ')}`);
  process.exit(1);
}
console.log(`✅ Capability matrix applied and verified (${want.size} rows).`);
