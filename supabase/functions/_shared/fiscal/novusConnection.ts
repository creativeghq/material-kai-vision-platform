import { resolveSecret } from '../secrets.ts';
import { novusBaseUrl } from './novus.ts';

export interface NovusConnection {
  apiKey: string;
  isSandbox: boolean;
  baseUrl: string;
}

/** NOVUS_SANDBOX picks the key too: the edge env pins NOVUS_API_KEY to the SANDBOX key and env beats
 *  the DB, so production reads NOVUS_PRODUCTION_API_KEY first. One key for both hosts = a 401. */
export async function resolveNovusConnection(
  supabase: Parameters<typeof resolveSecret>[0],
): Promise<NovusConnection> {
  const [sandbox, prodKey, key, base] = await Promise.all([
    resolveSecret(supabase, 'NOVUS_SANDBOX'),
    resolveSecret(supabase, 'NOVUS_PRODUCTION_API_KEY'),
    resolveSecret(supabase, 'NOVUS_API_KEY'),
    resolveSecret(supabase, 'NOVUS_API_BASE_URL'),
  ]);
  const isSandbox = (sandbox.value ?? 'true') !== 'false';
  const apiKey = (isSandbox ? key.value : prodKey.value || key.value) ?? '';
  return { apiKey, isSandbox, baseUrl: base.value || novusBaseUrl(isSandbox) };
}
