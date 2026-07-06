/**
 * KB Generate Embedding Edge Function
 *
 * Generates a text embedding for a KB document using the shared MIVAA
 * embedding infrastructure (Voyage AI, 1024D — model is whatever MIVAA's
 * `voyage_model` setting resolves to, currently voyage-4). Updates kb_docs
 * with the resulting vector + embedding_model, and sets embedding_status.
 * NOTE: query embeddings MUST use the same model as stored docs — a
 * cross-generation mismatch (e.g. voyage-3.5 doc vs voyage-4 query) yields
 * near-zero cosine and silently returns 0 search results.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, userCanAccessWorkspace } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

Deno.serve(withApiLogging('kb-generate-embedding', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Authenticate:
  // 1. Check for internal service key via x-internal-key header (pg_net trigger)
  // 2. Fall back to standard authenticate() for user JWTs / API secret keys
  const internalKey = req.headers.get('x-internal-key') || '';
  const isInternalCall = supabaseServiceKey && internalKey === supabaseServiceKey;

  // Pentest #250 C20: capture whether the caller is a trusted backend (pg_net trigger /
  // service-role / admin-secret) vs a specific user, so a user caller can be bound to the
  // doc's workspace below (otherwise any authenticated user could re-embed/overwrite any
  // tenant's KB doc by id — integrity + Voyage cost).
  let callerUserId: string | null = null;
  let isTrustedBackend = isInternalCall;
  if (!isInternalCall) {
    const auth = await authenticate(req);
    if (auth.success) {
      callerUserId = auth.userId;
      isTrustedBackend = auth.level === 'secret';
    } else {
      // Also accept service-role Bearer (edge-function-to-edge-function calls)
      const authHeader = req.headers.get('Authorization') || '';
      if (authHeader.includes(supabaseServiceKey)) {
        isTrustedBackend = true;
      } else {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
  }

  // Use service-role client so we can write embeddings regardless of RLS
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  let doc_id: string | undefined;

  try {
    const body = await req.json();
    doc_id = body.doc_id;

    if (!doc_id) {
      return new Response(
        JSON.stringify({ error: 'doc_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the document
    const { data: doc, error: fetchError } = await supabaseAdmin
      .from('kb_docs')
      .select('id, title, content, content_markdown, workspace_id')
      .eq('id', doc_id)
      .single();

    if (fetchError || !doc) {
      return new Response(
        JSON.stringify({ error: fetchError?.message || 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Pentest #250 C20: a user caller may only re-embed docs in their own workspace.
    if (!isTrustedBackend && !(await userCanAccessWorkspace(supabaseAdmin, callerUserId, doc.workspace_id))) {
      return new Response(
        JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build text — prefer markdown, fall back to plain content
    const textToEmbed = [doc.title, doc.content_markdown || doc.content]
      .filter(Boolean)
      .join('\n\n');

    if (!textToEmbed.trim()) {
      return new Response(
        JSON.stringify({ error: 'Document has no content to embed' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark as pending before starting
    await supabaseAdmin
      .from('kb_docs')
      .update({ embedding_status: 'pending', embedding_error_message: null })
      .eq('id', doc_id);

    const startMs = Date.now();

    // Generate embedding via MIVAA /api/embeddings/clip-text (Voyage AI 4, 1024D)
    const embResponse = await fetch(`${MIVAA_URL}/api/embeddings/clip-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: textToEmbed.substring(0, 8000),
        model: 'voyage-4',
        input_type: 'document',
        dimensions: 1024,
      }),
    });

    if (!embResponse.ok) {
      const errBody = await embResponse.text().catch(() => '');
      throw new Error(`MIVAA embedding API error ${embResponse.status}: ${errBody.substring(0, 200)}`);
    }

    const embResult = await embResponse.json();
    if (!embResult.success || !embResult.embedding) {
      throw new Error(`MIVAA embedding failed: ${embResult.error || 'no embedding returned'}`);
    }

    const embedding: number[] = embResult.embedding;
    const elapsedMs = Date.now() - startMs;

    // Store result
    const { error: updateError } = await supabaseAdmin
      .from('kb_docs')
      .update({
        text_embedding: embedding,
        embedding_status: 'success',
        embedding_model: 'voyage-4',
        embedding_dimension: embedding.length,
        embedding_generated_at: new Date().toISOString(),
        embedding_generation_time_ms: elapsedMs,
        embedding_error_message: null,
      })
      .eq('id', doc_id);

    if (updateError) {
      throw new Error(`Failed to save embedding: ${updateError.message}`);
    }

    // Section-level chunking: (re)build kb_doc_chunks so large docs are retrievable by
    // SECTION (not truncated to a head) and match per-section. Runs on MIVAA server-side;
    // fire-and-forget so doc save isn't blocked. Non-fatal — the backfill re-chunks on miss.
    try {
      const rechunk = fetch(`${MIVAA_URL}/api/rag/kb-docs/rechunk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ doc_id }),
      }).catch((e) => console.warn('kb rechunk trigger failed:', e));
      // Keep it alive past the response when the runtime supports it.
      (globalThis as any).EdgeRuntime?.waitUntil?.(rechunk);
    } catch (e) {
      console.warn('kb rechunk dispatch error:', e);
    }

    return new Response(
      JSON.stringify({
        success: true,
        doc_id,
        dimensions: embedding.length,
        model: 'voyage-4',
        generation_time_ms: elapsedMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('kb-generate-embedding error:', err);

    // Mark document as failed
    if (doc_id) {
      try {
        await supabaseAdmin
          .from('kb_docs')
          .update({
            embedding_status: 'failed',
            embedding_error_message: err instanceof Error ? err.message : String(err),
          })
          .eq('id', doc_id);
      } catch {
        // ignore — best effort
      }
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
