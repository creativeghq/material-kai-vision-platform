// deno-lint-ignore-file no-explicit-any
// Oxygen API client (https://docs.oxygen.gr/oxygen-api.json)
// Auth: Authorization: Bearer <apiKey>
//
// Settings come from the `oxygen_settings` table via loadOxygenSettings() (DB-first, env fallback).
// The client itself is stateless — pass settings in to each call.

export interface OxygenSettings {
  apiKey: string;
  apiBaseUrl: string;
  defaultTaxId24: number;
  defaultWarehouseId: number;
  source: 'db' | 'env' | 'partial';
}

export class OxygenError extends Error {
  constructor(public status: number, public path: string, public method: string, public body: string) {
    super(`Oxygen ${method} ${path} → ${status} ${body}`);
    this.name = 'OxygenError';
  }
}

async function oxygenFetch(settings: OxygenSettings, path: string, init: RequestInit = {}): Promise<any> {
  if (!settings.apiKey) {
    throw new Error('Oxygen API key is not configured. Set it on /admin/modules/oxygen.');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  const baseUrl = settings.apiBaseUrl || 'https://api.oxygen.gr/v1';
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new OxygenError(res.status, path, method, text);
  return text ? JSON.parse(text) : {};
}

export const oxygenGET  = (settings: OxygenSettings, path: string)                => oxygenFetch(settings, path);
export const oxygenPOST = (settings: OxygenSettings, path: string, body: unknown) => oxygenFetch(settings, path, { method: 'POST', body: JSON.stringify(body) });
export const oxygenPUT  = (settings: OxygenSettings, path: string, body: unknown) => oxygenFetch(settings, path, { method: 'PUT',  body: JSON.stringify(body) });

/**
 * Load Oxygen module settings. DB row is canonical; env vars are a one-time bootstrap fallback
 * so deployments that originally set env-only secrets keep working until an admin saves the form.
 * Service-role client required — RLS denies everyone else.
 */
export async function loadOxygenSettings(supabase: { from: (t: string) => any }): Promise<OxygenSettings> {
  let row: any = null;
  try {
    const { data } = await supabase.from('oxygen_settings').select('*').eq('id', 1).maybeSingle();
    row = data;
  } catch {
    row = null;
  }

  const envKey = Deno.env.get('OXYGEN_API_KEY') ?? '';
  const envBase = Deno.env.get('OXYGEN_API_BASE_URL') ?? '';
  const envTax = parseInt(Deno.env.get('OXYGEN_DEFAULT_TAX_ID_24') ?? '0', 10);
  const envWh = parseInt(Deno.env.get('OXYGEN_DEFAULT_WAREHOUSE_ID') ?? '0', 10);

  const apiKey = (row?.api_key ?? '') || envKey;
  const apiBaseUrl = (row?.api_base_url ?? '') || envBase || 'https://api.oxygen.gr/v1';
  const defaultTaxId24 = row?.default_tax_id_24 ?? (envTax > 0 ? envTax : 0);
  const defaultWarehouseId = row?.default_warehouse_id ?? (envWh > 0 ? envWh : 0);

  // Source classification helps the admin UI explain where each value came from.
  const allFromDb = !!row?.api_key && !!row?.default_tax_id_24 && !!row?.default_warehouse_id;
  const allFromEnv = !row?.api_key && !!envKey && envTax > 0 && envWh > 0;
  const source: OxygenSettings['source'] = allFromDb ? 'db' : allFromEnv ? 'env' : 'partial';

  return { apiKey, apiBaseUrl, defaultTaxId24, defaultWarehouseId, source };
}

/**
 * Quick mask helper used in admin GET responses so the full key never leaves the edge function.
 */
export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
