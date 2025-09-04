ki/**
 * Visual Feature Extraction Service
 * 
 * Orchestrates the complete visual feature extraction pipeline, coordinating
 * image preprocessing, LLaMA vision analysis, embedding generation, and 
 * database storage for the visual search system.
 */

import { 
  LLaMAVisionService, 
  MaterialVisionAnalysisRequest,
  MaterialVisionAnalysisResult 
} from './llamaVisionService';
import { 
  ImagePreprocessingService, 
  ImageValidationResult,
  ProcessedImageResult,
  ImageMetadata 
} from './imagePreprocessing';
import { supabase } from '../integrations/supabase/client';
import { Database } from '../integrations/supabase/types';
import {
  AppError,
  ValidationError,
  ExternalServiceError,
  errorLogger,
} from '../core/errors';
import { createErrorContext } from '../core/errors/utils';

// Type definitions for the visual feature extraction pipeline
export interface VisualFeatureExtractionRequest {
  user_id: string;
  material_id?: string; // Optional - can be created if not provided
  image_data: Buffer | string; // Raw image data or base64
  image_url?: string; // Alternative to image_data
  analysis_options?: {
    include_embeddings?: boolean;
    include_clip_analysis?: boolean; // For Phase 2
    analysis_type?: 'material_identification' | 'surface_analysis' | 'property_detection' | 'comprehensive';
    priority?: number; // 1-10, lower = higher priority
  };
  context?: {
    material_name?: string;
    expected_category?: string;
    room_type?: string;
    application_area?: string;
  };
}

export interface VisualFeatureExtractionResult {
  success: boolean;
  extraction_id: string;
  material_id: string;
  visual_analysis: {
    material_type: string;
    surface_texture: string;
    color_description: string;
    finish_type: string;
    pattern_grain: string;
    confidence_score: number;
    structured_properties: any;
  };
  embeddings?: {
    description_embedding?: number[];
    material_type_embedding?: number[];
    clip_embedding?: number[];
  };
  processing_metadata: {
    processing_time_ms: number;
    image_hash: string;
    llama_model_version: string;
    pipeline_version: string;
  };
  cost_info: {
    llama_analysis_cost: number;
    embedding_cost?: number;
    total_cost: number;
  };
  error?: string;
}

export interface BatchVisualFeatureExtractionRequest {
  user_id: string;
  images: Array<{
    id: string; // User-provided identifier
    material_id?: string;
    image_data: Buffer | string;
    image_url?: string;
    analysis_options?: VisualFeatureExtractionRequest['analysis_options'];
    context?: VisualFeatureExtractionRequest['context'];
  }>;
  batch_options?: {
    priority?: number;
    max_concurrent?: number;
    enable_deduplication?: boolean;
  };
}

export interface BatchVisualFeatureExtractionResult {
  success: boolean;
  batch_id: string;
  results: Array<{
    id: string; // Matches input id
    result: VisualFeatureExtractionResult | { success: false; error: string };
  }>;
  processing_metadata: {
    total_processing_time_ms: number;
    successful_extractions: number;
    failed_extractions: number;
    total_cost: number;
  };
}

export interface QueueProcessingStatus {
  queue_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: {
    completed_items: number;
    total_items: number;
    current_item?: string;
  };
  estimated_completion_time?: Date;
  processing_metadata?: {
    processing_time_ms?: number;
    cost_accumulated?: number;
  };
}

/**
 * Visual Feature Extraction Service
 * 
 * Main orchestrator for the visual search pipeline. Coordinates image preprocessing,
 * LLaMA vision analysis, embedding generation, and database storage.
 */
export class VisualFeatureExtractionService {
  private static llamaService = new LLaMAVisionService();
  private static imagePreprocessing = new ImagePreprocessingService();

