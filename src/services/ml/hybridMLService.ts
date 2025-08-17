import { supabase } from '@/integrations/supabase/client';

import { BaseService, ServiceConfig } from '../base/BaseService';

import { clientMLService, MLResult } from './clientMLService';
import { serverMLService, ServerMLResult } from './serverMLService';
import { DeviceDetector } from './deviceDetector';
import { HuggingFaceService } from './huggingFaceService';


export interface HybridMLServiceConfig extends ServiceConfig {
  preferServerSide: boolean;
  fallbackToClient: boolean;
  confidenceThreshold: number;
  useAIVision: boolean;
  maxFileSize: number; // in MB
  maxFiles: number;
  enableHybridProcessing: boolean;
  enableDeviceDetection: boolean;
  enablePerformanceOptimization: boolean;
}

export interface HybridMLOptions {
  preferServerSide?: boolean;
  fallbackToClient?: boolean;
  confidenceThreshold?: number;
  useAIVision?: boolean;
  maxFileSize?: number; // in MB
  maxFiles?: number;
}

export interface HybridMLResult extends MLResult {
  processingMethod?: 'client' | 'server' | 'hybrid';
  serverJobId?: string;
}

/**
 * Hybrid ML service that intelligently chooses between client and server processing
 * based on file characteristics, device capabilities, and user preferences
 */
export class HybridMLService extends BaseService<HybridMLServiceConfig> {
  private readonly DEFAULT_OPTIONS: Required<HybridMLOptions> = {
    preferServerSide: false,
    fallbackToClient: true,
    confidenceThreshold: 0.6,
    useAIVision: true,
    maxFileSize: 5, // 5MB
    maxFiles: 10,
  };

  protected async doInitialize(): Promise<void> {
    // Initialize dependent services
    try {
      const huggingFaceService = HuggingFaceService.getInstance<HuggingFaceService>();
      await huggingFaceService.initialize();
    } catch (error) {
      console.warn('HuggingFace service initialization failed:', error);
    }

    // Validate device capabilities
    const deviceInfo = await DeviceDetector.getDeviceInfo();
    if (!deviceInfo.supportsWebGPU && this.config?.preferServerSide === false) {
      console.warn('WebGPU not supported, server-side processing recommended');
    }

    // Test server availability if configured
    if (this.config?.enableHybridProcessing) {
      const serverAvailable = await this.checkServerAvailability();
      if (!serverAvailable) {
        console.warn('Server-side processing not available, falling back to client-side only');
      }
    }
  }

  protected async doHealthCheck(): Promise<void> {
    if (!this.config) {
      throw new Error('HybridMLService configuration not found');
    }

    // Check configuration validity
    if (this.config.maxFileSize <= 0 || this.config.maxFiles <= 0) {
      throw new Error('Invalid file size or count limits in configuration');
    }

    if (this.config.confidenceThreshold < 0 || this.config.confidenceThreshold > 1) {
      throw new Error('Invalid confidence threshold in configuration');
    }

    // Check dependent services
    const clientStatus = clientMLService.getStatus();
    if (!clientStatus.initialized && !this.config.preferServerSide) {
      throw new Error('Client ML service not initialized and server preference not set');
    }

    // Test basic functionality
    const deviceInfo = await DeviceDetector.getDeviceInfo();
    if (!deviceInfo.supportsWebGPU && !this.config.fallbackToClient) {
      throw new Error('No WebGPU support and fallback disabled');
    }
  }

  /**
   * Create a new HybridMLService instance with standardized configuration
   */
  static createInstance(config?: Partial<HybridMLServiceConfig>): HybridMLService {
    const defaultConfig: HybridMLServiceConfig = {
      name: 'HybridMLService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      timeout: 60000, // 60 seconds for ML processing
      retries: 2,
      preferServerSide: false,
      fallbackToClient: true,
      confidenceThreshold: 0.6,
      useAIVision: true,
      maxFileSize: 5, // 5MB
      maxFiles: 10,
      enableHybridProcessing: true,
      enableDeviceDetection: true,
      enablePerformanceOptimization: true,
    };

    const finalConfig = { ...defaultConfig, ...config };
    const instance = new HybridMLService(finalConfig);
    return instance;
  }

  /**
   * Analyze materials using the optimal processing method
   */
  async analyzeMaterials(
    files: File[],
    descriptions?: string[],
    options: HybridMLOptions = {},
  ): Promise<HybridMLResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const processingDecision = await this.determineProcessingMethod(files, opts);

    console.log(`Using ${processingDecision.method} processing:`, processingDecision.reason);

