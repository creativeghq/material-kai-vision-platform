import { assertSafeUrl } from '../ssrf-guard.ts';

export const MYDATA_PRODUCTION_BASE = 'https://mydatapi.aade.gr/myDATA';

/** `workspace_inbound_credentials.base_url` is tenant-writable, so only AADE's own hosts are fetched. */
export const MYDATA_ALLOWED_HOSTS: readonly string[] = ['mydatapi.aade.gr', 'mydataapidev.aade.gr'];

export class MydataEndpointRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MydataEndpointRefused';
  }
}

export function isAllowedMydataBase(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443')
    && MYDATA_ALLOWED_HOSTS.includes(u.hostname.toLowerCase()) && !u.search && !u.hash;
}

/** The base URL to call, without a trailing slash. Throws `MydataEndpointRefused` for any non-AADE target. */
export async function resolveMydataBase(raw: string | null | undefined, fallback = MYDATA_PRODUCTION_BASE): Promise<string> {
  const candidate = (raw && raw.trim()) || fallback;
  if (!isAllowedMydataBase(candidate)) {
    throw new MydataEndpointRefused('The configured myDATA endpoint is not an AADE host.');
  }
  try {
    await assertSafeUrl(candidate, { allowSchemes: ['https:'] });
  } catch (e) {
    throw new MydataEndpointRefused(`The configured myDATA endpoint was refused: ${(e as Error).message}`);
  }
  return candidate.replace(/\/+$/, '');
}

/** fetch() that never follows a redirect: a 3xx would move the request to a host nothing checked. */
export async function mydataFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, redirect: 'manual' });
  if (res.status >= 300 && res.status < 400) {
    await res.body?.cancel();
    throw new MydataEndpointRefused(`AADE answered with a redirect (HTTP ${res.status}), which is not followed.`);
  }
  return res;
}
