/**
 * Auto-Analyze Image - Supabase Edge Function
 * 
 * Automatically analyzes images when uploaded to knowledge base using Llama 4 Scout Vision.
 * 
 * Features:
 * - Triggered on image upload to material_images table
 * - Uses Llama 4 Scout Vision (69.4% MMMU, #1 OCR)
 * - Extracts: materials, colors, textures, patterns, finishes
 * - Generates searchable descriptions and tags
 * - Updates image record with analysis data
 * 
 * Trigger: INSERT on material_images table
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOGETHER_API_KEY = Deno.env.get('TOGETHER_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface ImageAnalysisResult {
  materials: string[];
  colors: string[];
  textures: string[];
  patterns: string[];
  finish: string;
  description: string;
  tags: string[];
  properties: Record<string, any>;
  confidence: number;
}

serve(async (req) => {
  try {
    const { record } = await req.json();
    
    if (!record || !record.id) {
      return new Response(
        JSON.stringify({ error: 'Invalid request - missing image record' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Auto-analyzing image: ${record.id}`);

    // Create Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Download image from storage
    const imageUrl = record.image_url;
    if (!imageUrl) {
      console.log('⚠️ No image URL found, skipping analysis');
      return new Response(
        JSON.stringify({ success: true, message: 'No image URL to analyze' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));

    // Analyze with Llama 4 Scout Vision
    const analysis = await analyzeImageWithLlama(imageBase64);

    if (!analysis) {
      console.log('⚠️ Analysis failed, skipping update');
      return new Response(
        JSON.stringify({ success: false, message: 'Analysis failed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Update image record with analysis
    const { error: updateError } = await supabase
      .from('material_images')
      .update({
        analysis_data: analysis,
        tags: analysis.tags,
        color_palette: {
          colors: analysis.colors,
          primary_color: analysis.colors[0] || null
        },
        description: analysis.description,
        metadata: {
          ...record.metadata,
          auto_analyzed: true,
          analysis_timestamp: new Date().toISOString(),
          analysis_model: 'llama-4-scout-17b-vision',
          analysis_confidence: analysis.confidence
        }
      })
      .eq('id', record.id);

    if (updateError) {
      console.error('❌ Failed to update image:', updateError);
      throw updateError;
    }

    console.log(`✅ Image analyzed successfully: ${record.id}`);
    console.log(`   Materials: ${analysis.materials.join(', ')}`);
    console.log(`   Colors: ${analysis.colors.join(', ')}`);
    console.log(`   Confidence: ${analysis.confidence}`);

    return new Response(
      JSON.stringify({
        success: true,
        image_id: record.id,
        analysis: analysis
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in auto-analyze-image:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function analyzeImageWithLlama(imageBase64: string): Promise<ImageAnalysisResult | null> {
  if (!TOGETHER_API_KEY) {
    console.error('❌ TOGETHER_API_KEY not set');
    return null;
  }

  try {
    const prompt = `Analyze this material/product image and extract comprehensive information in JSON format:
{
  "materials": ["<material1>", "<material2>"],
  "colors": ["<color1>", "<color2>"],
  "textures": ["<texture1>", "<texture2>"],
  "patterns": ["<pattern1>", "<pattern2>"],
  "finish": "<matte/glossy/satin/textured/polished/etc>",
  "description": "<detailed description of the image>",
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "properties": {
    "surface_type": "<smooth/rough/embossed/etc>",
    "style": "<modern/classic/industrial/etc>",
    "application": "<flooring/wall/furniture/etc>",
    "composition": "<estimated material composition>"
  },
  "confidence": <0.0-1.0>
}

Extract ALL visible materials, colors, textures, and patterns. Generate searchable tags. Provide a detailed description.
Respond ONLY with valid JSON, no additional text.`;

    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOGETHER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        max_tokens: 1024,
        temperature: 0.1,
        top_p: 0.9,
        stop: ['```']
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Llama API error ${response.status}:`, errorText);
      return null;
    }

    const result = await response.json();
    let content = result.choices[0].message.content;

    // Parse JSON response
    content = content.trim();
    if (content.startsWith('```json')) {
      content = content.substring(7);
    }
    if (content.startsWith('```')) {
      content = content.substring(3);
    }
    if (content.endsWith('```')) {
      content = content.substring(0, content.length - 3);
    }
    content = content.trim();

    const analysis: ImageAnalysisResult = JSON.parse(content);
    return analysis;

  } catch (error) {
    console.error('❌ Llama analysis failed:', error);
    return null;
  }
}

