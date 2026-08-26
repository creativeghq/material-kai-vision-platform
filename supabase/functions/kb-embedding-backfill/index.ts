/**
 * KB Embedding Backfill
 *
 * Drains kb_docs that have no usable text_embedding yet — i.e. rows left
 * `pending` (never embedded) or `failed` (MIVAA was overloaded during a bulk
 * import: 502 / TLS handshake EOF / connection closed). Without an embedding a
 * doc is invisible to agent KB search (kb_match_docs is vector-based), so this
 * closes the gap left by the fire-and-forget on-create embedding.
 *
 * Processes a small batch SEQUENTIALLY per invocation so we never hammer the
 * MIVAA embedding endpoint the way the original bulk import did. A pg_cron
 * job calls this every couple of minutes to drain the backlog gradually; it's
 * idempotent and early-returns when nothing is left.
 *
 * Auth: service-role bearer (cron / internal) or an admin JWT.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess, isCronAuthorized } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const CRON_SECRET = () => Deno.env.get('CRON_SECRET') || '';

const DEFAULT_LIMIT = 12;   // docs per invocation — keep small to spare MIVAA
const MAX_LIMIT = 50;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

interface DocRow {
  id: string;
  title: string | null;
  content: string | null;
  content_markdown: string | null;
  workspace_id: string | null;
}

async function embedOne(doc: DocRow): Promise<{ ok: true; dims: number } | { ok: false; error: string }> {
  const textToEmbed = [doc.title, doc.content_markdown || doc.content].filter(Boolean).join('\n\n');
  if (!textToEmbed.trim()) {
    await supabaseAdmin
      .from('kb_docs')
      .update({ embedding_status: 'failed', embedding_error_message: 'Document has no content to embed' })
      .eq('id', doc.id);
    return { ok: false, error: 'empty content' };
  }

  try {
    const startMs = Date.now();
    const embResponse = await fetch(`${MIVAA_URL}/api/embeddings/clip-text`, {
      method: 'POST',
      // MIVAA's /api/embeddings/* is excluded from the JWT middleware (no user
      // JWT exists on this path) and, until audit #12, had no route gate either --
      // an unauthenticated, uncapped Voyage spend reachable from the internet. It
      // now requires verify_internal_access; x-cron-secret is the branch that is a
      // plain string compare, so it works where a service-role Bearer would not
      // (_validate_supabase_jwt rejects aud="service_role").
      headers: { 'Content-Type': 'application/json', 'x-cron-secret': CRON_SECRET() },
      body: JSON.stringify({
        text: textToEmbed.substring(0, 8000),
        model: 'voyage-4',
        input_type: 'document',
        dimensions: 1024,
        // Attribution only (MIVAA authenticates this route by x-cron-secret, not by
        // this field): without it every clip-text call landed in ai_usage_logs with a
        // NULL workspace_id — 979 rows in 30 days, invisible to per-tenant cost views.
        workspace_id: doc.workspace_id ?? null,
      }),
    });

    if (!embResponse.ok) {
      const errBody = await embResponse.text().catch(() => '');
      throw new Error(`MIVAA embedding API error ${embResponse.status}: ${errBody.substring(0, 160)}`);
    }

    const embResult = await embResponse.json();
    if (!embResult.success || !embResult.embedding) {
      throw new Error(`MIVAA embedding failed: ${embResult.error || 'no embedding returned'}`);
    }

    const embedding: number[] = embResult.embedding;
    const { error: updateError } = await supabaseAdmin
      .from('kb_docs')
      .update({
        text_embedding: embedding,
        embedding_status: 'success',
        embedding_model: 'voyage-4',
        embedding_dimension: embedding.length,
        embedding_generated_at: new Date().toISOString(),
        embedding_generation_time_ms: Date.now() - startMs,
        embedding_error_message: null,
      })
      .eq('id', doc.id);
    if (updateError) throw new Error(`Failed to save embedding: ${updateError.message}`);

    return { ok: true, dims: embedding.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Only record the failure if the row still has no vector — see the matching
    // note in kb-generate-embedding. A concurrent attempt may have succeeded
    // between this batch being selected and this write, and marking that row
    // 'failed' would leave a perfectly searchable doc permanently mislabelled.
    await supabaseAdmin
      .from('kb_docs')
      .update({ embedding_status: 'failed', embedding_error_message: msg })
      .eq('id', doc.id)
      .is('text_embedding', null);
    return { ok: false, error: msg };
  }
}

Deno.serve(withApiLogging('kb-embedding-backfill', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Auth — accept service-role bearer (cron / internal) or admin JWT.
  const authHeader = req.headers.get('Authorization') || '';
  const isServiceRole = supabaseServiceKey && authHeader.includes(supabaseServiceKey);
  if (!isServiceRole && !isCronAuthorized(req)) {
    const auth = await authenticate(req, { allowedRoles: ['admin'] });
    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
  }

  let limit = DEFAULT_LIMIT;
  let workspaceId: string | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.limit === 'number') limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(body.limit)));
    if (typeof body.workspace_id === 'string') workspaceId = body.workspace_id;
  } catch { /* no body — use defaults */ }

  // Remaining backlog (for reporting + cron self-stop).
  let remainingQ = supabaseAdmin
    .from('kb_docs')
    .select('*', { count: 'exact', head: true })
    .is('text_embedding', null)
    .in('embedding_status', ['pending', 'failed']);
  if (workspaceId) remainingQ = remainingQ.eq('workspace_id', workspaceId);
  const { count: backlogBefore } = await remainingQ;

  // Claim a batch (oldest first).
  let batchQ = supabaseAdmin
    .from('kb_docs')
    .select('id, title, content, content_markdown, workspace_id')
    .is('text_embedding', null)
    .in('embedding_status', ['pending', 'failed'])
    .order('created_at', { ascending: true })
    .limit(limit);
  if (workspaceId) batchQ = batchQ.eq('workspace_id', workspaceId);
  const { data: batch, error: batchErr } = await batchQ;

  if (batchErr) {
    return new Response(
      JSON.stringify({ error: batchErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const rows = (batch || []) as DocRow[];
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  // Sequential — one at a time so we don't reproduce the bulk-import overload.
  for (const doc of rows) {
    const res = await embedOne(doc);
    if (res.ok) succeeded++;
    else { failed++; if (errors.length < 5) errors.push(res.error); }
  }

  const remaining = Math.max(0, (backlogBefore || 0) - succeeded);

  return new Response(
    JSON.stringify({
      success: true,
      processed: rows.length,
      succeeded,
      failed,
      backlog_before: backlogBefore || 0,
      remaining,
      sample_errors: errors,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
