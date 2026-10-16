const { WORKSPACE_ROLE_CAPABILITIES } = await import('../src/auth/roleCapabilities.ts');

const rows = Object.entries(WORKSPACE_ROLE_CAPABILITIES)
  .flatMap(([role, caps]) => caps.map((cap) => `    ('${role}', '${cap}')`));

process.stdout.write(`CREATE OR REPLACE FUNCTION public.workspace_role_capability_matrix()
 RETURNS TABLE(role text, capability text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  values
${rows.join(',\n')}
$function$;
`);
