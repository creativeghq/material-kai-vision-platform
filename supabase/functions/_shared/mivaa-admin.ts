import { createClient } from '@supabase/supabase-js';
import { resolveSecret } from './secrets.ts';
import { captureMessage } from './sentry.ts';

const MIVAA_EXTERNAL_URL = 'https://v1api.materialshub.gr';
const BATCH = 100;

export interface ReembedResult { requested: number; embedded: number; failed: number }

/**
 * Rebuild the text embedding of exactly these products from their CURRENT rows. Best-effort: a
 * failure is reported to Sentry and in the result, and the stale-but-present vector stays.
 */
export async function reembedProducts(workspaceId: string, productIds: string[]): Promise<ReembedResult> {
  const out: ReembedResult = { requested: productIds.length, embedded: 0, failed: 0 };
  if (productIds.length === 0) return out;

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const apiKey = (await resolveSecret(db, 'MIVAA_API_KEY')).value;
  const urls = [Deno.env.get('MIVAA_LOCAL_URL') || 'http://127.0.0.1:8000', Deno.env.get('MIVAA_SERVICE_URL') || MIVAA_EXTERNAL_URL]
    .filter((u, i, all) => u && all.indexOf(u) === i);

  for (let i = 0; i < productIds.length; i += BATCH) {
    const ids = productIds.slice(i, i + BATCH);
    let done = false;
    let lastError = 'no upstream attempted';
    for (const base of urls) {
      try {
        const res = await fetch(`${base}/api/admin/text-embeddings/backfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
          body: JSON.stringify({
            product_ids: ids, workspace_id: workspaceId, include_products: true, include_chunks: false, max_products: ids.length,
          }),
        });
        if (!res.ok) { lastError = `${base} -> ${res.status}`; continue; }
        const counts = (await res.json())?.products ?? {};
        const embedded = Number(counts.embedded ?? 0);
        out.embedded += embedded;
        out.failed += ids.length - embedded;
        done = true;
        break;
      } catch (e) {
        lastError = `${base} -> ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    if (!done) {
      out.failed += ids.length;
      void captureMessage('product re-embed request failed; vectors left stale', 'warning', {
        tags: { subsystem: 'product-reembed' },
        extra: { workspaceId, count: ids.length, error: lastError },
        fingerprint: ['product-reembed', 'request-failed'],
      });
    }
  }
  return out;
}
