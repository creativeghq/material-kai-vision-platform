// deno-lint-ignore-file no-explicit-any
// Admin-only CRUD + masking + connection-test for the `platform_secrets` registry.
// Resolution priority observed everywhere: ENV first, DB second. Edits via this function
// only affect the DB fallback — they never override an existing env var.

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isPlatformOperator } from '../_shared/auth.ts';
import {
  resolveSecret,
  maskSecretValue,
  invalidateSecretCache,
  type PlatformSecretRow,
} from '../_shared/secrets.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

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

Deno.serve(withApiLogging('platform-secrets-admin', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    // `allowedRoles: ['admin', 'super_admin']` was NOT a platform gate. authenticate() matches
    // allowedRoles against `workspace_members.role` as well as the global role, and 'admin' is an
    // ordinary WORKSPACE role any tenant hands out from Profile -> Team. So appointing a workspace
    // admin also granted write access to the platform-wide secret store — every tenant's
    // integrations resolve through it. `reset-platform` was moved off the same gate for the same
    // reason; this asks the operator question directly.
    const auth = await authenticate(req, { requireUser: true });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);
    if (!(await isPlatformOperator(auth.supabase, auth.userId))) {
      return json({ error: 'Platform operator access required' }, 403);
    }

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
}));

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
      // A live resolution tier (env > value > default_value), so it can hold a real
      // credential — masked on the same `is_sensitive` flag as `value`, which means a
      // non-sensitive default still shows in full.
      default_value: maskSecretValue(row.default_value, row.is_sensitive),
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

  // UPDATE, never upsert. `platform_secrets` is a declared registry — a key gets there by
  // migration. An upsert let a caller invent any key, and `resolveSecret()` reads this table for
  // every integration, so inventing one is choosing what an integration resolves to.
  const { data: existing } = await supabase
    .from('platform_secrets').select('key').eq('key', body.key).maybeSingle();
  if (!existing) return json({ error: `Unknown secret key: ${body.key}` }, 400);

  const { error } = await supabase
    .from('platform_secrets')
    .update(patch)
    .eq('key', body.key);
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
  // Same rule as handleSave, and the batch is rejected WHOLE: a partial apply would leave the
  // form's own view of which keys are set disagreeing with the store.
  const { data: known } = await supabase
    .from('platform_secrets').select('key').in('key', patches.map(p => p.key));
  const knownKeys = new Set((known ?? []).map((r: { key: string }) => r.key));
  const unknown = patches.map(p => p.key).filter(k => !knownKeys.has(k));
  if (unknown.length > 0) return json({ error: `Unknown secret key(s): ${unknown.join(', ')}` }, 400);

  for (const patch of patches) {
    const { error } = await supabase
      .from('platform_secrets')
      .update({ value: patch.value, updated_by: patch.updated_by })
      .eq('key', patch.key);
    if (error) return json({ error: error.message }, 500);
  }

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
