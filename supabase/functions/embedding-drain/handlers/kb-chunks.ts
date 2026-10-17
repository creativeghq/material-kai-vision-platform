/**
 * Claims the kb_docs whose chunks are missing, out of date or failing (claim_kb_docs_for_rechunk)
 * and hands them to MIVAA, which rechunks them after answering. Each outcome is recorded on the
 * kb_docs row and watched by kb.doc_chunks_missing — not reported in this response.
 */
import { resolveSecret } from '../../_shared/secrets.ts';
import { supabaseAdmin } from '../embed.ts';

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

export async function drainKbChunks(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const limit = typeof body.limit === 'number'
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)))
    : DEFAULT_LIMIT;
  const cronSecret = (await resolveSecret(supabaseAdmin, 'CRON_SECRET')).value;
  if (!cronSecret) throw new Error('CRON_SECRET is not configured; MIVAA would refuse the rechunk');
  const base = (await resolveSecret(supabaseAdmin, 'MIVAA_GATEWAY_URL')).value || 'https://v1api.materialshub.gr';

  const res = await fetch(`${base}/api/rag/kb-docs/rechunk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': cronSecret },
    body: JSON.stringify({ stale: true, limit }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`MIVAA rechunk ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json() as { queued?: number; doc_ids?: string[] };
  return { queued: out.queued ?? 0, doc_ids: out.doc_ids ?? [] };
}
