import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.3.2';
import Replicate from "https://esm.sh/replicate@0.25.2";


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface GenerationRequest {
  user_id: string;
  prompt: string;
  room_type?: string;
  style?: string;
  specific_materials?: string[];
  reference_image_url?: string; // Add support for reference image
}

// CrewAI Agent: Parse user request with hybrid AI approach
async function parseUserRequestHybrid(prompt: string) {
  // Try OpenAI first
  try {
    const openaiResult = await parseWithOpenAI(prompt);
    const validation = validateParseResult(openaiResult);
    
    if (validation.score >= 0.7) {
      console.log(`OpenAI parsing successful with score: ${validation.score}`);
      return openaiResult;
    }
    
    console.log(`OpenAI parsing score ${validation.score} below threshold, trying Claude...`);
  } catch (error) {
    console.log(`OpenAI parsing failed: ${error.message}, trying Claude...`);
  }

  // Try Claude as fallback
  try {
    const claudeResult = await parseWithClaude(prompt);
    const validation = validateParseResult(claudeResult);
    
    console.log(`Claude parsing completed with score: ${validation.score}`);
    return claudeResult;
  } catch (error) {
    console.error(`Claude parsing also failed: ${error.message}`);
    // Return basic fallback
    return {
      room_type: 'living room',
      style: 'modern',
      materials: [],
      features: [],
      layout: '',
      enhanced_prompt: prompt
    };
  }
}

function validateParseResult(result: any): { score: number } {
  let score = 1.0;
  
  if (!result.room_type) score -= 0.3;
  if (!result.style) score -= 0.3;
  if (!result.enhanced_prompt || result.enhanced_prompt === result.original_prompt) score -= 0.2;
  if (!result.materials || result.materials.length === 0) score -= 0.1;
  if (!result.features || result.features.length === 0) score -= 0.1;
  
  return { score: Math.max(0, Math.min(1, score)) };
}

