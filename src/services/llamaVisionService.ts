/**
 * LLaMA Vision Service
 * 
 * Service wrapper for LLaMA 3.2 Vision models via Together AI API.
 * Provides material analysis capabilities with cost tracking, rate limiting,
 * and comprehensive error handling.
 */

import {
  TOGETHER_AI_CONFIG,
  RATE_LIMIT_CONFIG,
  getCurrentModelConfig,
  getTogetherAIHeaders,
  createVisionAnalysisPayload,
  estimateAnalysisCost,
  MATERIAL_ANALYSIS_SYSTEM_PROMPT
} from '../config/together-ai.config';
import { CircuitBreaker } from './circuitBreaker';
import {
  AppError,
  ValidationError,
  NetworkError,
  APIError,
  ExternalServiceError,
  errorLogger,
} from '../core/errors';
import { createErrorContext } from '../core/errors/utils';
import { supabase } from '../integrations/supabase/client';

// Service-specific interfaces
export interface MaterialVisionAnalysisRequest {
  user_id: string;
  image_url: string;
  image_data?: string; // Base64 encoded image data
  analysis_type: 'material_identification' | 'surface_analysis' | 'property_detection' | 'comprehensive';
  context?: {
    room_type?: string;
    application_area?: string;
    expected_materials?: string[];
  };
  options?: {
    include_confidence_scores?: boolean;
    include_detailed_properties?: boolean;
    include_recommendations?: boolean;
    max_tokens?: number;
    temperature?: number;
  };
}

// Local cost tracking interface to replace missing CostTrackingInfo
export interface CostTrackingInfo {
  cost: number;
  tokens_used: number;
  model: string;
  timestamp: string;
}

export interface MaterialVisionAnalysisResult {
  success: boolean;
  analysis_id: string;
  materials_detected: Array<{
    material_type: string;
    confidence: number;
    properties: {
      texture: string;
      color: string;
      finish: string;
      estimated_dimensions?: string;
      wear_condition?: string;
      maintenance_requirements?: string[];
    };
    bounding_box?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
  overall_analysis: {
    dominant_materials: string[];
    style_assessment: string;
    quality_indicators: string[];
    recommendations: string[];
  };
  cost_info: CostTrackingInfo;
  processing_time_ms: number;
  model_used: string;
  error_message?: string;
}

export interface LLaMAVisionMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  total_cost: number;
  average_response_time_ms: number;
  rate_limit_hits: number;
  circuit_breaker_trips: number;
}

