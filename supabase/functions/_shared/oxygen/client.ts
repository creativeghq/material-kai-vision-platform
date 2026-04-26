// deno-lint-ignore-file no-explicit-any
// Oxygen API client (https://docs.oxygen.gr/oxygen-api.json)
// Auth: Authorization: Bearer <OXYGEN_API_KEY>

const OXYGEN_API_KEY = Deno.env.get('OXYGEN_API_KEY') ?? '';
const OXYGEN_API_BASE_URL = Deno.env.get('OXYGEN_API_BASE_URL') ?? 'https://api.oxygen.gr/v1';

export class OxygenError extends Error {
  constructor(public status: number, public path: string, public method: string, public body: string) {
    super(`Oxygen ${method} ${path} → ${status} ${body}`);
    this.name = 'OxygenError';
  }
}

async function oxygenFetch(path: string, init: RequestInit = {}): Promise<any> {
  if (!OXYGEN_API_KEY) {
    throw new Error('OXYGEN_API_KEY env secret is not set');
  }
  const method = (init.method ?? 'GET').toUpperCase();
  const res = await fetch(`${OXYGEN_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${OXYGEN_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new OxygenError(res.status, path, method, text);
  return text ? JSON.parse(text) : {};
}

export const oxygenGET  = (path: string)                    => oxygenFetch(path);
export const oxygenPOST = (path: string, body: unknown)     => oxygenFetch(path, { method: 'POST', body: JSON.stringify(body) });
export const oxygenPUT  = (path: string, body: unknown)     => oxygenFetch(path, { method: 'PUT',  body: JSON.stringify(body) });
