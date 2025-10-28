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

    const {
      image,
      imageUrl,
      userId,
      documentType,
      materialContext,
      extractStructuredData,
      language = 'en',
    } = await req.json();

    if (!image && !imageUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: image or imageUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Starting OCR processing via MIVAA backend');

    // Call MIVAA backend OCR service (EasyOCR)
    const mivaaResponse = await fetch(`${MIVAA_API_URL}/ocr/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_data: image || imageUrl,
        languages: [language],
        preprocessing_enabled: true,
        confidence_threshold: 0.3,
        document_type: documentType || 'general',
        material_context: materialContext,
      }),
    });

    if (!mivaaResponse.ok) {
      throw new Error(`MIVAA OCR failed: ${mivaaResponse.statusText}`);
    }

    const mivaaData = await mivaaResponse.json();

    // Extract text from OCR results
    const extractedText = mivaaData.ocr_results
      ?.map((result: any) => result.text)
      .filter((text: string) => text && text.trim())
      .join('\n') || '';

    // Extract structured data if requested
    let structuredData = null;
    if (extractStructuredData && mivaaData.structured_data) {
      structuredData = mivaaData.structured_data;
    }

    const metadata = {
      language: language,
      confidence: mivaaData.average_confidence || 0.8,
      processing_method: 'mivaa_easyocr',
      document_type: documentType || 'general',
      extraction_time: new Date().toISOString(),
      ocr_engine: 'EasyOCR',
    };

    // Store OCR results if userId provided
    if (userId) {
      try {
        const { error: storageError } = await supabase
          .from('ocr_results')
          .insert({
            user_id: userId,
            input_data: {
              image_url: imageUrl || 'base64_image',
              language: language,
              document_type: documentType || 'general',
              extract_structured_data: extractStructuredData || false,
            },
            result_data: {
              extracted_text: extractedText,
              structured_data: structuredData,
              metadata: metadata,
            },
            confidence_score: metadata.confidence,
            processing_time_ms: mivaaData.processing_time_ms || 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (storageError) {
          console.error('Failed to store OCR results:', storageError);
        } else {
          console.log('✅ OCR results stored successfully');
        }
      } catch (storageError) {
        console.error('Error storing OCR results:', storageError);
      }
    }

    console.log('OCR processing completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        extractedText: extractedText,
        structuredData: structuredData,
        metadata: metadata,
        confidence: metadata.confidence,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error in OCR processing:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
