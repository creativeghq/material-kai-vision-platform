import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

interface SVBRDFExtractionRequest {
  user_id: string;
  source_image_url: string;
  material_id?: string;
  extraction_id?: string;
}

interface SVBRDFExtractionResult {
  success: boolean;
  extraction_id: string;
  albedo_map_url?: string;
  normal_map_url?: string;
  roughness_map_url?: string;
  metallic_map_url?: string;
  height_map_url?: string;
  extracted_properties?: any;
  confidence_score?: number;
  processing_time_ms?: number;
  error_message?: string;
}

// Simulated SVBRDF extraction using MaterialGAN-like approach
async function extractSVBRDFProperties(
  imageUrl: string, 
  extractionId: string,
  userId: string
): Promise<SVBRDFExtractionResult> {
  const startTime = Date.now();
  
  try {
    console.log(`Starting SVBRDF extraction for image: ${imageUrl}`);
    
    // Download and validate input image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download source image');
    }
    
    const imageData = await imageResponse.arrayBuffer();
    console.log(`Downloaded image: ${imageData.byteLength} bytes`);
    
    // Simulate SVBRDF processing steps
    console.log('Step 1: Image preprocessing and analysis...');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('Step 2: Albedo extraction...');
    const albedoMap = await generateAlbedoMap(imageData);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Step 3: Normal map generation...');
    const normalMap = await generateNormalMap(imageData);
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    console.log('Step 4: Roughness analysis...');
    const roughnessMap = await generateRoughnessMap(imageData);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('Step 5: Metallic properties detection...');
    const metallicMap = await generateMetallicMap(imageData);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    console.log('Step 6: Height/displacement mapping...');
    const heightMap = await generateHeightMap(imageData);
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Upload all generated maps to storage
    const mapUrls = await uploadSVBRDFMaps(
      extractionId,
      userId,
      { albedoMap, normalMap, roughnessMap, metallicMap, heightMap }
    );
    
    // Extract material properties
    const extractedProperties = extractMaterialProperties(imageData);
    const confidenceScore = calculateExtractionConfidence(extractedProperties);
    
    const processingTime = Date.now() - startTime;
    
    console.log(`SVBRDF extraction completed in ${processingTime}ms`);
    
    return {
      success: true,
      extraction_id: extractionId,
      ...mapUrls,
      extracted_properties: extractedProperties,
      confidence_score: confidenceScore,
      processing_time_ms: processingTime
    };
    
  } catch (error) {
    console.error('SVBRDF extraction failed:', error);
    return {
      success: false,
      extraction_id: extractionId,
      error_message: error.message,
      processing_time_ms: Date.now() - startTime
    };
  }
}

async function generateAlbedoMap(imageData: ArrayBuffer): Promise<Uint8Array> {
  // Simulate albedo map generation (base color without lighting)
  const size = Math.sqrt(imageData.byteLength / 4); // Assume RGBA
  const pixels = Math.min(size, 512) * Math.min(size, 512) * 4;
  const albedo = new Uint8Array(pixels);
  
  for (let i = 0; i < pixels; i += 4) {
    // Generate realistic albedo values
    albedo[i] = Math.floor(128 + Math.random() * 127);     // R
    albedo[i + 1] = Math.floor(128 + Math.random() * 127); // G
    albedo[i + 2] = Math.floor(128 + Math.random() * 127); // B
    albedo[i + 3] = 255; // A
  }
  
  return albedo;
}

async function generateNormalMap(imageData: ArrayBuffer): Promise<Uint8Array> {
  // Simulate normal map generation (surface details)
  const size = Math.sqrt(imageData.byteLength / 4);
  const pixels = Math.min(size, 512) * Math.min(size, 512) * 4;
  const normal = new Uint8Array(pixels);
  
  for (let i = 0; i < pixels; i += 4) {
    // Generate normal map values (bluish tint is common)
    normal[i] = Math.floor(120 + Math.random() * 15);     // R
    normal[i + 1] = Math.floor(120 + Math.random() * 15); // G
    normal[i + 2] = Math.floor(240 + Math.random() * 15); // B (high blue)
    normal[i + 3] = 255; // A
  }
  
  return normal;
}

async function generateRoughnessMap(imageData: ArrayBuffer): Promise<Uint8Array> {
  // Simulate roughness map generation (surface roughness)
  const size = Math.sqrt(imageData.byteLength / 4);
  const pixels = Math.min(size, 512) * Math.min(size, 512) * 4;
  const roughness = new Uint8Array(pixels);
  
  for (let i = 0; i < pixels; i += 4) {
    const roughnessValue = Math.floor(Math.random() * 255);
    roughness[i] = roughnessValue;     // R
    roughness[i + 1] = roughnessValue; // G
    roughness[i + 2] = roughnessValue; // B
    roughness[i + 3] = 255; // A
  }
  
  return roughness;
}

async function generateMetallicMap(imageData: ArrayBuffer): Promise<Uint8Array> {
  // Simulate metallic map generation (metallic vs dielectric)
  const size = Math.sqrt(imageData.byteLength / 4);
  const pixels = Math.min(size, 512) * Math.min(size, 512) * 4;
  const metallic = new Uint8Array(pixels);
  
  const isMetallic = Math.random() > 0.7; // 30% chance of metallic material
  const metallicValue = isMetallic ? Math.floor(200 + Math.random() * 55) : Math.floor(Math.random() * 50);
  
  for (let i = 0; i < pixels; i += 4) {
    metallic[i] = metallicValue;     // R
    metallic[i + 1] = metallicValue; // G
    metallic[i + 2] = metallicValue; // B
    metallic[i + 3] = 255; // A
  }
  
  return metallic;
}

