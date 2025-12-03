-- Phase 4: Image Analysis Prompts Migration
-- Insert default prompts for image analysis using Llama Vision and Claude Vision

-- 1. Llama Vision Image Analysis Prompt
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'image_analysis',
  'products',
  'Analyze this material/product image and provide detailed analysis in JSON format:
{
  "description": "<detailed description of what you see>",
  "objects_detected": ["<object1>", "<object2>"],
  "materials_identified": ["<material1>", "<material2>"],
  "colors": ["<color1>", "<color2>"],
  "textures": ["<texture1>", "<texture2>"],
  "confidence": <0.0-1.0>,
  "properties": {
    "finish": "<matte/glossy/satin/etc>",
    "pattern": "<solid/striped/geometric/etc>",
    "composition": "<estimated composition>"
  }
}

Respond ONLY with valid JSON, no additional text.',
  'You are an expert at analyzing material and product images using computer vision.',
  false, 3, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO UPDATE SET
  prompt_template = EXCLUDED.prompt_template,
  system_prompt = EXCLUDED.system_prompt,
  updated_at = NOW();

-- 2. Claude Vision Validation Prompt
INSERT INTO extraction_prompts (
  workspace_id, stage, category, prompt_template, system_prompt, is_custom, version, created_at, updated_at
) VALUES (
  'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  'image_analysis',
  'products',
  'Validate and analyze this material/product image. Provide response in JSON format:
{
  "quality_assessment": {
    "clarity": <0.0-1.0>,
    "lighting": <0.0-1.0>,
    "composition": <0.0-1.0>,
    "overall_quality": <0.0-1.0>
  },
  "material_classification": {
    "primary_material": "<material>",
    "secondary_materials": ["<material1>", "<material2>"],
    "confidence": <0.0-1.0>
  },
  "visual_properties": {
    "surface_finish": "<finish type>",
    "color_palette": ["<color1>", "<color2>"],
    "pattern_type": "<pattern>"
  },
  "recommendations": ["<recommendation1>", "<recommendation2>"],
  "confidence": <0.0-1.0>
}',
  'You are an expert at validating and analyzing material and product images for quality and classification.',
  false, 4, NOW(), NOW()
) ON CONFLICT (workspace_id, stage, category, version) DO UPDATE SET
  prompt_template = EXCLUDED.prompt_template,
  system_prompt = EXCLUDED.system_prompt,
  updated_at = NOW();

-- Log migration
DO $$
BEGIN
  RAISE NOTICE 'Phase 4 Migration Complete: Inserted 2 image analysis prompts (Llama Vision v3, Claude Vision v4)';
END $$;

