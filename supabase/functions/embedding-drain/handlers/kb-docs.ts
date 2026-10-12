import { embedDocumentText, supabaseAdmin, VOYAGE_DOCUMENT_MODEL } from '../embed.ts';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

interface DocRow {
  id: string;
  title: string | null;
  content: string | null;
  content_markdown: string | null;
  workspace_id: string | null;
}

async function embedOne(doc: DocRow): Promise<{ ok: true } | { ok: false; error: string }> {
  const text = [doc.title, doc.content_markdown || doc.content].filter(Boolean).join('\n\n');
  if (!text.trim()) {
    await supabaseAdmin
      .from('kb_docs')
      .update({ embedding_status: 'failed', embedding_error_message: 'Document has no content to embed' })
      .eq('id', doc.id);
    return { ok: false, error: 'empty content' };
  }

  try {
    const startMs = Date.now();
    const embedding = await embedDocumentText(text, doc.workspace_id ?? null);
    const { error } = await supabaseAdmin
      .from('kb_docs')
      .update({
        text_embedding: embedding,
        embedding_status: 'success',
        embedding_model: VOYAGE_DOCUMENT_MODEL,
        embedding_dimension: embedding.length,
        embedding_generated_at: new Date().toISOString(),
        embedding_generation_time_ms: Date.now() - startMs,
        embedding_error_message: null,
      })
      .eq('id', doc.id);
    if (error) throw new Error(`Failed to save embedding: ${error.message}`);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Only when the row still has no vector: a concurrent attempt may have succeeded since this
    // batch was selected, and 'failed' would mislabel a searchable doc for good.
    await supabaseAdmin
      .from('kb_docs')
      .update({ embedding_status: 'failed', embedding_error_message: msg })
      .eq('id', doc.id)
      .is('text_embedding', null);
    return { ok: false, error: msg };
  }
}

export async function drainKbDocs(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const limit = typeof body.limit === 'number'
    ? Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)))
    : DEFAULT_LIMIT;
  const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id : undefined;

  let backlogQ = supabaseAdmin
    .from('kb_docs')
    .select('*', { count: 'exact', head: true })
    .is('text_embedding', null)
    .in('embedding_status', ['pending', 'failed']);
  if (workspaceId) backlogQ = backlogQ.eq('workspace_id', workspaceId);
  const { count: backlogBefore } = await backlogQ;

  let batchQ = supabaseAdmin
    .from('kb_docs')
    .select('id, title, content, content_markdown, workspace_id')
    .is('text_embedding', null)
    .in('embedding_status', ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit);
  if (workspaceId) batchQ = batchQ.eq('workspace_id', workspaceId);
  const { data: batch, error } = await batchQ;
  if (error) throw new Error(error.message);

  const rows = (batch || []) as DocRow[];
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const doc of rows) {
    const res = await embedOne(doc);
    if (res.ok) succeeded++;
    else { failed++; if (errors.length < 5) errors.push(res.error); }
  }

  return {
    processed: rows.length,
    succeeded,
    failed,
    backlog_before: backlogBefore || 0,
    remaining: Math.max(0, (backlogBefore || 0) - succeeded),
    sample_errors: errors,
  };
}