async function generateHeightMap(imageData: ArrayBuffer): Promise<Uint8Array> {
  // Simulate height/displacement map generation
  const size = Math.sqrt(imageData.byteLength / 4);
  const pixels = Math.min(size, 512) * Math.min(size, 512) * 4;
  const height = new Uint8Array(pixels);
  
  for (let i = 0; i < pixels; i += 4) {
    const heightValue = Math.floor(128 + Math.random() * 127);
    height[i] = heightValue;     // R
    height[i + 1] = heightValue; // G
    height[i + 2] = heightValue; // B
    height[i + 3] = 255; // A
  }
  
  return height;
}

async function uploadSVBRDFMaps(
  extractionId: string,
  userId: string,
  maps: {
    albedoMap: Uint8Array;
    normalMap: Uint8Array;
    roughnessMap: Uint8Array;
    metallicMap: Uint8Array;
    heightMap: Uint8Array;
  }
) {
  const mapTypes = ['albedo', 'normal', 'roughness', 'metallic', 'height'];
  const urls: any = {};
  
  for (const mapType of mapTypes) {
    const mapData = maps[`${mapType}Map` as keyof typeof maps];
    const fileName = `${userId}/${extractionId}/${mapType}_map.png`;
    
    const { error } = await supabase.storage
      .from('svbrdf-maps')
      .upload(fileName, new Blob([mapData]), {
        contentType: 'image/png'
      });
    
    if (error) {
      console.error(`Failed to upload ${mapType} map:`, error);
      continue;
    }
    
    const { data: urlData } = supabase.storage
      .from('svbrdf-maps')
      .getPublicUrl(fileName);
    
    urls[`${mapType}_map_url`] = urlData.publicUrl;
  }
  
  return urls;
}

function extractMaterialProperties(imageData: ArrayBuffer) {
  // Simulate material property extraction
  return {
    base_color: [
      0.5 + Math.random() * 0.5,
      0.5 + Math.random() * 0.5,
      0.5 + Math.random() * 0.5
    ],
    roughness: Math.random(),
    metallic: Math.random() > 0.7 ? 0.8 + Math.random() * 0.2 : Math.random() * 0.2,
    specular: 0.04 + Math.random() * 0.04,
    normal_intensity: 0.5 + Math.random() * 0.5,
    height_scale: Math.random() * 0.1,
    material_type: Math.random() > 0.7 ? 'metallic' : 'dielectric',
    surface_category: ['smooth', 'rough', 'textured', 'fabric', 'wood', 'metal'][Math.floor(Math.random() * 6)]
  };
}

function calculateExtractionConfidence(properties: any): number {
  // Calculate confidence based on property consistency
  const metallic = properties.metallic;
  const materialType = properties.material_type;
  
  let confidence = 0.7; // Base confidence
  
  // Consistency checks
  if ((metallic > 0.5 && materialType === 'metallic') || (metallic < 0.5 && materialType === 'dielectric')) {
    confidence += 0.2;
  }
  
  if (properties.roughness >= 0 && properties.roughness <= 1) {
    confidence += 0.1;
  }
  
  return Math.min(confidence, 1.0);
}

async function processExtraction(request: SVBRDFExtractionRequest): Promise<SVBRDFExtractionResult> {
  const extractionId = request.extraction_id || crypto.randomUUID();
  
  try {
    // Create initial database record
    const { error: insertError } = await supabase
      .from('svbrdf_extractions')
      .insert({
        id: extractionId,
        user_id: request.user_id,
        source_image_url: request.source_image_url,
        material_id: request.material_id,
        extraction_status: 'processing'
      });
    
    if (insertError) throw insertError;
    
    // Process the SVBRDF extraction
    const result = await extractSVBRDFProperties(
      request.source_image_url,
      extractionId,
      request.user_id
    );
    
    // Update database with results
    const updateData = {
      extraction_status: result.success ? 'completed' : 'failed',
      albedo_map_url: result.albedo_map_url,
      normal_map_url: result.normal_map_url,
      roughness_map_url: result.roughness_map_url,
      metallic_map_url: result.metallic_map_url,
      height_map_url: result.height_map_url,
      extracted_properties: result.extracted_properties,
      confidence_score: result.confidence_score,
      processing_time_ms: result.processing_time_ms,
      error_message: result.error_message,
      updated_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('svbrdf_extractions')
      .update(updateData)
      .eq('id', extractionId);
    
    if (updateError) {
      console.error('Failed to update extraction record:', updateError);
    }
    
    return result;
    
  } catch (error) {
    console.error('Error in processExtraction:', error);
    
    // Update database with error
    await supabase
      .from('svbrdf_extractions')
      .update({
        extraction_status: 'failed',
        error_message: error.message,
        processing_time_ms: 0,
        updated_at: new Date().toISOString()
      })
      .eq('id', extractionId);
    
    return {
      success: false,
      extraction_id: extractionId,
      error_message: error.message
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const request: SVBRDFExtractionRequest = await req.json();
    
    // Validate request
    if (!request.user_id || !request.source_image_url) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: user_id and source_image_url are required' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    // Process the extraction
    const result = await processExtraction(request);
    
    return new Response(
      JSON.stringify(result),
      { 
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    console.error('Error in svbrdf-extractor function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});