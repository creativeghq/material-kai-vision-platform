/** Reads one page for the quote check: every hop goes through the SSRF guard, redirects are re-checked, size and time are capped. */

import { assertSafeUrl } from './ssrf-guard.ts';
import type { FetchedPage } from './b2b-quote-check.ts';

const MAX_BYTES = 1_500_000;
const MAX_HOPS = 3;

export async function fetchPageText(rawUrl: string, timeoutMs: number): Promise<FetchedPage> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const expired = new Promise<never>((_, reject) => deadline.addEventListener('abort', () => reject(new Error('timed out')), { once: true }));
  expired.catch(() => {});
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const safe = await Promise.race([assertSafeUrl(url, { allowSchemes: ['https:', 'http:'] }), expired]);
    const res = await fetch(safe, {
      redirect: 'manual',
      signal: deadline,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MaterialKaiBot/1.0)', accept: 'text/html,*/*;q=0.5' },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location');
      await res.body?.cancel();
      if (!next) throw new Error('redirect without location');
      url = new URL(next, safe).toString();
      continue;
    }
    if (!res.ok) {
      await res.body?.cancel();
      throw new Error(`HTTP ${res.status}`);
    }
    const reader = res.body?.getReader();
    if (!reader) return { text: '', contentType: res.headers.get('content-type'), truncated: false };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.length;
    }
    const truncated = size >= MAX_BYTES;
    await reader.cancel().catch(() => {});
    const buf = new Uint8Array(size);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    return { text: new TextDecoder('utf-8', { fatal: false }).decode(buf), contentType: res.headers.get('content-type'), truncated };
  }
  throw new Error('too many redirects');
}