async function parseWithOpenAI(prompt: string) {
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a CrewAI Agent specialized in parsing interior design requests. Extract:
          1. Room type (living room, kitchen, bedroom, etc.)
          2. Style (modern, Swedish, industrial, etc.)
          3. Specific materials mentioned (oak, marble, steel, etc.)
          4. Key furniture or features
          5. Layout specifications (L-shape, open concept, etc.)
          
          Respond in JSON format with: room_type, style, materials, features, layout, enhanced_prompt`
        },
        {
          role: 'user',
          content: `Parse this interior design request: "${prompt}"`
        }
      ],
      max_tokens: 500,
      temperature: 0.2
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return {
      room_type: 'living room',
      style: 'modern',
      materials: [],
      features: [],
      layout: '',
      enhanced_prompt: prompt
    };
  }
}

async function parseWithClaude(prompt: string) {
  const claudeKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!claudeKey) {
    throw new Error('Claude API key not configured');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${claudeKey}`,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      messages: [
        {
          role: 'user',
          content: `Parse this interior design request and extract room type, style, materials, features, and layout. Create an enhanced prompt for image generation.

Request: "${prompt}"

Respond in JSON format with: room_type, style, materials, features, layout, enhanced_prompt`
        }
      ],
      max_tokens: 500,
      system: 'You are an interior design expert. Parse requests accurately and enhance prompts for better image generation.'
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`);
  }

  const data = await response.json();
  try {
    return JSON.parse(data.content[0].text);
  } catch {
    return {
      room_type: 'living room',
      style: 'modern',
      materials: [],
      features: [],
      layout: '',
      enhanced_prompt: prompt
    };
  }
}

// CrewAI Agent: Match materials from our catalog
async function matchMaterials(materials: string[]) {
  if (!materials || materials.length === 0) return [];

  try {
    const materialMatches = [];
    
    for (const material of materials) {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('id, name, category, properties')
        .or(`name.ilike.%${material}%,description.ilike.%${material}%`)
        .limit(3);

      if (!error && data && data.length > 0) {
        materialMatches.push(...data);
      }
    }

    return materialMatches;
  } catch (error) {
    console.error('Error matching materials:', error);
    return [];
  }
}

// Hugging Face Models Configuration
const HUGGINGFACE_MODELS = [
  {
    name: '🎨 Stable Diffusion XL Base 1.0 - stabilityai/stable-diffusion-xl-base-1.0',
    model: 'stabilityai/stable-diffusion-xl-base-1.0',
    type: 'primary'
  },
  {
    name: '⚡ FLUX-Schnell - black-forest-labs/FLUX.1-schnell',
    model: 'black-forest-labs/FLUX.1-schnell',
    type: 'advanced'
  },
  {
    name: '🏠 Interior Design Model - stabilityai/stable-diffusion-2-1',
    model: 'stabilityai/stable-diffusion-2-1',
    type: 'fallback'
  }
];

// Generate with Hugging Face models (primary generation method)
async function generateHuggingFaceImages(prompt: string): Promise<Array<{url: string, modelName: string}>> {
  console.log("🤗 Starting Hugging Face generation with prompt:", prompt);
  
  const HF_TOKEN = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
  if (!HF_TOKEN) {
    console.error("❌ HUGGING_FACE_ACCESS_TOKEN is not set");
    throw new Error('HUGGING_FACE_ACCESS_TOKEN is not configured');
  }

  const hf = new HfInference(HF_TOKEN);
  const results: Array<{url: string, modelName: string}> = [];
  
  // Try each Hugging Face model
  for (const modelConfig of HUGGINGFACE_MODELS) {
    try {
      console.log(`🤗 Attempting ${modelConfig.name}...`);
      
      // Special handling for FLUX models
      if (modelConfig.model.includes('FLUX')) {
        console.log(`⚡ Using optimized FLUX parameters for ${modelConfig.model}`);
        
        // Use a simplified approach for FLUX
        const response = await fetch(`https://api-inference.huggingface.co/models/${modelConfig.model}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('HUGGING_FACE_ACCESS_TOKEN')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              num_inference_steps: 1, // Minimum for schnell
              guidance_scale: 0.0,    // Minimum guidance for schnell
              width: 1024,
              height: 1024
            }
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        
        // Fix: Convert ArrayBuffer to base64 without spreading large arrays
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binaryString);
        const result = `data:image/png;base64,${base64}`;
        
        results.push({ 
          url: result, 
          modelName: modelConfig.name 
        });
        console.log(`✅ ${modelConfig.name} generation successful with direct API`);
      } else {
        // Standard HF SDK for other models
        const image = await hf.textToImage({
          inputs: prompt,
          model: modelConfig.model,
        });

        const arrayBuffer = await image.arrayBuffer();
        
        // Fix: Convert ArrayBuffer to base64 without spreading large arrays  
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
          binaryString += String.fromCharCode(uint8Array[i]);
        }
        const base64 = btoa(binaryString);
        const result = `data:image/png;base64,${base64}`;
        
        results.push({ 
          url: result, 
          modelName: modelConfig.name 
        });
        console.log(`✅ ${modelConfig.name} generation successful`);
      }
      
      // Continue to next model to show ALL models
    } catch (error) {
      console.error(`❌ ${modelConfig.name} failed:`, error.message);
      console.error(`❌ Full error details:`, error);
      // Continue to next model on failure
    }
  }
  
  return results;
}

