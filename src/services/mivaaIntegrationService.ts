/**
 * MIVAA Integration Service
 * 
 * Provides unified access to MIVAA PDF Processing Service endpoints
 * with proper authentication, error handling, and response standardization.
 */

import { supabase } from '@/integrations/supabase/client';

export interface MivaaConfig {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
  retryAttempts: number;
}

export interface MivaaResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
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

  private constructor() {
    this.config = {
      baseUrl: process.env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr',
      apiKey: process.env.MIVAA_API_KEY,
      timeout: 30000,
      retryAttempts: 3,
    };
  }

  public static getInstance(): MivaaIntegrationService {
    if (!MivaaIntegrationService.instance) {
      MivaaIntegrationService.instance = new MivaaIntegrationService();
    }
    return MivaaIntegrationService.instance;
  }

  /**
   * Call MIVAA endpoint directly
   */
  private async callMivaaEndpoint<T>(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    data?: any
  ): Promise<MivaaResponse<T>> {
    const startTime = Date.now();
    
    try {
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
        return {
          success: false,
          error: {
            code: `HTTP_${response.status}`,
            message: responseData.message || `HTTP ${response.status} error`,
            details: responseData,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime,
            endpoint,
            version: '1.0.0',
          },
        };
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
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
          details: error,
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
    payload: any
  ): Promise<MivaaResponse<T>> {
    try {
      const { data, error } = await supabase.functions.invoke('mivaa-gateway', {
        body: { action, payload },
      });

      // Check for Supabase client errors first
      if (error) {
        return {
          success: false,
          error: {
            code: 'SUPABASE_ERROR',
            message: error.message,
            details: error,
          },
          metadata: {
            timestamp: new Date().toISOString(),
            processingTime: 0,
            endpoint: `/functions/v1/mivaa-gateway`,
            version: '1.0.0',
          },
        };
      }

      // Check for MIVAA gateway errors in the response data
      if (data && !data.success && data.error) {
        return {
          success: false,
          error: data.error,
          metadata: data.metadata || {
            timestamp: new Date().toISOString(),
            processingTime: 0,
            endpoint: `/functions/v1/mivaa-gateway`,
            version: '1.0.0',
          },
        };
      }

      return data as MivaaResponse<T>;
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
          endpoint: `/functions/v1/mivaa-gateway`,
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
    options: MaterialAnalysisOptions = {}
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
    options: SearchOptions = {}
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
    options: PDFProcessingOptions = {}
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
    embeddingTypes: string[] = ['clip']
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
    options: SearchOptions = {}
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
    options: { includeOCR?: boolean; includeObjects?: boolean; imageId?: string } = {}
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
    options: { maxContextChunks?: number } = {}
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
    options: MaterialAnalysisOptions = {}
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
}

// Export singleton instance
export const mivaaService = MivaaIntegrationService.getInstance();
