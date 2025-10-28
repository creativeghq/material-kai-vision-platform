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

    console.log(`🖼️ Processing image queue - batch size: ${batchSize}`);

    // Get pending image processing jobs
    const { data: pendingJobs, error: fetchError } = await supabase
      .from('image_processing_queue')
      .select('*')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch pending jobs: ${fetchError.message}`);
    }

    if (!pendingJobs || pendingJobs.length === 0) {
      console.log('✅ No pending image processing jobs');
      return new Response(
        JSON.stringify({
          success: true,
          processed: 0,
          message: 'No pending jobs',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`📦 Found ${pendingJobs.length} pending jobs`);

    let processed = 0;
    let failed = 0;

    for (const job of pendingJobs) {
      try {
        // Mark as processing
        await supabase
          .from('image_processing_queue')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        // Get image data
        const { data: image, error: imageError } = await supabase
          .from('document_images')
          .select('*')
          .eq('id', job.image_id)
          .single();

        if (imageError || !image) {
          throw new Error(`Failed to fetch image: ${imageError?.message}`);
        }

        // Process image with OCR via MIVAA
        const ocrResponse = await fetch(`${MIVAA_API_URL}/ocr/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_data: image.image_data || image.image_url,
            languages: ['en'],
            preprocessing_enabled: true,
            confidence_threshold: 0.3,
            document_type: 'material_catalog',
          }),
        });

        if (!ocrResponse.ok) {
          throw new Error(`OCR processing failed: ${ocrResponse.statusText}`);
        }

        const ocrData = await ocrResponse.json();
        const extractedText = ocrData.ocr_results
          ?.map((result: any) => result.text)
          .filter((text: string) => text && text.trim())
          .join('\n') || '';

        // Generate CLIP embedding via enhanced-clip-integration
        const clipResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/enhanced-clip-integration`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              action: 'generate_product_embeddings',
              productId: image.id,
              productText: extractedText || image.description || 'Material image',
            }),
          },
        );

        const clipData = clipResponse.ok ? await clipResponse.json() : null;

        // Update image with OCR results and embeddings
        await supabase
          .from('document_images')
          .update({
            ocr_text: extractedText,
            clip_embedding: clipData?.data?.embedding ? JSON.stringify(clipData.data.embedding) : null,
            clip_model_version: clipData?.data?.model || 'clip-vit-base-patch32',
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.image_id);

        // Mark job as completed
        await supabase
          .from('image_processing_queue')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            result: {
              ocr_text_length: extractedText.length,
              embedding_generated: !!clipData?.data?.embedding,
              processing_time_ms: Date.now(),
            },
          })
          .eq('id', job.id);

        processed++;
        console.log(`✅ Processed image ${job.image_id}`);

      } catch (error) {
        console.error(`❌ Failed to process job ${job.id}:`, error);
        failed++;

        // Update job with error and retry logic
        const newRetryCount = (job.retry_count || 0) + 1;
        const shouldRetry = newRetryCount < (job.max_retries || maxRetries);

        await supabase
          .from('image_processing_queue')
          .update({
            status: shouldRetry ? 'pending' : 'failed',
            retry_count: newRetryCount,
            error_message: error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }

      // Update progress in job_progress table
      const { data: document } = await supabase
        .from('processed_documents')
        .select('id')
        .eq('id', job.document_id)
        .single();

      if (document) {
        const { data: queueStats } = await supabase
          .from('image_processing_queue')
          .select('status')
          .eq('document_id', job.document_id);

        const completed = queueStats?.filter((j: any) => j.status === 'completed').length || 0;
        const total = queueStats?.length || 1;
        const progress = 20 + (completed / total) * 20;

        await supabase
          .from('job_progress')
          .upsert({
            document_id: job.document_id,
            stage: 'image_processing',
            progress: Math.min(40, progress),
            completed_items: completed,
            total_items: total,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'document_id,stage' });
      }
    }

    console.log(`🎉 Image queue processing complete: ${processed} processed, ${failed} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        message: `Processed ${processed} images, ${failed} failed`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error in image queue processing:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