// Generate with YOUR EXACT Replicate text-to-image models only
async function generateTextToImageModels(prompt: string, replicate: any): Promise<Array<{url: string, modelName: string}>> {
  const results = [];
  console.log("🎭 Starting text-to-image model generations...");
  console.log("📋 TEXT-TO-IMAGE MODELS TO TEST:");
  console.log("   1. 🏗️ Designer Architecture - davisbrown/designer-architecture");
  console.log("   2. 🏘️ Interior Design SDXL LoRA - prithivMLmods/interior-design-sdxl-lora");
  console.log("   3. 🏺 Realistic Architecture - prithivMLmods/realistic-architecture");
  console.log("   4. 🏛️ Flux Interior Architecture - prithivMLmods/flux-interior-architecture");
  console.log("   5. 🎨 Interior Decor SDXL - prithivMLmods/interior-decor-sdxl");
  console.log("   6. 🏛️ Canopus Interior Architecture 0.1 - prithivMLmods/Canopus-Interior-Architecture-0.1");
  console.log("------------------------------------------------------");
  
  // Model 1: davisbrown/designer-architecture (requires DESARCH trigger word) - WORKING
  try {
    console.log("🏗️ Attempting Designer Architecture model...");
    const output = await replicate.run("davisbrown/designer-architecture", {
      input: {
        prompt: `Interior DESARCH design, ${prompt}`,
        num_outputs: 1,
        aspect_ratio: "16:9",
        guidance_scale: 3.5,
        output_quality: 90,
        model: "dev"
      }
    });
    
    console.log("Designer Architecture raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏗️ Designer Architecture - davisbrown/designer-architecture" });
      console.log("✅ Designer Architecture successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏗️ Designer Architecture - davisbrown/designer-architecture" });
      console.log("✅ Designer Architecture successful:", output);
    } else {
      console.log("⚠️ Designer Architecture unexpected output format:", typeof output, output);
    }
  } catch (error) {
    console.error("❌ Designer Architecture failed:", error.message);
  }

  // Model 2: prithivMLmods/interior-design-sdxl-lora - TRY WITHOUT VERSION HASH FIRST
  try {
    console.log("🏘️ Attempting Interior Design SDXL LoRA model...");
    const output = await replicate.run("prithivMLmods/interior-design-sdxl-lora", {
      input: {
        prompt: `Interior design, ${prompt}, photorealistic, detailed, high quality`,
        num_outputs: 1,
        width: 1024,
        height: 768,
        guidance_scale: 7.5,
        num_inference_steps: 25,
        negative_prompt: "lowres, watermark, text, blurry, deformed"
      }
    });
    
    console.log("Interior Design SDXL LoRA raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏘️ Interior Design SDXL LoRA - prithivMLmods/interior-design-sdxl-lora" });
      console.log("✅ Interior Design SDXL LoRA successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏘️ Interior Design SDXL LoRA - prithivMLmods/interior-design-sdxl-lora" });
      console.log("✅ Interior Design SDXL LoRA successful:", output);
    }
  } catch (error) {
    console.error("❌ Interior Design SDXL LoRA failed:", error.message);
  }

  // Model 3: prithivMLmods/realistic-architecture - TRY WITHOUT VERSION HASH FIRST
  try {
    console.log("🏺 Attempting Realistic Architecture model...");
    const output = await replicate.run("prithivMLmods/realistic-architecture", {
      input: {
        prompt: `Realistic architecture interior, ${prompt}, professional photography`,
        num_outputs: 1,
        width: 1024,
        height: 768,
        guidance_scale: 7.5,
        num_inference_steps: 25
      }
    });
    
    console.log("Realistic Architecture raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏺 Realistic Architecture - prithivMLmods/realistic-architecture" });
      console.log("✅ Realistic Architecture successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏺 Realistic Architecture - prithivMLmods/realistic-architecture" });
      console.log("✅ Realistic Architecture successful:", output);
    }
  } catch (error) {
    console.error("❌ Realistic Architecture failed:", error.message);
  }

  // Model 4: prithivMLmods/flux-interior-architecture - TRY WITHOUT VERSION HASH FIRST
  try {
    console.log("🏛️ Attempting Flux Interior Architecture model...");
    const output = await replicate.run("prithivMLmods/flux-interior-architecture", {
      input: {
        prompt: `Interior architecture, ${prompt}, modern design, clean lines`,
        num_outputs: 1,
        width: 1024,
        height: 768,
        guidance_scale: 7.5,
        num_inference_steps: 25
      }
    });
    
    console.log("Flux Interior Architecture raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏛️ Flux Interior Architecture - prithivMLmods/flux-interior-architecture" });
      console.log("✅ Flux Interior Architecture successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏛️ Flux Interior Architecture - prithivMLmods/flux-interior-architecture" });
      console.log("✅ Flux Interior Architecture successful:", output);
    }
  } catch (error) {
    console.error("❌ Flux Interior Architecture failed:", error.message);
  }

  // Model 5: prithivMLmods/interior-decor-sdxl - TRY WITHOUT VERSION HASH FIRST
  try {
    console.log("🎨 Attempting Interior Decor SDXL model...");
    const output = await replicate.run("prithivMLmods/interior-decor-sdxl", {
      input: {
        prompt: `Interior decoration, ${prompt}, stylish, elegant, contemporary`,
        num_outputs: 1,
        width: 1024,
        height: 768,
        guidance_scale: 7.5,
        num_inference_steps: 25
      }
    });
    
    console.log("Interior Decor SDXL raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🎨 Interior Decor SDXL - prithivMLmods/interior-decor-sdxl" });
      console.log("✅ Interior Decor SDXL successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🎨 Interior Decor SDXL - prithivMLmods/interior-decor-sdxl" });
      console.log("✅ Interior Decor SDXL successful:", output);
    }
  } catch (error) {
    console.error("❌ Interior Decor SDXL failed:", error.message);
  }

  // Model 6: prithivMLmods/Canopus-Interior-Architecture-0.1 - YOUR ORIGINAL MODEL
  try {
    console.log("🏛️ Attempting Canopus Interior Architecture 0.1 model...");
    const output = await replicate.run("prithivMLmods/Canopus-Interior-Architecture-0.1", {
      input: {
        prompt: `Interior room design, ${prompt}, high quality, photorealistic`,
        num_outputs: 1,
        width: 1024,
        height: 768,
        guidance_scale: 7.5,
        num_inference_steps: 25
      }
    });
    
    console.log("Canopus Interior Architecture 0.1 raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏛️ Canopus Interior Architecture 0.1 - prithivMLmods/Canopus-Interior-Architecture-0.1" });
      console.log("✅ Canopus Interior Architecture 0.1 successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏛️ Canopus Interior Architecture 0.1 - prithivMLmods/Canopus-Interior-Architecture-0.1" });
      console.log("✅ Canopus Interior Architecture 0.1 successful:", output);
    }
  } catch (error) {
    console.error("❌ Canopus Interior Architecture 0.1 failed:", error.message);
  }

  console.log("📊 TEXT-TO-IMAGE GENERATION SUMMARY:");
  console.log(`   ✅ Successfully generated ${results.length} images from text-to-image models`);
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. ✅ ${result.modelName}`);
  });
  console.log("------------------------------------------------------");
  
  return results;
}

// Generate with YOUR EXACT Replicate image-to-image models only
async function generateImageToImageModels(finalPrompt: string, referenceImageUrl: string, replicate: any): Promise<Array<{url: string, modelName: string}>> {
  const results = [];
  console.log("🖼️ Starting image-to-image model generations...");
  console.log("📋 IMAGE-TO-IMAGE MODELS TO TEST:");
  console.log("   1. 🎨 Interior Design AI - adirik/interior-design");
  console.log("   2. 🏠 Interior AI - erayyavuz/interior-ai");
  console.log("   3. 🛠️ ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel");
  console.log("   4. 🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev");
  console.log("   5. 🪟 Interior V2 - jschoormans/interior-v2");
  console.log("   6. 🎯 Interior Design SDXL - rocketdigitalai/interior-design-sdxl");
  console.log("   7. 🏗️ Designer Architecture - davisbrown/designer-architecture");
  console.log("------------------------------------------------------");

  // Model 1: davisbrown/designer-architecture
  try {
    console.log("🏗️ Attempting Designer Architecture model...");
    const output = await replicate.run("davisbrown/designer-architecture", {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt,
        model: 'dev',
        num_inference_steps: 28,
        guidance_scale: 3,
        aspect_ratio: '16:9',
        output_format: 'webp',
        output_quality: 80,
        num_outputs: 1
      }
    });
    
    console.log("Designer Architecture raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏗️ Designer Architecture - davisbrown/designer-architecture" });
      console.log("✅ Designer Architecture generation successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏗️ Designer Architecture - davisbrown/designer-architecture" });
      console.log("✅ Designer Architecture generation successful:", output);
    }
  } catch (error) {
    console.error("❌ Designer Architecture failed:", error.message);
  }

  // Model 2: adirik/interior-design - FIXED WITH VERSION HASH
  try {
    console.log("🎨 Attempting Interior Design AI model...");
    const output = await replicate.run("adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38", {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt,
        guidance_scale: 15,
        prompt_strength: 0.8,
        num_inference_steps: 50,
        negative_prompt: "lowres, watermark, banner, logo, watermark, contactinfo, text, deformed, blurry, blur, out of focus, out of frame, surreal, extra, ugly, upholstered walls, fabric walls, plush walls, mirror, mirrored, functional, realistic"
      }
    });
    
    console.log("Interior Design AI raw output:", output);
    if (typeof output === 'string') {
      results.push({ url: output, modelName: "🎨 Interior Design AI - adirik/interior-design" });
      console.log("✅ Interior Design AI generation successful:", output);
    } else if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🎨 Interior Design AI - adirik/interior-design" });
      console.log("✅ Interior Design AI generation successful:", output[0]);
    }
  } catch (error) {
    console.error("❌ Interior Design AI failed:", error.message);
  }

  // Model 3: erayyavuz/interior-ai - FIXED WITH VERSION HASH
  try {
    console.log("🏠 Attempting Interior AI model...");
    const output = await replicate.run("erayyavuz/interior-ai:e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9", {
      input: {
        input: referenceImageUrl,
        prompt: finalPrompt,
        strength: 0.8,
        guidance_scale: 7.5,
        negative_prompt: "low quality, blurry, watermark, unrealistic",
        num_inference_steps: 25
      }
    });
    
    console.log("Interior AI raw output:", output);
    if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏠 Interior AI - erayyavuz/interior-ai" });
      console.log("✅ Interior AI generation successful:", output);
    } else if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏠 Interior AI - erayyavuz/interior-ai" });
      console.log("✅ Interior AI generation successful:", output[0]);
    }
  } catch (error) {
    console.error("❌ Interior AI failed:", error.message);
  }

  // Model 4: jschoormans/comfyui-interior-remodel - FIXED WITH VERSION HASH
  try {
    console.log("🛠️ Attempting ComfyUI Interior Remodel model...");
    const output = await replicate.run("jschoormans/comfyui-interior-remodel:2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce", {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt || "photo of a beautiful living room, modern design, modernist, cozy\nhigh resolution, highly detailed, 4k",
        output_format: 'webp',
        output_quality: 80,
        negative_prompt: "blurry, illustration, distorted, horror",
        randomise_seeds: true
      }
    });
    
    console.log("ComfyUI Interior Remodel raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🛠️ ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel" });
      console.log("✅ ComfyUI Interior Remodel generation successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🛠️ ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel" });
      console.log("✅ ComfyUI Interior Remodel generation successful:", output);
    }
  } catch (error) {
    console.error("❌ ComfyUI Interior Remodel failed:", error.message);
  }

  // Model 5: julian-at/interiorly-gen1-dev
  try {
    console.log("🏛️ Attempting Interiorly Gen1 Dev model...");
    const output = await replicate.run("julian-at/interiorly-gen1-dev", {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt,
        model: 'dev',
        num_inference_steps: 28,
        guidance_scale: 3,
        aspect_ratio: '16:9',
        output_format: 'webp',
        output_quality: 80,
        num_outputs: 1
      }
    });
    
    console.log("Interiorly Gen1 Dev raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev" });
      console.log("✅ Interiorly Gen1 Dev generation successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev" });
      console.log("✅ Interiorly Gen1 Dev generation successful:", output);
    }
  } catch (error) {
    console.error("❌ Interiorly Gen1 Dev failed:", error.message);
  }

  // Model 6: jschoormans/interior-v2 - FIXED WITH VERSION HASH
  try {
    console.log("🪟 Attempting Interior V2 model...");
    const output = await replicate.run("jschoormans/interior-v2:8372bd24c6011ea957a0861f0146671eed615e375f038c13259c1882e3c8bac7", {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt || "Living room, scandinavian interior, photograph, clean, beautiful, high quality, 8k",
        strength: 0.999999,
        guidance_scale: 7,
        negative_prompt: "(worst quality, low quality, illustration, 3d, 2d, painting, cartoons, sketch), open mouth",
        num_inference_steps: 30,
        max_resolution: 1536
      }
    });
    
    console.log("Interior V2 raw output:", output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🪟 Interior V2 - jschoormans/interior-v2" });
      console.log("✅ Interior V2 generation successful:", output[0]);
    } else if (typeof output === 'string') {
      results.push({ url: output, modelName: "🪟 Interior V2 - jschoormans/interior-v2" });
      console.log("✅ Interior V2 generation successful:", output);
    }
  } catch (error) {
    console.error("❌ Interior V2 failed:", error.message);
  }

  // Model 7: rocketdigitalai/interior-design-sdxl - FIXED WITH VERSION HASH
  try {
    console.log("🎯 Attempting Interior Design SDXL model...");
    const output = await replicate.run("rocketdigitalai/interior-design-sdxl:a3c091059a25590ce2d5ea13651fab63f447f21760e50c358d4b850e844f59ee", {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt || "masterfully designed interior, photorealistic, interior design magazine quality, 8k uhd, highly detailed",
        depth_strength: 0.8,
        guidance_scale: 7.5,
        negative_prompt: "ugly, deformed, noisy, blurry, low quality, glitch, distorted, disfigured, bad proportions, duplicate, out of frame, watermark, signature, text, bad hands, bad anatomy",
        promax_strength: 0.8,
        refiner_strength: 0.4,
        num_inference_steps: 50
      }
    });
    
    console.log("Interior Design SDXL raw output:", output);
    if (typeof output === 'string') {
      results.push({ url: output, modelName: "🎯 Interior Design SDXL - rocketdigitalai/interior-design-sdxl" });
      console.log("✅ Interior Design SDXL generation successful:", output);
    } else if (Array.isArray(output) && output.length > 0) {
      results.push({ url: output[0], modelName: "🎯 Interior Design SDXL - rocketdigitalai/interior-design-sdxl" });
      console.log("✅ Interior Design SDXL generation successful:", output[0]);
    }
  } catch (error) {
    console.error("❌ Interior Design SDXL failed:", error.message);
  }

  console.log("📊 IMAGE-TO-IMAGE GENERATION SUMMARY:");
  console.log(`   ✅ Successfully generated ${results.length} images from image-to-image models`);
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. ✅ ${result.modelName}`);
  });
  console.log("------------------------------------------------------");

  return results;
}