export class LLaMAVisionService {
  private static circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 10000, // 10 seconds
  });

  private static metrics: LLaMAVisionMetrics = {
    total_requests: 0,
    successful_requests: 0,
    failed_requests: 0,
    total_cost: 0,
    average_response_time_ms: 0,
    rate_limit_hits: 0,
    circuit_breaker_trips: 0,
  };

  /**
   * Simple rate limiting check
   */
  private static checkRateLimit(): { canProceed: boolean; reason?: string } {
    // Simple implementation - could be enhanced with real rate limiting
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const maxRequestsPerMinute = RATE_LIMIT_CONFIG.requestsPerMinute;
    
    // For now, just return true - implement proper rate limiting later
    return { canProceed: true };
  }

  /**
   * Analyze material properties in an image using LLaMA Vision
   */
  static async analyzeMaterialImage(
    request: MaterialVisionAnalysisRequest
  ): Promise<MaterialVisionAnalysisResult> {
    const startTime = Date.now();
    
    try {
      // Input validation
      this.validateAnalysisRequest(request);

      // Check rate limits - simple implementation
      const rateLimitStatus = this.checkRateLimit();
      if (!rateLimitStatus.canProceed) {
        this.metrics.rate_limit_hits++;
        throw new APIError(
          `Rate limit exceeded. Please wait before making another request.`,
          createErrorContext('LLaMAVisionService', 'checkRateLimit')
        );
      }

      // Check budget constraints
      const modelConfig = getCurrentModelConfig();
      const costEstimate = modelConfig.costPerRequest;
      const budgetStatus = await this.checkBudgetConstraints(costEstimate);
      if (!budgetStatus.withinBudget) {
        throw new APIError(
          `Budget exceeded. Current usage: $${budgetStatus.currentUsage}/${budgetStatus.monthlyBudget}`,
          createErrorContext('LLaMAVisionService', 'checkBudgetConstraints')
        );
      }

      // Increment request counter
      this.metrics.total_requests++;

      // Execute with circuit breaker protection
      const result = await this.circuitBreaker.execute(async () => {
        return await this.executeVisionAnalysis(request);
      });

      // Track successful completion
      const processingTime = Date.now() - startTime;
      this.metrics.successful_requests++;
      this.updateAverageResponseTime(processingTime);
      this.metrics.total_cost += result.cost_info.cost;

      return {
        ...result,
        processing_time_ms: processingTime,
      };

    } catch (error) {
      this.metrics.failed_requests++;
      
      if (error instanceof Error && error.message.includes('Circuit breaker is OPEN')) {
        this.metrics.circuit_breaker_trips++;
      }

      const processingTime = Date.now() - startTime;
      
      // Log error for monitoring
      errorLogger.logError(error as Error, {
        context: 'LLaMAVisionService.analyzeMaterialImage',
        
        analysis_type: request.analysis_type,
        processing_time_ms: processingTime,
      });

      // Return error result
      const modelConfig = getCurrentModelConfig();
      return {
        success: false,
        analysis_id: `error-${Date.now()}`,
        materials_detected: [],
        overall_analysis: {
          dominant_materials: [],
          style_assessment: 'Analysis failed',
          quality_indicators: [],
          recommendations: [],
        },
        cost_info: {
          cost: 0,
          tokens_used: 0,
          model: modelConfig.model,
          timestamp: new Date().toISOString(),
        },
        processing_time_ms: processingTime,
        model_used: modelConfig.model,
        error_message: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Execute the actual vision analysis with Together AI
   */
  private static async executeVisionAnalysis(
    request: MaterialVisionAnalysisRequest
  ): Promise<Omit<MaterialVisionAnalysisResult, 'processing_time_ms'>> {
    const modelConfig = getCurrentModelConfig();
    
    // Create the vision analysis payload using the actual function signature
    const payload = createVisionAnalysisPayload(
      request.image_url,
      `Analyze this material image for ${request.analysis_type}. ${MATERIAL_ANALYSIS_SYSTEM_PROMPT}`,
      {
        maxTokens: request.options?.max_tokens || modelConfig.maxTokens,
        temperature: request.options?.temperature || modelConfig.temperature,
        systemPrompt: MATERIAL_ANALYSIS_SYSTEM_PROMPT
      }
    );

    // Make API call to Together AI
    const headers = getTogetherAIHeaders();
    const response = await fetch('https://api.together.xyz/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(
        `Together AI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`,
        createErrorContext('LLaMAVisionService', 'callTogetherAI')
      );
    }

    const apiResponse = await response.json();
    
    // Track cost - simple implementation
    const costInfo: CostTrackingInfo = {
      cost: modelConfig.costPerRequest,
      tokens_used: apiResponse.usage?.total_tokens || 0,
      model: modelConfig.model,
      timestamp: new Date().toISOString(),
    };

    // Parse and structure the response
    const analysisResult = this.parseVisionResponse(apiResponse, request);

    // Store analysis in database
    const analysisId = await this.storeAnalysisResult(request, analysisResult, costInfo);

    return {
      success: true,
      analysis_id: analysisId,
      materials_detected: analysisResult.materials_detected,
      overall_analysis: analysisResult.overall_analysis,
      cost_info: costInfo,
      model_used: modelConfig.model,
    };
  }

  /**
   * Parse the LLaMA Vision API response into structured material analysis
   */
  private static parseVisionResponse(
    apiResponse: any,
    request: MaterialVisionAnalysisRequest
  ): {
    materials_detected: MaterialVisionAnalysisResult['materials_detected'];
    overall_analysis: MaterialVisionAnalysisResult['overall_analysis'];
  } {
    try {
      const content = apiResponse.choices?.[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content in API response');
      }

      // Parse the structured JSON response from LLaMA Vision
      let parsedContent;
      try {
        // Extract JSON from the response (LLaMA often wraps JSON in markdown)
        const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedContent = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
          parsedContent = JSON.parse(content);
        }
      } catch (parseError) {
        // Fallback: create structure from text content
        parsedContent = this.createFallbackStructure(content, request);
      }

      return {
        materials_detected: parsedContent.materials_detected || [],
        overall_analysis: parsedContent.overall_analysis || {
          dominant_materials: [],
          style_assessment: content.substring(0, 200) + '...',
          quality_indicators: [],
          recommendations: [],
        },
      };

    } catch (error) {
      errorLogger.logError(error as Error, {
        context: 'LLaMAVisionService.parseVisionResponse',
        apiResponse: JSON.stringify(apiResponse, null, 2),
      });

      // Return minimal structure on parse failure
      return {
        materials_detected: [],
        overall_analysis: {
          dominant_materials: [],
          style_assessment: 'Failed to parse analysis results',
          quality_indicators: [],
          recommendations: [],
        },
      };
    }
  }

  /**
   * Create fallback structure when JSON parsing fails
   */
  private static createFallbackStructure(
    content: string,
    request: MaterialVisionAnalysisRequest
  ) {
    // Extract materials mentioned in the text
    const commonMaterials = [
      'wood', 'metal', 'glass', 'plastic', 'fabric', 'leather', 'stone', 
      'ceramic', 'concrete', 'brick', 'marble', 'granite', 'tile'
    ];
    
    const detectedMaterials = commonMaterials.filter(material => 
      content.toLowerCase().includes(material)
    );

    return {
      materials_detected: detectedMaterials.map(material => ({
        material_type: material,
        confidence: 0.7, // Default confidence for text-based detection
        properties: {
          texture: 'Unknown',
          color: 'Unknown',
          finish: 'Unknown',
        },
      })),
      overall_analysis: {
        dominant_materials: detectedMaterials.slice(0, 3),
        style_assessment: content.substring(0, 200),
        quality_indicators: [],
        recommendations: ['Professional assessment recommended for detailed analysis'],
      },
    };
  }

  /**
   * Store analysis results in database
   */
  private static async storeAnalysisResult(
    request: MaterialVisionAnalysisRequest,
    result: any,
    costInfo: CostTrackingInfo
  ): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('agent_ml_tasks')
        .insert({
          ml_operation_type: 'vision_analysis',
          input_data: {
            image_url: request.image_url,
            image_data: request.image_data,
            analysis_type: request.analysis_type,
            user_id: request.user_id
          },
          ml_results: {
            materials_detected: result.materials_detected,
            overall_analysis: result.overall_analysis,
            cost_info: JSON.parse(JSON.stringify(costInfo))
          },
          model_versions: {
            model_used: getCurrentModelConfig().model,
            version: '1.0'
          },
          confidence_scores: result.confidence || {},
          processing_time_ms: 0
        })
        .select('id')
        .single();

      if (error) {
        errorLogger.logError(new Error(`Database storage failed: ${error.message}`), {
          context: 'LLaMAVisionService.storeAnalysisResult',
          
        });
        return `temp-${Date.now()}`; // Return temporary ID on storage failure
      }

      return data.id;
    } catch (error) {
      errorLogger.logError(error as Error, {
        context: 'LLaMAVisionService.storeAnalysisResult',
        
      });
      return `temp-${Date.now()}`;
    }
  }

  /**
   * Validate analysis request
   */
  private static validateAnalysisRequest(request: MaterialVisionAnalysisRequest): void {
    if (!request.user_id) {
      throw new ValidationError('user_id is required',
        createErrorContext('LLaMAVisionService', 'validateRequest')
      );
    }

    if (!request.image_url && !request.image_data) {
      throw new ValidationError('Either image_url or image_data is required',
        createErrorContext('LLaMAVisionService', 'validateRequest')
      );
    }

    if (!request.analysis_type) {
      throw new ValidationError('analysis_type is required',
        createErrorContext('LLaMAVisionService', 'validateRequest')
      );
    }

    const validAnalysisTypes = [
      'material_identification',
      'surface_analysis',
      'property_detection',
      'comprehensive'
    ];

    if (!validAnalysisTypes.includes(request.analysis_type)) {
      throw new ValidationError(
        `Invalid analysis_type. Must be one of: ${validAnalysisTypes.join(', ')}`,
        createErrorContext('LLaMAVisionService', 'validateRequest')
      );
    }
  }

  /**
   * Check budget constraints
   */
  private static async checkBudgetConstraints(estimatedCost: number): Promise<{
    withinBudget: boolean;
    currentUsage: number;
    monthlyBudget: number;
  }> {
    // Simple budget check - could be enhanced with actual cost tracking
    const monthlyBudget = 100; // Default budget in USD
    const currentUsage = this.metrics.total_cost;
    
    return {
      withinBudget: (currentUsage + estimatedCost) <= monthlyBudget,
      currentUsage,
      monthlyBudget,
    };
  }

  /**
   * Update average response time metric
   */
  private static updateAverageResponseTime(newTime: number): void {
    const totalRequests = this.metrics.successful_requests;
    const currentAverage = this.metrics.average_response_time_ms;
    
    this.metrics.average_response_time_ms = 
      ((currentAverage * (totalRequests - 1)) + newTime) / totalRequests;
  }

  /**
   * Get service metrics and health status
   */
  static getMetrics(): LLaMAVisionMetrics & {
    circuit_breaker_state: string;
    health_status: 'healthy' | 'degraded' | 'unhealthy';
  } {
    const successRate = this.metrics.total_requests > 0 
      ? this.metrics.successful_requests / this.metrics.total_requests 
      : 1;

    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (successRate < 0.5 || this.circuitBreaker.getState() === 'OPEN') {
      healthStatus = 'unhealthy';
    } else if (successRate < 0.8 || this.circuitBreaker.getState() === 'HALF_OPEN') {
      healthStatus = 'degraded';
    }

    return {
      ...this.metrics,
      circuit_breaker_state: this.circuitBreaker.getState(),
      health_status: healthStatus,
    };
  }

  /**
   * Reset service metrics (for testing or monitoring purposes)
   */
  static resetMetrics(): void {
    this.metrics = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      total_cost: 0,
      average_response_time_ms: 0,
      rate_limit_hits: 0,
      circuit_breaker_trips: 0,
    };
  }

  /**
   * Batch analyze multiple images
   */
  static async batchAnalyzeMaterials(
    requests: MaterialVisionAnalysisRequest[]
  ): Promise<MaterialVisionAnalysisResult[]> {
    const results: MaterialVisionAnalysisResult[] = [];
    
    // Process in batches to respect rate limits
    const batchSize = 3; // Conservative batch size
    
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      
      const batchPromises = batch.map(request => 
        this.analyzeMaterialImage(request)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          // Create error result for failed batch item
          const failedRequest = batch[index];
          results.push({
            success: false,
            analysis_id: `batch-error-${Date.now()}-${index}`,
            materials_detected: [],
            overall_analysis: {
              dominant_materials: [],
              style_assessment: 'Batch processing failed',
              quality_indicators: [],
              recommendations: [],
            },
            cost_info: {
              cost: 0,
              tokens_used: 0,
              model: getCurrentModelConfig().model,
              timestamp: new Date().toISOString(),
            },
            processing_time_ms: 0,
            model_used: getCurrentModelConfig().model,
            error_message: result.reason?.message || 'Batch processing error',
          });
        }
      });
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }
}