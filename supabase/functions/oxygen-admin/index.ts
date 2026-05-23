// deno-lint-ignore-file no-explicit-any
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import {
  oxygenGET,
  loadOxygenSettings,
  maskApiKey,
  OxygenError,
  type OxygenSettings,
} from '../_shared/oxygen/client.ts';

// Admin-only configuration + lookup endpoint for the Oxygen module.
// Supersedes env-only secrets: settings live in the oxygen_settings table.
//
// Actions:
//  - get_settings        — return masked settings + env-fallback indicators
//  - save_settings       — upsert single-row settings (admin only)
//  - list_taxes          — proxy GET /taxes on Oxygen, returns array for the dropdown
//  - list_warehouses     — proxy GET /warehouses on Oxygen, returns array for the dropdown
//  - test_connection     — call GET /taxes to confirm key works, stamp last_verified_*
//
// All actions require admin / super_admin user JWT.

type Action =
  | 'get_settings'
  | 'save_settings'
  | 'list_taxes'
  | 'list_warehouses'
  | 'test_connection';

interface RequestBody {
  action: Action;
  // save_settings payload
  api_key?: string | null;            // null = leave unchanged; '' = clear
  api_base_url?: string | null;
  default_tax_id_24?: number | null;
  default_warehouse_id?: number | null;
  // list_taxes / list_warehouses / test_connection — use override key+base for a yet-unsaved value
  override_api_key?: string;
  override_api_base_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const auth = await authenticate(req, { requireUser: true, allowedRoles: ['admin', 'super_admin'] });
    if (!auth.success) return json({ error: auth.error ?? 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json()) as RequestBody;
    if (!body.action) return json({ error: 'action is required' }, 400);

    switch (body.action) {
      case 'get_settings':         return await handleGetSettings(supabase);
      case 'save_settings':        return await handleSaveSettings(supabase, body, auth.userId);
      case 'list_taxes':           return await handleListTaxes(supabase, body);
      case 'list_warehouses':      return await handleListWarehouses(supabase, body);
      case 'test_connection':      return await handleTestConnection(supabase, body);
      default:
        return json({ error: `Unknown action: ${body.action}` }, 400);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[oxygen-admin] Unhandled error:', err);
    return json({ error: message }, 500);
  }
});

async function handleGetSettings(supabase: any) {
  const { data: row } = await supabase.from('oxygen_settings').select('*').eq('id', 1).maybeSingle();
  const settings = await loadOxygenSettings(supabase);

  return json({
    ok: true,
    api_key_masked: maskApiKey(row?.api_key ?? null),
    api_key_present: !!row?.api_key,
    api_base_url: row?.api_base_url ?? 'https://api.oxygen.gr/v1',
    default_tax_id_24: row?.default_tax_id_24 ?? null,
    default_warehouse_id: row?.default_warehouse_id ?? null,
    last_verified_at: row?.last_verified_at ?? null,
    last_verified_status: row?.last_verified_status ?? null,
    last_verified_error: row?.last_verified_error ?? null,
    updated_at: row?.updated_at ?? null,
    // Effective values (DB ?? env) — useful so the UI can tell admins whether the function
    // would currently run, even if no DB row has been saved yet.
    effective: {
      api_key_present: !!settings.apiKey,
      api_base_url: settings.apiBaseUrl,
      default_tax_id_24: settings.defaultTaxId24 || null,
      default_warehouse_id: settings.defaultWarehouseId || null,
      source: settings.source,
    },
  });
}

async function handleSaveSettings(supabase: any, body: RequestBody, userId: string | null) {
  const patch: Record<string, unknown> = {
    id: 1,
    updated_by: userId,
  };
  // api_key: null = leave unchanged. To clear, send empty string explicitly.
  if (body.api_key !== undefined && body.api_key !== null) patch.api_key = body.api_key === '' ? null : body.api_key;
  if (body.api_base_url !== undefined && body.api_base_url !== null) patch.api_base_url = body.api_base_url || 'https://api.oxygen.gr/v1';
  if (body.default_tax_id_24 !== undefined) patch.default_tax_id_24 = body.default_tax_id_24;
  if (body.default_warehouse_id !== undefined) patch.default_warehouse_id = body.default_warehouse_id;

  const { error } = await supabase
    .from('oxygen_settings')
    .upsert(patch, { onConflict: 'id' });

  if (error) return json({ error: `Failed to save settings: ${error.message}` }, 500);

  return await handleGetSettings(supabase);
}

async function getSettingsForCall(supabase: any, body: RequestBody): Promise<OxygenSettings> {
  const base = await loadOxygenSettings(supabase);
  if (body.override_api_key) {
    return {
      ...base,
      apiKey: body.override_api_key,
      apiBaseUrl: body.override_api_base_url || base.apiBaseUrl,
    };
  }
  return base;
}

async function handleListTaxes(supabase: any, body: RequestBody) {
  const settings = await getSettingsForCall(supabase, body);
  if (!settings.apiKey) return json({ error: 'Oxygen API key not configured' }, 503);

  try {
    const result = await oxygenGET(settings, '/taxes');
    const taxes = Array.isArray(result) ? result : (result?.data ?? []);
    return json({ ok: true, taxes });
  } catch (err) {
    return json({ error: errorMessage(err) }, 502);
  }
}

async function handleListWarehouses(supabase: any, body: RequestBody) {
  const settings = await getSettingsForCall(supabase, body);
  if (!settings.apiKey) return json({ error: 'Oxygen API key not configured' }, 503);

  try {
    const result = await oxygenGET(settings, '/warehouses');
    const warehouses = Array.isArray(result) ? result : (result?.data ?? []);
    return json({ ok: true, warehouses });
  } catch (err) {
    return json({ error: errorMessage(err) }, 502);
  }
}

async function handleTestConnection(supabase: any, body: RequestBody) {
  const settings = await getSettingsForCall(supabase, body);
  if (!settings.apiKey) return json({ error: 'Oxygen API key not configured' }, 503);

  try {
    // Cheapest read available — also useful since the result is what the dropdown needs anyway.
    const result = await oxygenGET(settings, '/taxes');
    const taxes = Array.isArray(result) ? result : (result?.data ?? []);
    await supabase.from('oxygen_settings').update({
      last_verified_at: new Date().toISOString(),
      last_verified_status: 'ok',
      last_verified_error: null,
    }).eq('id', 1);
    return json({ ok: true, taxes_count: taxes.length, base_url: settings.apiBaseUrl });
  } catch (err) {
    const message = errorMessage(err);
    await supabase.from('oxygen_settings').update({
      last_verified_at: new Date().toISOString(),
      last_verified_status: 'failed',
      last_verified_error: message,
    }).eq('id', 1);
    return json({ error: message }, 502);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof OxygenError) return `Oxygen ${err.method} ${err.path} → ${err.status}: ${err.body}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
