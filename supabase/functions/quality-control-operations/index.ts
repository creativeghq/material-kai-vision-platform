/**
 * Quality Control Operations Edge Function
 *
 * Handles quality control operations including:
 * - Automated quality assessment
 * - Human review task management
 * - Batch quality processing
 * - Quality metrics tracking
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QualityControlRequest {
  action: 'assess_quality' | 'batch_assess' | 'get_review_tasks' | 'complete_review' | 'get_stats';
  entityId?: string;
  entityType?: 'product' | 'chunk' | 'image';
  entityIds?: string[];
  taskId?: string;
  reviewDecision?: 'approve' | 'reject' | 'needs_improvement' | 'escalate';
  reviewNotes?: string;
  reviewerId?: string;
  config?: any;
  filters?: any;
}

interface QualityThresholds {
  minProductQualityScore: number;
  minProductConfidenceScore: number;
  minProductCompletenessScore: number;
  minChunkCoherenceScore: number;
  minChunkBoundaryQuality: number;
  minChunkSemanticCompleteness: number;
  minImageQualityScore: number;
  minImageRelevanceScore: number;
  minImageOcrConfidence: number;
  minEmbeddingCoverage: number;
  minEmbeddingConfidence: number;
}

const defaultThresholds: QualityThresholds = {
  minProductQualityScore: 0.7,
  minProductConfidenceScore: 0.6,
  minProductCompletenessScore: 0.8,
  minChunkCoherenceScore: 0.65,
  minChunkBoundaryQuality: 0.6,
  minChunkSemanticCompleteness: 0.7,
  minImageQualityScore: 0.6,
  minImageRelevanceScore: 0.5,
  minImageOcrConfidence: 0.5,
  minEmbeddingCoverage: 0.8,
  minEmbeddingConfidence: 0.7,
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request
    const requestData: QualityControlRequest = await req.json();
    const { action } = requestData;

    console.log(`🔍 Quality Control Operation: ${action}`);

    let result;

    switch (action) {
      case 'assess_quality':
        result = await assessEntityQuality(supabase, requestData);
        break;

      case 'batch_assess':
        result = await batchAssessQuality(supabase, requestData);
        break;

      case 'get_review_tasks':
        result = await getReviewTasks(supabase, requestData);
        break;

      case 'complete_review':
        result = await completeReviewTask(supabase, requestData);
        break;

      case 'get_stats':
        result = await getQualityStats(supabase, requestData);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('❌ Quality Control Operation failed:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

/**
 * Assess quality of a single entity
 */
async function assessEntityQuality(supabase: any, request: QualityControlRequest) {
  const { entityId, entityType, config = {} } = request;

  if (!entityId || !entityType) {
    throw new Error('entityId and entityType are required');
  }

  const thresholds = { ...defaultThresholds, ...config.thresholds };

  let assessment;
  switch (entityType) {
    case 'product':
      assessment = await assessProductQuality(supabase, entityId, thresholds);
      break;
    case 'chunk':
      assessment = await assessChunkQuality(supabase, entityId, thresholds);
      break;
    case 'image':
      assessment = await assessImageQuality(supabase, entityId, thresholds);
      break;
    default:
      throw new Error(`Unknown entity type: ${entityType}`);
  }

  // Store assessment
  await storeQualityAssessment(supabase, assessment);

  // Create human review task if needed
  if (assessment.needsHumanReview && config.humanReviewEnabled !== false) {
    await createHumanReviewTask(supabase, assessment);
  }

  return assessment;
}

/**
 * Assess product quality
 */
