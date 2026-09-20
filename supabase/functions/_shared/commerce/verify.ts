// deno-lint-ignore-file no-explicit-any

export class WebhookRefusal extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'WebhookRefusal';
    this.status = status;
  }
}

export type WebhookScheme = 'shopify' | 'woocommerce' | 'generic';

export interface VerifiableConnection {
  id: string;
  workspace_id: string;
  platform: string;
  store_url?: string | null;
  webhook_secret?: string | null;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacBase64(secret: string, raw: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

export function normaliseStoreUrl(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return u.host.toLowerCase().replace(/^www\./, '');
  } catch {
    return raw.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

/** The ONLY way a commerce webhook gets its body, and it returns it PARSED on purpose. */
export async function readVerifiedWebhook(
  req: Request,
  connection: VerifiableConnection,
  scheme: WebhookScheme,
): Promise<{ body: any }> {
  const secret = String(connection.webhook_secret ?? '').trim();
  if (!secret) {
    throw new WebhookRefusal(503, 'This connection has no webhook secret configured, so its deliveries cannot be verified.');
  }

  const raw = await req.text();

  if (scheme === 'woocommerce') {
    // One tenant's leaked secret plus a spoofed body must not reach another's connection.
    const claimed = normaliseStoreUrl(req.headers.get('x-wc-webhook-source'));
    const expected = normaliseStoreUrl(connection.store_url);
    // A MISSING source is unverifiable, not acceptable — Woo always sends it.
    if (expected && claimed !== expected) {
      throw new WebhookRefusal(404, 'Not found');
    }
  }

  const header = scheme === 'shopify' ? 'x-shopify-hmac-sha256'
    : scheme === 'woocommerce' ? 'x-wc-webhook-signature'
      : 'x-signature';
  const received = String(req.headers.get(header) ?? '').trim();
  if (!received) throw new WebhookRefusal(401, 'Missing signature');

  const expected = await hmacBase64(secret, raw);
  if (!timingSafeEqual(expected, received)) throw new WebhookRefusal(401, 'Signature mismatch');

  try {
    return { body: JSON.parse(raw) };
  } catch {
    throw new WebhookRefusal(400, 'Body is not valid JSON');
  }
}
