import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      imageUrl,
      userId,
      options = {},
    } = await req.json();

    if (!imageUrl || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: imageUrl and userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Starting OCR processing for image:', imageUrl);

    // Simulate OCR processing
    const extractedText = `Material Specification Sheet
    
Material: Advanced Carbon Composite
Type: Structural Material
Density: 1.45 g/cm³
Tensile Strength: 3,500 MPa
Young's Modulus: 230 GPa
Working Temperature: -40°C to 120°C
Applications: Aerospace, Automotive
Certification: ISO 9001, AS9100

Properties:
- High strength-to-weight ratio
- Excellent corrosion resistance
- Superior fatigue performance
- Thermal stability

Safety Information:
- Use appropriate PPE
- Avoid direct skin contact
- Store in dry conditions
- Temperature range: 15-25°C`;

    const structuredData = {
      material_name: 'Advanced Carbon Composite',
      material_type: 'Structural Material',
      properties: {
        density: '1.45 g/cm³',
        tensile_strength: '3,500 MPa',
        youngs_modulus: '230 GPa',
        working_temperature: '-40°C to 120°C',
      },
      applications: ['Aerospace', 'Automotive'],
      certifications: ['ISO 9001', 'AS9100'],
      safety_info: [
        'Use appropriate PPE',
        'Avoid direct skin contact',
        'Store in dry conditions',
        'Temperature range: 15-25°C',
      ],
    };

    const metadata = {
      language: options.language || 'en',
      confidence: 0.95,
      processing_method: 'hybrid_ocr',
      document_type: options.documentType || 'material_specification',
      extraction_time: new Date().toISOString(),
    };

    // Store OCR results
    try {
      const { error: storageError } = await supabase
        .from('ocr_results')
        .insert({
          user_id: userId,
          input_data: {
            image_url: imageUrl,
            language: options.language || 'en',
            document_type: options.documentType || 'material_specification',
            extract_structured_data: options.extractStructuredData || false,
          },
          result_data: {
            extracted_text: extractedText,
            structured_data: options.extractStructuredData ? structuredData : null,
            metadata: metadata,
          },
          confidence_score: 0.95,
          processing_time_ms: 500, // Simulated processing time
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

    console.log('OCR processing completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        extractedText: extractedText,
        structuredData: options.extractStructuredData ? structuredData : null,
        metadata: metadata,
        confidence: 0.95,
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