  /**
   * Extract visual features from a single image
   */
  static async extractFeatures(
    request: VisualFeatureExtractionRequest
  ): Promise<VisualFeatureExtractionResult> {
    const startTime = Date.now();
    const extractionId = `extract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // 1. Validate and preprocess image
      const preprocessedImage = await this.preprocessImage(request);
      if (!preprocessedImage.success) {
        return this.createErrorResult(
          extractionId,
          request.material_id || 'unknown',
          `Image preprocessing failed: ${preprocessedImage.error}`,
          startTime
        );
      }

      // 2. Check for existing analysis (deduplication)
      const existingAnalysis = await this.checkExistingAnalysis(
        preprocessedImage.hash,
        request.analysis_options?.analysis_type || 'comprehensive'
      );

      if (existingAnalysis) {
        return this.formatExistingAnalysisResult(existingAnalysis, extractionId, startTime);
      }

      // 3. Perform LLaMA vision analysis
      const llamaRequest: MaterialVisionAnalysisRequest = {
        user_id: request.user_id,
        image_url: request.image_url || '',
        image_data: preprocessedImage.processedImageData ?
          preprocessedImage.processedImageData.toString('base64') : '',
        analysis_type: request.analysis_options?.analysis_type || 'comprehensive',
        context: request.context ? {
          room_type: request.context.room_type || undefined,
          application_area: request.context.application_area || undefined,
          expected_materials: request.context.expected_category ? [request.context.expected_category] : undefined
        } : undefined,
        options: {
          include_confidence_scores: true,
          include_detailed_properties: request.analysis_options?.include_embeddings || false
        }
      };

      const llamaResult = await LLaMAVisionService.analyzeMaterialImage(llamaRequest);
      
      if (!llamaResult.success) {
        return this.createErrorResult(
          extractionId,
          request.material_id || 'unknown',
          `LLaMA analysis failed: ${llamaResult.error_message}`,
          startTime
        );
      }

      // 4. Generate embeddings if requested
      const embeddings = request.analysis_options?.include_embeddings ? 
        await this.generateEmbeddings(llamaResult) : undefined;

      // 5. Store visual analysis in database
      const analysisId = await this.storeVisualAnalysis({
        material_id: request.material_id || llamaResult.analysis_id,
        llama_result: llamaResult,
        image_hash: preprocessedImage.hash,
        image_url: request.image_url,
        image_dimensions: preprocessedImage.processedMetadata || preprocessedImage.originalMetadata,
        embeddings: embeddings || undefined,
        user_id: request.user_id
      });

      // 6. Update materials catalog if needed
      if (request.material_id) {
        await this.updateMaterialsCatalog(request.material_id, llamaResult, embeddings);
      }

      return {
        success: true,
        extraction_id: extractionId,
        material_id: request.material_id || llamaResult.analysis_id,
        visual_analysis: {
          material_type: this.extractMaterialType(llamaResult),
          surface_texture: this.extractSurfaceTexture(llamaResult),
          color_description: this.extractColorDescription(llamaResult),
          finish_type: this.extractFinishType(llamaResult),
          pattern_grain: this.extractPatternGrain(llamaResult),
          confidence_score: llamaResult.materials_detected?.[0]?.confidence || 0,
          structured_properties: this.extractStructuredProperties(llamaResult),
        },
        embeddings: embeddings,
        processing_metadata: {
          processing_time_ms: Date.now() - startTime,
          image_hash: preprocessedImage.hash,
          llama_model_version: llamaResult.model_used || 'llama-3.2-vision',
          pipeline_version: '1.0.0'
        },
        cost_info: {
          llama_analysis_cost: llamaResult.cost_info?.cost || 0,
          embedding_cost: embeddings ? 0.001 : 0,
          total_cost: (llamaResult.cost_info?.cost || 0) + (embeddings ? 0.001 : 0)
        }
      };

    } catch (error) {
      errorLogger.logError(error as Error, {
        extraction_id: extractionId,
        service: 'VisualFeatureExtractionService',
        operation: 'extractFeatures'
      });

      return this.createErrorResult(
        extractionId,
        request.material_id || 'unknown',
        `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        startTime
      );
    }
  }

  /**
   * Queue image for background processing
   */
  static async queueForProcessing(
    request: VisualFeatureExtractionRequest,
    priority: number = 5
  ): Promise<{ queue_id: string; estimated_processing_time?: Date }> {
    try {
      // Preprocess image to get hash and basic metadata
      const preprocessed = await this.preprocessImage(request);
      if (!preprocessed.success) {
        throw new ValidationError(
          `Image preprocessing failed: ${preprocessed.error}`,
          createErrorContext('VisualFeatureExtractionService.queueForProcessing', 'preprocessing_failed')
        );
      }

      // Insert into queue
      const { data, error } = await supabase
        .from('visual_analysis_queue')
        .insert({
          user_id: request.user_id,
          material_id: request.material_id || null,
          image_url: request.image_url || '',
          image_hash: preprocessed.hash || null,
          priority,
          analysis_type: [request.analysis_options?.analysis_type || 'comprehensive'],
          processing_options: {
            include_embeddings: request.analysis_options?.include_embeddings,
            include_clip_analysis: request.analysis_options?.include_clip_analysis,
            context: request.context
          },
          status: 'pending'
        })
        .select('id')
        .single();

      if (error) {
        throw new ExternalServiceError(
          `Failed to queue for processing: ${error.message}`,
          createErrorContext('VisualFeatureExtractionService.queueForProcessing', 'database_insert_failed')
        );
      }

      return {
        queue_id: data.id,
        estimated_processing_time: this.estimateProcessingTime(priority)
      };

    } catch (error) {
      errorLogger.logError(error as Error, {
        service: 'VisualFeatureExtractionService',
        operation: 'queueForProcessing'
      });
      throw error;
    }
  }

  /**
   * Get processing status for queued items
   */
  static async getProcessingStatus(
    queueIds: string[]
  ): Promise<Record<string, QueueProcessingStatus>> {
    try {
      const { data, error } = await supabase
        .from('visual_analysis_queue')
        .select('id, status, priority, created_at, processing_time_ms')
        .in('id', queueIds);

      if (error) {
        throw new ExternalServiceError(
          `Failed to get processing status: ${error.message}`,
          createErrorContext('VisualFeatureExtractionService.getProcessingStatus', 'database_query_failed')
        );
      }

      const statusMap: Record<string, QueueProcessingStatus> = {};
      
      data?.forEach(item => {
        statusMap[item.id] = {
          queue_id: item.id,
          status: (item.status as any) || 'pending',
          processing_metadata: {
            processing_time_ms: item.processing_time_ms || undefined
          }
        };
      });

      return statusMap;

    } catch (error) {
      errorLogger.logError(error as Error, {
        service: 'VisualFeatureExtractionService',
        operation: 'getProcessingStatus'
      });
      throw error;
    }
  }

  // Helper Methods

  private static async preprocessImage(
    request: VisualFeatureExtractionRequest
  ): Promise<ProcessedImageResult> {
    if (request.image_data) {
      // Convert string/Buffer to Buffer for processing
      const buffer = typeof request.image_data === 'string' 
        ? Buffer.from(request.image_data, 'base64')
        : request.image_data;
      
      return ImagePreprocessingService.processImage(buffer, {
        targetWidth: 1024,
        targetHeight: 1024,
        quality: 0.85,
        format: 'jpeg'
      });
    } else if (request.image_url) {
      // For URLs, we'd need to fetch the image first
      const response = await fetch(request.image_url);
      const buffer = Buffer.from(await response.arrayBuffer());
      
      return ImagePreprocessingService.processImage(buffer, {
        targetWidth: 1024,
        targetHeight: 1024,
        quality: 0.85,
        format: 'jpeg'
      });
    } else {
      return {
        success: false,
        originalMetadata: { width: 0, height: 0, format: 'unknown', size: 0 },
        hash: '',
        processingTime: 0,
        optimizations: [],
        error: 'Either image_data or image_url must be provided'
      };
    }
  }

  private static async checkExistingAnalysis(
    imageHash: string,
    analysisType: string
  ): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from('material_visual_analysis')
        .select('*')
        .eq('source_image_hash', imageHash)
        .single();

      if (error || !data) {
        return null;
      }

      return data;
    } catch {
      return null;
    }
  }

  private static formatExistingAnalysisResult(
    existingAnalysis: any,
    extractionId: string,
    startTime: number
  ): VisualFeatureExtractionResult {
    return {
      success: true,
      extraction_id: extractionId,
      material_id: existingAnalysis.material_id,
      visual_analysis: {
        material_type: existingAnalysis.material_type || 'unknown',
        surface_texture: existingAnalysis.surface_texture || '',
        color_description: existingAnalysis.color_description || '',
        finish_type: existingAnalysis.finish_type || '',
        pattern_grain: existingAnalysis.pattern_grain || '',
        confidence_score: existingAnalysis.llama_confidence_score || 0,
        structured_properties: existingAnalysis.structural_properties || {},
      },
      processing_metadata: {
        processing_time_ms: Date.now() - startTime,
        image_hash: existingAnalysis.source_image_hash || '',
        llama_model_version: existingAnalysis.llama_model_version || '',
        pipeline_version: '1.0.0'
      },
      cost_info: {
        llama_analysis_cost: 0, // No cost for cached result
        total_cost: 0
      }
    };
  }

  private static async generateEmbeddings(
    llamaResult: MaterialVisionAnalysisResult
  ): Promise<{ description_embedding?: number[]; material_type_embedding?: number[]; clip_embedding?: number[]; }> {
    // Placeholder for embedding generation
    // This would integrate with embedding services (OpenAI, local models, etc.)
    return {
      description_embedding: [], // TODO: Generate from description
      material_type_embedding: [], // TODO: Generate from material type
      clip_embedding: [] // TODO: Generate using CLIP model
    };
  }

  private static async storeVisualAnalysis(params: {
    material_id: string;
    llama_result: MaterialVisionAnalysisResult;
    image_hash: string;
    image_url?: string;
    image_dimensions: ImageMetadata;
    embeddings?: any;
    user_id: string;
  }): Promise<string> {
    const analysisData: Database['public']['Tables']['material_visual_analysis']['Insert'] = {
      material_id: params.material_id,
      material_type: this.extractMaterialType(params.llama_result),
      surface_texture: this.extractSurfaceTexture(params.llama_result),
      color_description: this.extractColorDescription(params.llama_result),
      finish_type: this.extractFinishType(params.llama_result),
      pattern_grain: this.extractPatternGrain(params.llama_result),
      visual_characteristics: this.extractVisualCharacteristics(params.llama_result),
      structural_properties: this.extractStructuredProperties(params.llama_result),
      llama_confidence_score: this.extractConfidenceScore(params.llama_result),
      llama_model_version: params.llama_result.model_used || 'llama-3.2-vision',
      llama_processing_time_ms: params.llama_result.processing_time_ms || null,
      source_image_hash: params.image_hash,
      source_image_url: params.image_url || null,
      image_dimensions: params.image_dimensions as any,
      description_embedding: params.embeddings?.description_embedding ? 
        JSON.stringify(params.embeddings.description_embedding) : null,
      material_type_embedding: params.embeddings?.material_type_embedding ? 
        JSON.stringify(params.embeddings.material_type_embedding) : null,
      clip_embedding: params.embeddings?.clip_embedding ? 
        JSON.stringify(params.embeddings.clip_embedding) : null,
      created_by: params.user_id,
      processing_status: 'completed'
    };

    const { data, error } = await supabase
      .from('material_visual_analysis')
      .insert(analysisData)
      .select('id')
      .single();

    if (error) {
      throw new ExternalServiceError(
        `Failed to store visual analysis: ${error.message}`,
        createErrorContext('VisualFeatureExtractionService.storeVisualAnalysis', 'database_insert_failed')
      );
    }

    return data.id;
  }

  private static async updateMaterialsCatalog(
    materialId: string,
    llamaResult: MaterialVisionAnalysisResult,
    embeddings?: any
  ): Promise<void> {
    try {
      const updateData: any = {
        material_type: this.extractMaterialType(llamaResult),
        updated_at: new Date().toISOString(),
        analysis_summary: this.extractVisualCharacteristics(llamaResult),
        visual_analysis_confidence: this.extractConfidenceScore(llamaResult)
      };

      // Add embeddings if available
      if (embeddings?.clip_embedding) {
        updateData.visual_embedding_512 = JSON.stringify(embeddings.clip_embedding);
      }

      await supabase
        .from('materials_catalog')
        .update(updateData)
        .eq('id', materialId);

    } catch (error) {
      errorLogger.logError(error as Error, {
        service: 'VisualFeatureExtractionService',
        operation: 'updateMaterialsCatalog'
      });
      // Don't throw - catalog update is non-critical
    }
  }

  private static createErrorResult(
    extractionId: string,
    materialId: string,
    errorMessage: string,
    startTime: number
  ): VisualFeatureExtractionResult {
    return {
      success: false,
      extraction_id: extractionId,
      material_id: materialId,
      visual_analysis: {
        material_type: '',
        surface_texture: '',
        color_description: '',
        finish_type: '',
        pattern_grain: '',
        confidence_score: 0,
        structured_properties: {},
      },
      processing_metadata: {
        processing_time_ms: Date.now() - startTime,
        image_hash: '',
        llama_model_version: '',
        pipeline_version: '1.0.0'
      },
      cost_info: {
        llama_analysis_cost: 0,
        total_cost: 0
      },
      error: errorMessage
    };
  }

  // Data extraction helpers
  private static extractMaterialType(result: MaterialVisionAnalysisResult): string {
    return result.materials_detected?.[0]?.material_type || 'unknown';
  }

  private static extractSurfaceTexture(result: MaterialVisionAnalysisResult): string {
    return result.materials_detected?.[0]?.properties?.texture || '';
  }

  private static extractColorDescription(result: MaterialVisionAnalysisResult): string {
    return result.materials_detected?.[0]?.properties?.color || '';
  }

  private static extractFinishType(result: MaterialVisionAnalysisResult): string {
    return result.materials_detected?.[0]?.properties?.finish || '';
  }

  private static extractPatternGrain(result: MaterialVisionAnalysisResult): string {
    return result.overall_analysis?.style_assessment || '';
  }

  private static extractVisualCharacteristics(result: MaterialVisionAnalysisResult): string {
    return JSON.stringify(result.overall_analysis || {});
  }

  private static extractStructuredProperties(result: MaterialVisionAnalysisResult): any {
    return result.materials_detected?.[0]?.properties || {};
  }

  private static extractConfidenceScore(result: MaterialVisionAnalysisResult): number {
    return result.materials_detected?.[0]?.confidence || 0;
  }

  private static estimateProcessingTime(priority: number): Date {
    // Simple estimation based on priority and current queue
    const baseProcessingMinutes = 10 - priority; // Higher priority = less time
    const estimatedTime = new Date();
    estimatedTime.setMinutes(estimatedTime.getMinutes() + baseProcessingMinutes);
    return estimatedTime;
  }
}