// deno-lint-ignore-file no-explicit-any
//
// Legacy compatibility shim. The Oxygen module now uses the platform-wide secrets infrastructure
// (`platform-secrets-admin` edge function + `platform_secrets` table + env-first resolver).
//
// This file remains so any old clients still calling /oxygen-admin keep working. New callers
// should target /platform-secrets-admin directly. Each legacy action maps to the new equivalent.

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { resolveSecret, resolveSecretAsNumber } from '../../_shared/secrets.ts';
import { oxygenGET, OxygenError, maskApiKey } from '../../_shared/oxygen/client.ts';

interface RequestBody {
  action:
    | 'get_settings'
    | 'save_settings'
    | 'list_taxes'
    | 'list_warehouses'
    | 'test_connection';
  api_key?: string | null;
  api_base_url?: string | null;
  default_tax_id_24?: number | null;
  default_warehouse_id?: number | null;
  override_api_key?: string;
  override_api_base_url?: string;
}

export async function handleOxygenAdmin(req: Request, body: RequestBody): Promise<Response> {
  try {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin'] });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    switch (body.action) {
      case 'get_settings':    return await handleGetSettings(supabase);
      case 'save_settings':   return await handleSaveSettings(supabase, body, auth.userId);
      case 'list_taxes':      return await handleListTaxes(supabase, body);
      case 'list_warehouses': return await handleListWarehouses(supabase, body);
      case 'test_connection': return await handleTestConnection(supabase, body);
      default: return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
}

async function handleGetSettings(supabase: any) {
  const [apiKey, apiBaseUrl, taxId, warehouseId] = await Promise.all([
    resolveSecret(supabase, 'OXYGEN_API_KEY'),
    resolveSecret(supabase, 'OXYGEN_API_BASE_URL'),
    resolveSecretAsNumber(supabase, 'OXYGEN_DEFAULT_TAX_ID_24'),
    resolveSecretAsNumber(supabase, 'OXYGEN_DEFAULT_WAREHOUSE_ID'),
  ]);

  const { data: row } = await supabase.from('platform_secrets').select('value, last_verified_at, last_verified_status, last_verified_error, updated_at').eq('key', 'OXYGEN_API_KEY').maybeSingle();
  return json({
    ok: true,
    api_key_masked: maskApiKey(row?.value ?? null),
    api_key_present: !!row?.value,
    api_base_url: apiBaseUrl.value || 'https://api.oxygen.gr/v1',
    default_tax_id_24: taxId,
    default_warehouse_id: warehouseId,
    last_verified_at: row?.last_verified_at ?? null,
    last_verified_status: row?.last_verified_status ?? null,
    last_verified_error: row?.last_verified_error ?? null,
    updated_at: row?.updated_at ?? null,
    effective: {
      api_key_present: !!apiKey.value,
      api_base_url: apiBaseUrl.value ?? 'https://api.oxygen.gr/v1',
      default_tax_id_24: taxId,
      default_warehouse_id: warehouseId,
      source: apiKey.source,
    },
  });
}

async function handleSaveSettings(supabase: any, body: RequestBody, userId: string | null) {
  const entries: Array<{ key: string; value: string | null }> = [];
  if (body.api_key !== undefined && body.api_key !== null) entries.push({ key: 'OXYGEN_API_KEY', value: body.api_key === '' ? null : body.api_key });
  if (body.api_base_url !== undefined && body.api_base_url !== null) entries.push({ key: 'OXYGEN_API_BASE_URL', value: body.api_base_url || null });
  if (body.default_tax_id_24 !== undefined) entries.push({ key: 'OXYGEN_DEFAULT_TAX_ID_24', value: body.default_tax_id_24 != null ? String(body.default_tax_id_24) : null });
  if (body.default_warehouse_id !== undefined) entries.push({ key: 'OXYGEN_DEFAULT_WAREHOUSE_ID', value: body.default_warehouse_id != null ? String(body.default_warehouse_id) : null });

  if (entries.length > 0) {
    const { error } = await supabase
      .from('platform_secrets')
      .upsert(entries.map(e => ({ ...e, updated_by: userId })), { onConflict: 'key' });
    if (error) return json({ error: error.message }, 500);
  }
  return await handleGetSettings(supabase);
}

async function oxygenSettingsForTest(supabase: any, body: RequestBody) {
  if (body.override_api_key) {
    return {
      apiKey: body.override_api_key,
      apiBaseUrl: body.override_api_base_url || (await resolveSecret(supabase, 'OXYGEN_API_BASE_URL')).value || 'https://api.oxygen.gr/v1',
      defaultTaxId24: 0,
      defaultWarehouseId: 0,
      source: 'db' as const,
    };
  }
  const apiKey = (await resolveSecret(supabase, 'OXYGEN_API_KEY')).value || '';
  const apiBaseUrl = (await resolveSecret(supabase, 'OXYGEN_API_BASE_URL')).value || 'https://api.oxygen.gr/v1';
  return { apiKey, apiBaseUrl, defaultTaxId24: 0, defaultWarehouseId: 0, source: 'db' as const };
}

async function handleListTaxes(supabase: any, body: RequestBody) {
  const settings = await oxygenSettingsForTest(supabase, body);
  if (!settings.apiKey) return json({ error: 'Oxygen API key not configured' }, 503);
  try {
    const result = await oxygenGET(settings, '/taxes');
    return json({ ok: true, taxes: Array.isArray(result) ? result : (result?.data ?? []) });
  } catch (err) {
    return json({ error: errStr(err) }, 502);
  }
}

async function handleListWarehouses(supabase: any, body: RequestBody) {
  const settings = await oxygenSettingsForTest(supabase, body);
  if (!settings.apiKey) return json({ error: 'Oxygen API key not configured' }, 503);
  try {
    const result = await oxygenGET(settings, '/warehouses');
    return json({ ok: true, warehouses: Array.isArray(result) ? result : (result?.data ?? []) });
  } catch (err) {
    return json({ error: errStr(err) }, 502);
  }
}

async function handleTestConnection(supabase: any, body: RequestBody) {
  const settings = await oxygenSettingsForTest(supabase, body);
  if (!settings.apiKey) return json({ error: 'Oxygen API key not configured' }, 503);
  try {
    const result = await oxygenGET(settings, '/taxes');
    const taxes = Array.isArray(result) ? result : (result?.data ?? []);
    await supabase.from('platform_secrets').update({
      last_verified_at: new Date().toISOString(),
      last_verified_status: 'ok',
      last_verified_error: null,
    }).eq('key', 'OXYGEN_API_KEY');
    return json({ ok: true, taxes_count: taxes.length, base_url: settings.apiBaseUrl });
  } catch (err) {
    const msg = errStr(err);
    await supabase.from('platform_secrets').update({
      last_verified_at: new Date().toISOString(),
      last_verified_status: 'failed',
      last_verified_error: msg,
    }).eq('key', 'OXYGEN_API_KEY');
    return json({ error: msg }, 502);
  }
}

function errStr(err: unknown): string {
  if (err instanceof OxygenError) return `Oxygen ${err.method} ${err.path} → ${err.status}: ${err.body}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
