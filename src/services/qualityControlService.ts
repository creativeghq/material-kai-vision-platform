/**
 * Quality Control Service with Human-in-the-Loop
 * 
 * Comprehensive quality validation system with automated scoring, AI confidence assessment,
 * completeness checks, and human review triggers for products below quality thresholds.
 * 
 * Features:
 * - Automated quality assessment using existing scoring systems
 * - Human review triggers based on configurable thresholds
 * - Workflow management for review processes
 * - Quality improvement recommendations
 * - Integration with existing admin panels
 */

import { supabase } from '@/integrations/supabase/client';

export interface QualityThresholds {
  // Product quality thresholds
  minProductQualityScore: number;
  minProductConfidenceScore: number;
  minProductCompletenessScore: number;
  
  // Chunk quality thresholds
  minChunkCoherenceScore: number;
  minChunkBoundaryQuality: number;
  minChunkSemanticCompleteness: number;
  
  // Image quality thresholds
  minImageQualityScore: number;
  minImageRelevanceScore: number;
  minImageOcrConfidence: number;
  
  // Multi-vector embedding thresholds
  minEmbeddingCoverage: number;
  minEmbeddingConfidence: number;
}

export interface QualityAssessment {
  entityId: string;
  entityType: 'product' | 'chunk' | 'image';
  overallScore: number;
  qualityMetrics: Record<string, number>;
  passesThresholds: boolean;
  needsHumanReview: boolean;
  issues: QualityIssue[];
  recommendations: string[];
  assessmentTimestamp: string;
}

export interface QualityIssue {
  type: 'quality' | 'completeness' | 'confidence' | 'embedding' | 'validation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metric: string;
  currentValue: number;
  expectedValue: number;
  autoFixable: boolean;
}

export interface HumanReviewTask {
  id: string;
  entityId: string;
  entityType: 'product' | 'chunk' | 'image';
  reviewType: 'quality_validation' | 'completeness_check' | 'content_verification' | 'embedding_validation';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'rejected' | 'escalated';
  assignedTo?: string;
  qualityAssessment: QualityAssessment;
  reviewNotes?: string;
  reviewDecision?: 'approve' | 'reject' | 'needs_improvement' | 'escalate';
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface QualityControlConfig {
  thresholds: QualityThresholds;
  autoReviewEnabled: boolean;
  humanReviewEnabled: boolean;
  escalationEnabled: boolean;
  notificationsEnabled: boolean;
  batchProcessingEnabled: boolean;
}

export class QualityControlService {
  private static defaultThresholds: QualityThresholds = {
    // Product quality thresholds (based on existing scoring)
    minProductQualityScore: 0.7,
    minProductConfidenceScore: 0.6,
    minProductCompletenessScore: 0.8,
    
    // Chunk quality thresholds (based on existing scoring)
    minChunkCoherenceScore: 0.65,
    minChunkBoundaryQuality: 0.6,
    minChunkSemanticCompleteness: 0.7,
    
    // Image quality thresholds (based on existing validation)
    minImageQualityScore: 0.6,
    minImageRelevanceScore: 0.5,
    minImageOcrConfidence: 0.5,
    
    // Multi-vector embedding thresholds
    minEmbeddingCoverage: 0.8, // 80% of embedding types should be present
    minEmbeddingConfidence: 0.7,
  };

  private static defaultConfig: QualityControlConfig = {
    thresholds: this.defaultThresholds,
    autoReviewEnabled: true,
    humanReviewEnabled: true,
    escalationEnabled: true,
    notificationsEnabled: true,
    batchProcessingEnabled: true,
  };

