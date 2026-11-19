import { assertSafeUrl } from '../ssrf-guard.ts';
import type { EuVat } from './euVat.ts';

export interface ViesResult { status: 'valid' | 'invalid' | 'unavailable'; name: string | null; error?: string }

const BUSY = new Set(['MS_MAX_CONCURRENT_REQ', 'GLOBAL_MAX_CONCURRENT_REQ', 'MS_UNAVAILABLE', 'TIMEOUT', 'SERVICE_UNAVAILABLE']);
const BACKOFF_MS = [1500, 4000];

/** One VIES check. Busy/rate answers are retried twice, then reported as `unavailable` — never as invalid. */
export async function viesLookup(vat: EuVat, until: number): Promise<ViesResult> {
  const url = `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${vat.cc}/vat/${encodeURIComponent(vat.number)}`;
  let lastError = 'no attempt';
  for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
    const left = until - Date.now();
    if (left < 1500) return { status: 'unavailable', name: null, error: `budget spent (${lastError})` };
    try {
      await assertSafeUrl(url, { allowSchemes: ['https:'] });
      const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(Math.min(10_000, left)), headers: { accept: 'application/json' } });
      const body = await res.json().catch(() => null) as { isValid?: boolean; userError?: string; name?: string } | null;
      const err = body?.userError ?? `HTTP ${res.status}`;
      if (body && typeof body.isValid === 'boolean' && !BUSY.has(err)) {
        if (!body.isValid) return { status: 'invalid', name: null };
        const name = String(body.name ?? '').trim();
        return { status: 'valid', name: name && !/^-+$/.test(name) ? name : null };
      }
      lastError = err;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (attempt < BACKOFF_MS.length) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
  }
  return { status: 'unavailable', name: null, error: lastError };
}
