/**
 * KB Generate Embedding Edge Function
 *
 * Generates a text embedding for a KB document using the shared MIVAA
 * embedding infrastructure (Voyage AI 3.5, 1024D). Updates kb_docs with
 * the resulting vector and sets embedding_status accordingly.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { generateStandardEmbedding } from '../_shared/embedding-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Authenticate — accept any valid user or secret key
  const auth = await authenticate(req);
  if (!auth.success) {
    return new Response(
      JSON.stringify({ error: auth.error || 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
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

    // Generate embedding via shared MIVAA / Voyage AI 3.5 infrastructure
    const embedding = await generateStandardEmbedding(textToEmbed, 'document', {
      operationType: 'kb_embedding',
      jobId: doc_id,
    });

    const elapsedMs = Date.now() - startMs;

    // Store result
    const { error: updateError } = await supabaseAdmin
      .from('kb_docs')
      .update({
        text_embedding: embedding,
        embedding_status: 'success',
        embedding_model: 'voyage-3.5',
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
        model: 'voyage-3.5',
        generation_time_ms: elapsedMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('kb-generate-embedding error:', err);

    // Mark document as failed
    if (doc_id) {
      await supabaseAdmin
        .from('kb_docs')
        .update({
          embedding_status: 'failed',
          embedding_error_message: err instanceof Error ? err.message : String(err),
        })
        .eq('id', doc_id)
        .catch(() => {});
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