  /**
   * Assess quality of a product and determine if human review is needed
   */
  static async assessProductQuality(
    productId: string,
    config: Partial<QualityControlConfig> = {}
  ): Promise<QualityAssessment> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    try {
      console.log(`🔍 Assessing product quality for ${productId}...`);

      // Get product data with quality scores
      const { data: product, error: productError } = await supabase
        .from('products')
        .select(`
          id, name, description, long_description, specifications, metadata,
          quality_score, confidence_score, completeness_score, quality_metrics,
          quality_assessment,
          text_embedding_1536, visual_clip_embedding_512, multimodal_fusion_embedding_2048,
          color_embedding_256, texture_embedding_256, application_embedding_512,
          embedding_metadata
        `)
        .eq('id', productId)
        .single();

      if (productError || !product) {
        throw new Error(`Failed to fetch product: ${productError?.message}`);
      }

      // Calculate overall quality metrics
      const qualityMetrics = {
        quality_score: product.quality_score || 0,
        confidence_score: product.confidence_score || 0,
        completeness_score: product.completeness_score || 0,
        embedding_coverage: this.calculateEmbeddingCoverage(product),
        embedding_confidence: this.calculateEmbeddingConfidence(product.embedding_metadata),
      };

      // Calculate overall score (weighted average)
      const overallScore = (
        qualityMetrics.quality_score * 0.3 +
        qualityMetrics.confidence_score * 0.2 +
        qualityMetrics.completeness_score * 0.25 +
        qualityMetrics.embedding_coverage * 0.15 +
        qualityMetrics.embedding_confidence * 0.1
      );

      // Check against thresholds
      const issues = this.identifyQualityIssues(qualityMetrics, finalConfig.thresholds);
      const passesThresholds = issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical').length === 0;
      const needsHumanReview = !passesThresholds || overallScore < 0.7;

      // Generate recommendations
      const recommendations = this.generateRecommendations(issues, qualityMetrics);

      const assessment: QualityAssessment = {
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

      // Store assessment in database
      await this.storeQualityAssessment(assessment);

      // Create human review task if needed
      if (needsHumanReview && finalConfig.humanReviewEnabled) {
        await this.createHumanReviewTask(assessment, finalConfig);
      }

      console.log(`✅ Product quality assessment complete: ${overallScore.toFixed(2)} (${needsHumanReview ? 'needs review' : 'passed'})`);
      return assessment;

    } catch (error) {
      console.error(`❌ Product quality assessment failed:`, error);
      throw error;
    }
  }

  /**
   * Assess quality of a chunk and determine if human review is needed
   */
  static async assessChunkQuality(
    chunkId: string,
    config: Partial<QualityControlConfig> = {}
  ): Promise<QualityAssessment> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    try {
      console.log(`🔍 Assessing chunk quality for ${chunkId}...`);

      // Get chunk data with quality scores
      const { data: chunk, error: chunkError } = await supabase
        .from('document_vectors')
        .select(`
          chunk_id, content, metadata, page_number,
          coherence_score, quality_score, boundary_quality, semantic_completeness,
          text_embedding_1536, visual_clip_embedding_512, embedding_metadata
        `)
        .eq('chunk_id', chunkId)
        .single();

      if (chunkError || !chunk) {
        throw new Error(`Failed to fetch chunk: ${chunkError?.message}`);
      }

      // Calculate quality metrics
      const qualityMetrics = {
        coherence_score: chunk.coherence_score || 0,
        quality_score: chunk.quality_score || 0,
        boundary_quality: chunk.boundary_quality || 0,
        semantic_completeness: chunk.semantic_completeness || 0,
        embedding_coverage: chunk.text_embedding_1536 ? 1 : 0, // Basic coverage for chunks
      };

      // Calculate overall score
      const overallScore = (
        qualityMetrics.coherence_score * 0.3 +
        qualityMetrics.quality_score * 0.25 +
        qualityMetrics.boundary_quality * 0.25 +
        qualityMetrics.semantic_completeness * 0.2
      );

      // Check against thresholds
      const issues = this.identifyChunkQualityIssues(qualityMetrics, finalConfig.thresholds);
      const passesThresholds = issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical').length === 0;
      const needsHumanReview = !passesThresholds || overallScore < finalConfig.thresholds.minChunkCoherenceScore;

      // Generate recommendations
      const recommendations = this.generateChunkRecommendations(issues, qualityMetrics);

      const assessment: QualityAssessment = {
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

      // Store assessment
      await this.storeQualityAssessment(assessment);

      // Create human review task if needed
      if (needsHumanReview && finalConfig.humanReviewEnabled) {
        await this.createHumanReviewTask(assessment, finalConfig);
      }

      console.log(`✅ Chunk quality assessment complete: ${overallScore.toFixed(2)} (${needsHumanReview ? 'needs review' : 'passed'})`);
      return assessment;

    } catch (error) {
      console.error(`❌ Chunk quality assessment failed:`, error);
      throw error;
    }
  }

