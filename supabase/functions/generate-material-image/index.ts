import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const openaiApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, material_type, tile_id, style = 'professional' } = await req.json();

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Generating material image for:', material_type);

    let imageResponse;
    let imageUrl;

    // Try OpenAI first if available
    if (openaiApiKey) {
      try {
        const enhancedPrompt = `Professional technical illustration of ${material_type} material. ${prompt}. 
        Clean, high-quality material sample on white background, detailed texture and surface properties visible, 
        technical documentation style, professional lighting, no text or labels.`;

        imageResponse = await fetch('https://api.openai.com/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openaiApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-image-1',
            prompt: enhancedPrompt,
            n: 1,
            size: '1024x1024',
            quality: 'high',
            output_format: 'png',
            background: 'opaque'
          }),
        });

        if (imageResponse.ok) {
          const imageData = await imageResponse.json();
          // For gpt-image-1, the response contains base64 data
          const base64Image = imageData.data[0].b64_json;
          
          // Convert base64 to blob for storage
          const imageBytes = Uint8Array.from(atob(base64Image), c => c.charCodeAt(0));
          
          // Store image in Supabase storage
          const fileName = `material_${material_type}_${tile_id || Date.now()}.png`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('material-images')
            .upload(`generated/${fileName}`, imageBytes, {
              contentType: 'image/png',
              upsert: true
            });

          if (uploadError) {
            console.error('Storage upload error:', uploadError);
            throw uploadError;
          }

          // Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('material-images')
            .getPublicUrl(`generated/${fileName}`);

          imageUrl = publicUrl;
        } else {
          throw new Error(`OpenAI API error: ${imageResponse.status}`);
        }
      } catch (openaiError) {
        console.error('OpenAI generation failed:', openaiError);
        // Fall through to alternative method
      }
    }

    // Fallback to Hugging Face if OpenAI is not available or failed
    if (!imageUrl) {
      const huggingFaceToken = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
      
      if (huggingFaceToken) {
        try {
          const fallbackPrompt = `High-quality ${material_type} material sample, professional photography style, 
          clean white background, detailed texture, technical documentation quality`;

          const hfResponse = await fetch('https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${huggingFaceToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ inputs: fallbackPrompt }),
          });

          if (hfResponse.ok) {
            const imageBlob = await hfResponse.blob();
            const imageBytes = new Uint8Array(await imageBlob.arrayBuffer());
            
            // Store in Supabase storage
            const fileName = `material_${material_type}_${tile_id || Date.now()}_hf.jpg`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('material-images')
              .upload(`generated/${fileName}`, imageBytes, {
                contentType: 'image/jpeg',
                upsert: true
              });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
              .from('material-images')
              .getPublicUrl(`generated/${fileName}`);

            imageUrl = publicUrl;
          } else {
            throw new Error(`Hugging Face API error: ${hfResponse.status}`);
          }
        } catch (hfError) {
          console.error('Hugging Face generation failed:', hfError);
        }
      }
    }

    // Ultimate fallback - generate a placeholder or use a stock image
    if (!imageUrl) {
      // Generate a simple placeholder with material info
      imageUrl = `https://via.placeholder.com/512x512/f0f0f0/333333?text=${encodeURIComponent(material_type.toUpperCase())}`;
    }

    console.log('Generated image URL:', imageUrl);

    // Optionally store the generation record
    try {
      await supabase
        .from('material_knowledge')
        .insert({
          title: `Generated Image: ${material_type}`,
          content: `AI-generated visual representation of ${material_type} material`,
          source_type: 'ai_generated_image',
          metadata: {
            prompt: prompt,
            material_type: material_type,
            tile_id: tile_id,
            image_url: imageUrl,
            generation_method: openaiApiKey ? 'openai' : 'huggingface',
            style: style
          }
        });
    } catch (dbError) {
      console.error('Failed to store generation record:', dbError);
      // Don't fail the whole request for this
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        image_url: imageUrl,
        material_type: material_type,
        generation_method: openaiApiKey ? 'openai' : 'huggingface'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-material-image function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});