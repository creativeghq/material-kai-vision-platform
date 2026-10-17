/**
 * Rechunks the kb_docs whose chunks are missing, out of date, or failed — the set
 * `kb_docs_needing_rechunk` derives from `chunks_source_hash`. The work runs on MIVAA; a doc
 * takes ~20s, so a tick stays well under the 150s edge ceiling.
 */
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 5;

export async function drainKbChunks(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const limit = typeof body.limit === 'number'
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)))
    : DEFAULT_LIMIT;
  const base = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
  // /kb-docs/rechunk accepts the service-role bearer or x-cron-secret; see _require_internal_kb_caller.
  const res = await fetch(`${base}/api/rag/kb-docs/rechunk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': Deno.env.get('CRON_SECRET') || '' },
    body: JSON.stringify({ stale: true, limit }),
    signal: AbortSignal.timeout(130_000),
  });
  if (!res.ok) throw new Error(`MIVAA rechunk ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const out = await res.json() as {
    processed?: number; chunks_total?: number; errors?: Array<{ doc_id?: string; error?: string }>;
  };
  const errors = out.errors ?? [];
  return {
    processed: out.processed ?? 0,
    succeeded: (out.processed ?? 0) - errors.length,
    failed: errors.length,
    chunks_total: out.chunks_total ?? 0,
    sample_errors: errors.slice(0, 5).map((e) => `${e.doc_id}: ${e.error}`),
  };
}