  /**
   * Assess quality of an image and determine if human review is needed
   */
  static async assessImageQuality(
    imageId: string,
    config: Partial<QualityControlConfig> = {}
  ): Promise<QualityAssessment> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    try {
      console.log(`🔍 Assessing image quality for ${imageId}...`);

      // Get image data with validation results
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
        embedding_coverage: this.calculateImageEmbeddingCoverage(image),
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

      // Check against thresholds
      const issues = this.identifyImageQualityIssues(qualityMetrics, finalConfig.thresholds);
      const passesThresholds = issues.filter(issue => issue.severity === 'high' || issue.severity === 'critical').length === 0;
      const needsHumanReview = !passesThresholds || overallScore < finalConfig.thresholds.minImageQualityScore;

      // Generate recommendations
      const recommendations = this.generateImageRecommendations(issues, qualityMetrics);

      const assessment: QualityAssessment = {
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

      // Store assessment
      await this.storeQualityAssessment(assessment);

      // Create human review task if needed
      if (needsHumanReview && finalConfig.humanReviewEnabled) {
        await this.createHumanReviewTask(assessment, finalConfig);
      }

      console.log(`✅ Image quality assessment complete: ${overallScore.toFixed(2)} (${needsHumanReview ? 'needs review' : 'passed'})`);
      return assessment;

    } catch (error) {
      console.error(`❌ Image quality assessment failed:`, error);
      throw error;
    }
  }

