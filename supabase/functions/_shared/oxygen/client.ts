// deno-lint-ignore-file no-explicit-any
// Oxygen API client (https://docs.oxygen.gr/oxygen-api.json)
// Auth: Authorization: Bearer <apiKey>
//
// Settings come from platform_secrets via resolveSecret() — env wins, DB row is fallback.

import { resolveSecret, resolveSecretAsNumber } from '../secrets.ts';

export interface OxygenSettings {
  apiKey: string;
  apiBaseUrl: string;
  defaultTaxId24: number;
  defaultWarehouseId: number;
  source: 'db' | 'env' | 'default' | 'partial';
}

export class OxygenError extends Error {
  constructor(public status: number, public path: string, public method: string, public body: string) {
    super(`Oxygen ${method} ${path} → ${status} ${body}`);
    this.name = 'OxygenError';
  }
}

async function oxygenFetch(settings: OxygenSettings, path: string, init: RequestInit = {}): Promise<any> {
  if (!settings.apiKey) {
    throw new Error('Oxygen API key is not configured. Set OXYGEN_API_KEY via env or /admin/modules/oxygen → Settings.');
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
 * Load Oxygen settings via the platform secrets resolver.
 * Env vars take priority; platform_secrets rows are fallback only.
 */
export async function loadOxygenSettings(supabase: { from: (t: string) => any }): Promise<OxygenSettings> {
  const [apiKey, apiBaseUrl, taxId, warehouseId] = await Promise.all([
    resolveSecret(supabase, 'OXYGEN_API_KEY'),
    resolveSecret(supabase, 'OXYGEN_API_BASE_URL'),
    resolveSecretAsNumber(supabase, 'OXYGEN_DEFAULT_TAX_ID_24'),
    resolveSecretAsNumber(supabase, 'OXYGEN_DEFAULT_WAREHOUSE_ID'),
  ]);

  // Classify source: 'env' if all four came from env, 'db' if all from db, else 'partial'.
  const sources = [apiKey.source, apiBaseUrl.source, taxId !== null ? 'db' : 'missing', warehouseId !== null ? 'db' : 'missing'];
  const uniq = new Set(sources);
  const source: OxygenSettings['source'] =
    uniq.size === 1 && uniq.has('env') ? 'env' :
    uniq.size === 1 && uniq.has('db')  ? 'db'  :
    'partial';

  return {
    apiKey: apiKey.value ?? '',
    apiBaseUrl: apiBaseUrl.value ?? 'https://api.oxygen.gr/v1',
    defaultTaxId24: taxId ?? 0,
    defaultWarehouseId: warehouseId ?? 0,
    source,
  };
}

/** Mask a key for admin GET responses. */
export function maskApiKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