async function assessProductQuality(supabase: any, productId: string, thresholds: QualityThresholds) {
  // Get product data
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      id, name, description, long_description, specifications, metadata,
      quality_score, confidence_score, completeness_score, quality_metrics,
      text_embedding_1536, visual_clip_embedding_512, multimodal_fusion_embedding_2048,
      color_embedding_256, texture_embedding_256, application_embedding_512,
      embedding_metadata
    `)
    .eq('id', productId)
    .single();

  if (error || !product) {
    throw new Error(`Failed to fetch product: ${error?.message}`);
  }

  // Calculate quality metrics
  const qualityMetrics = {
    quality_score: product.quality_score || 0,
    confidence_score: product.confidence_score || 0,
    completeness_score: product.completeness_score || 0,
    embedding_coverage: calculateEmbeddingCoverage(product),
    embedding_confidence: calculateEmbeddingConfidence(product.embedding_metadata),
  };

  // Calculate overall score
  const overallScore = (
    qualityMetrics.quality_score * 0.3 +
    qualityMetrics.confidence_score * 0.2 +
    qualityMetrics.completeness_score * 0.25 +
    qualityMetrics.embedding_coverage * 0.15 +
    qualityMetrics.embedding_confidence * 0.1
  );

  // Identify issues
  const issues = identifyProductQualityIssues(qualityMetrics, thresholds);
  const passesThresholds = issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical').length === 0;
  const needsHumanReview = !passesThresholds || overallScore < 0.7;

  // Generate recommendations
  const recommendations = generateProductRecommendations(issues, qualityMetrics);

  return {
    entityId: productId,
    entityType: 'product',
    overallScore: Math.round(overallScore * 100) / 100,
    qualityMetrics,
    passesThresholds,
    needsHumanReview,
    issues,
    recommendations,
    assessmentTimestamp: new Date().toISOString(),
  };
}

/**
 * Assess chunk quality
 */
async function assessChunkQuality(supabase: any, chunkId: string, thresholds: QualityThresholds) {
  // Get chunk data
  const { data: chunk, error } = await supabase
    .from('document_vectors')
    .select(`
      chunk_id, content, metadata, page_number,
      coherence_score, quality_score, boundary_quality, semantic_completeness,
      text_embedding_1536, embedding_metadata
    `)
    .eq('chunk_id', chunkId)
    .single();

  if (error || !chunk) {
    throw new Error(`Failed to fetch chunk: ${error?.message}`);
  }

  // Calculate quality metrics
  const qualityMetrics = {
    coherence_score: chunk.coherence_score || 0,
    quality_score: chunk.quality_score || 0,
    boundary_quality: chunk.boundary_quality || 0,
    semantic_completeness: chunk.semantic_completeness || 0,
    embedding_coverage: chunk.text_embedding_1536 ? 1 : 0,
  };

  // Calculate overall score
  const overallScore = (
    qualityMetrics.coherence_score * 0.3 +
    qualityMetrics.quality_score * 0.25 +
    qualityMetrics.boundary_quality * 0.25 +
    qualityMetrics.semantic_completeness * 0.2
  );

  // Identify issues
  const issues = identifyChunkQualityIssues(qualityMetrics, thresholds);
  const passesThresholds = issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical').length === 0;
  const needsHumanReview = !passesThresholds || overallScore < thresholds.minChunkCoherenceScore;

  // Generate recommendations
  const recommendations = generateChunkRecommendations(issues);

  return {
    entityId: chunkId,
    entityType: 'chunk',
    overallScore: Math.round(overallScore * 100) / 100,
    qualityMetrics,
    passesThresholds,
    needsHumanReview,
    issues,
    recommendations,
    assessmentTimestamp: new Date().toISOString(),
  };
}

/**
 * Assess image quality
 */
async function assessImageQuality(supabase: any, imageId: string, thresholds: QualityThresholds) {
  // Get image data
  const { data: image, error: imageError } = await supabase
    .from('document_images')
    .select(`
      id, filename, file_size, dimensions, metadata,
      visual_clip_embedding_512, color_embedding_256, texture_embedding_256,
      embedding_metadata
    `)
    .eq('id', imageId)
    .single();

  if (imageError || !image) {
    throw new Error(`Failed to fetch image: ${imageError?.message}`);
  }

  // Get validation results
  const { data: validation } = await supabase
    .from('image_validations')
    .select('*')
    .eq('image_id', imageId)
    .single();

  // Calculate quality metrics
  const qualityMetrics = {
    quality_score: validation?.quality_score || 0,
    relevance_score: validation?.relevance_score || 0,
    ocr_confidence: validation?.ocr_confidence || 0,
    embedding_coverage: calculateImageEmbeddingCoverage(image),
    format_valid: validation?.format_valid ? 1 : 0,
    dimensions_valid: validation?.dimensions_valid ? 1 : 0,
  };

  // Calculate overall score
  const overallScore = (
    qualityMetrics.quality_score * 0.3 +
    qualityMetrics.relevance_score * 0.25 +
    qualityMetrics.ocr_confidence * 0.2 +
    qualityMetrics.embedding_coverage * 0.15 +
    qualityMetrics.format_valid * 0.05 +
    qualityMetrics.dimensions_valid * 0.05
  );

  // Identify issues
  const issues = identifyImageQualityIssues(qualityMetrics, thresholds);
  const passesThresholds = issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical').length === 0;
  const needsHumanReview = !passesThresholds || overallScore < thresholds.minImageQualityScore;

  // Generate recommendations
  const recommendations = generateImageRecommendations(issues);

  return {
    entityId: imageId,
    entityType: 'image',
    overallScore: Math.round(overallScore * 100) / 100,
    qualityMetrics,
    passesThresholds,
    needsHumanReview,
    issues,
    recommendations,
    assessmentTimestamp: new Date().toISOString(),
  };
}

/**
 * Batch assess quality for multiple entities
 */
async function batchAssessQuality(supabase: any, request: QualityControlRequest) {
  const { entityIds = [], config = {} } = request;

  if (entityIds.length === 0) {
    throw new Error('entityIds array is required');
  }

  const results = [];
  let passed = 0;
  let needsReview = 0;
  let failed = 0;

  // Process in batches of 10
  const batchSize = 10;
  for (let i = 0; i < entityIds.length; i += batchSize) {
    const batch = entityIds.slice(i, i + batchSize);

    const batchPromises = batch.map(async (entityId) => {
      try {
        // Determine entity type (simplified - could be enhanced)
        const entityType = request.entityType || 'product';

        const assessment = await assessEntityQuality(supabase, {
          action: 'assess_quality',
          entityId,
          entityType,
          config,
        });

        if (assessment.passesThresholds) {
          passed++;
        } else if (assessment.needsHumanReview) {
          needsReview++;
        } else {
          failed++;
        }

        return assessment;
      } catch (error) {
        console.error(`Failed to assess ${entityId}:`, error);
        failed++;
        return null;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(Boolean));

    // Add delay between batches
    if (i + batchSize < entityIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return {
    assessments: results,
    summary: {
      total: entityIds.length,
      passed,
      needsReview,
      failed,
    },
  };
}

/**
 * Get review tasks
 */
async function getReviewTasks(supabase: any, request: QualityControlRequest) {
  const { filters = {} } = request;

  let query = supabase
    .from('human_review_tasks')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true });

  if (filters.entityType) {
    query = query.eq('entity_type', filters.entityType);
  }
  if (filters.priority) {
    query = query.eq('priority', filters.priority);
  }
  if (filters.reviewType) {
    query = query.eq('review_type', filters.reviewType);
  }
  if (filters.assignedTo) {
    query = query.eq('assigned_to', filters.assignedTo);
  }
  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch review tasks: ${error.message}`);
  }

  return data || [];
}

