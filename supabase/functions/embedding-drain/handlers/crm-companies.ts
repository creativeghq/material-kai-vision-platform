import { embedDocumentText, supabaseAdmin, VOYAGE_DOCUMENT_MODEL } from '../embed.ts';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

interface BacklogRow {
  id: string;
  workspace_id: string | null;
  source_text: string | null;
  source_hash: string;
}

/** Embed one company and store the verdict. Never throws — the batch keeps draining. */
async function embedOne(row: BacklogRow): Promise<'success' | 'skipped' | 'failed'> {
  // Nothing beyond a bare name is a VERDICT ('skipped'), not an absence: left pending it would be
  // re-picked every tick forever and read to the integrity probe as a backlog that never drains.
  if (!row.source_text || !row.source_text.trim()) {
    const { error } = await supabaseAdmin.from('crm_companies').update({
      text_embedding_1024: null,
      embedding_status: 'skipped',
      embedding_source_hash: row.source_hash,
      embedding_model: null,
      embedding_error_message: null,
      embedding_updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) {
      console.error(`[embedding-drain:crm-companies] could not mark ${row.id} skipped:`, error.message);
      return 'failed';
    }
    return 'skipped';
  }

  try {
    const embedding = await embedDocumentText(row.source_text, row.workspace_id ?? null);
    const { error } = await supabaseAdmin.from('crm_companies').update({
      text_embedding_1024: embedding,
      embedding_status: 'success',
      embedding_source_hash: row.source_hash,
      embedding_model: VOYAGE_DOCUMENT_MODEL,
      embedding_error_message: null,
      embedding_updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (error) throw new Error(`Failed to save embedding: ${error.message}`);
    return 'success';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The hash is NOT stored on failure, so the row stays in the backlog behind its 6-hour cool-off.
    const { error: markErr } = await supabaseAdmin.from('crm_companies').update({
      embedding_status: 'failed',
      embedding_error_message: msg,
      embedding_updated_at: new Date().toISOString(),
    }).eq('id', row.id);
    if (markErr) console.error(`[embedding-drain:crm-companies] could not mark ${row.id} failed:`, markErr.message);
    console.error(`[embedding-drain:crm-companies] ${row.id}: ${msg}`);
    return 'failed';
  }
}

export async function drainCrmCompanies(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const limit = typeof body.limit === 'number'
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)))
    : DEFAULT_LIMIT;

  const { data, error } = await supabaseAdmin.rpc('crm_companies_embedding_backlog', { p_limit: limit });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as BacklogRow[];
  let succeeded = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const verdict = await embedOne(row);
    if (verdict === 'success') succeeded++;
    else if (verdict === 'skipped') skipped++;
    else failed++;
  }

  // Re-read rather than subtract: a row can leave the backlog for reasons this run did not cause.
  const { data: after } = await supabaseAdmin.rpc('crm_companies_embedding_backlog', { p_limit: MAX_LIMIT });
  const remaining = (after ?? []).length;

  return {
    processed: rows.length,
    succeeded,
    skipped,
    failed,
    remaining,
    remaining_capped: remaining >= MAX_LIMIT,
  };
}
