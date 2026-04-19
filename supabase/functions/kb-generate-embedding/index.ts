/**
 * KB Generate Embedding Edge Function
 *
 * Generates a text embedding for a KB document using the shared MIVAA
 * embedding infrastructure (Voyage AI 3.5, 1024D). Updates kb_docs with
 * the resulting vector and sets embedding_status accordingly.
 */

import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
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

  if (!isInternalCall) {
    try {
      const auth = await authenticate(req);
      if (!auth.success) {
        throw new Error(auth.error || 'Unauthorized');
      }
    } catch {
      // Also accept service-role Bearer (edge-function-to-edge-function calls)
      const authHeader = req.headers.get('Authorization') || '';
      if (!authHeader.includes(supabaseServiceKey)) {
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
      .select('id, title, content, content_markdown')
      .eq('id', doc_id)
      .single();

    if (fetchError || !doc) {
      return new Response(
        JSON.stringify({ error: fetchError?.message || 'Document not found' }),
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