/**
 * Complete a review task
 */
async function completeReviewTask(supabase: any, request: QualityControlRequest) {
  const { taskId, reviewDecision, reviewNotes, reviewerId } = request;

  if (!taskId || !reviewDecision || !reviewerId) {
    throw new Error('taskId, reviewDecision, and reviewerId are required');
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from('human_review_tasks')
    .update({
      status: reviewDecision === 'escalate' ? 'escalated' : 'completed',
      review_decision: reviewDecision,
      review_notes: reviewNotes,
      assigned_to: reviewerId,
      completed_at: now,
      updated_at: now,
    })
    .eq('id', taskId);

  if (error) {
    throw new Error(`Failed to complete review task: ${error.message}`);
  }

  return { success: true, taskId, decision: reviewDecision };
}

/**
 * Get quality control statistics
 */
async function getQualityStats(supabase: any, request: QualityControlRequest) {
  const timeRange = request.filters?.timeRange || '7d';
  const timeFilter = getTimeFilter(timeRange);

  // Get assessment statistics
  const { data: assessments } = await supabase
    .from('quality_assessments')
    .select('overall_score, passes_thresholds, needs_human_review, issues')
    .gte('assessment_timestamp', timeFilter);

  // Get review task statistics
  const { data: reviewTasks } = await supabase
    .from('human_review_tasks')
    .select('status, created_at, completed_at')
    .gte('created_at', timeFilter);

  // Calculate statistics
  const assessmentStats = {
    total: assessments?.length || 0,
    passed: assessments?.filter(a => a.passes_thresholds).length || 0,
    needsReview: assessments?.filter(a => a.needs_human_review).length || 0,
    failed: assessments?.filter(a => !a.passes_thresholds && !a.needs_human_review).length || 0,
  };

  const reviewTaskStats = {
    pending: reviewTasks?.filter(t => t.status === 'pending').length || 0,
    completed: reviewTasks?.filter(t => t.status === 'completed').length || 0,
    escalated: reviewTasks?.filter(t => t.status === 'escalated').length || 0,
    avgCompletionTime: calculateAvgCompletionTime(reviewTasks || []),
  };

  const qualityTrends = {
    avgQualityScore: calculateAvgQualityScore(assessments || []),
    improvementRate: calculateImprovementRate(assessments || []),
    issueTypes: aggregateIssueTypes(assessments || []),
  };

  return {
    assessments: assessmentStats,
    reviewTasks: reviewTaskStats,
    qualityTrends,
  };
}

// ===== HELPER FUNCTIONS =====

/**
 * Calculate embedding coverage for a product
 */
function calculateEmbeddingCoverage(product: any): number {
  const embeddingTypes = [
    'text_embedding_1536',
    'visual_clip_embedding_512',
    'multimodal_fusion_embedding_2048',
    'color_embedding_256',
    'texture_embedding_256',
    'application_embedding_512',
  ];

  const presentEmbeddings = embeddingTypes.filter(type =>
    product[type] && Array.isArray(product[type]) && product[type].length > 0,
  );

  return presentEmbeddings.length / embeddingTypes.length;
}

/**
 * Calculate embedding confidence from metadata
 */
function calculateEmbeddingConfidence(embeddingMetadata: any): number {
  if (!embeddingMetadata || !embeddingMetadata.confidence_scores) {
    return 0;
  }

  const confidenceScores = Object.values(embeddingMetadata.confidence_scores) as number[];
  if (confidenceScores.length === 0) {
    return 0;
  }

  return confidenceScores.reduce((sum, score) => sum + score, 0) / confidenceScores.length;
}

/**
 * Calculate embedding coverage for an image
 */
function calculateImageEmbeddingCoverage(image: any): number {
  const embeddingTypes = [
    'visual_clip_embedding_512',
    'color_embedding_256',
    'texture_embedding_256',
  ];

  const presentEmbeddings = embeddingTypes.filter(type =>
    image[type] && Array.isArray(image[type]) && image[type].length > 0,
  );

  return presentEmbeddings.length / embeddingTypes.length;
}

/**
 * Identify quality issues for products
 */
function identifyProductQualityIssues(qualityMetrics: any, thresholds: QualityThresholds): any[] {
  const issues = [];

  if (qualityMetrics.quality_score < thresholds.minProductQualityScore) {
    issues.push({
      type: 'quality',
      severity: qualityMetrics.quality_score < 0.5 ? 'critical' : 'high',
      description: 'Product quality score is below threshold',
      metric: 'quality_score',
      currentValue: qualityMetrics.quality_score,
      expectedValue: thresholds.minProductQualityScore,
      autoFixable: false,
    });
  }

  if (qualityMetrics.confidence_score < thresholds.minProductConfidenceScore) {
    issues.push({
      type: 'confidence',
      severity: qualityMetrics.confidence_score < 0.4 ? 'high' : 'medium',
      description: 'Product confidence score is below threshold',
      metric: 'confidence_score',
      currentValue: qualityMetrics.confidence_score,
      expectedValue: thresholds.minProductConfidenceScore,
      autoFixable: false,
    });
  }

  if (qualityMetrics.completeness_score < thresholds.minProductCompletenessScore) {
    issues.push({
      type: 'completeness',
      severity: qualityMetrics.completeness_score < 0.6 ? 'high' : 'medium',
      description: 'Product completeness score is below threshold',
      metric: 'completeness_score',
      currentValue: qualityMetrics.completeness_score,
      expectedValue: thresholds.minProductCompletenessScore,
      autoFixable: true,
    });
  }

  if (qualityMetrics.embedding_coverage < thresholds.minEmbeddingCoverage) {
    issues.push({
      type: 'embedding',
      severity: qualityMetrics.embedding_coverage < 0.5 ? 'high' : 'medium',
      description: 'Embedding coverage is below threshold',
      metric: 'embedding_coverage',
      currentValue: qualityMetrics.embedding_coverage,
      expectedValue: thresholds.minEmbeddingCoverage,
      autoFixable: true,
    });
  }

  return issues;
}

/**
 * Identify quality issues for chunks
 */
function identifyChunkQualityIssues(qualityMetrics: any, thresholds: QualityThresholds): any[] {
  const issues = [];

  if (qualityMetrics.coherence_score < thresholds.minChunkCoherenceScore) {
    issues.push({
      type: 'quality',
      severity: qualityMetrics.coherence_score < 0.4 ? 'critical' : 'high',
      description: 'Chunk coherence score is below threshold',
      metric: 'coherence_score',
      currentValue: qualityMetrics.coherence_score,
      expectedValue: thresholds.minChunkCoherenceScore,
      autoFixable: false,
    });
  }

  if (qualityMetrics.boundary_quality < thresholds.minChunkBoundaryQuality) {
    issues.push({
      type: 'quality',
      severity: qualityMetrics.boundary_quality < 0.4 ? 'high' : 'medium',
      description: 'Chunk boundary quality is below threshold',
      metric: 'boundary_quality',
      currentValue: qualityMetrics.boundary_quality,
      expectedValue: thresholds.minChunkBoundaryQuality,
      autoFixable: true,
    });
  }

  return issues;
}

/**
 * Identify quality issues for images
 */
function identifyImageQualityIssues(qualityMetrics: any, thresholds: QualityThresholds): any[] {
  const issues = [];

  if (qualityMetrics.quality_score < thresholds.minImageQualityScore) {
    issues.push({
      type: 'quality',
      severity: qualityMetrics.quality_score < 0.4 ? 'critical' : 'high',
      description: 'Image quality score is below threshold',
      metric: 'quality_score',
      currentValue: qualityMetrics.quality_score,
      expectedValue: thresholds.minImageQualityScore,
      autoFixable: false,
    });
  }

  if (qualityMetrics.relevance_score < thresholds.minImageRelevanceScore) {
    issues.push({
      type: 'validation',
      severity: qualityMetrics.relevance_score < 0.3 ? 'high' : 'medium',
      description: 'Image relevance score is below threshold',
      metric: 'relevance_score',
      currentValue: qualityMetrics.relevance_score,
      expectedValue: thresholds.minImageRelevanceScore,
      autoFixable: false,
    });
  }

  return issues;
}

/**
 * Generate recommendations for products
 */
function generateProductRecommendations(issues: any[], qualityMetrics: any): string[] {
  const recommendations = [];

  const qualityIssues = issues.filter(issue => issue.type === 'quality');
  if (qualityIssues.length > 0) {
    recommendations.push('Review and improve product name and description quality');
    recommendations.push('Ensure product specifications are complete and accurate');
  }

  const completenessIssues = issues.filter(issue => issue.type === 'completeness');
  if (completenessIssues.length > 0) {
    recommendations.push('Add missing product information (description, specifications, metadata)');
    recommendations.push('Verify all required fields are populated');
  }

  const embeddingIssues = issues.filter(issue => issue.type === 'embedding');
  if (embeddingIssues.length > 0) {
    recommendations.push('Generate missing embedding types for better search capabilities');
    recommendations.push('Re-process embeddings with higher quality settings');
  }

  if (qualityMetrics.quality_score && qualityMetrics.quality_score < 0.6) {
    recommendations.push('Consider re-processing this item with updated AI models');
  }

  return recommendations;
}

/**
 * Generate recommendations for chunks
 */
function generateChunkRecommendations(issues: any[]): string[] {
  const recommendations = [];

  if (issues.some(issue => issue.metric === 'coherence_score')) {
    recommendations.push('Review chunk boundaries for better semantic coherence');
    recommendations.push('Consider re-chunking with different parameters');
  }

  if (issues.some(issue => issue.metric === 'boundary_quality')) {
    recommendations.push('Adjust chunking strategy to improve boundary detection');
    recommendations.push('Use layout-aware chunking for better boundaries');
  }

  return recommendations;
}

/**
 * Generate recommendations for images
 */
function generateImageRecommendations(issues: any[]): string[] {
  const recommendations = [];

  if (issues.some(issue => issue.metric === 'quality_score')) {
    recommendations.push('Consider using higher resolution images');
    recommendations.push('Improve image clarity and contrast');
  }

  if (issues.some(issue => issue.metric === 'relevance_score')) {
    recommendations.push('Verify image relevance to associated content');
    recommendations.push('Consider replacing with more relevant images');
  }

  return recommendations;
}

/**
 * Store quality assessment in database
 */
async function storeQualityAssessment(supabase: any, assessment: any): Promise<void> {
  try {
    const { error } = await supabase
      .from('quality_assessments')
      .insert([{
        entity_id: assessment.entityId,
        entity_type: assessment.entityType,
        overall_score: assessment.overallScore,
        quality_metrics: assessment.qualityMetrics,
        passes_thresholds: assessment.passesThresholds,
        needs_human_review: assessment.needsHumanReview,
        issues: assessment.issues,
        recommendations: assessment.recommendations,
        assessment_timestamp: assessment.assessmentTimestamp,
      }]);

    if (error) {
      console.error('Failed to store quality assessment:', error);
    }
  } catch (error) {
    console.error('Failed to store quality assessment:', error);
  }
}

/**
 * Create human review task
 */
async function createHumanReviewTask(supabase: any, assessment: any): Promise<void> {
  try {
    // Determine priority based on issues severity
    const criticalIssues = assessment.issues.filter((issue: any) => issue.severity === 'critical').length;
    const highIssues = assessment.issues.filter((issue: any) => issue.severity === 'high').length;

    let priority: string;
    if (criticalIssues > 0) {
      priority = 'urgent';
    } else if (highIssues > 2) {
      priority = 'high';
    } else if (highIssues > 0) {
      priority = 'medium';
    } else {
      priority = 'low';
    }

    // Determine review type based on issues
    let reviewType: string;
    if (assessment.issues.some((issue: any) => issue.type === 'embedding')) {
      reviewType = 'embedding_validation';
    } else if (assessment.issues.some((issue: any) => issue.type === 'completeness')) {
      reviewType = 'completeness_check';
    } else if (assessment.issues.some((issue: any) => issue.type === 'validation')) {
      reviewType = 'content_verification';
    } else {
      reviewType = 'quality_validation';
    }

    const { error } = await supabase
      .from('human_review_tasks')
      .insert([{
        entity_id: assessment.entityId,
        entity_type: assessment.entityType,
        review_type: reviewType,
        priority: priority,
        status: 'pending',
        quality_assessment: assessment,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);

    if (error) {
      console.error('Failed to create human review task:', error);
    }
  } catch (error) {
    console.error('Failed to create human review task:', error);
  }
}

/**
 * Get time filter for statistics
 */
function getTimeFilter(timeRange: string): string {
  const now = new Date();
  let hoursBack = 24; // Default to 24 hours

  switch (timeRange) {
    case '24h':
      hoursBack = 24;
      break;
    case '7d':
      hoursBack = 24 * 7;
      break;
    case '30d':
      hoursBack = 24 * 30;
      break;
  }

  const timeFilter = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  return timeFilter.toISOString();
}

/**
 * Calculate average completion time
 */
function calculateAvgCompletionTime(reviewTasks: any[]): number {
  const completedTasks = reviewTasks.filter(task =>
    task.status === 'completed' && task.created_at && task.completed_at,
  );

  if (completedTasks.length === 0) {
    return 0;
  }

  const totalTime = completedTasks.reduce((sum, task) => {
    const created = new Date(task.created_at).getTime();
    const completed = new Date(task.completed_at).getTime();
    return sum + (completed - created);
  }, 0);

  // Return average time in minutes
  return Math.round(totalTime / completedTasks.length / (1000 * 60));
}

/**
 * Calculate average quality score
 */
function calculateAvgQualityScore(assessments: any[]): number {
  if (assessments.length === 0) {
    return 0;
  }

  const totalScore = assessments.reduce((sum, assessment) => sum + assessment.overall_score, 0);
  return Math.round((totalScore / assessments.length) * 100) / 100;
}

/**
 * Calculate improvement rate
 */
function calculateImprovementRate(assessments: any[]): number {
  if (assessments.length < 2) return 0;

  const firstScore = assessments[0]?.overall_score || 0;
  const lastScore = assessments[assessments.length - 1]?.overall_score || 0;

  if (firstScore === 0) return 0;

  return Math.round(((lastScore - firstScore) / firstScore) * 100) / 100;
}

/**
 * Aggregate issue types
 */
function aggregateIssueTypes(assessments: any[]): Record<string, number> {
  const issueTypes: Record<string, number> = {};

  assessments.forEach(assessment => {
    if (assessment.issues && Array.isArray(assessment.issues)) {
      assessment.issues.forEach((issue: any) => {
        issueTypes[issue.type] = (issueTypes[issue.type] || 0) + 1;
      });
    }
  });

  return issueTypes;
}