  /**
   * Batch assess quality for multiple entities
   */
  static async batchAssessQuality(
    entities: Array<{ id: string; type: 'product' | 'chunk' | 'image' }>,
    config: Partial<QualityControlConfig> = {}
  ): Promise<{
    assessments: QualityAssessment[];
    summary: {
      total: number;
      passed: number;
      needsReview: number;
      failed: number;
    };
  }> {
    const finalConfig = { ...this.defaultConfig, ...config };
    
    if (!finalConfig.batchProcessingEnabled) {
      throw new Error('Batch processing is disabled');
    }

    console.log(`🔍 Starting batch quality assessment for ${entities.length} entities...`);

    const assessments: QualityAssessment[] = [];
    let passed = 0;
    let needsReview = 0;
    let failed = 0;

    // Process in batches of 10 to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < entities.length; i += batchSize) {
      const batch = entities.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (entity) => {
        try {
          let assessment: QualityAssessment;
          
          switch (entity.type) {
            case 'product':
              assessment = await this.assessProductQuality(entity.id, config);
              break;
            case 'chunk':
              assessment = await this.assessChunkQuality(entity.id, config);
              break;
            case 'image':
              assessment = await this.assessImageQuality(entity.id, config);
              break;
            default:
              throw new Error(`Unknown entity type: ${entity.type}`);
          }

          if (assessment.passesThresholds) {
            passed++;
          } else if (assessment.needsHumanReview) {
            needsReview++;
          } else {
            failed++;
          }

          return assessment;
        } catch (error) {
          console.error(`❌ Failed to assess ${entity.type} ${entity.id}:`, error);
          failed++;
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      assessments.push(...batchResults.filter(Boolean) as QualityAssessment[]);

      // Add delay between batches to prevent rate limiting
      if (i + batchSize < entities.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    const summary = {
      total: entities.length,
      passed,
      needsReview,
      failed,
    };

    console.log(`✅ Batch quality assessment complete: ${passed} passed, ${needsReview} need review, ${failed} failed`);
    return { assessments, summary };
  }

  // ===== HELPER METHODS =====

  /**
   * Calculate embedding coverage for a product
   */
  private static calculateEmbeddingCoverage(product: any): number {
    const embeddingTypes = [
      'text_embedding_1536',
      'visual_clip_embedding_512',
      'multimodal_fusion_embedding_2048',
      'color_embedding_256',
      'texture_embedding_256',
      'application_embedding_512',
    ];

    const presentEmbeddings = embeddingTypes.filter(type => product[type] && product[type].length > 0);
    return presentEmbeddings.length / embeddingTypes.length;
  }

  /**
   * Calculate embedding confidence from metadata
   */
  private static calculateEmbeddingConfidence(embeddingMetadata: any): number {
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
  private static calculateImageEmbeddingCoverage(image: any): number {
    const embeddingTypes = [
      'visual_clip_embedding_512',
      'color_embedding_256',
      'texture_embedding_256',
    ];

    const presentEmbeddings = embeddingTypes.filter(type => image[type] && image[type].length > 0);
    return presentEmbeddings.length / embeddingTypes.length;
  }

  /**
   * Identify quality issues for products
   */
  private static identifyQualityIssues(
    qualityMetrics: Record<string, number>,
    thresholds: QualityThresholds
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Check quality score
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

    // Check confidence score
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

    // Check completeness score
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

    // Check embedding coverage
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

    // Check embedding confidence
    if (qualityMetrics.embedding_confidence < thresholds.minEmbeddingConfidence) {
      issues.push({
        type: 'embedding',
        severity: qualityMetrics.embedding_confidence < 0.5 ? 'high' : 'medium',
        description: 'Embedding confidence is below threshold',
        metric: 'embedding_confidence',
        currentValue: qualityMetrics.embedding_confidence,
        expectedValue: thresholds.minEmbeddingConfidence,
        autoFixable: true,
      });
    }

    return issues;
  }

  /**
   * Identify quality issues for chunks
   */
  private static identifyChunkQualityIssues(
    qualityMetrics: Record<string, number>,
    thresholds: QualityThresholds
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Check coherence score
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

    // Check boundary quality
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

    // Check semantic completeness
    if (qualityMetrics.semantic_completeness < thresholds.minChunkSemanticCompleteness) {
      issues.push({
        type: 'completeness',
        severity: qualityMetrics.semantic_completeness < 0.5 ? 'high' : 'medium',
        description: 'Chunk semantic completeness is below threshold',
        metric: 'semantic_completeness',
        currentValue: qualityMetrics.semantic_completeness,
        expectedValue: thresholds.minChunkSemanticCompleteness,
        autoFixable: false,
      });
    }

    return issues;
  }

  /**
   * Identify quality issues for images
   */
  private static identifyImageQualityIssues(
    qualityMetrics: Record<string, number>,
    thresholds: QualityThresholds
  ): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Check image quality score
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

    // Check relevance score
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

    // Check OCR confidence
    if (qualityMetrics.ocr_confidence < thresholds.minImageOcrConfidence) {
      issues.push({
        type: 'validation',
        severity: 'medium',
        description: 'Image OCR confidence is below threshold',
        metric: 'ocr_confidence',
        currentValue: qualityMetrics.ocr_confidence,
        expectedValue: thresholds.minImageOcrConfidence,
        autoFixable: false,
      });
    }

    return issues;
  }

  /**
   * Generate recommendations for quality improvement
   */
  private static generateRecommendations(
    issues: QualityIssue[],
    qualityMetrics: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    // Quality-specific recommendations
    const qualityIssues = issues.filter(issue => issue.type === 'quality');
    if (qualityIssues.length > 0) {
      recommendations.push('Review and improve product name and description quality');
      recommendations.push('Ensure product specifications are complete and accurate');
    }

    // Completeness recommendations
    const completenessIssues = issues.filter(issue => issue.type === 'completeness');
    if (completenessIssues.length > 0) {
      recommendations.push('Add missing product information (description, specifications, metadata)');
      recommendations.push('Verify all required fields are populated');
    }

    // Embedding recommendations
    const embeddingIssues = issues.filter(issue => issue.type === 'embedding');
    if (embeddingIssues.length > 0) {
      recommendations.push('Generate missing embedding types for better search capabilities');
      recommendations.push('Re-process embeddings with higher quality settings');
    }

    // Confidence recommendations
    const confidenceIssues = issues.filter(issue => issue.type === 'confidence');
    if (confidenceIssues.length > 0) {
      recommendations.push('Review AI-generated content for accuracy');
      recommendations.push('Consider manual verification of low-confidence items');
    }

    // General recommendations based on overall score
    if (qualityMetrics.quality_score && qualityMetrics.quality_score < 0.6) {
      recommendations.push('Consider re-processing this item with updated AI models');
    }

    return recommendations;
  }

  /**
   * Generate recommendations for chunk quality improvement
   */
  private static generateChunkRecommendations(
    issues: QualityIssue[],
    qualityMetrics: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    // Coherence recommendations
    if (issues.some(issue => issue.metric === 'coherence_score')) {
      recommendations.push('Review chunk boundaries for better semantic coherence');
      recommendations.push('Consider re-chunking with different parameters');
    }

    // Boundary quality recommendations
    if (issues.some(issue => issue.metric === 'boundary_quality')) {
      recommendations.push('Adjust chunking strategy to improve boundary detection');
      recommendations.push('Use layout-aware chunking for better boundaries');
    }

    // Semantic completeness recommendations
    if (issues.some(issue => issue.metric === 'semantic_completeness')) {
      recommendations.push('Ensure chunks contain complete semantic units');
      recommendations.push('Review chunk size and overlap parameters');
    }

    return recommendations;
  }

  /**
   * Generate recommendations for image quality improvement
   */
  private static generateImageRecommendations(
    issues: QualityIssue[],
    qualityMetrics: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];

    // Quality recommendations
    if (issues.some(issue => issue.metric === 'quality_score')) {
      recommendations.push('Consider using higher resolution images');
      recommendations.push('Improve image clarity and contrast');
    }

    // Relevance recommendations
    if (issues.some(issue => issue.metric === 'relevance_score')) {
      recommendations.push('Verify image relevance to associated content');
      recommendations.push('Consider replacing with more relevant images');
    }

    // OCR recommendations
    if (issues.some(issue => issue.metric === 'ocr_confidence')) {
      recommendations.push('Improve image text clarity for better OCR results');
      recommendations.push('Consider manual text extraction for critical content');
    }

    return recommendations;
  }

  /**
   * Store quality assessment in database
   */
  private static async storeQualityAssessment(assessment: QualityAssessment): Promise<void> {
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
        console.error(`❌ Failed to store quality assessment:`, error);
        // Don't throw error - assessment can continue without storage
      }
    } catch (error) {
      console.error(`❌ Failed to store quality assessment:`, error);
    }
  }