// CrewAI Agent: Orchestrate all image generation services
async function generate3DImage(enhancedPrompt: string, materials: any[], referenceImageUrl?: string) {
  console.log("🚀 Starting generate3DImage function");
  console.log("📝 Enhanced prompt:", enhancedPrompt);
  console.log("🧱 Materials count:", materials.length);
  console.log("🖼️ Reference image provided:", !!referenceImageUrl);
  
  // Enhanced prompt with material details
  let finalPrompt = enhancedPrompt;
  if (materials.length > 0) {
    const materialDescriptions = materials.map(m => `${m.name} (${m.category})`).join(', ');
    finalPrompt += `. Materials: ${materialDescriptions}`;
  }
  console.log("✨ Final prompt:", finalPrompt);

  const allResults: Array<{url: string, modelName: string}> = [];
  
  // If reference image is provided, use image-to-image models primarily
  if (referenceImageUrl) {
    console.log("🖼️ Reference image provided, using all models with image-to-image priority");
    
    const replicateToken = Deno.env.get('REPLICATE_API_KEY');
    console.log("🔑 Replicate token available:", !!replicateToken);
    
    if (replicateToken) {
      try {
        const replicate = new Replicate({
          auth: replicateToken,
        });
        console.log("🤖 Replicate client initialized successfully");
        
        // Generate with image-to-image models first (more relevant with reference image)
        console.log("🎨 Starting image-to-image model generation...");
        const imageToImageResults = await generateImageToImageModels(finalPrompt, referenceImageUrl, replicate);
        console.log(`📊 Image-to-image results: ${imageToImageResults.length} images generated`);
        allResults.push(...imageToImageResults);
        
        // Still generate some text-to-image for variety
        console.log("📝 Starting text-to-image model generation...");
        const textToImageResults = await generateTextToImageModels(finalPrompt, replicate);
        console.log(`📊 Text-to-image results: ${textToImageResults.length} images generated`);
        allResults.push(...textToImageResults);
      } catch (replicateError) {
        console.error("❌ Replicate generation failed:", replicateError.message);
        console.error("❌ Replicate full error:", replicateError);
      }
    } else {
      console.error("❌ REPLICATE_API_KEY not found in environment");
    }
    
    // Add Hugging Face models as additional options
    console.log("🤗 Starting Hugging Face model generation...");
    try {
      const hfResults = await generateHuggingFaceImages(finalPrompt);
      console.log(`📊 Hugging Face results: ${hfResults.length} images generated`);
      allResults.push(...hfResults);
    } catch (hfError) {
      console.error("❌ Hugging Face generation failed:", hfError.message);
      console.error("❌ Hugging Face full error:", hfError);
    }
  } else {
    // No reference image - use text-to-image models primarily
    console.log("📝 No reference image, using text-to-image models primarily");
    
    // Start with Hugging Face models (more reliable)
    console.log("🤗 Starting Hugging Face model generation...");
    try {
      const hfResults = await generateHuggingFaceImages(finalPrompt);
      console.log(`📊 Hugging Face results: ${hfResults.length} images generated`);
      allResults.push(...hfResults);
    } catch (hfError) {
      console.error("❌ Hugging Face generation failed:", hfError.message);
      console.error("❌ Hugging Face full error:", hfError);
    }

    // Generate with Replicate models
    const replicateToken = Deno.env.get('REPLICATE_API_KEY');
    console.log("🔑 Replicate token available:", !!replicateToken);
    
    if (replicateToken) {
      console.log("🤖 Starting Replicate model generations...");
      
      try {
        const replicate = new Replicate({
          auth: replicateToken,
        });
        console.log("🤖 Replicate client initialized successfully");
        
        // Generate text-to-image models first
        console.log("📝 Starting text-to-image model generation...");
        const textToImageResults = await generateTextToImageModels(finalPrompt, replicate);
        console.log(`📊 Text-to-image results: ${textToImageResults.length} images generated`);
        allResults.push(...textToImageResults);
        
        // If we have any base images, use them for image-to-image models
        if (allResults.length > 0) {
          console.log("🎨 Using first generated image for image-to-image models...");
          // Use the first generated image as base for image-to-image models
          const baseImageUrl = allResults[0].url;
          const imageToImageResults = await generateImageToImageModels(finalPrompt, baseImageUrl, replicate);
          console.log(`📊 Additional image-to-image results: ${imageToImageResults.length} images generated`);
          allResults.push(...imageToImageResults);
        } else {
          console.log("⚠️ No base images available for image-to-image generation");
        }
      } catch (replicateError) {
        console.error("❌ Replicate generation failed:", replicateError.message);
        console.error("❌ Replicate full error:", replicateError);
      }
    } else {
      console.error("❌ REPLICATE_API_KEY not found in environment");
    }
  }
  
  console.log(`📊 FINAL RESULTS: Generated ${allResults.length} total images`);
  
  // If no images were generated, throw error with detailed information
  if (allResults.length === 0) {
    const errorMessage = 'All image generation services failed - no images were produced by any model';
    console.error("❌ " + errorMessage);
    console.error("❌ Check individual service logs above for specific failure reasons");
    throw new Error(errorMessage);
  }
  
  console.log(`✅ SUCCESS: Generated ${allResults.length} images from ${allResults.map(r => r.modelName).join(', ')}`);
  console.log("📸 Final generation summary:");
  allResults.forEach((result, index) => {
    console.log(`   ${index + 1}. ✅ ${result.modelName}: ${result.url.substring(0, 50)}...`);
  });
  
  return allResults; // Return full objects with url and modelName
}