    try {
      switch (processingDecision.method) {
        case 'server':
          return await this.processOnServer(files, descriptions, opts);

        case 'client':
          return await this.processOnClient(files, descriptions, opts);

        case 'hybrid':
          return await this.processHybrid(files, descriptions, opts);

        default:
          throw new Error('Invalid processing method');
      }
    } catch (error) {
      console.error('Primary processing failed:', error);

      if (opts.fallbackToClient && processingDecision.method !== 'client') {
        console.log('Falling back to client-side processing');
        return await this.processOnClient(files, descriptions, opts);
      }

      throw error;
    }
  }

  /**
   * Determine the optimal processing method based on various factors
   */
  private async determineProcessingMethod(
    files: File[],
    options: Required<HybridMLOptions>,
  ): Promise<{ method: 'client' | 'server' | 'hybrid'; reason: string }> {
    // Check file constraints
    const totalSize = files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024); // MB
    const oversizedFiles = files.filter(file => file.size > options.maxFileSize * 1024 * 1024);

    if (files.length > options.maxFiles) {
      return {
        method: 'server',
        reason: `Too many files (${files.length} > ${options.maxFiles})`,
      };
    }

    if (oversizedFiles.length > 0) {
      return {
        method: 'server',
        reason: `Large files detected (${oversizedFiles.length} files > ${options.maxFileSize}MB)`,
      };
    }

    // Check for AI vision requirement
    if (options.useAIVision && options.preferServerSide) {
      return {
        method: 'server',
        reason: 'AI vision requested with server preference',
      };
    }

    // Check device capabilities
    const deviceInfo = await DeviceDetector.getDeviceInfo();

    if (!deviceInfo.supportsWebGPU && totalSize > 2) {
      return {
        method: 'server',
        reason: 'No WebGPU support and large total file size',
      };
    }

    // User preference
    if (options.preferServerSide) {
      return {
        method: 'server',
        reason: 'User preference for server-side processing',
      };
    }

    // Small files, good device capabilities - use client
    if (files.length <= 3 && totalSize <= 1 && deviceInfo.supportsWebGPU) {
      return {
        method: 'client',
        reason: 'Small files with good device capabilities',
      };
    }

    // Medium complexity - hybrid approach
    if (files.length <= 5 && totalSize <= 3) {
      return {
        method: 'hybrid',
        reason: 'Medium complexity - using hybrid approach',
      };
    }

    // Default to server for everything else
    return {
      method: 'server',
      reason: 'Default choice for optimal performance',
    };
  }

  /**
   * Process using server-side ML
   */
  private async processOnServer(
    files: File[],
    descriptions?: string[],
    options?: HybridMLOptions,
  ): Promise<HybridMLResult> {
    const startTime = performance.now();

    const serverResult = await serverMLService.recognizeMaterials(files, {
      confidence_threshold: options?.confidenceThreshold || 0.6,
      use_ai_vision: options?.useAIVision,
      extract_properties: true,
      include_similar_materials: true,
      detection_methods: ['visual'],
    });

    const processingTime = performance.now() - startTime;

    if (!serverResult.success) {
      throw new Error(serverResult.error || 'Server processing failed');
    }

    return {
      success: true,
      data: serverResult.results,
      confidence: this.calculateAverageConfidence(serverResult.results),
      processingTime: Math.round(processingTime),
      processingMethod: 'server',
      serverJobId: serverResult.job_id,
    };
  }

  /**
   * Process using client-side ML
   */
  private async processOnClient(
    files: File[],
    descriptions?: string[],
    options?: HybridMLOptions,
  ): Promise<HybridMLResult> {
    const startTime = performance.now();
    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const description = descriptions?.[i];

      try {
        // Try client-side first
        const result = await clientMLService.analyzeMaterial(file, description);

        if (result.success && (result.confidence || 0) > 0.7) {
          results.push(result);
          continue;
        }

        // Fallback to HuggingFace if client confidence is low
        console.log('Client confidence low, trying HuggingFace...');
        const huggingFaceService = HuggingFaceService.getInstance<HuggingFaceService>();
        await huggingFaceService.initialize();

        const [materialResults, styleResults] = await Promise.all([
          huggingFaceService.classifyMaterial(file),
          huggingFaceService.analyzeImageStyle(file),
        ]);

        if (materialResults.length > 0) {
          const topResult = materialResults[0];
          results.push({
            success: true,
            data: {
              materialType: topResult.label,
              confidence: topResult.score,
              properties: {
                style: styleResults[0]?.label || 'unknown',
                processing_method: 'huggingface',
              },
            },
            confidence: topResult.score,
          });
        } else {
          results.push(result); // Use client result even if low confidence
        }

      } catch (error) {
        console.error('Processing failed for file:', file.name, error);
        results.push({
          success: false,
          error: error instanceof Error ? error.message : 'Processing failed',
        });
      }
    }

    const processingTime = performance.now() - startTime;
    const successfulResults = results.filter(r => r.success);

    return {
      success: successfulResults.length > 0,
      data: successfulResults.map(r => r.data),
      confidence: this.calculateAverageConfidence(successfulResults),
      processingTime: Math.round(processingTime),
      processingMethod: 'client',
      error: successfulResults.length === 0 ? 'All processing methods failed' : undefined,
    };
  }

  /**
   * Process using hybrid approach (client + server validation)
   */
  private async processHybrid(
    files: File[],
    descriptions?: string[],
    options?: HybridMLOptions,
  ): Promise<HybridMLResult> {
    const startTime = performance.now();

    // Start with client-side processing for speed
    const clientPromise = this.processOnClient(files, descriptions, options);

    // Simultaneously start server processing for accuracy
    const serverPromise = this.processOnServer(files, descriptions, options);

    try {
      // Wait for client results first
      const clientResult = await clientPromise;

      // Check if client results meet confidence threshold
      const avgConfidence = clientResult.confidence || 0;

      if (avgConfidence >= (options?.confidenceThreshold || 0.6)) {
        console.log('Client results meet confidence threshold, using client results');

        // Cancel server processing if possible (edge function will still complete)
        return {
          ...clientResult,
          processingMethod: 'hybrid',
        };
      }

      // Wait for server results for better accuracy
      console.log('Client confidence low, waiting for server results');
      const serverResult = await serverPromise;

      // Combine the best aspects of both
      return {
        success: serverResult.success || clientResult.success,
        data: serverResult.data || clientResult.data,
        confidence: Math.max(serverResult.confidence || 0, clientResult.confidence || 0),
        processingTime: Math.round(performance.now() - startTime),
        processingMethod: 'hybrid',
        serverJobId: serverResult.serverJobId,
      };

    } catch (error) {
      // If server fails, return client results
      const clientResult = await clientPromise;
      return {
        ...clientResult,
        processingMethod: 'hybrid',
        error: `Hybrid processing: ${error instanceof Error ? error.message : 'Server processing failed'}`,
      };
    }
  }

  /**
   * Calculate average confidence from results
   */
  private calculateAverageConfidence(results?: any[]): number {
    if (!results || results.length === 0) return 0;

    const confidences = results
      .map(r => r.confidence_score || r.confidence || 0)
      .filter(c => typeof c === 'number');

    return confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;
  }

  /**
   * Get processing recommendations for given files
   */
  async getProcessingRecommendation(files: File[]): Promise<{
    recommendedMethod: 'client' | 'server' | 'hybrid';
    reasons: string[];
    estimatedTime: string;
    costImplications: string;
  }> {
    const decision = this.determineProcessingMethod(files, this.DEFAULT_OPTIONS);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0) / (1024 * 1024);
    const deviceInfo = await DeviceDetector.getDeviceInfo();

    const reasons = [decision.reason];

    let estimatedTime = '';
    let costImplications = '';

    switch (decision.method) {
      case 'client':
        estimatedTime = '5-15 seconds';
        costImplications = 'No server costs, uses local device resources';
        reasons.push('Fastest processing', 'Works offline', 'Privacy-focused');
        break;

      case 'server':
        estimatedTime = '10-30 seconds';
        costImplications = 'Uses AI API credits for enhanced accuracy';
        reasons.push('Highest accuracy', 'Advanced AI models', 'Handles large files');
        break;

      case 'hybrid':
        estimatedTime = '5-20 seconds';
        costImplications = 'Balanced approach - minimal API usage';
        reasons.push('Best of both worlds', 'Adaptive processing', 'Optimized performance');
        break;
    }

    if (!deviceInfo.supportsWebGPU) {
      reasons.push('Limited local GPU support detected');
    }

    return {
      recommendedMethod: decision.method,
      reasons,
      estimatedTime,
      costImplications,
    };
  }

  /**
   * Check if server-side processing is available
   */
  async checkServerAvailability(): Promise<boolean> {
    try {
      // Try a simple ping to the edge function
      const { error } = await supabase.functions.invoke('material-recognition', {
        body: { action: 'ping' },
      });
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Analyze a single image using optimal processing method
   */
  async analyzeImage(file: File, options: any = {}): Promise<HybridMLResult> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };
    const processingDecision = this.determineProcessingMethod([file], opts);

    try {
      switch (processingDecision.method) {
        case 'server':
          return await this.processOnServer([file], [], opts);
        case 'client':
        default:
          return await this.processOnClient([file], [], opts);
      }
    } catch (error) {
      console.error('Image analysis failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image analysis failed',
        processingMethod: processingDecision.method,
      };
    }
  }

  /**
   * Analyze image style
   */
  async analyzeImageStyle(file: File, options: any = {}): Promise<HybridMLResult> {
    // For now, delegate to general image analysis
    return await this.analyzeImage(file, { ...options, analysisType: 'style' });
  }

  /**
   * Classify image
   */
  async classifyImage(file: File, options: any = {}): Promise<HybridMLResult> {
    // For now, delegate to general image analysis
    return await this.analyzeImage(file, { ...options, analysisType: 'classification' });
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{
    client: ReturnType<typeof clientMLService.getStatus>;
    device: Awaited<ReturnType<typeof DeviceDetector.getDeviceInfo>>;
    recommendations: string[];
  }> {
    const clientStatus = clientMLService.getStatus();
    const deviceInfo = await DeviceDetector.getDeviceInfo();

    const recommendations = [];

    if (!deviceInfo.supportsWebGPU) {
      recommendations.push('Consider using server-side processing for better performance');
    }

    if (!clientStatus.initialized) {
      recommendations.push('Client-side models are still loading');
    }

    if (clientStatus.initialized && deviceInfo.supportsWebGPU) {
      recommendations.push('All systems ready for optimal processing');
    }

    return {
      client: clientStatus,
      device: deviceInfo,
      recommendations,
    };
  }
}

export const hybridMLService = HybridMLService.createInstance();
