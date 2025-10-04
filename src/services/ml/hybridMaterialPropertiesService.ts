import { BaseService, ServiceConfig } from '../base/BaseService';

import { MLResult } from './types';
import { MaterialAnalyzerService, MaterialAnalysisOptions } from './materialAnalyzer';
import { unifiedMLService } from './unifiedMLService';

interface HybridMaterialPropertiesServiceConfig extends ServiceConfig {
  preferServerForComprehensive: boolean;
  serverFileSizeThreshold: number; // bytes
  enableFallbackToClient: boolean;
  maxRetryAttempts: number;
  enablePerformanceLogging: boolean;
  enableCaching: boolean;
  cacheExpirationMs: number;
  serverTimeoutMs: number;
  clientTimeoutMs: number;
  enableQualityAssessment: boolean;
  minConfidenceThreshold: number;
  specializedFocusAreas: string[];
}

export class HybridMaterialPropertiesService extends BaseService<HybridMaterialPropertiesServiceConfig> {
  private clientAnalyzer: MaterialAnalyzerService | null = null;
  private analysisCache: Map<string, { result: MLResult; timestamp: number }> = new Map();

  protected constructor(config: HybridMaterialPropertiesServiceConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    // Initialize client analyzer
    await this.executeOperation(
      () => this.initializeClientAnalyzer(),
      'initialize-client-analyzer',
    );

    // Server ML is now handled by unifiedMLService - no separate initialization needed

    // Verify both services are functional
    await this.executeOperation(
      () => this.verifyServicesHealth(),
      'verify-services-health',
    );
  }

  protected async doHealthCheck(): Promise<void> {
    // Check if services are properly initialized
    if (!this.clientAnalyzer) {
      throw new Error('Client analyzer not properly initialized');
    }

    // Basic health check - services exist and are ready
    // Note: Cannot access protected isInitialized property from external services
  }

  private async initializeClientAnalyzer(): Promise<void> {
    // Create MaterialAnalyzerService using factory pattern
    const analyzerConfig = {
      name: 'MaterialAnalyzerService',
      version: '1.0.0',
      environment: 'development' as const,
      enabled: true,
      enableAdvancedAnalysis: true,
      knowledgeBaseSize: 1000,
      defaultAnalysisDepth: 'standard' as const,
      enableVisualAnalysis: true,
    };

    this.clientAnalyzer = MaterialAnalyzerService.createInstance(analyzerConfig);
    await this.clientAnalyzer.initialize();
  }

  private async verifyServicesHealth(): Promise<void> {
    if (!this.clientAnalyzer) {
      throw new Error('Client analyzer not properly initialized');
    }

    // Services exist and have been created successfully
    // Note: Cannot access protected isInitialized property from external services
  }