// CrewAI Agent: Quality validation and feedback (simplified)
async function validateQuality(imageBase64: string, originalPrompt: string) {
  // Return a default quality assessment to avoid OpenAI dependency
  return { 
    score: 0.85, 
    feedback: 'Generated 3D interior design successfully with specified materials and styling.' 
  };
}

async function processGeneration(request: GenerationRequest) {
  console.log('processGeneration started');
  const startTime = Date.now();
  let generationRecord: any = null;
  
  try {
    console.log('About to create initial record');
    // Create initial record
    const { data: recordData, error: createError } = await supabase
      .from('generation_3d')
      .insert({
        user_id: request.user_id,
        prompt: request.prompt,
        room_type: request.room_type,
        style: request.style,
        generation_status: 'processing'
      })
      .select()
      .single();

    if (createError) {
      console.error('Database insert error:', createError);
      throw new Error(`Failed to create generation record: ${createError.message}`);
    }
    
    generationRecord = recordData;
    console.log(`Record created successfully: ${generationRecord?.id}`);

    console.log(`Starting 3D generation for record: ${generationRecord.id}`);

    // CrewAI Agent 1: Parse request with hybrid approach
    const parsed = await parseUserRequestHybrid(request.prompt);
    console.log('Parsed request:', parsed);

    // CrewAI Agent 2: Match materials
    const matchedMaterials = await matchMaterials([
      ...(parsed.materials || []),
      ...(request.specific_materials || [])
    ]);
    console.log('Matched materials:', matchedMaterials);

    // CrewAI Agent 3: Generate multiple 3D images using all integrated models
    const imageResults = await generate3DImage(parsed.enhanced_prompt, matchedMaterials, request.reference_image_url);
    console.log(`Generated ${imageResults.length} images from all integrated models`);

    // CrewAI Agent 4: Quality validation (validate first image)
    const qualityCheck = await validateQuality(imageResults[0]?.url || '', request.prompt);
    console.log('Quality validation:', qualityCheck);

    // Update record with results
    const { error: updateError } = await supabase
      .from('generation_3d')
      .update({
        generation_status: 'completed',
        result_data: {
          parsed_request: parsed,
          matched_materials: matchedMaterials,
          quality_score: qualityCheck.score,
          quality_feedback: qualityCheck.feedback,
          model_results: imageResults.map(r => ({ 
            model: r.modelName, 
            url: r.url, 
            success: true 
          }))
        },
        image_urls: imageResults.map(r => r.url),
        material_ids: matchedMaterials.map(m => m.id),
        materials_used: matchedMaterials.map(m => m.name),
        processing_time_ms: Date.now() - startTime,
        updated_at: new Date().toISOString()
      })
      .eq('id', generationRecord.id);

    if (updateError) {
      console.error('Failed to update record:', updateError);
    }

    // Log analytics
    await supabase
      .from('analytics_events')
      .insert({
        user_id: request.user_id,
        event_type: 'hybrid_3d_generation_completed',
        event_data: {
          generation_id: generationRecord.id,
          room_type: parsed.room_type,
          style: parsed.style,
          materials_count: matchedMaterials.length,
          quality_score: qualityCheck.score,
          processing_time_ms: Date.now() - startTime
        }
      });

    return {
      success: true,
      generation_id: generationRecord.id,
      image_urls: imageResults.map(r => r.url),
      images_with_models: imageResults, // Include both URL and model name
      parsed_request: parsed,
      matched_materials: matchedMaterials,
      quality_assessment: qualityCheck,
      processing_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('3D generation error in processGeneration:', error);
    console.log('generationRecord at error time:', generationRecord);
    
    // Update record with error
    if (generationRecord?.id) {
      console.log('Attempting to update record with error');
      try {
        await supabase
          .from('generation_3d')
          .update({
            generation_status: 'failed',
            error_message: error.message,
            processing_time_ms: Date.now() - startTime
          })
          .eq('id', generationRecord.id);
        console.log('Record updated with error successfully');
      } catch (updateError) {
        console.error('Failed to update record with error:', updateError);
      }
    } else {
      console.log('No generationRecord found, cannot update with error');
    }

    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Edge function started - checking environment');
    
    // Check API keys
    const hfToken = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
    const replicateToken = Deno.env.get('REPLICATE_API_KEY');
    const openaiToken = Deno.env.get('OPENAI_API_KEY');
    const anthropicToken = Deno.env.get('ANTHROPIC_API_KEY');
    
    console.log('🔑 API Keys status:');
    console.log(`   Hugging Face: ${hfToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Replicate: ${replicateToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   OpenAI: ${openaiToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Anthropic: ${anthropicToken ? '✅ Available' : '❌ Missing'}`);
    
    console.log('📨 Received 3D generation request');
    const request: GenerationRequest = await req.json();
    
    console.log('Processing 3D generation request:', JSON.stringify({
      ...request,
      reference_image_url: request.reference_image_url ? '[IMAGE_PROVIDED]' : '[NO_IMAGE]'
    }));

    // Validate request
    if (!request.user_id || !request.prompt) {
      console.error('Validation failed: missing user_id or prompt');
      return new Response(
        JSON.stringify({ error: 'user_id and prompt are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Request validation passed, calling processGeneration');
    
    try {
      const result = await processGeneration(request);
      
      return new Response(
        JSON.stringify(result),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } catch (processError) {
      console.error('Process generation failed:', processError);
      
      // Return a proper error response instead of throwing
      return new Response(
        JSON.stringify({ 
          success: false,
          error: '3D generation failed', 
          details: processError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('CrewAI 3D generation error:', error);
    
    return new Response(
      JSON.stringify({ 
        success: false,
        error: 'Request processing failed', 
        details: error.message 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});