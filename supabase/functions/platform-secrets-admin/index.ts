// deno-lint-ignore-file no-explicit-any
//
// Admin-only CRUD + masking + connection-test for the `platform_secrets` registry.
//
// Resolution priority observed everywhere: ENV first, DB second. Edits via this function
// only affect the DB fallback — they never override an existing env var.

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import {
  resolveSecret,
  maskSecretValue,
  invalidateSecretCache,
  type PlatformSecretRow,
} from '../_shared/secrets.ts';

interface RequestBody {
  action:
    | 'list'              // list all secrets visible to the caller
    | 'list_for_module'   // narrow list to one module
    | 'list_platform'     // narrow list to platform-wide (primary_module_slug IS NULL)
    | 'save'              // upsert one key
    | 'save_many'         // upsert N keys at once (used by module settings forms)
    | 'delete_value';     // null-out a single key's value (env fallback / default still applies)
  module_slug?: string;
  key?: string;
  value?: string | null;
  entries?: Array<{ key: string; value: string | null }>;
}

interface MaskedSecretView extends Omit<PlatformSecretRow, 'value'> {
  value_masked: string | null;
  value_present: boolean;
  effective: {
    value_present: boolean;
    source: 'env' | 'db' | 'default' | 'missing';
  };
  modules: string[]; // module_slug list, including primary + linked
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin'] });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const body = (await req.json()) as RequestBody;
    if (!body.action) return json({ error: 'action is required' }, 400);

    switch (body.action) {
      case 'list':                       return await handleList(supabase, null);
      case 'list_platform':              return await handleList(supabase, 'platform');
      case 'list_for_module':            return await handleList(supabase, body.module_slug ?? null);
      case 'save':                       return await handleSave(supabase, body, auth.userId);
      case 'save_many':                  return await handleSaveMany(supabase, body, auth.userId);
      case 'delete_value':               return await handleDeleteValue(supabase, body, auth.userId);
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    console.error('[platform-secrets-admin] Unhandled error:', err);
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});

async function handleList(supabase: any, scope: string | null): Promise<Response> {
  // scope: null => everything, 'platform' => primary_module_slug IS NULL, else => secrets linked to that module
  let query = supabase
    .from('platform_secrets')
    .select('*, links:platform_secret_module_links(module_slug)')
    .order('category', { ascending: true })
    .order('key', { ascending: true });

  if (scope === 'platform') {
    query = query.is('primary_module_slug', null);
  } else if (scope) {
    // primary OR linked
    query = query.or(`primary_module_slug.eq.${scope},key.in.(${await linkedKeysCsv(supabase, scope)})`);
  }

  const { data, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const secrets = await Promise.all((data ?? []).map(async (row: any) => {
    const resolved = await resolveSecret(supabase, row.key);
    const modules: string[] = [];
    if (row.primary_module_slug) modules.push(row.primary_module_slug);
    for (const link of (row.links ?? [])) {
      if (link.module_slug && !modules.includes(link.module_slug)) modules.push(link.module_slug);
    }
    const view: MaskedSecretView = {
      key: row.key,
      value_masked: maskSecretValue(row.value, row.is_sensitive),
      value_present: !!row.value,
      description: row.description,
      category: row.category,
      primary_module_slug: row.primary_module_slug,
      is_sensitive: row.is_sensitive,
      default_value: row.default_value,
      last_verified_at: row.last_verified_at,
      last_verified_status: row.last_verified_status,
      last_verified_error: row.last_verified_error,
      updated_at: row.updated_at,
      effective: {
        value_present: !!resolved.value,
        source: resolved.source,
      },
      modules,
    };
    return view;
  }));

  return json({ ok: true, secrets });
}

async function linkedKeysCsv(supabase: any, moduleSlug: string): Promise<string> {
  const { data } = await supabase
    .from('platform_secret_module_links')
    .select('secret_key')
    .eq('module_slug', moduleSlug);
  const keys = (data ?? []).map((r: any) => r.secret_key);
  return keys.length > 0 ? keys.map((k: string) => `"${k}"`).join(',') : '"___never___"';
}

async function handleSave(supabase: any, body: RequestBody, userId: string | null): Promise<Response> {
  if (!body.key) return json({ error: 'key is required' }, 400);
  // value semantics: undefined => leave unchanged; '' or null => clear (use env/default); else => set
  const patch: Record<string, unknown> = {
    key: body.key,
    updated_by: userId,
  };
  if (body.value === '' || body.value === null) patch.value = null;
  else if (body.value !== undefined) patch.value = body.value;

  const { error } = await supabase
    .from('platform_secrets')
    .upsert(patch, { onConflict: 'key' });
  if (error) return json({ error: error.message }, 500);

  invalidateSecretCache(body.key);
  return await handleList(supabase, null);
}

async function handleSaveMany(supabase: any, body: RequestBody, userId: string | null): Promise<Response> {
  const entries = body.entries ?? [];
  if (entries.length === 0) return json({ error: 'entries is required' }, 400);
  const patches = entries.map(e => ({
    key: e.key,
    value: e.value === '' ? null : e.value,
    updated_by: userId,
  }));
  const { error } = await supabase
    .from('platform_secrets')
    .upsert(patches, { onConflict: 'key' });
  if (error) return json({ error: error.message }, 500);

  for (const e of entries) invalidateSecretCache(e.key);
  return await handleList(supabase, body.module_slug ?? null);
}

async function handleDeleteValue(supabase: any, body: RequestBody, userId: string | null): Promise<Response> {
  if (!body.key) return json({ error: 'key is required' }, 400);
  const { error } = await supabase
    .from('platform_secrets')
    .update({ value: null, updated_by: userId, last_verified_status: null, last_verified_error: null })
    .eq('key', body.key);
  if (error) return json({ error: error.message }, 500);
  invalidateSecretCache(body.key);
  return await handleList(supabase, null);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
