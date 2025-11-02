/**
 * MIVAA Integration Service
 *
 * Provides unified access to MIVAA PDF Processing Service endpoints
 * with proper authentication, error handling, and response standardization.
 */

import { supabase } from '@/integrations/supabase/client';
import { RetryHelper, RetryOptions } from '@/utils/retryHelper';
import { CircuitBreaker } from '@/services/circuitBreaker';

export interface MivaaConfig {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
  retryBackoffMultiplier: number;
}

export interface MivaaResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata: {
    timestamp: string;
    processingTime: number;
    endpoint: string;
    version: string;
  };
}

export interface MaterialAnalysisOptions {
  includeProperties?: boolean;
  includeComposition?: boolean;
  confidenceThreshold?: number;
  analysisTypes?: string[];
}

export interface SearchOptions {
  limit?: number;
  similarityThreshold?: number;
  documentIds?: string[];
  includeMetadata?: boolean;
}

export interface PDFProcessingOptions {
  extractImages?: boolean;
  extractText?: boolean;
  extractTables?: boolean;
  ocrEnabled?: boolean;
}

/**
 * MIVAA Integration Service Class
 */
export class MivaaIntegrationService {
  private static instance: MivaaIntegrationService;
  private config: MivaaConfig;
  private circuitBreaker: CircuitBreaker;

