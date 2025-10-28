import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIVAA_API_URL = Deno.env.get('MIVAA_API_URL') || 'https://v1api.materialshub.gr';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { batchSize = 10, maxRetries = 3 } = await req.json();

    console.log(`🤖 Processing AI analysis queue - batch size: ${batchSize}`);

    // Get pending AI analysis jobs
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('ai_analysis_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch pending jobs: ${fetchError.message}`);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('✅ No pending AI analysis jobs');
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: 'No pending jobs',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`📦 Found ${pendingJobs.length} pending AI analysis jobs`);

    let processed = 0;
    let failed = 0;

    for (const job of pendingJobs) {
      try {
        // Mark as processing
        await supabase
          .from('ai_analysis_queue')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Get chunk data
        const { data: chunk, error: chunkError } = await supabase
          .from('document_chunks')
          .select('*')
          .eq('id', job.chunk_id)
          .single();

        if (chunkError || !chunk) {
          throw new Error(`Failed to fetch chunk: ${chunkError?.message}`);
        }

        let analysisResult: any = {};

        // Perform analysis based on type
        if (job.analysis_type === 'classification') {
          // Call classify-content edge function
          const classifyResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/classify-content`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                content: chunk.content,
                context: 'material_catalog',
              }),
            },
          );

          if (classifyResponse.ok) {
            analysisResult = await classifyResponse.json();
          }
        } else if (job.analysis_type === 'metadata') {
          // Call canonical-metadata-extraction edge function
          const metadataResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/canonical-metadata-extraction`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                content: chunk.content,
                chunkId: job.chunk_id,
              }),
            },
          );

          if (metadataResponse.ok) {
            analysisResult = await metadataResponse.json();
          }
        } else if (job.analysis_type === 'product_detection') {
          // Call enhanced-product-processing edge function
          const productResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/enhanced-product-processing`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              },
              body: JSON.stringify({
                action: 'analyze_coverage',
                documentId: job.document_id,
              }),
            },
          );

          if (productResponse.ok) {
            analysisResult = await productResponse.json();
          }
        }

        // Store analysis result in chunk metadata
        await supabase
          .from('document_chunks')
          .update({
            metadata: {
              ...chunk.metadata,
              [`${job.analysis_type}_analysis`]: analysisResult,
              [`${job.analysis_type}_analyzed_at`]: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.chunk_id);

        // Mark job as completed
        await supabase
          .from('ai_analysis_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: analysisResult,
          })
          .eq('id', job.id);

        processed++;
        console.log(`✅ Completed AI analysis for chunk ${job.chunk_id}`);

      } catch (error) {
        console.error(`❌ Failed to process job ${job.id}:`, error);
        failed++;

        // Update job with error and retry logic
        const newRetryCount = (job.retry_count || 0) + 1;
        const shouldRetry = newRetryCount < (job.max_retries || maxRetries);

        await supabase
          .from('ai_analysis_queue')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            retry_count: newRetryCount,
            error_message: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }

      // Update progress in job_progress table
      const { data: queueStats } = await supabase
        .from('ai_analysis_queue')
        .select('status')
        .eq('document_id', job.document_id);

      const completed = queueStats?.filter((j: any) => j.status === 'completed').length || 0;
      const total = queueStats?.length || 1;
      const progress = 60 + (completed / total) * 30;

      await supabase
        .from('job_progress')
        .upsert({
          document_id: job.document_id,
          stage: 'ai_analysis',
          progress: Math.min(90, progress),
          completed_items: completed,
          total_items: total,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'document_id,stage' });
    }

    console.log(`🎉 AI analysis queue processing complete: ${processed} processed, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        message: `Processed ${processed} analyses, ${failed} failed`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error in AI analysis queue processing:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