  /**
   * Create a human review task for quality assessment
   */
  static async createHumanReviewTask(
    assessment: QualityAssessment,
    config: QualityControlConfig
  ): Promise<HumanReviewTask> {
    try {
      // Determine priority based on issues severity
      const criticalIssues = assessment.issues.filter(issue => issue.severity === 'critical').length;
      const highIssues = assessment.issues.filter(issue => issue.severity === 'high').length;

      let priority: 'low' | 'medium' | 'high' | 'urgent';
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
      let reviewType: 'quality_validation' | 'completeness_check' | 'content_verification' | 'embedding_validation';
      if (assessment.issues.some(issue => issue.type === 'embedding')) {
        reviewType = 'embedding_validation';
      } else if (assessment.issues.some(issue => issue.type === 'completeness')) {
        reviewType = 'completeness_check';
      } else if (assessment.issues.some(issue => issue.type === 'validation')) {
        reviewType = 'content_verification';
      } else {
        reviewType = 'quality_validation';
      }

      const reviewTask: HumanReviewTask = {
        id: crypto.randomUUID(),
        entityId: assessment.entityId,
        entityType: assessment.entityType,
        reviewType,
        priority,
        status: 'pending',
        qualityAssessment: assessment,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Store in database
      const { error } = await supabase
        .from('human_review_tasks')
        .insert([{
          id: reviewTask.id,
          entity_id: reviewTask.entityId,
          entity_type: reviewTask.entityType,
          review_type: reviewTask.reviewType,
          priority: reviewTask.priority,
          status: reviewTask.status,
          quality_assessment: reviewTask.qualityAssessment,
          created_at: reviewTask.createdAt,
          updated_at: reviewTask.updatedAt,
        }]);

      if (error) {
        throw new Error(`Failed to create human review task: ${error.message}`);
      }

      console.log(`📋 Created human review task ${reviewTask.id} for ${assessment.entityType} ${assessment.entityId} (priority: ${priority})`);
      return reviewTask;

    } catch (error) {
      console.error(`❌ Failed to create human review task:`, error);
      throw error;
    }
  }

  /**
   * Get pending human review tasks
   */
  static async getPendingReviewTasks(
    filters: {
      entityType?: 'product' | 'chunk' | 'image';
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      reviewType?: string;
      assignedTo?: string;
      limit?: number;
    } = {}
  ): Promise<HumanReviewTask[]> {
    try {
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

      return (data || []).map(task => ({
        id: task.id,
        entityId: task.entity_id,
        entityType: task.entity_type,
        reviewType: task.review_type,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assigned_to,
        qualityAssessment: task.quality_assessment,
        reviewNotes: task.review_notes,
        reviewDecision: task.review_decision,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
        completedAt: task.completed_at,
      }));

    } catch (error) {
      console.error(`❌ Failed to get pending review tasks:`, error);
      throw error;
    }
  }

  /**
   * Complete a human review task
   */
  static async completeReviewTask(
    taskId: string,
    decision: 'approve' | 'reject' | 'needs_improvement' | 'escalate',
    reviewNotes: string,
    reviewerId: string
  ): Promise<void> {
    try {
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('human_review_tasks')
        .update({
          status: decision === 'escalate' ? 'escalated' : 'completed',
          review_decision: decision,
          review_notes: reviewNotes,
          assigned_to: reviewerId,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', taskId);

      if (error) {
        throw new Error(`Failed to complete review task: ${error.message}`);
      }

      console.log(`✅ Completed review task ${taskId} with decision: ${decision}`);

    } catch (error) {
      console.error(`❌ Failed to complete review task:`, error);
      throw error;
    }
  }

  /**
   * Get quality control statistics
   */
  static async getQualityControlStats(
    timeRange: '24h' | '7d' | '30d' = '7d'
  ): Promise<{
    assessments: {
      total: number;
      passed: number;
      needsReview: number;
      failed: number;
    };
    reviewTasks: {
      pending: number;
      completed: number;
      escalated: number;
      avgCompletionTime: number;
    };
    qualityTrends: {
      avgQualityScore: number;
      improvementRate: number;
      issueTypes: Record<string, number>;
    };
  }> {
    try {
      const timeFilter = this.getTimeFilter(timeRange);

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
        avgCompletionTime: this.calculateAvgCompletionTime(reviewTasks || []),
      };

      const qualityTrends = {
        avgQualityScore: this.calculateAvgQualityScore(assessments || []),
        improvementRate: this.calculateImprovementRate(assessments || []),
        issueTypes: this.aggregateIssueTypes(assessments || []),
      };

      return {
        assessments: assessmentStats,
        reviewTasks: reviewTaskStats,
        qualityTrends,
      };

    } catch (error) {
      console.error(`❌ Failed to get quality control stats:`, error);
      throw error;
    }
  }

  // ===== ADDITIONAL HELPER METHODS =====

  private static getTimeFilter(timeRange: string): string {
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

  private static calculateAvgCompletionTime(reviewTasks: any[]): number {
    const completedTasks = reviewTasks.filter(task =>
      task.status === 'completed' && task.created_at && task.completed_at
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

  private static calculateAvgQualityScore(assessments: any[]): number {
    if (assessments.length === 0) {
      return 0;
    }

    const totalScore = assessments.reduce((sum, assessment) => sum + assessment.overall_score, 0);
    return Math.round((totalScore / assessments.length) * 100) / 100;
  }

  private static calculateImprovementRate(assessments: any[]): number {
    // TODO: Implement improvement rate calculation
    return 0;
  }

  private static aggregateIssueTypes(assessments: any[]): Record<string, number> {
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
}