  private constructor(config?: MivaaConfig) {
    // Use provided config or load from environment
    this.config = config || {
      baseUrl: process.env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr',
      apiKey: process.env.MIVAA_API_KEY,
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      retryBackoffMultiplier: 2,
    };

    // Initialize circuit breaker for fault tolerance
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 10000,
    });
  }

  /**
   * Initialize with configuration from centralized config system
   */
  public static initializeWithConfig(config: MivaaConfig): void {
    MivaaIntegrationService.instance = new MivaaIntegrationService(config);
  }

  public static getInstance(): MivaaIntegrationService {
    if (!MivaaIntegrationService.instance) {
      MivaaIntegrationService.instance = new MivaaIntegrationService();
    }
    return MivaaIntegrationService.instance;
  }

  /**
   * Validate and fix image URLs for accessibility
   */
  async validateAndFixImageUrls(documentId: string): Promise<{ fixed: number; total: number; errors: string[] }> {
    const errors: string[] = [];
    let fixed = 0;
    let total = 0;

    try {
      // Get all images for the document
      const { data: images, error } = await supabase
        .from('document_images')
        .select('*')
        .eq('document_id', documentId);

      if (error) {
        errors.push(`Failed to fetch images: ${error.message}`);
        return { fixed: 0, total: 0, errors };
      }

      total = images?.length || 0;

      if (!images || images.length === 0) {
        return { fixed: 0, total: 0, errors: ['No images found for document'] };
      }

      // Check and fix each image URL
      for (const image of images) {
        const currentUrl = image.image_url;

        // Check if URL is accessible or needs fixing
        if (!currentUrl || currentUrl.startsWith('placeholder_') || currentUrl.startsWith('missing_storage_url_')) {
          console.log(`🔧 Fixing image URL for image ${image.id}`);

          // Try to generate proper storage URL
          const imageName = image.metadata?.image_filename || image.metadata?.filename || `image_${image.id}.png`;
          const storagePath = `extracted/${documentId}/${imageName}`;

          const { data: urlData } = supabase.storage
            .from('pdf-documents')
            .getPublicUrl(storagePath);

          if (urlData?.publicUrl) {
            // Update the image with the correct URL
            const { error: updateError } = await supabase
              .from('document_images')
              .update({
                image_url: urlData.publicUrl,
                metadata: {
                  ...image.metadata,
                  storage_path: storagePath,
                  url_fixed_at: new Date().toISOString(),
                },
              })
              .eq('id', image.id);

            if (updateError) {
              errors.push(`Failed to update image ${image.id}: ${updateError.message}`);
            } else {
              fixed++;
              console.log(`✅ Fixed URL for image ${image.id}: ${urlData.publicUrl}`);
            }
          } else {
            errors.push(`Could not generate storage URL for image ${image.id}`);
          }
        }
      }

      return { fixed, total, errors };
    } catch (error) {
      errors.push(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { fixed: 0, total, errors };
    }
  }

  /**
   * Call MIVAA endpoint with retry logic and circuit breaker
   */
  private async callMivaaEndpoint<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    data?: any,
  ): Promise<MivaaResponse<T>> {
    const startTime = Date.now();

    try {
      // Use circuit breaker to prevent cascading failures
      return await this.circuitBreaker.execute(async () => {
        // Use retry logic for transient failures
        return await RetryHelper.withRetry(
          async () => {
            const url = `${this.config.baseUrl}${endpoint}`;
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };

            if (this.config.apiKey) {
              headers['Authorization'] = `Bearer ${this.config.apiKey}`;
            }

            const response = await fetch(url, {
              method,
              headers,
              body: method !== 'GET' ? JSON.stringify(data) : undefined,
              signal: AbortSignal.timeout(this.config.timeout),
            });

            const responseData = await response.json();
            const processingTime = Date.now() - startTime;

            if (!response.ok) {
              // Throw error for retry logic to handle
              const error = new Error(
                `MIVAA API error: ${response.status} - ${responseData.message || 'Unknown error'}`,
              );
              (error as any).status = response.status;
              (error as any).details = responseData;
              throw error;
            }

            return {
              success: true,
              data: responseData,
              metadata: {
                timestamp: new Date().toISOString(),
                processingTime,
                endpoint,
                version: '1.0.0',
              },
            };
          },
          {
            maxAttempts: this.config.retryAttempts,
            delay: this.config.retryDelay,
            backoffMultiplier: this.config.retryBackoffMultiplier,
            retryCondition: (error: unknown) => {
              // Retry on network errors and 5xx server errors
              if (error instanceof Error) {
                const status = (error as any).status;
                return !status || status >= 500;
              }
              return true;
            },
          },
        );
      });
    } catch (error) {
      const processingTime = Date.now() - startTime;
      return {
        success: false,
        error: {
          code: 'MIVAA_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error instanceof Error ? { message: error.message } : error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - startTime,
          endpoint,
          version: '1.0.0',
        },
      };
    }
  }

  /**
   * Call MIVAA via Supabase function proxy
   */
  private async callMivaaViaSupabase<T>(
    action: string,
    payload: any,
  ): Promise<MivaaResponse<T>> {
    try {
      const response = await this.callMivaaGatewayDirect(action, payload);

      // Check for direct call errors
      if (!response.success) {
        return {
          success: false,
          error: {
            code: 'MIVAA_GATEWAY_ERROR',
            message: response.error?.message || 'Unknown error',
            details: response.error,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime: 0,
            endpoint: '/functions/v1/mivaa-gateway',
            version: '1.0.0',
          },
        };
      }

      // Return the direct response
      return response as MivaaResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SUPABASE_CALL_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error,
        },
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: 0,
          endpoint: '/functions/v1/mivaa-gateway',
          version: '1.0.0',
        },
      };
    }
  }

  // =============================================================================
  // PUBLIC API METHODS
  // =============================================================================

  /**
   * Health Check
   */
  async healthCheck(): Promise<MivaaResponse> {
    return this.callMivaaEndpoint('/health', 'GET');
  }

  /**
   * Material Recognition
   */
  async analyzeMaterial(
    imageData: string,
    options: MaterialAnalysisOptions = {},
  ): Promise<MivaaResponse> {
    return this.callMivaaViaSupabase('material_recognition', {
      image_data: imageData,
      analysis_types: options.analysisTypes ?? ['visual', 'spectral', 'chemical'],
      include_properties: options.includeProperties ?? true,
      include_composition: options.includeComposition ?? true,
      confidence_threshold: options.confidenceThreshold ?? 0.8,
    });
  }

  /**
   * Semantic Search
   */
  async semanticSearch(
    query: string,
    options: SearchOptions = {},
  ): Promise<MivaaResponse> {
    return this.callMivaaViaSupabase('semantic_search', {
      query,
      limit: options.limit ?? 10,
      similarity_threshold: options.similarityThreshold ?? 0.7,
      document_ids: options.documentIds,
      include_metadata: options.includeMetadata ?? true,
    });
  }

  /**
   * PDF Processing
   */
  async processPDF(
    fileUrl: string,
    options: PDFProcessingOptions = {},
  ): Promise<MivaaResponse> {
    return this.callMivaaViaSupabase('pdf_extract', {
      file_url: fileUrl,
      extract_images: options.extractImages ?? true,
      extract_text: options.extractText ?? true,
      extract_tables: options.extractTables ?? true,
      ocr_enabled: options.ocrEnabled ?? true,
    });
  }

  /**
   * Generate Text Embeddings
   */
  async generateEmbedding(text: string): Promise<MivaaResponse> {
    return this.callMivaaViaSupabase('generate_embedding', {
      text,
      model: 'text-embedding-ada-002',
    });
  }

  /**
   * Generate Material Embeddings
   */
  async generateMaterialEmbeddings(
    imageData: string,
    embeddingTypes: string[] = ['clip'],
  ): Promise<MivaaResponse> {
    return this.callMivaaViaSupabase('material_embeddings', {
      image_data: imageData,
      embedding_types: embeddingTypes,
    });
  }

  /**
   * Visual Material Search
   */
  async visualMaterialSearch(
    imageData: string,
    options: SearchOptions = {},
  ): Promise<MivaaResponse> {
    return this.callMivaaEndpoint('/api/search/materials/visual', 'POST', {
      query_image: imageData,
      search_type: 'hybrid',
      search_strategy: 'comprehensive',
      confidence_threshold: 0.75,
      similarity_threshold: options.similarityThreshold ?? 0.7,
      limit: options.limit ?? 10,
    });
  }

  /**
   * Image Analysis
   */
  async analyzeImage(
    imageData: string,
    options: { includeOCR?: boolean; includeObjects?: boolean; imageId?: string } = {},
  ): Promise<MivaaResponse> {
    const analysisTypes = [];
    if (options.includeOCR !== false) analysisTypes.push('ocr');
    if (options.includeObjects !== false) analysisTypes.push('objects');
    analysisTypes.push('description'); // Always include description

    return this.callMivaaEndpoint('/api/v1/images/analyze', 'POST', {
      image_id: options.imageId || `temp_${Date.now()}`,
      image_url: imageData.startsWith('http') ? imageData : undefined,
      analysis_types: analysisTypes,
      quality: 'standard',
      language: 'auto',
      confidence_threshold: 0.7,
    });
  }

  /**
   * Document Query (RAG)
   */
  async queryDocument(
    documentId: string,
    question: string,
    options: { maxContextChunks?: number } = {},
  ): Promise<MivaaResponse> {
    return this.callMivaaEndpoint(`/api/documents/${documentId}/query`, 'POST', {
      question,
      max_context_chunks: options.maxContextChunks ?? 5,
      include_sources: true,
    });
  }

  /**
   * Get Performance Metrics
   */
  async getPerformanceMetrics(): Promise<MivaaResponse> {
    return this.callMivaaEndpoint('/performance/summary', 'GET');
  }

  /**
   * Batch Image Analysis
   */
  async batchAnalyzeImages(
    images: Array<{ id: string; data: string }>,
    options: MaterialAnalysisOptions = {},
  ): Promise<MivaaResponse> {
    return this.callMivaaEndpoint('/api/v1/images/analyze/batch', 'POST', {
      image_ids: images.map(img => img.id),
      analysis_types: options.analysisTypes ?? ['description', 'ocr', 'objects'],
      quality: 'standard',
      confidence_threshold: options.confidenceThreshold ?? 0.8,
      parallel_processing: true,
      priority: 'normal',
    });
  }

  /**
   * Call MIVAA Gateway directly using fetch to avoid CORS issues
   */
  private async callMivaaGatewayDirect(action: string, payload: any): Promise<any> {
    const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://bgbavxtjlbvgplozizxu.supabase.co';
    const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE5MDYwMzEsImV4cCI6MjA2NzQ4MjAzMX0.xswCBesG3eoYjKY5VNkUNhxc0tG6Ju2IzGI0Yd-DWMg';

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration not found');
    }

    const url = `${supabaseUrl}/functions/v1/mivaa-gateway`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          payload,
        }),
      });

      if (!response.ok) {
        throw new Error(`MIVAA gateway request failed: HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Check for application-level errors
      if (!data.success && data.error) {
        throw new Error(`MIVAA gateway request failed: ${data.error.message || 'Unknown error'}`);
      }

      return data;
    } catch (error) {
      console.error('Direct MIVAA gateway call failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const mivaaService = MivaaIntegrationService.getInstance();
