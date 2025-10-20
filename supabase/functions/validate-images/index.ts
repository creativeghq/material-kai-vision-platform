import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import {
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/**
 * Image Validation Edge Function
 * Validates extracted images and ensures quality standards
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { image_ids, workspace_id, validation_rules } = await req.json();

    if (!image_ids || !Array.isArray(image_ids) || image_ids.length === 0) {
      return createErrorResponse('image_ids must be a non-empty array', 400);
    }

    if (!workspace_id) {
      return createErrorResponse('workspace_id is required', 400);
    }

    // Default validation rules
    const defaultRules = {
      min_width: 100,
      max_width: 4000,
      min_height: 100,
      max_height: 4000,
      min_quality_score: 0.6,
      allowed_formats: ['image/png', 'image/jpeg', 'image/webp'],
      max_file_size: 10 * 1024 * 1024, // 10MB
      min_ocr_confidence: 0.5,
    };

    const rules = { ...defaultRules, ...validation_rules };

    // Fetch images from database
    const { data: images, error: imagesError } = await supabase
      .from('document_images')
      .select('*')
      .in('id', image_ids);

    if (imagesError) {
      return createErrorResponse(`Failed to fetch images: ${imagesError.message}`, 500);
    }

    if (!images || images.length === 0) {
      return createErrorResponse('No images found', 404);
    }

    // Validate each image
    const validations = [];
    for (const image of images) {
      const validation = validateImage(image, rules);
      validations.push(validation);
    }

    // Insert validations into database
    const { data: insertedValidations, error: insertError } = await supabase
      .from('image_validations')
      .insert(validations)
      .select();

    if (insertError) {
      return createErrorResponse(`Failed to insert validations: ${insertError.message}`, 500);
    }

    // Calculate statistics
    const stats = {
      total: validations.length,
      valid: validations.filter(v => v.validation_status === 'valid').length,
      invalid: validations.filter(v => v.validation_status === 'invalid').length,
      needs_review: validations.filter(v => v.validation_status === 'needs_review').length,
    };

    return createSuccessResponse({
      validations: insertedValidations,
      stats,
    });
  } catch (error) {
    console.error('Error in validate-images function:', error);
    return createErrorResponse(
      `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500
    );
  }
});

/**
 * Validate a single image
 */
function validateImage(image: any, rules: any) {
  const issues = [];
  const recommendations = [];
  let qualityScore = 1.0;

  // Check dimensions
  const width = image.width || 0;
  const height = image.height || 0;

  if (width < rules.min_width || width > rules.max_width) {
    issues.push({
      type: 'invalid_width',
      severity: 'high',
      description: `Image width ${width}px is outside allowed range`,
    });
    qualityScore -= 0.3;
  }

  if (height < rules.min_height || height > rules.max_height) {
    issues.push({
      type: 'invalid_height',
      severity: 'high',
      description: `Image height ${height}px is outside allowed range`,
    });
    qualityScore -= 0.3;
  }

  // Check format
  const format = image.mime_type || '';
  if (!rules.allowed_formats.includes(format)) {
    issues.push({
      type: 'invalid_format',
      severity: 'high',
      description: `Image format ${format} is not allowed`,
    });
    qualityScore -= 0.3;
  }

  // Check file size
  const fileSize = image.file_size || 0;
  if (fileSize > rules.max_file_size) {
    issues.push({
      type: 'file_too_large',
      severity: 'medium',
      description: `File size exceeds maximum`,
    });
    qualityScore -= 0.15;
  }

  // Determine validation status
  const criticalIssues = issues.filter(i => i.severity === 'high');
  let validationStatus = 'valid';

  if (criticalIssues.length > 0) {
    validationStatus = 'invalid';
  } else if (qualityScore < rules.min_quality_score) {
    validationStatus = 'needs_review';
  }

  // Generate recommendations
  if (issues.some(i => i.type === 'invalid_width' || i.type === 'invalid_height')) {
    recommendations.push({
      type: 'resize_image',
      description: 'Resize image to meet dimension requirements',
      priority: 'high',
    });
  }

  if (issues.some(i => i.type === 'invalid_format')) {
    recommendations.push({
      type: 'convert_format',
      description: 'Convert image to supported format',
      priority: 'high',
    });
  }

  if (issues.some(i => i.type === 'file_too_large')) {
    recommendations.push({
      type: 'compress_image',
      description: 'Compress image to reduce file size',
      priority: 'medium',
    });
  }

  return {
    image_id: image.id,
    workspace_id: image.workspace_id,
    validation_status: validationStatus,
    quality_score: Math.max(0, Math.min(1, qualityScore)),
    dimensions_valid: width >= rules.min_width && width <= rules.max_width && height >= rules.min_height && height <= rules.max_height,
    format_valid: rules.allowed_formats.includes(format),
    file_size_valid: fileSize <= rules.max_file_size,
    issues: issues.length > 0 ? issues : null,
    recommendations: recommendations.length > 0 ? recommendations : null,
    validated_at: new Date().toISOString(),
  };
}