  async analyzeAdvancedProperties(
    imageFile: File,
    options: MaterialAnalysisOptions = { analysisDepth: 'standard', focusAreas: [] },
  ): Promise<MLResult> {
    return this.executeOperation(async () => {
      const startTime = performance.now();

      // Check cache first
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey(imageFile, options);
        const cached = this.analysisCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.config.cacheExpirationMs) {
          if (this.config.enablePerformanceLogging) {
            console.log('HybridMaterialProperties: Using cached result');
          }
          return cached.result;
        }
      }

      try {
        // Determine processing strategy
        const useServer = this.shouldUseServerAnalysis(options, imageFile);

        let result: MLResult;

        if (useServer) {
          if (this.config.enablePerformanceLogging) {
            console.log('HybridMaterialProperties: Using server-side advanced material properties analysis');
          }
          result = await this.performServerAnalysis(imageFile, options);
        } else {
          if (this.config.enablePerformanceLogging) {
            console.log('HybridMaterialProperties: Using client-side advanced material properties analysis');
          }
          result = await this.performClientAnalysis(imageFile, options);
        }

        // Quality assessment
        if (this.config.enableQualityAssessment) {
          result = this.assessResultQuality(result);
        }

        // Cache successful results
        if (this.config.enableCaching && result.success) {
          const cacheKey = this.generateCacheKey(imageFile, options);
          this.analysisCache.set(cacheKey, {
            result,
            timestamp: Date.now(),
          });
        }

        // Add processing metadata
        result.processingTime = performance.now() - startTime;
        result.provider = useServer ? 'hybrid-server' : 'hybrid-client';

        return result;

      } catch (error) {
        console.error('HybridMaterialProperties: Analysis failed:', error);

        // Fallback to basic client analysis if enabled
        if (this.config.enableFallbackToClient) {
          try {
            if (this.config.enablePerformanceLogging) {
              console.log('HybridMaterialProperties: Falling back to basic client analysis');
            }
            const fallbackResult = await this.performClientAnalysis(imageFile, {
              ...options,
              analysisDepth: 'basic',
            });

            fallbackResult.processingTime = performance.now() - startTime;
            fallbackResult.provider = 'hybrid-fallback';
            return fallbackResult;
          } catch (fallbackError) {
            console.error('HybridMaterialProperties: Fallback analysis also failed:', fallbackError);
          }
        }

        return {
          success: false,
          error: 'All material properties analysis methods failed',
          processingTime: performance.now() - startTime,
          provider: 'hybrid-error',
        };
      }
    }, 'analyze-advanced-properties');
  }

  private async performServerAnalysis(imageFile: File, options: MaterialAnalysisOptions): Promise<MLResult> {
    // Use unified ML service for server-side analysis
    const result = await unifiedMLService.analyzeMaterial(imageFile, undefined, {
      preferServerSide: true,
      analysisType: 'comprehensive',
      ...options
    });

    return {
      success: result.success,
      data: result.data,
      confidence: result.confidence,
      processingTime: result.processingTime,
      error: result.success ? undefined : 'Server analysis failed'
    };
  }

  private async performClientAnalysis(imageFile: File, options: MaterialAnalysisOptions): Promise<MLResult> {
    if (!this.clientAnalyzer) {
      throw new Error('Client analyzer not initialized');
    }

    return await this.clientAnalyzer.analyzeAdvancedProperties(imageFile, options);
  }

  private shouldUseServerAnalysis(options: MaterialAnalysisOptions, file: File): boolean {
    // Use server for comprehensive analysis
    if (this.config.preferServerForComprehensive && options.analysisDepth === 'comprehensive') {
      return true;
    }

    // Use server for specialized focus areas
    if (options.focusAreas?.some(area =>
      this.config.specializedFocusAreas.includes(area),
    )) {
      return true;
    }

    // Use server for large files (better processing power)
    if (file.size > this.config.serverFileSizeThreshold) {
      return true;
    }

    // Default to client for standard analysis
    return false;
  }

  private generateCacheKey(file: File, options: MaterialAnalysisOptions): string {
    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    const optionsKey = JSON.stringify(options);
    return `${fileKey}-${optionsKey}`;
  }

  private assessResultQuality(result: MLResult): MLResult {
    if (!result.success || !result.data) {
      return result;
    }

    // Add confidence assessment if not present
    const resultData = result.data as any;
    if (typeof resultData.confidence === 'undefined') {
      resultData.confidence = 0.8; // Default confidence
    }

    // Check if confidence meets threshold
    if (resultData.confidence < this.config.minConfidenceThreshold) {
      resultData.qualityWarning = 'Low confidence result';
    }

    return result;
  }

  getStatus(): { clientSupported: boolean; serverAvailable: boolean; features: string[] } {
    return {
      clientSupported: !!this.clientAnalyzer,
      serverAvailable: true, // Always available through unifiedMLService
      features: [
        'Advanced Material Properties',
        'Physical Characteristics',
        'Mechanical Properties',
        'Chemical Analysis',
        'Environmental Assessment',
        'Performance Evaluation',
        'Quality Grading',
        'Compliance Standards',
        'Hybrid Processing',
        'Intelligent Routing',
        'Fallback Support',
        'Quality Assessment',
        'Performance Optimization',
        'Result Caching',
      ],
    };
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.analysisCache.size,
    };
  }

  /**
   * Force server analysis for next request
   */
  async forceServerAnalysis(
    imageFile: File,
    options: MaterialAnalysisOptions = { analysisDepth: 'comprehensive', focusAreas: [] },
  ): Promise<MLResult> {
    return this.executeOperation(async () => {
      return await this.performServerAnalysis(imageFile, options);
    }, 'force-server-analysis');
  }

  /**
   * Force client analysis for next request
   */
  async forceClientAnalysis(
    imageFile: File,
    options: MaterialAnalysisOptions = { analysisDepth: 'standard', focusAreas: [] },
  ): Promise<MLResult> {
    return this.executeOperation(async () => {
      if (!this.clientAnalyzer) {
        throw new Error('Client analyzer not initialized');
      }

      return await this.performClientAnalysis(imageFile, options);
    }, 'force-client-analysis');
  }

  // Static factory method for standardized instantiation
  public static createInstance(config?: Partial<HybridMaterialPropertiesServiceConfig>): HybridMaterialPropertiesService {
    const defaultConfig: HybridMaterialPropertiesServiceConfig = {
      name: 'HybridMaterialPropertiesService',
      version: '1.0.0',
      environment: 'development',
      enabled: true,
      preferServerForComprehensive: true,
      serverFileSizeThreshold: 5 * 1024 * 1024, // 5MB
      enableFallbackToClient: true,
      maxRetryAttempts: 3,
      enablePerformanceLogging: true,
      enableCaching: true,
      cacheExpirationMs: 10 * 60 * 1000, // 10 minutes
      serverTimeoutMs: 30000, // 30 seconds
      clientTimeoutMs: 15000, // 15 seconds
      enableQualityAssessment: true,
      minConfidenceThreshold: 0.6,
      specializedFocusAreas: [
        'chemical-composition',
        'compliance-standards',
        'environmental-impact',
      ],
    };

    const finalConfig = { ...defaultConfig, ...config };
    return new HybridMaterialPropertiesService(finalConfig);
  }
}

export const hybridMaterialPropertiesService = HybridMaterialPropertiesService.createInstance();
